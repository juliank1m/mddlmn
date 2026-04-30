import { randomUUID } from "node:crypto";
import { FastifyRequest, FastifyReply } from "fastify";
import { forward } from "./forwarder.js";
import { log } from "../storage/logger.js";

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

export async function handleRequest(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();
  const rawBody = req.body as string;
  const apiPath = req.url;
  const method = req.method;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  await log({
    requestId,
    timestamp: new Date().toISOString(),
    type: "request",
    path: apiPath,
    payload: parsedBody,
  });

  let response: Response;
  try {
    response = await forward(apiPath, method, headers, rawBody);
  } catch (err) {
    console.error(`[proxy] Forward failed for ${requestId}:`, err);
    reply.status(502).send({ error: "Failed to reach upstream API" });
    return;
  }

  const responseHeaders = responseHeadersForClient(response);
  const isStreaming = responseHeaders["content-type"]?.includes("text/event-stream");

  if (!isStreaming) {
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

    reply.status(response.status).headers(responseHeaders).send(responseBody);
    return;
  }

  reply.raw.writeHead(response.status, responseHeaders);

  const reader = response.body?.getReader();
  if (!reader) {
    reply.raw.end();
    return;
  }

  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.raw.write(value);
      chunks.push(value);
    }
  } catch (err) {
    console.error(`[proxy] Stream error for ${requestId}:`, err);
  } finally {
    reply.raw.end();
    const fullResponse = chunks.map((c) => decoder.decode(c, { stream: true })).join("");
    const durationMs = Date.now() - startTime;

    await log({
      requestId,
      timestamp: new Date().toISOString(),
      type: "response",
      path: apiPath,
      payload: fullResponse,
      durationMs,
    });
  }
}
