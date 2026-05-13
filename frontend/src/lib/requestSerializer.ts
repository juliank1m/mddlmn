import type { AnthropicRequestBody } from "./types";
import {
  editorToBody,
  type EditorBody,
  type EditableMessage,
  type EditableBlock,
} from "./editorModel";

export type SerializeResult =
  | { ok: true; body: AnthropicRequestBody }
  | { ok: false; errors: string[] };

function validateBlock(block: EditableBlock, errors: string[]): void {
  if (block.__deleted) return;
  if (block.type === "tool_use") {
    if (typeof block.id !== "string" || block.id.length === 0) {
      errors.push("tool_use block is missing id");
    }
    if (typeof block.name !== "string" || block.name.length === 0) {
      errors.push("tool_use block is missing name");
    }
  }
}

function validateMessage(msg: EditableMessage, errors: string[]): void {
  if (msg.__deleted) return;
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      validateBlock(block, errors);
    }
  }
}

export function serializeForApproval(editor: EditorBody): SerializeResult {
  const errors: string[] = [];

  const messages = Array.isArray(editor.messages)
    ? editor.messages.filter((m) => !m.__deleted)
    : [];
  if (messages.length === 0) {
    errors.push("Cannot send a request with no messages");
  }

  if (Array.isArray(editor.messages)) {
    for (const msg of editor.messages) {
      validateMessage(msg, errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, body: editorToBody(editor) };
}
