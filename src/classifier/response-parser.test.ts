import { describe, expect, test } from "vitest";
import { parseResponseSections } from "./response-parser.js";

describe("parseResponseSections — non-streaming JSON", () => {
  test("returns empty array for response with no content", () => {
    expect(parseResponseSections(JSON.stringify({}))).toEqual([]);
  });

  test("returns empty array for malformed JSON", () => {
    expect(parseResponseSections("{not json")).toEqual([]);
  });

  test("emits assistant_text section for text block", () => {
    const sections = parseResponseSections(
      JSON.stringify({ content: [{ type: "text", text: "hello world" }] })
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("assistant_text");
    expect(sections[0].content).toBe("hello world");
  });

  test("emits thinking section for thinking block", () => {
    const sections = parseResponseSections(
      JSON.stringify({ content: [{ type: "thinking", thinking: "let me think" }] })
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("thinking");
  });

  test("emits assistant_tool_call section for tool_use block", () => {
    const sections = parseResponseSections(
      JSON.stringify({
        content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "/x" } }],
      })
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("assistant_tool_call");
    expect(sections[0].label).toContain("read_file");
    expect(sections[0].content).toContain("read_file");
    expect(sections[0].content).toContain("/x");
  });

  test("skips empty text blocks", () => {
    const sections = parseResponseSections(
      JSON.stringify({ content: [{ type: "text", text: "   " }] })
    );
    expect(sections).toEqual([]);
  });

  test("preserves order across multiple blocks", () => {
    const sections = parseResponseSections(
      JSON.stringify({
        content: [
          { type: "thinking", thinking: "first" },
          { type: "text", text: "second" },
          { type: "tool_use", id: "t", name: "tool", input: {} },
        ],
      })
    );
    expect(sections.map((s) => s.type)).toEqual([
      "thinking",
      "assistant_text",
      "assistant_tool_call",
    ]);
  });
});

describe("parseResponseSections — streaming SSE", () => {
  test("reconstructs text from content_block_start + content_block_delta", () => {
    const sse = [
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const sections = parseResponseSections(sse);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("assistant_text");
    expect(sections[0].content).toBe("Hello");
  });

  test("reconstructs thinking from thinking_delta events", () => {
    const sse = [
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "thinking" } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "thought" } })}`,
    ].join("\n");

    const sections = parseResponseSections(sse);
    expect(sections[0]?.type).toBe("thinking");
    expect(sections[0]?.content).toBe("thought");
  });

  test("reconstructs tool_use input from input_json_delta events", () => {
    const sse = [
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "read_file" } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":' } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"/x"}' } })}`,
    ].join("\n");

    const sections = parseResponseSections(sse);
    expect(sections[0]?.type).toBe("assistant_tool_call");
    expect(sections[0]?.label).toContain("read_file");
    expect(sections[0]?.content).toContain("/x");
  });

  test("ignores non-data lines and malformed JSON in events", () => {
    const sse = [
      "event: foo",
      "data: {malformed",
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text" } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } })}`,
    ].join("\n");

    const sections = parseResponseSections(sse);
    expect(sections[0]?.content).toBe("ok");
  });

  test("skips empty text and thinking blocks", () => {
    const sse = [
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text" } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "  " } })}`,
    ].join("\n");

    expect(parseResponseSections(sse)).toEqual([]);
  });
});
