import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { handleRequest } from "./handler.js";
import { registerApiRoutes } from "../api/routes.js";
import { gate, approveHeld, setGateEnabled } from "./gate-singleton.js";
import * as forwarderModule from "./forwarder.js";

/**
 * Integration test for the held → edit → forward wire.
 *
 * Stubs `forward()` so we can capture exactly what body the proxy
 * forwards upstream after the user approves a held request with edits.
 *
 * NOT covered elsewhere — gate.test.ts only verifies the Gate primitive,
 * not the full handler flow including canonical, outbound pipeline, and
 * forwarder serialization.
 */

let app: FastifyInstance;
let forwardSpy: ReturnType<typeof vi.spyOn>;

const MAIN_REQUEST_BODY = JSON.stringify({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 64,
  stream: false,
  // Long enough system to trigger isMainConversation
  system: "you are a test assistant. ".repeat(40),
  // Must have tools to be considered main
  tools: [
    {
      name: "echo",
      description: "echo back",
      input_schema: { type: "object", properties: {} },
    },
  ],
  messages: [
    { role: "user", content: [{ type: "text", text: "tell me about fastapi" }] },
  ],
});

beforeEach(async () => {
  // Disable gate to start clean; tests enable it explicitly
  setGateEnabled(false);

  app = Fastify({ bodyLimit: 50 * 1024 * 1024, logger: false });
  app.removeContentTypeParser(["application/json", "text/plain"]);
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });
  await registerApiRoutes(app);
  app.all("/*", handleRequest);

  // Stub forward to return an empty 200 — we only care about what was forwarded
  forwardSpy = vi
    .spyOn(forwarderModule, "forward")
    .mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
});

afterEach(async () => {
  setGateEnabled(false);
  // Drain any leftover held entries
  while (gate.queueLength() > 0) {
    const id = gate.currentHeldId();
    if (id) approveHeld(id);
  }
  forwardSpy.mockRestore();
  await app.close();
});

function lastForwardedBody(): unknown {
  const calls = forwardSpy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error("forward() was never called");
  // forward(path, method, headers, body)
  return JSON.parse(last[3] as string);
}

describe("gate edit → forward wire", () => {
  test("approveHeld with an edited body forwards the edited body", async () => {
    setGateEnabled(true);

    // Fire the held request — don't await; it blocks until approve
    const proxyPromise = app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "content-type": "application/json" },
      payload: MAIN_REQUEST_BODY,
    });

    // Wait for the request to land in the gate
    let attempts = 0;
    while (gate.queueLength() === 0 && attempts < 100) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }
    expect(gate.queueLength()).toBe(1);

    const heldId = gate.currentHeldId()!;
    expect(heldId).toBeTruthy();

    // Approve with an edited body — change "fastapi" → "rust"
    const edited = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 64,
      stream: false,
      system: "you are a test assistant. ".repeat(40),
      tools: [
        {
          name: "echo",
          description: "echo back",
          input_schema: { type: "object", properties: {} },
        },
      ],
      messages: [
        { role: "user", content: [{ type: "text", text: "tell me about rust" }] },
      ],
    };

    approveHeld(heldId, edited);

    // Wait for the proxy to actually call forward()
    await proxyPromise;

    // Assert forward was called and the forwarded body contains the EDITED text
    const forwarded = lastForwardedBody() as {
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    expect(forwarded.messages[0].content[0].text).toBe("tell me about rust");
    expect(forwarded.messages[0].content[0].text).not.toContain("fastapi");
  });

  test("approveHeld with no edits forwards the original held body", async () => {
    setGateEnabled(true);

    const proxyPromise = app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "content-type": "application/json" },
      payload: MAIN_REQUEST_BODY,
    });

    let attempts = 0;
    while (gate.queueLength() === 0 && attempts < 100) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }
    expect(gate.queueLength()).toBe(1);
    const heldId = gate.currentHeldId()!;

    approveHeld(heldId); // no editedBody — pass through

    await proxyPromise;
    const forwarded = lastForwardedBody() as {
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    // Original text preserved
    expect(forwarded.messages[0].content[0].text).toBe("tell me about fastapi");
  });
});
