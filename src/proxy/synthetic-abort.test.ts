import { describe, expect, test } from "vitest";
import { buildSyntheticAbort } from "./synthetic-abort.js";

describe("buildSyntheticAbort", () => {
  test("returns JSON for non-streaming requests", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: false,
    });
    expect(result.contentType).toBe("application/json");
    const parsed = JSON.parse(result.body);
    expect(parsed.type).toBe("message");
    expect(parsed.role).toBe("assistant");
    expect(parsed.model).toBe("claude-opus-4-7");
    expect(parsed.content).toEqual([
      { type: "text", text: "[cancelled by mddlmn]" },
    ]);
    expect(parsed.stop_reason).toBe("end_turn");
    expect(parsed.id).toContain("req-1234");
  });

  test("returns SSE event stream for streaming requests", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: true,
    });
    expect(result.contentType).toBe("text/event-stream");
    // SSE response must contain all six event types in order.
    const events = result.body
      .split("\n\n")
      .filter((b) => b.trim())
      .map((block) => {
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        return dataLine ? JSON.parse(dataLine.slice(6)) : null;
      })
      .filter(Boolean);

    const types = events.map((e) => e!.type);
    expect(types).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
  });

  test("SSE message_start contains the model and a message id", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: true,
    });
    const block = result.body
      .split("\n\n")
      .find((b) => b.includes("message_start"))!;
    const data = JSON.parse(
      block.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    );
    expect(data.message.model).toBe("claude-opus-4-7");
    expect(data.message.role).toBe("assistant");
    expect(data.message.type).toBe("message");
  });

  test("SSE content_block_delta carries the cancelled text", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: true,
    });
    const block = result.body
      .split("\n\n")
      .find((b) => b.includes("content_block_delta"))!;
    const data = JSON.parse(
      block.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    );
    expect(data.delta.type).toBe("text_delta");
    expect(data.delta.text).toBe("[cancelled by mddlmn]");
  });

  test("SSE message_delta carries stop_reason end_turn", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: true,
    });
    const block = result.body
      .split("\n\n")
      .find((b) => b.includes("message_delta"))!;
    const data = JSON.parse(
      block.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    );
    expect(data.delta.stop_reason).toBe("end_turn");
  });

  test("each SSE event includes the event: line for client compatibility", () => {
    const result = buildSyntheticAbort({
      requestId: "req-12345678",
      model: "claude-opus-4-7",
      stream: true,
    });
    const blocks = result.body.split("\n\n").filter((b) => b.trim());
    for (const block of blocks) {
      expect(block).toMatch(/^event: /);
      expect(block).toMatch(/\ndata: /);
    }
  });
});
