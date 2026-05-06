import { describe, expect, test } from "vitest";
import { Pipeline } from "./pipeline.js";
import { runStage } from "./run-stage.js";

describe("runStage", () => {
  test("returns the original raw body when pipeline is empty", async () => {
    const raw = JSON.stringify({ model: "x" });
    const result = await runStage({
      requestId: "r",
      apiPath: "/p",
      headers: {},
      rawBody: raw,
      pipeline: new Pipeline(),
    });
    expect(result).toBe(raw);
  });

  test("returns empty string when raw body is empty", async () => {
    const pipeline = new Pipeline();
    pipeline.use((ctx) => ({ ...ctx, body: { ...ctx.body, mutated: true } }));
    const result = await runStage({
      requestId: "r",
      apiPath: "/p",
      headers: {},
      rawBody: "",
      pipeline,
    });
    expect(result).toBe("");
  });

  test("returns raw body unchanged when not parseable JSON", async () => {
    const pipeline = new Pipeline();
    pipeline.use((ctx) => ({ ...ctx, body: { ...ctx.body, mutated: true } }));
    const result = await runStage({
      requestId: "r",
      apiPath: "/p",
      headers: {},
      rawBody: "not-json",
      pipeline,
    });
    expect(result).toBe("not-json");
  });

  test("runs the pipeline and returns serialized modified body", async () => {
    const pipeline = new Pipeline();
    pipeline.use((ctx) => ({ ...ctx, body: { ...ctx.body, marker: 1 } }));
    const result = await runStage({
      requestId: "r",
      apiPath: "/p",
      headers: {},
      rawBody: JSON.stringify({ model: "x" }),
      pipeline,
    });
    const parsed = JSON.parse(result);
    expect(parsed.model).toBe("x");
    expect(parsed.marker).toBe(1);
  });

  test("propagates errors from middleware", async () => {
    const pipeline = new Pipeline();
    pipeline.use(() => {
      throw new Error("boom");
    });
    await expect(
      runStage({
        requestId: "r",
        apiPath: "/p",
        headers: {},
        rawBody: JSON.stringify({ model: "x" }),
        pipeline,
      })
    ).rejects.toThrow("boom");
  });
});
