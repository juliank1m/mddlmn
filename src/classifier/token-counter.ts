import type { Section } from "./index.js";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const TOKEN_COUNT_PATH = "/v1/messages/count_tokens";

export type CountTokensOptions = {
  model: string;
  headers: Record<string, string>;
  baseUrl?: string;
};

type TokenCountResponse = {
  input_tokens?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function contentBlocks(content: unknown): unknown[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : [content];
}

function dummyToolResultFor(toolUse: unknown): Record<string, unknown> {
  const toolUseId = isRecord(toolUse) && typeof toolUse.id === "string" ? toolUse.id : "toolu_mddlmn";

  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: "",
  };
}

function dummyToolUseFor(toolResult: unknown): Record<string, unknown> {
  const toolUseId =
    isRecord(toolResult) && typeof toolResult.tool_use_id === "string"
      ? toolResult.tool_use_id
      : "toolu_mddlmn";

  return {
    type: "tool_use",
    id: toolUseId,
    name: "mddlmn_token_count_placeholder",
    input: {},
  };
}

function tokenCountRequestForSection(section: Section, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: "." }],
  };

  const content = parseJsonContent(section.content);

  if (section.type === "system") {
    body.system = content;
    return body;
  }

  if (section.type === "tools") {
    body.tools = content;
    return body;
  }

  if (section.type === "metadata") {
    body.messages = [{ role: "user", content: section.content }];
    return body;
  }

  if (section.type === "assistant_tool_call") {
    body.messages = [
      { role: "assistant", content: contentBlocks(content) },
      { role: "user", content: [dummyToolResultFor(content)] },
    ];
    return body;
  }

  if (section.type === "user_tool_result") {
    body.messages = [
      { role: "assistant", content: [dummyToolUseFor(content)] },
      { role: "user", content: contentBlocks(content) },
    ];
    return body;
  }

  const role =
    section.type === "assistant_text" || section.type === "thinking"
      ? "assistant"
      : "user";

  body.messages = [
    {
      role,
      content: typeof content === "string" ? content : [content],
    },
  ];

  return body;
}

function cleanTokenCountHeaders(headers: Record<string, string>): Record<string, string> {
  const cleanHeaders: Record<string, string> = {};
  const stripped = new Set([
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "accept-encoding",
  ]);

  for (const [key, value] of Object.entries(headers)) {
    if (!stripped.has(key.toLowerCase())) {
      cleanHeaders[key] = value;
    }
  }

  cleanHeaders["content-type"] = "application/json";
  return cleanHeaders;
}

async function countSectionTokens(
  section: Section,
  options: CountTokensOptions
): Promise<number> {
  const url = `${options.baseUrl ?? ANTHROPIC_BASE}${TOKEN_COUNT_PATH}`;
  const response = await fetch(url, {
    method: "POST",
    headers: cleanTokenCountHeaders(options.headers),
    body: JSON.stringify(tokenCountRequestForSection(section, options.model)),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token count failed for ${section.type}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenCountResponse;
  if (typeof data.input_tokens !== "number") {
    throw new Error(`Token count response missing input_tokens for ${section.type}`);
  }

  return data.input_tokens;
}

export async function countTokens(
  sections: Section[],
  options: CountTokensOptions
): Promise<Section[]> {
  const countedSections: Section[] = [];

  for (const section of sections) {
    try {
      countedSections.push({
        ...section,
        tokenCount: await countSectionTokens(section, options),
      });
    } catch (err) {
      console.error(`[classifier] Token counting failed for ${section.type} ${section.id}:`, err);
      countedSections.push(section);
    }
  }

  return countedSections;
}
