import type { AnthropicRequestBody } from "./types";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `e_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface EditableBlock {
  __id: string;
  __deleted?: boolean;
  [key: string]: unknown;
}

export interface EditableMessage {
  __id: string;
  __deleted?: boolean;
  role: string;
  content: string | EditableBlock[];
}

export interface EditorBody {
  [key: string]: unknown;
  system?: string | EditableBlock[];
  tools?: EditableBlock[];
  messages?: EditableMessage[];
}

function tagBlock(block: unknown): EditableBlock {
  if (block && typeof block === "object" && !Array.isArray(block)) {
    return { ...(block as Record<string, unknown>), __id: nextId() } as EditableBlock;
  }
  // For non-object blocks (rare), wrap minimally
  return { __id: nextId(), value: block } as EditableBlock;
}

function tagMessage(msg: unknown): EditableMessage {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { __id: nextId(), role: "user", content: "" };
  }
  const m = msg as { role?: unknown; content?: unknown; [k: string]: unknown };
  const role = typeof m.role === "string" ? m.role : "user";
  const content =
    typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map(tagBlock)
        : "";
  return { ...m, __id: nextId(), role, content };
}

export function bodyToEditor(body: AnthropicRequestBody): EditorBody {
  const editor: EditorBody = { ...body };

  if (Array.isArray(body.system)) {
    editor.system = body.system.map(tagBlock);
  } else if (typeof body.system === "string") {
    editor.system = body.system;
  }

  if (Array.isArray(body.tools)) {
    editor.tools = body.tools.map(tagBlock);
  }

  if (Array.isArray(body.messages)) {
    editor.messages = body.messages.map(tagMessage);
  }

  return editor;
}

function stripBlock(block: EditableBlock): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(block)) {
    if (k === "__id" || k === "__deleted") continue;
    rest[k] = v;
  }
  return rest;
}

function stripMessage(msg: EditableMessage): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(msg)) {
    if (k === "__id" || k === "__deleted" || k === "content") continue;
    rest[k] = v;
  }
  const content =
    typeof msg.content === "string"
      ? msg.content
      : msg.content.filter((b) => !b.__deleted).map(stripBlock);
  return { ...rest, content };
}

export function editorToBody(editor: EditorBody): AnthropicRequestBody {
  const body: AnthropicRequestBody = {};
  for (const [k, v] of Object.entries(editor)) {
    if (k === "system" || k === "tools" || k === "messages") continue;
    body[k] = v;
  }

  if (Array.isArray(editor.system)) {
    body.system = editor.system.filter((b) => !b.__deleted).map(stripBlock);
  } else if (typeof editor.system === "string") {
    body.system = editor.system;
  }

  if (Array.isArray(editor.tools)) {
    body.tools = editor.tools.filter((b) => !b.__deleted).map(stripBlock);
  }

  if (Array.isArray(editor.messages)) {
    body.messages = editor.messages.filter((m) => !m.__deleted).map(stripMessage);
  }

  return body;
}
