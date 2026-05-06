import { describe, expect, test } from "vitest";
import { Pipeline, type MiddlewareContext } from "./pipeline.js";

function makeCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    requestId: "req-1",
    apiPath: "/v1/messages",
    headers: {},
    body: { model: "claude-opus-4-7" },
    ...overrides,
  };
}

describe("Pipeline", () => {
  test("returns context unchanged when no middleware registered", async () => {
    const pipeline = new Pipeline();
    const ctx = makeCtx();
    const result = await pipeline.run(ctx);
    expect(result).toEqual(ctx);
  });

  test("runs registered middleware in order, passing the result of each into the next", async () => {
    const pipeline = new Pipeline();
    const order: string[] = [];

    pipeline.use((ctx) => {
      order.push("a");
      return { ...ctx, body: { ...ctx.body, marker: "a" } };
    });
    pipeline.use((ctx) => {
      order.push("b");
      expect(ctx.body.marker).toBe("a");
      return { ...ctx, body: { ...ctx.body, marker: "b" } };
    });

    const result = await pipeline.run(makeCtx());
    expect(order).toEqual(["a", "b"]);
    expect(result.body.marker).toBe("b");
  });

  test("supports async middleware", async () => {
    const pipeline = new Pipeline();
    pipeline.use(async (ctx) => {
      await new Promise((r) => setTimeout(r, 1));
      return { ...ctx, body: { ...ctx.body, async: true } };
    });
    const result = await pipeline.run(makeCtx());
    expect(result.body.async).toBe(true);
  });

  test("propagates errors thrown by middleware", async () => {
    const pipeline = new Pipeline();
    pipeline.use(() => {
      throw new Error("boom");
    });
    await expect(pipeline.run(makeCtx())).rejects.toThrow("boom");
  });

  test("size() reports the number of registered middleware", () => {
    const pipeline = new Pipeline();
    expect(pipeline.size()).toBe(0);
    pipeline.use((ctx) => ctx);
    expect(pipeline.size()).toBe(1);
    pipeline.use((ctx) => ctx);
    expect(pipeline.size()).toBe(2);
  });
});
