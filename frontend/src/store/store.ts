import { create } from "zustand";
import { bridge, type BridgeStatus, type ProxyState } from "../lib/bridge";
import type {
  RequestRecord,
  SectionRecord,
  SessionRecord,
  WSEvent,
} from "../lib/types";

export type TabKey = "inspector" | "diff" | "timeline" | "tokens";

interface State {
  status: BridgeStatus;
  proxy: ProxyState;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  requests: RequestRecord[];
  selectedRequestId: string | null;
  tab: TabKey;
  followLive: boolean;
  showAux: boolean;
  flashIds: Set<string>; // request ids that just arrived (for animation)
  sectionsCache: Record<string, SectionRecord[]>;
  diffPairOverride: { idA: string; idB: string } | null;
}

interface Actions {
  hydrate(): Promise<void>;
  startProxy(): void;
  stopProxy(): void;
  selectSession(id: string): Promise<void>;
  selectRequest(id: string): void;
  setTab(tab: TabKey): void;
  setFollowLive(value: boolean): void;
  setShowAux(value: boolean): void;
  loadSections(requestId: string): Promise<SectionRecord[]>;
  setDiffPair(pair: { idA: string; idB: string } | null): void;
  clearFlash(id: string): void;
}

export const useStore = create<State & Actions>((set, get) => ({
  status: "closed",
  proxy: { baseUrl: null, running: false },
  sessions: [],
  activeSessionId: null,
  requests: [],
  selectedRequestId: null,
  tab: "inspector",
  followLive: true,
  showAux: false,
  flashIds: new Set(),
  sectionsCache: {},
  diffPairOverride: null,

  async hydrate() {
    if (!get().proxy.running) {
      return;
    }

    try {
      const { sessions } = await bridge.fetch<{ sessions: SessionRecord[] }>(
        "/api/sessions"
      );
      set({ sessions });
      const active = sessions[0];
      if (active) {
        await get().selectSession(active.id);
      }
    } catch {
      // network error — leave empty
    }
  },

  startProxy() {
    bridge.startProxy();
  },

  stopProxy() {
    bridge.stopProxy();
  },

  async selectSession(id) {
    set({ activeSessionId: id, requests: [], selectedRequestId: null });
    try {
      const { requests } = await bridge.fetch<{ requests: RequestRecord[] }>(
        `/api/sessions/${id}/requests`
      );
      set({ requests });
    } catch {
      // ignore
    }
  },

  selectRequest(id) {
    set({ selectedRequestId: id, diffPairOverride: null });
    void get().loadSections(id);
  },

  setTab(tab) {
    set({ tab });
  },

  setFollowLive(value) {
    set({ followLive: value });
  },

  setShowAux(value) {
    set({ showAux: value });
  },

  async loadSections(requestId) {
    const cached = get().sectionsCache[requestId];
    if (cached) return cached;

    try {
      const { sections } = await bridge.fetch<{ sections: SectionRecord[] }>(
        `/api/requests/${requestId}/sections`
      );
      set((state) => ({
        sectionsCache: { ...state.sectionsCache, [requestId]: sections },
      }));
      return sections;
    } catch {
      return [];
    }
  },

  setDiffPair(pair) {
    set({ diffPairOverride: pair });
  },

  clearFlash(id) {
    set((state) => {
      if (!state.flashIds.has(id)) return state;
      const next = new Set(state.flashIds);
      next.delete(id);
      return { flashIds: next };
    });
  },
}));

// Initialize bridge subscriptions once
let initialized = false;
export function initBridge(): void {
  if (initialized) return;
  initialized = true;

  bridge.onStatus((status) => useStore.setState({ status }));

  bridge.onProxyState((proxy) => {
    useStore.setState({ proxy });
    if (proxy.running) {
      void useStore.getState().hydrate();
    }
  });

  bridge.onEvent(async (event: WSEvent) => {
    const state = useStore.getState();

    if (event.type === "new_request") {
      // If session unknown yet, hydrate sessions list.
      if (!state.activeSessionId) {
        await state.hydrate();
        return;
      }

      if (event.sessionId !== state.activeSessionId) return;

      // Fetch the new request record
      try {
        const { request } = await bridge.fetch<{ request: RequestRecord }>(
          `/api/requests/${event.requestId}`
        );
        useStore.setState((s) => {
          if (s.requests.some((r) => r.id === request.id)) return s;
          const flashIds = new Set(s.flashIds);
          flashIds.add(request.id);
          const next = {
            requests: [...s.requests, request],
            flashIds,
            selectedRequestId: s.followLive ? request.id : s.selectedRequestId,
          };
          return next;
        });

        if (useStore.getState().followLive) {
          void useStore.getState().loadSections(request.id);
        }

        // Auto-clear flash after animation
        setTimeout(() => useStore.getState().clearFlash(request.id), 2200);
      } catch {
        // ignore
      }
    }

    if (event.type === "request_classified") {
      // Invalidate sections cache to pick up classified content
      useStore.setState((s) => {
        const next = { ...s.sectionsCache };
        delete next[event.requestId];
        return { sectionsCache: next };
      });

      // Re-fetch the request record to pick up updated totalTokens
      try {
        const { request } = await bridge.fetch<{ request: RequestRecord }>(
          `/api/requests/${event.requestId}`
        );
        useStore.setState((s) => ({
          requests: s.requests.map((r) => r.id === request.id ? request : r),
        }));
      } catch {
        // ignore
      }

      const sel = useStore.getState().selectedRequestId;
      if (sel === event.requestId) {
        void useStore.getState().loadSections(event.requestId);
      }
    }
  });
}
