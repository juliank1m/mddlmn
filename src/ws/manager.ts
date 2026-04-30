import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import type { SectionType } from "../classifier/index.js";

export type RequestKind = "top_level" | "tool_chain" | "aux";

export type SectionSummary = {
  type: SectionType;
  tokenCount: number;
};

export type NewRequestEvent = {
  type: "new_request";
  requestId: string;
  sessionId: string;
  totalTokens: number;
  model: string | null;
  kind: RequestKind;
  preview: string | null;
  timestamp: number;
};

export type RequestClassifiedEvent = {
  type: "request_classified";
  requestId: string;
  sections: SectionSummary[];
};

export type WSEvent = NewRequestEvent | RequestClassifiedEvent;

const clients = new Set<WebSocket>();

function send(socket: WebSocket, event: WSEvent): boolean {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(JSON.stringify(event));
  return true;
}

export async function registerWebSocketManager(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);

    socket.on("close", () => {
      clients.delete(socket);
    });

    socket.on("error", () => {
      clients.delete(socket);
    });
  });
}

export function broadcast(event: WSEvent): void {
  for (const client of clients) {
    if (!send(client, event)) {
      clients.delete(client);
    }
  }
}

export function broadcastNewRequest(event: Omit<NewRequestEvent, "type">): void {
  broadcast({ type: "new_request", ...event });
}

export function broadcastRequestClassified(
  event: Omit<RequestClassifiedEvent, "type">
): void {
  broadcast({ type: "request_classified", ...event });
}
