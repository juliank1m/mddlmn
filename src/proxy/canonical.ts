type Message = { role: string; content: unknown };

/**
 * CanonicalConversation maintains a server-owned copy of the conversation
 * that is the source of truth for what gets forwarded upstream. Claude Code
 * replays its full transcript on every request; we ignore the replay's
 * prefix and only ingest the new tail. This lets us keep edits and abort
 * decisions stable across requests, even though Claude Code keeps replaying
 * the original prompts client-side.
 *
 * Length-based session detection: if the incoming message count is shorter
 * than what we last saw, treat it as a client restart and reset.
 */
export class CanonicalConversation {
  private messages: Message[] = [];
  private lastSeenIncomingCount = 0;

  size(): number {
    return this.messages.length;
  }

  getMessages(): Message[] {
    return this.messages.slice();
  }

  reset(): void {
    this.messages = [];
    this.lastSeenIncomingCount = 0;
  }

  ingest(incoming: Message[]): Message[] {
    if (incoming.length < this.lastSeenIncomingCount) {
      this.reset();
    }

    const tail = incoming.slice(this.lastSeenIncomingCount);
    this.messages.push(...tail);
    this.lastSeenIncomingCount = incoming.length;
    return this.getMessages();
  }

  popLastTurn(): void {
    if (this.messages.length === 0) return;
    this.messages.pop();
    // lastSeenIncomingCount is intentionally NOT decremented — the client
    // still sent that turn, and on its next replay it will resend the same
    // prefix (including the popped turn). We slice from lastSeenIncomingCount,
    // which means the popped turn gets skipped on the next ingest, exactly
    // as if the client had never sent it.
  }

  /**
   * Advance lastSeenIncomingCount by `count` extra messages without ingesting
   * them. Used after we synthesize a fake response that the client will append
   * to its history — those synthetic messages will appear in the client's next
   * replay, and we want to skip them on the next ingest rather than pulling
   * them into canonical.
   */
  noteSyntheticAppend(count: number): void {
    this.lastSeenIncomingCount += count;
  }
}
