import { createHash, randomUUID } from "node:crypto";
import type { Section, SectionType } from "./index.js";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "redacted_thinking" }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type StreamingBlock = {
  type: string;
  index: number;
  accumulated: string;
  id?: string;
  name?: string;
  input?: string;
};

function makeSection(type: SectionType, content: unknown, label: string): Section {
  const normalized =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return {
    id: randomUUID(),
    type,
    label,
    content: normalized,
    tokenCount: 0,
    contentHash: createHash("sha256").update(normalized).digest("hex"),
  };
}

/**
 * Parse a streamed SSE response body into Section objects representing
 * the assistant's reply. Handles both streaming and non-streaming formats.
 */
export function parseResponseSections(responseBody: string): Section[] {
  // Non-streaming: full JSON response object
  if (responseBody.trimStart().startsWith("{")) {
    return parseJsonResponse(responseBody);
  }

  // Streaming: reconstruct content from SSE events
  return parseSseResponse(responseBody);
}

function parseJsonResponse(body: string): Section[] {
  try {
    const obj = JSON.parse(body) as {
      content?: ContentBlock[];
      usage?: { output_tokens?: number };
    };
    if (!obj.content) return [];
    return contentBlocksToSections(obj.content);
  } catch {
    return [];
  }
}

function parseSseResponse(sseText: string): Section[] {
  // SSE events arrive as "data: {...}\n\n" lines.
  // We reconstruct the content blocks by tracking deltas.
  const blocks: StreamingBlock[] = [];

  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }

    const eventType = event.type as string | undefined;

    if (eventType === "content_block_start") {
      const index = event.index as number;
      const block = event.content_block as Record<string, unknown> | undefined;
      blocks[index] = {
        type: (block?.type as string) ?? "text",
        index,
        accumulated: "",
        id: block?.id as string | undefined,
        name: block?.name as string | undefined,
        input: "",
      };
    }

    if (eventType === "content_block_delta") {
      const index = event.index as number;
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!blocks[index] || !delta) continue;

      const deltaType = delta.type as string;
      if (deltaType === "text_delta" && typeof delta.text === "string") {
        blocks[index].accumulated += delta.text;
      } else if (deltaType === "thinking_delta" && typeof delta.thinking === "string") {
        blocks[index].accumulated += delta.thinking;
      } else if (deltaType === "input_json_delta" && typeof delta.partial_json === "string") {
        blocks[index].input = (blocks[index].input ?? "") + delta.partial_json;
      }
    }
  }

  const sections: Section[] = [];
  let blockNum = 0;

  for (const block of blocks) {
    if (!block) continue;
    blockNum++;

    if (block.type === "text" && block.accumulated.trim()) {
      sections.push(
        makeSection("assistant_text", block.accumulated, `Response block ${blockNum}`)
      );
    } else if (block.type === "thinking" && block.accumulated.trim()) {
      sections.push(
        makeSection("thinking", block.accumulated, `Thinking block ${blockNum}`)
      );
    } else if (block.type === "tool_use") {
      let input: unknown = block.input ?? "";
      try {
        input = JSON.parse(block.input ?? "{}");
      } catch {
        // leave as string
      }
      sections.push(
        makeSection(
          "assistant_tool_call",
          {
            type: "tool_use",
            id: block.id ?? "toolu_mddlmn",
            name: block.name,
            input,
          },
          `Tool call: ${block.name ?? "unknown"}`
        )
      );
    }
  }

  return sections;
}

function contentBlocksToSections(blocks: ContentBlock[]): Section[] {
  const sections: Section[] = [];
  let i = 0;

  for (const block of blocks) {
    i++;
    if (block.type === "text" && block.text.trim()) {
      sections.push(makeSection("assistant_text", block.text, `Response block ${i}`));
    } else if (block.type === "thinking" && block.thinking?.trim()) {
      sections.push(makeSection("thinking", block.thinking, `Thinking block ${i}`));
    } else if (block.type === "tool_use") {
      sections.push(
        makeSection(
          "assistant_tool_call",
          {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          },
          `Tool call: ${block.name}`
        )
      );
    }
  }

  return sections;
}
