import { describe, expect, test } from "vitest";
import { bodyToEditor, type EditableMessage, type EditableBlock } from "./editorModel";
import { serializeForApproval } from "./requestSerializer";

describe("editor → serialize wire", () => {
  test("editing a text block updates the serialized body", () => {
    const editor = bodyToEditor({
      model: "claude-x",
      messages: [
        { role: "user", content: [{ type: "text", text: "tell me about fastapi" }] },
      ],
    });

    // Simulate what the UI does when the user types into the textarea
    const msg = (editor.messages as EditableMessage[])[0];
    const block = (msg.content as EditableBlock[])[0];
    block.text = "tell me about rust";

    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.messages[0].content[0].text).toBe("tell me about rust");
      expect(JSON.stringify(result.body)).not.toContain("fastapi");
    }
  });

  test("editing a string message content updates the serialized body", () => {
    const editor = bodyToEditor({
      model: "claude-x",
      messages: [{ role: "user", content: "tell me about fastapi" }],
    });
    (editor.messages as EditableMessage[])[0].content = "tell me about rust";

    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.messages[0].content).toBe("tell me about rust");
    }
  });

  test("the serialized body has no __id or __deleted leakage", () => {
    const editor = bodyToEditor({
      model: "claude-x",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hi" }, { type: "text", text: "bye" }],
        },
      ],
    });
    const blocks = (editor.messages as EditableMessage[])[0].content as EditableBlock[];
    blocks[1].__deleted = true; // mark second block as deleted

    const result = serializeForApproval(editor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.body);
      expect(serialized).not.toContain("__id");
      expect(serialized).not.toContain("__deleted");
      expect(result.body.messages[0].content).toHaveLength(1);
    }
  });
});
