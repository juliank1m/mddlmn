/**
 * index.ts
 *
 * Entry point for the mddlmn proxy server.
 *
 * This sets up a Fastify server that catches ALL incoming requests
 * and routes them through our proxy handler. The key trick is the
 * content type parser — we tell Fastify to treat every request body
 * as a raw string, regardless of content-type. This is necessary
 * because:
 *
 * 1. We need the exact bytes Claude Code sent, not a parsed object
 * 2. We're going to forward the raw body to Anthropic unchanged
 * 3. Fastify's default JSON parser would choke on some edge cases
 *    and it would add unnecessary overhead to parse-then-reserialize
 *
 * The proxy listens on port 8080 by default. To use it:
 *   1. Start this server: npm run dev
 *   2. Set ANTHROPIC_BASE_URL=http://localhost:8080
 *   3. Use Claude Code normally
 */

import Fastify from "fastify";
import { registerApiRoutes } from "./api/routes.js";
import { handleRequest } from "./proxy/handler.js";

const PORT = parseInt(process.env.MDDLMN_PORT ?? "8080", 10);

const app = Fastify({
  // Increase the body size limit. Claude Code can send very large
  // payloads when the conversation has a lot of tool outputs and
  // file contents. The default 1MB limit would break real usage.
  // 50MB is generous but safe.
  bodyLimit: 50 * 1024 * 1024,

  // Disable Fastify's default request logging — it's noisy and
  // we have our own logging in the handler.
  logger: false,
});

// Tell Fastify to capture request bodies as raw strings.
// By default, Fastify has built-in parsers for application/json and
// text/plain. The wildcard parser does not override those more-specific
// parsers, so remove them first; otherwise JSON requests would be parsed
// into objects and forwarded upstream as "[object Object]".
app.removeContentTypeParser(["application/json", "text/plain"]);
app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

async function start(): Promise<void> {
  try {
    await registerApiRoutes(app);

    // Catch-all route: every non-API request to any path gets proxied.
    // Claude Code primarily hits POST /v1/messages, but there may be
    // other endpoints (like /v1/models for model listing). We proxy
    // everything so nothing breaks.
    app.all("/*", handleRequest);

    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[mddlmn] Proxy listening on http://localhost:${PORT}`);
    console.log(`[mddlmn] Set ANTHROPIC_BASE_URL=http://localhost:${PORT} to use`);
  } catch (err) {
    console.error("[mddlmn] Failed to start:", err);
    process.exit(1);
  }
}

start();
