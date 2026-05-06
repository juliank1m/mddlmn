import { describe, expect, test } from "vitest";
import { Pipeline } from "./pipeline.js";
import { applyPipelines } from "./apply.js";

describe("applyPipelines", () => {
  test("returns the original raw body when both pipelines are empty", async () => {
    const inbound = new Pipeline();
    const outbound = new Pipeline();
    const rawBody = JSON.stringify({ model: "x", messages: [] });

    const result = await applyPipelines({
      requestId: "r1",
      apiPath: "/v1/messages",
      headers: {},
      rawBody,
      inbound,
      outbound,
    });

    expect(result).toBe(rawBody);
  });

  test("returns the original raw body unchanged when body is empty", async () => {
    const inbound = new Pipeline();
    inbound.use((ctx) => ({ ...ctx, body: { ...ctx.body, mutated: true } }));

    const result = await applyPipelines({
      requestId: "r1",
      apiPath: "/v1/messages",
      headers: {},
      rawBody: "",
      inbound,
      outbound: new Pipeline(),
    });

    expect(result).toBe("");
  });

  test("returns the original raw body unchanged when body is not parseable JSON", async () => {
    const inbound = new Pipeline();
    inbound.use((ctx) => ({ ...ctx, body: { ...ctx.body, mutated: true } }));
    const rawBody = "not-json";

    const result = await applyPipelines({
      requestId: "r1",
      apiPath: "/v1/messages",
      headers: {},
      rawBody,
      inbound,
      outbound: new Pipeline(),
    });

    expect(result).toBe(rawBody);
  });

  test("runs inbound then outbound, returning the serialized modified body", async () => {
    const inbound = new Pipeline();
    inbound.use((ctx) => ({
      ...ctx,
      body: { ...ctx.body, inboundMark: 1 },
    }));
    const outbound = new Pipeline();
    outbound.use((ctx) => {
      expect(ctx.body.inboundMark).toBe(1);
      return { ...ctx, body: { ...ctx.body, outboundMark: 2 } };
    });

    const rawBody = JSON.stringify({ model: "claude" });
    const result = await applyPipelines({
      requestId: "r1",
      apiPath: "/v1/messages",
      headers: { "x-test": "1" },
      rawBody,
      inbound,
      outbound,
    });

    const parsed = JSON.parse(result);
    expect(parsed.model).toBe("claude");
    expect(parsed.inboundMark).toBe(1);
    expect(parsed.outboundMark).toBe(2);
  });

  test("propagates errors thrown by middleware", async () => {
    const inbound = new Pipeline();
    inbound.use(() => {
      throw new Error("redaction failed");
    });

    await expect(
      applyPipelines({
        requestId: "r1",
        apiPath: "/v1/messages",
        headers: {},
        rawBody: JSON.stringify({ model: "x" }),
        inbound,
        outbound: new Pipeline(),
      })
    ).rejects.toThrow("redaction failed");
  });
});
