import { describe, expect, test } from "vitest";
import {
  bodyToEditor,
  editorToBody,
  type EditableMessage,
  type EditableBlock,
} from "./editorModel";

describe("bodyToEditor", () => {
  test("assigns __id to every message", () => {
    const result = bodyToEditor({
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });
    const msgs = result.messages as EditableMessage[];
    expect(msgs[0].__id).toBeDefined();
    expect(msgs[1].__id).toBeDefined();
    expect(msgs[0].__id).not.toBe(msgs[1].__id);
  });

  test("assigns __id to each content block when content is an array", () => {
    const result = bodyToEditor({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "x" },
            { type: "text", text: "y" },
          ],
        },
      ],
    });
    const msgs = result.messages as EditableMessage[];
    const blocks = msgs[0].content as EditableBlock[];
    expect(blocks[0].__id).toBeDefined();
    expect(blocks[1].__id).toBeDefined();
    expect(blocks[0].__id).not.toBe(blocks[1].__id);
  });

  test("leaves string content as a string", () => {
    const result = bodyToEditor({
      messages: [{ role: "user", content: "hello" }],
    });
    const msgs = result.messages as EditableMessage[];
    expect(msgs[0].content).toBe("hello");
  });

  test("assigns __id to each system block when system is an array", () => {
    const result = bodyToEditor({
      system: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    });
    const blocks = result.system as EditableBlock[];
    expect(blocks[0].__id).toBeDefined();
    expect(blocks[1].__id).toBeDefined();
  });

  test("leaves string system as a string", () => {
    const result = bodyToEditor({ system: "you are helpful" });
    expect(result.system).toBe("you are helpful");
  });

  test("assigns __id to each tool definition", () => {
    const result = bodyToEditor({
      tools: [
        { name: "a", description: "" },
        { name: "b", description: "" },
      ],
    });
    const tools = result.tools as EditableBlock[];
    expect(tools[0].__id).toBeDefined();
    expect(tools[1].__id).toBeDefined();
  });

  test("preserves all top-level scalar fields", () => {
    const result = bodyToEditor({
      model: "claude-x",
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
      messages: [],
    });
    expect(result.model).toBe("claude-x");
    expect(result.max_tokens).toBe(1024);
    expect(result.temperature).toBe(0.7);
    expect(result.stream).toBe(true);
  });

  test("does not mutate input", () => {
    const body = {
      messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
    };
    const snapshot = JSON.stringify(body);
    bodyToEditor(body);
    expect(JSON.stringify(body)).toBe(snapshot);
  });
});

describe("editorToBody", () => {
  test("strips __id from messages and blocks", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "x" }],
        },
      ],
    });
    const result = editorToBody(editor);
    expect(JSON.stringify(result)).not.toContain("__id");
  });

  test("removes tombstoned messages", () => {
    const editor = bodyToEditor({
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    });
    (editor.messages as EditableMessage[])[1].__deleted = true;

    const result = editorToBody(editor);
    expect(result.messages).toEqual([
      { role: "user", content: "a" },
      { role: "user", content: "c" },
    ]);
  });

  test("removes tombstoned content blocks", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "keep" },
            { type: "text", text: "drop" },
          ],
        },
      ],
    });
    const blocks = (editor.messages as EditableMessage[])[0].content as EditableBlock[];
    blocks[1].__deleted = true;

    const result = editorToBody(editor);
    expect(result.messages[0].content).toEqual([{ type: "text", text: "keep" }]);
  });

  test("removes tombstoned system blocks", () => {
    const editor = bodyToEditor({
      system: [
        { type: "text", text: "keep" },
        { type: "text", text: "drop" },
      ],
    });
    (editor.system as EditableBlock[])[1].__deleted = true;

    const result = editorToBody(editor);
    expect(result.system).toEqual([{ type: "text", text: "keep" }]);
  });

  test("removes tombstoned tool definitions", () => {
    const editor = bodyToEditor({
      tools: [
        { name: "keep" },
        { name: "drop" },
      ],
    });
    (editor.tools as EditableBlock[])[1].__deleted = true;

    const result = editorToBody(editor);
    expect(result.tools).toEqual([{ name: "keep" }]);
  });

  test("strips __deleted flag from non-deleted items", () => {
    const editor = bodyToEditor({
      messages: [{ role: "user", content: "x" }],
    });
    const result = editorToBody(editor);
    expect(JSON.stringify(result)).not.toContain("__deleted");
  });

  test("round-trips a complex body unchanged (mod ID assignment)", () => {
    const body = {
      model: "claude-x",
      max_tokens: 1024,
      system: [{ type: "text", text: "instructions" }],
      tools: [{ name: "read_file", description: "Read a file" }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "do the thing" }],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "ok" },
            { type: "tool_use", id: "t1", name: "read_file", input: { path: "/x" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "data" },
          ],
        },
      ],
    };
    expect(editorToBody(bodyToEditor(body))).toEqual(body);
  });

  test("preserves arbitrary top-level fields", () => {
    const editor = bodyToEditor({
      model: "x",
      max_tokens: 100,
      stream: true,
      metadata: { user_id: "u1" },
      messages: [],
    });
    const result = editorToBody(editor);
    expect(result.model).toBe("x");
    expect(result.max_tokens).toBe(100);
    expect(result.stream).toBe(true);
    expect(result.metadata).toEqual({ user_id: "u1" });
  });
});
