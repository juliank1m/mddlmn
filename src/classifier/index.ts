import { createHash, randomUUID } from "node:crypto";

export type SectionType =
  | "system"
  | "user_text"
  | "injected_context"
  | "assistant_text"
  | "assistant_tool_call"
  | "user_tool_result"
  | "thinking"
  | "tools"
  | "metadata";

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  content: string;
  tokenCount: number;
  contentHash: string;
}

type AnthropicMessage = {
  role?: unknown;
  content?: unknown;
};

export type AnthropicRequest = {
  model?: unknown;
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
  max_tokens?: unknown;
  [key: string]: unknown;
};

const SECTION_LABELS: Record<SectionType, string> = {
  system: "System prompt",
  user_text: "User text",
  injected_context: "Injected context",
  assistant_text: "Assistant text",
  assistant_tool_call: "Assistant tool call",
  user_tool_result: "Tool result",
  thinking: "Extended thinking",
  tools: "Tool definitions",
  metadata: "Metadata",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function contentToString(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function makeSection(type: SectionType, content: unknown, label?: string): Section {
  const normalizedContent = contentToString(content);

  return {
    id: randomUUID(),
    type,
    label: label ?? SECTION_LABELS[type],
    content: normalizedContent,
    tokenCount: 0,
    contentHash: createHash("sha256").update(normalizedContent).digest("hex"),
  };
}

export function parseAnthropicRequest(rawRequestBody: string): AnthropicRequest {
  const parsed = JSON.parse(rawRequestBody) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Expected request body to be a JSON object");
  }

  return parsed as AnthropicRequest;
}

function looksInjected(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.includes("<system-reminder>") ||
    trimmed.startsWith("<command-message>") ||
    trimmed.startsWith("<local-command-stdout>") ||
    trimmed.startsWith("<local-command-stderr>")
  );
}

function classifyUserBlock(block: Record<string, unknown>): SectionType {
  if (block.type === "tool_result") {
    return "user_tool_result";
  }

  if (block.type === "text" && typeof block.text === "string" && looksInjected(block.text)) {
    return "injected_context";
  }

  return "user_text";
}

function classifyAssistantBlock(block: Record<string, unknown>): SectionType {
  if (block.type === "tool_use") {
    return "assistant_tool_call";
  }

  if (block.type === "thinking" || block.type === "redacted_thinking") {
    return "thinking";
  }

  return "assistant_text";
}

function classifyMessage(message: AnthropicMessage, index: number): Section[] {
  const role = message.role;
  const content = message.content;

  if (role === "user") {
    if (typeof content === "string") {
      return [
        makeSection(
          looksInjected(content) ? "injected_context" : "user_text",
          content,
          `User message ${index + 1}`
        ),
      ];
    }

    if (Array.isArray(content)) {
      return content.map((block, blockIndex) => {
        if (isRecord(block)) {
          return makeSection(
            classifyUserBlock(block),
            block,
            `User message ${index + 1}, block ${blockIndex + 1}`
          );
        }

        return makeSection("user_text", block, `User message ${index + 1}, block ${blockIndex + 1}`);
      });
    }
  }

  if (role === "assistant") {
    if (typeof content === "string") {
      return [makeSection("assistant_text", content, `Assistant message ${index + 1}`)];
    }

    if (Array.isArray(content)) {
      return content.map((block, blockIndex) => {
        if (isRecord(block)) {
          return makeSection(
            classifyAssistantBlock(block),
            block,
            `Assistant message ${index + 1}, block ${blockIndex + 1}`
          );
        }

        return makeSection(
          "assistant_text",
          block,
          `Assistant message ${index + 1}, block ${blockIndex + 1}`
        );
      });
    }
  }

  return [makeSection("metadata", message, `Message ${index + 1}`)];
}

function metadataFromRequest(request: AnthropicRequest): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(request)) {
    if (key !== "system" && key !== "messages" && key !== "tools") {
      metadata[key] = value;
    }
  }

  return metadata;
}

export function classify(rawRequestBody: string): Section[] {
  const request = parseAnthropicRequest(rawRequestBody);
  const sections: Section[] = [];

  if (request.system !== undefined) {
    sections.push(makeSection("system", request.system));
  }

  if (request.tools !== undefined) {
    sections.push(makeSection("tools", request.tools));
  }

  const metadata = metadataFromRequest(request);
  if (Object.keys(metadata).length > 0) {
    sections.push(makeSection("metadata", metadata));
  }

  if (Array.isArray(request.messages)) {
    request.messages.forEach((message, index) => {
      if (isRecord(message)) {
        sections.push(...classifyMessage(message, index));
      } else {
        sections.push(makeSection("metadata", message, `Message ${index + 1}`));
      }
    });
  }

  return sections;
}

export function extractLastUserPreview(request: AnthropicRequest): string | null {
  if (!Array.isArray(request.messages)) {
    return null;
  }

  for (let i = request.messages.length - 1; i >= 0; i -= 1) {
    const message = request.messages[i];
    if (!isRecord(message) || message.role !== "user") {
      continue;
    }

    const content = message.content;
    if (typeof content === "string" && !looksInjected(content)) {
      return content.slice(0, 120);
    }

    if (Array.isArray(content)) {
      const text = content
        .filter(isRecord)
        .filter((block) => block.type === "text")
        .map((block) => (typeof block.text === "string" ? block.text : ""))
        .filter((text) => text && !looksInjected(text))
        .join("\n")
        .trim();

      if (text) {
        return text.slice(0, 120);
      }
    }
  }

  return null;
}

export function detectRequestKind(
  path: string,
  request: AnthropicRequest
): {
  isMainConversation: boolean;
  isTopLevel: boolean;
} {
  if (path.startsWith("/v1/messages/count_tokens")) {
    return { isMainConversation: false, isTopLevel: false };
  }

  const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
  const systemLength = contentToString(request.system ?? "").length;
  const maxTokens = typeof request.max_tokens === "number" ? request.max_tokens : null;
  const isQuotaProbe = maxTokens === 1 && extractLastUserPreview(request)?.toLowerCase() === "quota";
  const isMainConversation = hasTools && !isQuotaProbe && systemLength > 500;

  return {
    isMainConversation,
    isTopLevel: isMainConversation && isUserInitiated(request),
  };
}

function isUserInitiated(request: AnthropicRequest): boolean {
  if (!Array.isArray(request.messages) || request.messages.length === 0) return false;

  // Walk backwards to find the last user-role message
  for (let i = request.messages.length - 1; i >= 0; i--) {
    const msg = request.messages[i];
    if (!isRecord(msg) || msg.role !== "user") continue;

    const content = msg.content;

    // String content — must be non-injected text
    if (typeof content === "string") return !looksInjected(content);

    // Array content — top-level if it contains at least one plain text block
    // (not a tool_result and not injected context)
    if (Array.isArray(content)) {
      return content.some(
        (block) =>
          isRecord(block) &&
          block.type === "text" &&
          typeof block.text === "string" &&
          !looksInjected(block.text)
      );
    }

    return false;
  }

  return false;
}
