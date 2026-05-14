import type { WSEvent } from "./types";

export interface Bridge {
  fetch<T>(endpoint: string): Promise<T>;
  post<T>(endpoint: string, body?: unknown): Promise<T>;
  patch<T>(endpoint: string, body?: unknown): Promise<T>;
  del<T>(endpoint: string): Promise<T>;
  onEvent(handler: (event: WSEvent) => void): () => void;
  onStatus(handler: (status: BridgeStatus) => void): () => void;
  onProxyState(handler: (state: ProxyState) => void): () => void;
  startProxy(): void;
  stopProxy(): void;
}

export type BridgeStatus = "connecting" | "open" | "closed" | "error";
export type ProxyState = {
  port?: number;
  baseUrl: string | null;
  running: boolean;
};

type VsCodeApi = {
  postMessage(message: unknown): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const inWebview =
  typeof window !== "undefined" && typeof window.acquireVsCodeApi === "function";

export const bridge: Bridge = inWebview ? createWebviewBridge() : createBrowserBridge();

function createBrowserBridge(): Bridge {
  const eventHandlers = new Set<(event: WSEvent) => void>();
  const statusHandlers = new Set<(status: BridgeStatus) => void>();
  const proxyStateHandlers = new Set<(state: ProxyState) => void>();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const emitStatus = (status: BridgeStatus) => {
    for (const handler of statusHandlers) handler(status);
  };

  const connect = () => {
    if (socket) return;
    emitStatus("connecting");

    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    socket = ws;

    ws.addEventListener("open", () => emitStatus("open"));
    ws.addEventListener("close", () => {
      socket = null;
      emitStatus("closed");
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1500);
      }
    });
    ws.addEventListener("error", () => emitStatus("error"));
    ws.addEventListener("message", (msg) => {
      try {
        const data = JSON.parse(msg.data) as WSEvent;
        for (const handler of eventHandlers) handler(data);
      } catch {
        // ignore non-JSON
      }
    });
  };

  connect();

  return {
    async fetch<T>(endpoint: string): Promise<T> {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      return (await res.json()) as T;
    },
    async post<T>(endpoint: string, body?: unknown): Promise<T> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      return (await res.json()) as T;
    },
    async patch<T>(endpoint: string, body?: unknown): Promise<T> {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      return (await res.json()) as T;
    },
    async del<T>(endpoint: string): Promise<T> {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      return (await res.json()) as T;
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    onProxyState(handler) {
      proxyStateHandlers.add(handler);
      handler({ baseUrl: `${location.protocol}//${location.host}`, running: true });
      return () => proxyStateHandlers.delete(handler);
    },
    startProxy() {
      connect();
    },
    stopProxy() {
      socket?.close();
    },
  };
}

function createWebviewBridge(): Bridge {
  const vscode = window.acquireVsCodeApi!();
  const eventHandlers = new Set<(event: WSEvent) => void>();
  const statusHandlers = new Set<(status: BridgeStatus) => void>();
  const proxyStateHandlers = new Set<(state: ProxyState) => void>();
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  window.addEventListener("message", (msg) => {
    const data = msg.data as
      | { type: "fetch:response"; id: string; ok: boolean; status: number; body: unknown }
      | { type: "fetch:error"; id: string; error: string }
      | { type: "ws:event"; event: WSEvent }
      | { type: "ws:status"; status: "open" | "closed" }
      | { type: "ws:error"; error: string }
      | { type: "state"; proxy: ProxyState };

    if (!data || typeof data !== "object") return;

    switch (data.type) {
      case "fetch:response": {
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        if (data.ok) p.resolve(data.body);
        else p.reject(new Error(`HTTP ${data.status}`));
        return;
      }
      case "fetch:error": {
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        p.reject(new Error(data.error));
        return;
      }
      case "ws:event":
        for (const handler of eventHandlers) handler(data.event);
        return;
      case "ws:status":
        for (const handler of statusHandlers) handler(data.status === "open" ? "open" : "closed");
        return;
      case "ws:error":
        for (const handler of statusHandlers) handler("error");
        return;
      case "state":
        for (const handler of proxyStateHandlers) handler(data.proxy);
        if (data.proxy.running) {
          vscode.postMessage({ type: "ws:connect" });
        } else {
          for (const handler of statusHandlers) handler("closed");
        }
        return;
    }
  });

  vscode.postMessage({ type: "ready" });

  return {
    fetch<T>(endpoint: string): Promise<T> {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
        });
        vscode.postMessage({ type: "fetch", id, endpoint });
      });
    },
    post<T>(endpoint: string, body?: unknown): Promise<T> {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
        });
        vscode.postMessage({
          type: "fetch",
          id,
          endpoint,
          init: {
            method: "POST",
            headers: body !== undefined ? { "content-type": "application/json" } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
          },
        });
      });
    },
    patch<T>(endpoint: string, body?: unknown): Promise<T> {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
        });
        vscode.postMessage({
          type: "fetch",
          id,
          endpoint,
          init: {
            method: "PATCH",
            headers: body !== undefined ? { "content-type": "application/json" } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
          },
        });
      });
    },
    del<T>(endpoint: string): Promise<T> {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
        });
        vscode.postMessage({
          type: "fetch",
          id,
          endpoint,
          init: { method: "DELETE" },
        });
      });
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    onProxyState(handler) {
      proxyStateHandlers.add(handler);
      return () => proxyStateHandlers.delete(handler);
    },
    startProxy() {
      vscode.postMessage({ type: "proxy:start" });
      for (const handler of statusHandlers) handler("connecting");
    },
    stopProxy() {
      vscode.postMessage({ type: "proxy:stop" });
    },
  };
}
