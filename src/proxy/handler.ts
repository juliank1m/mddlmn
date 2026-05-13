/**
 * handler.ts
 *
 * The main proxy handler. This is where requests from Claude Code arrive
 * and where we decide what to do with them.
 *
 * The flow for every request:
 * 1. Read the raw request body
 * 2. Generate a unique request ID
 * 3. Log the request to JSONL
 * 4. Forward to Anthropic
 * 5. Stream the response back to Claude Code
 * 6. While streaming, buffer the chunks so we can log the full response
 * 7. After the stream ends, log the complete response
 *
 * The tricky part is step 5+6. Anthropic sends SSE (Server-Sent Events)
 * for streaming responses. Each event looks like:
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
 *
 * We need to:
 * - Forward each chunk to Claude Code immediately (so the user sees
 *   text appearing in real time, no added latency)
 * - Collect all chunks so we can reconstruct the full response for logging
 *
 * We do this by using a TransformStream that passes data through to
 * the client while also saving it to a buffer on the side.
 */

import { randomUUID } from "node:crypto";
import { FastifyRequest, FastifyReply } from "fastify";
import { forward } from "./forwarder.js";
import { log } from "../storage/logger.js";
import {
  classify,
  detectRequestKind,
  extractLastUserPreview,
  parseAnthropicRequest,
  type Section,
} from "../classifier/index.js";
import { parseResponseSections } from "../classifier/response-parser.js";
import { countTokens } from "../classifier/token-counter.js";
import {
  getCurrentSessionId,
  replaceRequestSections,
  updateRequestDuration,
  upsertRequest,
} from "../storage/db.js";
import {
  broadcastNewRequest,
  broadcastRequestClassified,
  type RequestKind,
} from "../ws/manager.js";
import {
  inboundPipeline,
  outboundPipeline,
  runStage,
} from "../middleware/index.js";
import { gate } from "./gate-singleton.js";
import { canonical } from "./canonical-singleton.js";
import { buildSyntheticAbort } from "./synthetic-abort.js";
import { normalizeMessageCacheControl } from "./cache-control.js";

const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

function responseHeadersForClient(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  return headers;
}

function modelFromRequestBody(rawBody: string): string | null {
  try {
    const request = parseAnthropicRequest(rawBody);
    return typeof request.model === "string" ? request.model : null;
  } catch {
    return null;
  }
}

function requestKindForEvent(requestKind: {
  isMainConversation: boolean;
  isTopLevel: boolean;
}): RequestKind {
  if (requestKind.isTopLevel) {
    return "top_level";
  }

  if (requestKind.isMainConversation) {
    return "tool_chain";
  }

  return "aux";
}

function announceRequest(params: {
  requestId: string;
  timestamp: string;
  apiPath: string;
  rawBody: string;
  rawLogOffset: number | null;
}): void {
  try {
    const request = parseAnthropicRequest(params.rawBody);
    const model = typeof request.model === "string" ? request.model : null;
    const requestKind = detectRequestKind(params.apiPath, request);
    const lastUserPreview = extractLastUserPreview(request);

    upsertRequest({
      id: params.requestId,
      timestamp: params.timestamp,
      path: params.apiPath,
      model,
      totalTokens: null,
      isMainConversation: requestKind.isMainConversation,
      isTopLevel: requestKind.isTopLevel,
      lastUserPreview,
      rawLogOffset: params.rawLogOffset,
    });

    broadcastNewRequest({
      requestId: params.requestId,
      sessionId: getCurrentSessionId(),
      totalTokens: 0,
      model,
      kind: requestKindForEvent(requestKind),
      preview: lastUserPreview,
      timestamp: Date.parse(params.timestamp),
    });
  } catch (err) {
    console.error(`[proxy] Failed to announce request ${params.requestId}:`, err);
    // Still broadcast so the sidebar shows something
    broadcastNewRequest({
      requestId: params.requestId,
      sessionId: getCurrentSessionId(),
      totalTokens: 0,
      model: null,
      kind: "aux",
      preview: null,
      timestamp: Date.parse(params.timestamp),
    });
  }
}

async function classifyAndStoreRequest(params: {
  requestId: string;
  timestamp: string;
  apiPath: string;
  rawBody: string;
  headers: Record<string, string>;
  rawLogOffset: number | null;
  responseBody?: string;
}): Promise<void> {
  const request = parseAnthropicRequest(params.rawBody);
  const model = typeof request.model === "string" ? request.model : null;
  const requestKind = detectRequestKind(params.apiPath, request);
  const lastUserPreview = extractLastUserPreview(request);

  let sections = classify(params.rawBody);

  // Append assistant response sections if the response body is available
  if (params.responseBody) {
    const responseSections = parseResponseSections(params.responseBody);
    sections = [...sections, ...responseSections];
  }

  if (model) {
    try {
      sections = await countTokens(sections, {
        model,
        headers: params.headers,
      });
    } catch (err) {
      console.error(`[classifier] Token counting failed for ${params.requestId}:`, err);
    }
  }

  const totalTokens = sections.reduce((sum: number, section: Section) => {
    return sum + section.tokenCount;
  }, 0);

  upsertRequest({
    id: params.requestId,
    timestamp: params.timestamp,
    path: params.apiPath,
    model,
    totalTokens: totalTokens || null,
    isMainConversation: requestKind.isMainConversation,
    isTopLevel: requestKind.isTopLevel,
    lastUserPreview,
    rawLogOffset: params.rawLogOffset,
  });
  replaceRequestSections(params.requestId, sections);
  broadcastRequestClassified({
    requestId: params.requestId,
    sections: sections.map((section) => ({
      type: section.type,
      tokenCount: section.tokenCount,
    })),
  });
}

function storeDuration(requestId: string, durationMs: number): void {
  try {
    updateRequestDuration(requestId, durationMs);
  } catch (err) {
    console.error(`[storage] Failed to update duration for ${requestId}:`, err);
  }
}

/**
 * Handle an incoming request from Claude Code.
 */
export async function handleRequest(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Read the raw request body. Fastify gives us the raw body as a string
  // because we'll configure it to use a plain text content type parser.
  const rawBody = (req.body as string | undefined) ?? "";
  const apiPath = req.url; // e.g. "/v1/messages"
  const method = req.method;

  // Extract headers as a flat record. Claude Code sends important headers
  // like x-api-key, anthropic-version, content-type. We forward all of
  // them (minus the ones the forwarder strips).
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }

  // Log the incoming request. We try to parse it as JSON for structured
  // logging, but if it's not valid JSON we log the raw string.
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  const requestTimestamp = new Date().toISOString();
  const rawLogOffset = await log({
    requestId,
    timestamp: requestTimestamp,
    type: "request",
    path: apiPath,
    payload: parsedBody,
  });

  // Classification happens after the full response is captured so we can
  // include the assistant's reply sections. resolveResponseBody is called
  // in the streaming/non-streaming paths below once we have the body.
  let resolveResponseBody!: (body: string) => void;
  const responseBodyPromise = new Promise<string>((res) => {
    resolveResponseBody = res;
  });

  // Broadcast the new request immediately so the sidebar updates without
  // waiting for the full response. Classification (which needs the response
  // body to include assistant sections) runs after the stream ends.
  announceRequest({
    requestId,
    timestamp: requestTimestamp,
    apiPath,
    rawBody,
    rawLogOffset,
  });

  // The body the inspector classifies should reflect what was actually
  // forwarded upstream (post-canonical, post-injection) — not the raw replay
  // Claude Code sends, which can include turns the user has excised.
  // Updated below as the body progresses through canonical → outbound.
  // The raw replay is preserved in the JSONL log via `parsedBody` above.
  let bodyForClassification = rawBody;

  // Fire classification as a background task that waits for the response body.
  void responseBodyPromise.then((responseBody) =>
    classifyAndStoreRequest({
      requestId,
      timestamp: requestTimestamp,
      apiPath,
      rawBody: bodyForClassification,
      headers,
      rawLogOffset,
      responseBody,
    }).catch((err) => {
      console.error(`[classifier] Failed to classify ${requestId}:`, err);
    })
  );

  // Inbound middleware (e.g. redaction) — runs before the user sees the
  // request in the gating UI.
  let bodyAfterInbound: string;
  try {
    bodyAfterInbound = await runStage({
      requestId,
      apiPath,
      headers,
      rawBody,
      pipeline: inboundPipeline,
    });
  } catch (err) {
    console.error(`[middleware] Inbound pipeline failed for ${requestId}:`, err);
    reply.status(500).send({ error: "Middleware pipeline failed" });
    resolveResponseBody("");
    return;
  }

  // Canonical conversation: for main-conversation requests, replace the
  // incoming messages with the server-owned canonical (which may have had
  // turns excised by previous aborts). Aux requests bypass canonical.
  let bodyForGate = bodyAfterInbound;
  let isMainForCanonical = false;
  if (bodyAfterInbound) {
    try {
      const parsed = parseAnthropicRequest(bodyAfterInbound);
      const kind = detectRequestKind(apiPath, parsed);
      if (kind.isMainConversation && Array.isArray(parsed.messages)) {
        isMainForCanonical = true;
        const canonicalMessages = canonical.ingest(
          parsed.messages as Array<{ role: string; content: unknown }>
        );
        // Strip stale cache_control markers from older canonical messages
        // and re-anchor the marker on the latest message. Without this,
        // stale markers accumulate across turns and the request eventually
        // exceeds Anthropic's max-4 cache_control limit.
        const normalizedMessages = normalizeMessageCacheControl(canonicalMessages);
        bodyForGate = JSON.stringify({
          ...parsed,
          messages: normalizedMessages,
        });
        bodyForClassification = bodyForGate;
      }
    } catch {
      // Not parseable — leave as-is.
    }
  }

  // Gate: if enabled, hold the request until the user approves or cancels.
  // The body presented to the user is bodyForGate (post-redaction, post-canonical).
  let bodyAfterGate = bodyForGate;
  if (gate.isEnabled() && bodyForGate) {
    let parsedForGate;
    try {
      parsedForGate = parseAnthropicRequest(bodyForGate);
    } catch {
      parsedForGate = null;
    }
    if (parsedForGate) {
      const gateKind = detectRequestKind(apiPath, parsedForGate);
      const kindForBroadcast: "top_level" | "tool_chain" | "aux" =
        gateKind.isTopLevel
          ? "top_level"
          : gateKind.isMainConversation
            ? "tool_chain"
            : "aux";
      const decision = await gate.hold(requestId, parsedForGate, kindForBroadcast);
      if (decision.decision === "cancel") {
        // Excise the latest user turn from canonical so it never gets
        // forwarded — even though Claude Code's client will still replay it.
        if (isMainForCanonical) {
          canonical.popLastTurn();
          canonical.noteSyntheticAppend(1);
        }
        // Match the response shape the request asked for. If the request was
        // streaming (Claude Code's main loop always streams), return a full
        // synthetic SSE event sequence; otherwise return JSON. Returning the
        // wrong content-type makes the SDK think the connection failed and
        // fire a duplicate request.
        const isStreaming = parsedForGate.stream === true;
        const synthetic = buildSyntheticAbort({
          requestId,
          model: typeof parsedForGate.model === "string" ? parsedForGate.model : "claude",
          stream: isStreaming,
        });
        if (isStreaming) {
          reply.raw.writeHead(200, {
            "content-type": synthetic.contentType,
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          reply.raw.write(synthetic.body);
          reply.raw.end();
        } else {
          reply
            .status(200)
            .header("content-type", synthetic.contentType)
            .send(synthetic.body);
        }
        resolveResponseBody(synthetic.body);
        return;
      }
      bodyAfterGate = JSON.stringify(decision.body);
    }
  }

  // Outbound middleware (e.g. injection) — runs after user approval, before
  // forwarding upstream. If a middleware throws, the request fails with 500.
  let forwardBody: string;
  try {
    forwardBody = await runStage({
      requestId,
      apiPath,
      headers,
      rawBody: bodyAfterGate,
      pipeline: outboundPipeline,
    });
  } catch (err) {
    console.error(`[middleware] Outbound pipeline failed for ${requestId}:`, err);
    reply.status(500).send({ error: "Middleware pipeline failed" });
    resolveResponseBody("");
    return;
  }
  bodyForClassification = forwardBody;

  // Forward to Anthropic.
  let response: Response;
  try {
    response = await forward(apiPath, method, headers, forwardBody);
  } catch (err) {
    // Network error talking to Anthropic — return 502 Bad Gateway.
    // This means Anthropic is down or unreachable, not a bug in our proxy.
    console.error(`[proxy] Forward failed for ${requestId}:`, err);
    reply.status(502).send({ error: "Failed to reach upstream API" });
    resolveResponseBody("");
    return;
  }

  // Copy response headers from Anthropic to our reply. Body framing headers
  // are stripped because Node fetch may transparently decode upstream bodies.
  const responseHeaders = responseHeadersForClient(response);

  // Check if this is a streaming response.
  // Claude Code sends "stream": true in the request body, and Anthropic
  // responds with content-type: text/event-stream.
  const isStreaming = responseHeaders["content-type"]?.includes("text/event-stream");

  if (!isStreaming) {
    // Non-streaming response: simple case.
    // Read the full body, log it, send it back.
    const responseBody = await response.text();
    const durationMs = Date.now() - startTime;

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(responseBody);
    } catch {
      parsedResponse = responseBody;
    }

    await log({
      requestId,
      timestamp: new Date().toISOString(),
      type: "response",
      path: apiPath,
      payload: parsedResponse,
      durationMs,
    });
    storeDuration(requestId, durationMs);
    resolveResponseBody(responseBody);

    reply.status(response.status).headers(responseHeaders).send(responseBody);
    return;
  }

  // Streaming response: the interesting case.
  //
  // Anthropic's response body is a ReadableStream of SSE chunks.
  // We need to pipe it to Claude Code while also capturing it.
  //
  // Strategy: read from the response body, and for each chunk:
  // 1. Write it to the reply (so Claude Code receives it immediately)
  // 2. Append it to a buffer (so we can log the full response later)

  // Set the response status and headers BEFORE we start streaming.
  // This sends the HTTP headers to Claude Code so it knows to expect SSE.
  reply.raw.writeHead(response.status, responseHeaders);

  const reader = response.body?.getReader();
  if (!reader) {
    reply.raw.end();
    return;
  }

  // Buffer to collect all chunks for logging.
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Forward the chunk to Claude Code immediately.
      // reply.raw is the underlying Node.js http.ServerResponse.
      // We write directly to it because Fastify's reply.send() is
      // designed for complete responses, not incremental streaming.
      reply.raw.write(value);

      // Save the chunk for logging.
      chunks.push(value);
    }
  } catch (err) {
    console.error(`[proxy] Stream error for ${requestId}:`, err);
  } finally {
    // End the response stream to Claude Code.
    reply.raw.end();

    // Now reassemble all chunks and log the complete response.
    const fullResponse = chunks.map((c) => decoder.decode(c, { stream: true })).join("");
    const durationMs = Date.now() - startTime;

    // For streaming responses, the payload is the raw SSE text.
    // We could parse it into structured events here, but for Step 1
    // we just log the raw stream. Parsing comes in Step 2.
    await log({
      requestId,
      timestamp: new Date().toISOString(),
      type: "response",
      path: apiPath,
      payload: fullResponse,
      durationMs,
    });
    storeDuration(requestId, durationMs);
    resolveResponseBody(fullResponse);
  }
}
