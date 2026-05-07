type ContentBlock = Record<string, unknown>;
type Message = { role: string; content: unknown };

const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" } as const;

function stripCacheControl(block: ContentBlock): ContentBlock {
  if (!("cache_control" in block)) return block;
  const next = { ...block };
  delete next.cache_control;
  return next;
}

function withCacheControl(block: ContentBlock): ContentBlock {
  return { ...block, cache_control: { ...EPHEMERAL_CACHE_CONTROL } };
}

/**
 * Normalize cache_control markers across canonical messages.
 *
 * Claude Code uses a rolling-boundary cache_control strategy that places
 * markers on the latest 1-2 message blocks. Canonical preserves the marker
 * state from when each message was ingested, so stale markers accumulate
 * across turns and the request eventually exceeds Anthropic's max-4 limit.
 *
 * Strip cache_control from every message, then add it back to the last
 * content block of the last message. Combined with the system + tools
 * markers (which sit outside `messages`), total cache_control count is
 * at most 3.
 */
export function normalizeMessageCacheControl(messages: Message[]): Message[] {
  if (messages.length === 0) return [];

  const normalized: Message[] = messages.map((msg) => {
    if (Array.isArray(msg.content)) {
      const stripped = (msg.content as ContentBlock[]).map(stripCacheControl);
      return { ...msg, content: stripped };
    }
    return { ...msg };
  });

  const last = normalized[normalized.length - 1];
  if (Array.isArray(last.content) && last.content.length > 0) {
    const blocks = (last.content as ContentBlock[]).slice();
    blocks[blocks.length - 1] = withCacheControl(blocks[blocks.length - 1]);
    normalized[normalized.length - 1] = { ...last, content: blocks };
  }

  return normalized;
}
