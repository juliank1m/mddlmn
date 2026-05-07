import { describe, expect, test } from "vitest";
import { normalizeMessageCacheControl } from "./cache-control.js";

const cc = { type: "ephemeral" };

describe("normalizeMessageCacheControl", () => {
  test("returns empty array unchanged when messages is empty", () => {
    expect(normalizeMessageCacheControl([])).toEqual([]);
  });

  test("strips cache_control from all but the last message", () => {
    const result = normalizeMessageCacheControl([
      {
        role: "user",
        content: [{ type: "text", text: "first", cache_control: cc }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "second", cache_control: cc }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "third" }],
      },
    ]);
    expect(result[0].content[0]).not.toHaveProperty("cache_control");
    expect(result[1].content[0]).not.toHaveProperty("cache_control");
    // last message gets cc added
    expect(result[2].content[0]).toHaveProperty("cache_control");
  });

  test("strips cache_control from every block in a multi-block message", () => {
    const result = normalizeMessageCacheControl([
      {
        role: "user",
        content: [
          { type: "text", text: "a", cache_control: cc },
          { type: "text", text: "b", cache_control: cc },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "c" }],
      },
    ]);
    expect(result[0].content[0]).not.toHaveProperty("cache_control");
    expect(result[0].content[1]).not.toHaveProperty("cache_control");
    expect(result[1].content[0]).toHaveProperty("cache_control");
  });

  test("adds cache_control to the last content block of the last message", () => {
    const result = normalizeMessageCacheControl([
      {
        role: "user",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      },
    ]);
    expect(result[0].content[0]).not.toHaveProperty("cache_control");
    expect(result[0].content[1].cache_control).toEqual(cc);
  });

  test("leaves a single-message-string-content unchanged structurally", () => {
    const result = normalizeMessageCacheControl([
      { role: "user", content: "hello" },
    ]);
    // string-content can't carry cache_control; leave it alone
    expect(result[0].content).toBe("hello");
  });

  test("only the very last message gets cc; earlier last-array-block does not", () => {
    const result = normalizeMessageCacheControl([
      { role: "user", content: [{ type: "text", text: "a" }] },
      { role: "assistant", content: [{ type: "text", text: "b" }] },
    ]);
    expect(result[0].content[0]).not.toHaveProperty("cache_control");
    expect(result[1].content[0].cache_control).toEqual(cc);
  });

  test("is idempotent on an already-normalized list", () => {
    const once = normalizeMessageCacheControl([
      { role: "user", content: [{ type: "text", text: "a" }] },
      { role: "user", content: [{ type: "text", text: "b" }] },
    ]);
    const twice = normalizeMessageCacheControl(once);
    expect(twice).toEqual(once);
  });

  test("preserves message and content-block fields other than cache_control", () => {
    const result = normalizeMessageCacheControl([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "read_file",
            input: { path: "/x" },
            cache_control: cc,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "ok",
          },
        ],
      },
    ]);
    expect(result[0].content[0]).toMatchObject({
      type: "tool_use",
      id: "t1",
      name: "read_file",
      input: { path: "/x" },
    });
    expect(result[0].content[0]).not.toHaveProperty("cache_control");
    expect(result[1].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
      content: "ok",
    });
    expect(result[1].content[0].cache_control).toEqual(cc);
  });

  test("does not mutate the input array or its messages", () => {
    const input = [
      {
        role: "user",
        content: [{ type: "text", text: "a", cache_control: cc }],
      },
    ];
    normalizeMessageCacheControl(input);
    expect(input[0].content[0].cache_control).toEqual(cc);
  });
});
