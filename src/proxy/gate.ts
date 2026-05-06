import type { AnthropicRequest } from "../classifier/index.js";

export type GateDecision =
  | { decision: "approve"; body: AnthropicRequest }
  | { decision: "cancel" };

interface HeldEntry {
  requestId: string;
  body: AnthropicRequest;
  resolve: (decision: GateDecision) => void;
}

type HoldListener = (requestId: string, body: AnthropicRequest) => void;

export class Gate {
  private enabled = false;
  private queue: HeldEntry[] = [];
  private holdListeners: HoldListener[] = [];

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): string[] {
    this.enabled = false;
    const releasedIds: string[] = [];
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      releasedIds.push(entry.requestId);
      entry.resolve({ decision: "approve", body: entry.body });
    }
    return releasedIds;
  }

  queueLength(): number {
    return this.queue.length;
  }

  currentHeldId(): string | null {
    return this.queue[0]?.requestId ?? null;
  }

  onHold(listener: HoldListener): void {
    this.holdListeners.push(listener);
  }

  hold(requestId: string, body: AnthropicRequest): Promise<GateDecision> {
    if (!this.enabled) {
      return Promise.resolve({ decision: "approve", body });
    }
    return new Promise((resolve) => {
      const wasEmpty = this.queue.length === 0;
      this.queue.push({ requestId, body, resolve });
      if (wasEmpty) {
        this.notifyHold(requestId, body);
      }
    });
  }

  approve(requestId: string, editedBody?: AnthropicRequest): void {
    this.resolveAndAdvance(requestId, (entry) => ({
      decision: "approve",
      body: editedBody ?? entry.body,
    }));
  }

  cancel(requestId: string): void {
    this.resolveAndAdvance(requestId, () => ({ decision: "cancel" }));
  }

  private resolveAndAdvance(
    requestId: string,
    decide: (entry: HeldEntry) => GateDecision
  ): void {
    const idx = this.queue.findIndex((e) => e.requestId === requestId);
    if (idx === -1) return;

    const [entry] = this.queue.splice(idx, 1);
    entry.resolve(decide(entry));

    if (idx === 0 && this.queue.length > 0) {
      const next = this.queue[0];
      this.notifyHold(next.requestId, next.body);
    }
  }

  private notifyHold(requestId: string, body: AnthropicRequest): void {
    for (const listener of this.holdListeners) {
      try {
        listener(requestId, body);
      } catch (err) {
        console.error("[gate] onHold listener threw:", err);
      }
    }
  }
}
