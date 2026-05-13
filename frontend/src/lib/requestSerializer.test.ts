import { describe, expect, test } from "vitest";
import { serializeForApproval } from "./requestSerializer";
import { bodyToEditor, type EditableMessage } from "./editorModel";

describe("serializeForApproval", () => {
  test("returns ok with stripped body for a valid editor state", () => {
    const editor = bodyToEditor({
      model: "x",
      messages: [{ role: "user", content: "hi" }],
    });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({
        model: "x",
        messages: [{ role: "user", content: "hi" }],
      });
    }
  });

  test("fails when all messages are tombstoned", () => {
    const editor = bodyToEditor({
      messages: [{ role: "user", content: "hi" }],
    });
    (editor.messages as EditableMessage[])[0].__deleted = true;
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Cannot send a request with no messages");
    }
  });

  test("fails when messages is missing entirely", () => {
    const editor = bodyToEditor({ model: "x" });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(false);
  });

  test("fails when a tool_use block is missing id", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "read", input: {} }],
        },
      ],
    });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/tool_use.*id/i);
    }
  });

  test("fails when a tool_use block is missing name", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", input: {} }],
        },
      ],
    });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/tool_use.*name/i);
    }
  });

  test("passes for valid tool_use block", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "read", input: {} }],
        },
      ],
    });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
  });

  test("ignores tombstoned invalid blocks", () => {
    const editor = bodyToEditor({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", name: "read", input: {} }, // missing id
          ],
        },
      ],
    });
    const msgs = editor.messages as EditableMessage[];
    msgs[1].__deleted = true;
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
  });

  test("collects multiple errors", () => {
    const editor = bodyToEditor({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", input: {} }, // missing id AND name
          ],
        },
      ],
    });
    const result = serializeForApproval(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
