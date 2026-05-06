import { describe, expect, test } from "vitest";
import {
  classify,
  detectRequestKind,
  extractLastUserPreview,
  parseAnthropicRequest,
} from "./index.js";

describe("parseAnthropicRequest", () => {
  test("returns empty object when input is undefined", () => {
    expect(parseAnthropicRequest(undefined)).toEqual({});
  });

  test("returns empty object when input is empty string", () => {
    expect(parseAnthropicRequest("")).toEqual({});
  });

  test("parses valid JSON object", () => {
    const result = parseAnthropicRequest('{"model":"x","messages":[]}');
    expect(result.model).toBe("x");
    expect(result.messages).toEqual([]);
  });

  test("throws when JSON is not an object", () => {
    expect(() => parseAnthropicRequest("[]")).toThrow();
    expect(() => parseAnthropicRequest('"hello"')).toThrow();
    expect(() => parseAnthropicRequest("42")).toThrow();
  });

  test("throws on invalid JSON", () => {
    expect(() => parseAnthropicRequest("{not json")).toThrow();
  });
});

describe("classify", () => {
  test("returns empty array for empty body", () => {
    expect(classify(undefined)).toEqual([]);
    expect(classify("")).toEqual([]);
  });

  test("emits a system section when system prompt is present", () => {
    const sections = classify(
      JSON.stringify({ system: "You are helpful.", messages: [] })
    );
    expect(sections.find((s) => s.type === "system")?.content).toBe(
      "You are helpful."
    );
  });

  test("emits a tools section when tools are present", () => {
    const sections = classify(
      JSON.stringify({ tools: [{ name: "read" }], messages: [] })
    );
    const tools = sections.find((s) => s.type === "tools");
    expect(tools).toBeDefined();
    expect(tools!.content).toContain("read");
  });

  test("emits metadata section for top-level fields other than system/messages/tools", () => {
    const sections = classify(
      JSON.stringify({ model: "claude", max_tokens: 100, messages: [] })
    );
    const meta = sections.find((s) => s.type === "metadata");
    expect(meta).toBeDefined();
    expect(meta!.content).toContain("claude");
    expect(meta!.content).toContain("100");
  });

  test("classifies plain user string as user_text", () => {
    const sections = classify(
      JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
    );
    const userMsg = sections.find((s) => s.label.startsWith("User message"));
    expect(userMsg?.type).toBe("user_text");
    expect(userMsg?.content).toBe("hello");
  });

  test("classifies user string containing <system-reminder> as injected_context", () => {
    const sections = classify(
      JSON.stringify({
        messages: [
          { role: "user", content: "<system-reminder>foo</system-reminder>" },
        ],
      })
    );
    expect(sections.find((s) => s.label.startsWith("User message"))?.type).toBe(
      "injected_context"
    );
  });

  test("classifies user content blocks: tool_result → user_tool_result", () => {
    const sections = classify(
      JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "x", content: "ok" },
            ],
          },
        ],
      })
    );
    expect(sections.some((s) => s.type === "user_tool_result")).toBe(true);
  });

  test("classifies assistant text content as assistant_text", () => {
    const sections = classify(
      JSON.stringify({
        messages: [{ role: "assistant", content: "hi back" }],
      })
    );
    expect(sections.some((s) => s.type === "assistant_text")).toBe(true);
  });

  test("classifies assistant tool_use block as assistant_tool_call", () => {
    const sections = classify(
      JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "t1", name: "read", input: {} }],
          },
        ],
      })
    );
    expect(sections.some((s) => s.type === "assistant_tool_call")).toBe(true);
  });

  test("classifies thinking blocks as thinking", () => {
    const sections = classify(
      JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: [{ type: "thinking", thinking: "hmm" }],
          },
        ],
      })
    );
    expect(sections.some((s) => s.type === "thinking")).toBe(true);
  });

  test("each section has a unique id and stable contentHash", () => {
    const sections = classify(
      JSON.stringify({
        messages: [
          { role: "user", content: "a" },
          { role: "user", content: "a" },
        ],
      })
    );
    expect(sections[0].id).not.toBe(sections[1].id);
    expect(sections[0].contentHash).toBe(sections[1].contentHash);
  });
});

describe("extractLastUserPreview", () => {
  test("returns null when there are no messages", () => {
    expect(extractLastUserPreview({})).toBeNull();
    expect(extractLastUserPreview({ messages: [] })).toBeNull();
  });

  test("returns last user string message", () => {
    expect(
      extractLastUserPreview({
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "x" },
          { role: "user", content: "second" },
        ],
      })
    ).toBe("second");
  });

  test("skips injected user content and returns earlier real user message", () => {
    expect(
      extractLastUserPreview({
        messages: [
          { role: "user", content: "real question" },
          { role: "user", content: "<system-reminder>x</system-reminder>" },
        ],
      })
    ).toBe("real question");
  });

  test("extracts text from array content blocks", () => {
    expect(
      extractLastUserPreview({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "block one" },
              { type: "text", text: "block two" },
            ],
          },
        ],
      })
    ).toBe("block one\nblock two");
  });

  test("truncates to 120 characters", () => {
    const long = "x".repeat(200);
    expect(extractLastUserPreview({
      messages: [{ role: "user", content: long }],
    })).toHaveLength(120);
  });
});

describe("detectRequestKind", () => {
  test("count_tokens path is never main conversation or top level", () => {
    expect(
      detectRequestKind("/v1/messages/count_tokens", {
        tools: [{ name: "read" }],
        system: "x".repeat(1000),
        messages: [{ role: "user", content: "go" }],
      })
    ).toEqual({ isMainConversation: false, isTopLevel: false });
  });

  test("requires tools, system >500 chars, and not a quota probe to be main conversation", () => {
    const big = "x".repeat(1000);
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: big,
        messages: [{ role: "user", content: "go" }],
      }).isMainConversation
    ).toBe(true);
  });

  test("no tools → not main conversation", () => {
    expect(
      detectRequestKind("/v1/messages", {
        system: "x".repeat(1000),
        messages: [{ role: "user", content: "go" }],
      }).isMainConversation
    ).toBe(false);
  });

  test("short system prompt → not main conversation", () => {
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: "short",
        messages: [{ role: "user", content: "go" }],
      }).isMainConversation
    ).toBe(false);
  });

  test("quota probe (max_tokens=1, 'quota' user text) → not main conversation", () => {
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: "x".repeat(1000),
        max_tokens: 1,
        messages: [{ role: "user", content: "quota" }],
      }).isMainConversation
    ).toBe(false);
  });

  test("isTopLevel true when last user message is real user text", () => {
    const big = "x".repeat(1000);
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: big,
        messages: [{ role: "user", content: "what's up" }],
      }).isTopLevel
    ).toBe(true);
  });

  test("isTopLevel false when last user message is tool_result", () => {
    const big = "x".repeat(1000);
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: big,
        messages: [
          { role: "user", content: "go" },
          { role: "assistant", content: [{ type: "tool_use", id: "t", name: "x", input: {} }] },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "t", content: "result" }],
          },
        ],
      }).isTopLevel
    ).toBe(false);
  });

  test("isTopLevel false when last user message is injected context", () => {
    const big = "x".repeat(1000);
    expect(
      detectRequestKind("/v1/messages", {
        tools: [{ name: "read" }],
        system: big,
        messages: [
          { role: "user", content: "go" },
          { role: "user", content: "<system-reminder>x</system-reminder>" },
        ],
      }).isTopLevel
    ).toBe(false);
  });
});
