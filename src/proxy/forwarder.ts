/**
 * forwarder.ts
 *
 * This module does one thing: take an API request meant for Anthropic
 * and actually send it to Anthropic. It returns the raw Response object
 * so the caller can decide how to handle it (stream it, buffer it, etc).
 *
 * Why is this its own module? Because the proxy handler needs to do
 * stuff before and after forwarding (logging, parsing, gating). Keeping
 * the "just send it" logic separate means the proxy handler stays clean.
 */

const ANTHROPIC_BASE = "https://api.anthropic.com";

/**
 * Headers that should NOT be forwarded to Anthropic.
 *
 * - host: would say "localhost:8080", Anthropic expects their own domain
 * - content-length: we might modify the body later (Phase 2), and fetch
 *   recalculates it anyway
 * - connection / keep-alive: hop-by-hop headers that are meant for the
 *   direct connection, not the upstream server
 * - transfer-encoding: same reason — hop-by-hop
 * - accept-encoding: we want the raw response, not gzipped, so we can
 *   read and log the SSE stream. If we forwarded "gzip" here, Anthropic
 *   would compress the response and we'd have to decompress before we
 *   could read events.
 */
const STRIPPED_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "accept-encoding",
]);

/**
 * Forward a request to the real Anthropic API.
 *
 * @param path - The API path, e.g. "/v1/messages"
 * @param method - HTTP method (almost always POST)
 * @param headers - The original headers from Claude Code
 * @param body - The raw request body as a string
 * @returns The raw fetch Response — caller handles streaming
 */
export async function forward(
  path: string,
  method: string,
  headers: Record<string, string>,
  body: string
): Promise<Response> {
  // Build clean headers, stripping the ones that would cause problems.
  const cleanHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!STRIPPED_HEADERS.has(key.toLowerCase())) {
      cleanHeaders[key] = value;
    }
  }

  const url = `${ANTHROPIC_BASE}${path}`;

  // This is just a standard fetch call. The important thing is that
  // we're passing the original auth headers through (x-api-key or
  // Authorization), so Anthropic authenticates the request using
  // the user's own API key. We never touch or store the key.
  const hasBody = method !== "GET" && method !== "HEAD";

  const response = await fetch(url, {
    method,
    headers: cleanHeaders,
    body: hasBody ? body || undefined : undefined,
    // @ts-ignore — Node 22's fetch doesn't have full type support for
    // duplex yet, but it's needed for streaming request bodies
  });

  return response;
}
