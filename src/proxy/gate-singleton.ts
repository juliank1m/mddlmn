import { Gate } from "./gate.js";
import {
  broadcastGateStatus,
  broadcastRequestHeld,
  broadcastRequestReleased,
} from "../ws/manager.js";
import { getCurrentSessionId } from "../storage/db.js";

export const gate = new Gate();

gate.onHold((requestId, body, kind) => {
  broadcastRequestHeld({
    requestId,
    sessionId: getCurrentSessionId(),
    body,
    kind,
    timestamp: Date.now(),
  });
});

export function broadcastCurrentGateStatus(): void {
  broadcastGateStatus({
    enabled: gate.isEnabled(),
    queueLength: gate.queueLength(),
  });
}

export function setGateEnabled(enabled: boolean): void {
  if (enabled) {
    gate.enable();
  } else {
    const released = gate.disable();
    for (const requestId of released) {
      broadcastRequestReleased({ requestId });
    }
  }
  broadcastCurrentGateStatus();
}

export function approveHeld(
  requestId: string,
  editedBody?: import("../classifier/index.js").AnthropicRequest
): void {
  gate.approve(requestId, editedBody);
  broadcastRequestReleased({ requestId });
  broadcastCurrentGateStatus();
}

export function cancelHeld(requestId: string): void {
  gate.cancel(requestId);
  broadcastRequestReleased({ requestId });
  broadcastCurrentGateStatus();
}
