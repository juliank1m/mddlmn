import { useEffect } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { initBridge, useStore, type TabKey } from "./store/store";
import { RequestList } from "./components/RequestList";
import { StatusDot } from "./components/StatusDot";
import { TextScramble } from "./components/TextScramble";
import { InspectorTab } from "./tabs/InspectorTab";
import { DiffTab } from "./tabs/DiffTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { TokensTab } from "./tabs/TokensTab";
import { GateTab } from "./tabs/GateTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { formatTokens } from "./lib/format";
import frontendLogo from "./assets/frontend_logo.jpeg";

declare global {
  interface Window {
    __MDDLMN_ASSETS__?: {
      logo?: string;
    };
  }
}

const TABS: Array<{ key: TabKey; label: string; symbol: string }> = [
  { key: "inspector", label: "inspector", symbol: "01" },
  { key: "diff", label: "diff", symbol: "02" },
  { key: "timeline", label: "timeline", symbol: "03" },
  { key: "tokens", label: "tokens", symbol: "04" },
  { key: "settings", label: "settings", symbol: "05" },
];

export function App() {
  const status = useStore((s) => s.status);
  const proxy = useStore((s) => s.proxy);
  const startProxy = useStore((s) => s.startProxy);
  const stopProxy = useStore((s) => s.stopProxy);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const hydrate = useStore((s) => s.hydrate);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const requests = useStore((s) => s.requests);
  const selectedId = useStore((s) => s.selectedRequestId);
  const gateEnabled = useStore((s) => s.gateEnabled);
  const gateQueueLength = useStore((s) => s.gateQueueLength);
  const heldRequest = useStore((s) => s.heldRequest);
  const toggleGate = useStore((s) => s.toggleGate);

  useEffect(() => {
    initBridge();
    void hydrate();
  }, [hydrate]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const totalTokens = activeSession?.totalTokens ?? requests.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

  return (
    <div className="relative h-full bg-ink-950 text-bone-100 grain vignette">
      {/* hairline grid background */}
      <div className="absolute inset-0 bg-hairgrid pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        <Header
          status={status}
          sessionLabel={activeSession?.id}
          proxy={proxy}
          onStart={startProxy}
          onStop={stopProxy}
          gateEnabled={gateEnabled}
          gateQueueLength={gateQueueLength}
          gateHeld={Boolean(heldRequest)}
          onToggleGate={() => void toggleGate()}
        />

        <div className="grid grid-cols-[clamp(280px,26vw,360px)_1fr] flex-1 min-h-0 overflow-hidden">
          <RequestList />
          <main className="flex flex-col min-h-0 relative overflow-hidden">
            <TabBar
              tab={tab}
              setTab={setTab}
              totalTokens={totalTokens}
              showGate={Boolean(heldRequest) || gateEnabled}
              gateHeld={Boolean(heldRequest)}
            />
            <div className="relative flex-1 overflow-y-auto">
              {selectedId && tab !== "gate" && tab !== "settings" && (
                <motion.div
                  key={selectedId + tab}
                  className="absolute inset-0 pointer-events-none scanline"
                />
              )}
              <div className="relative z-[1] h-full">
                {tab === "inspector" && <InspectorTab />}
                {tab === "diff" && <DiffTab />}
                {tab === "timeline" && <TimelineTab />}
                {tab === "tokens" && <TokensTab />}
                {tab === "settings" && <SettingsTab />}
                {tab === "gate" && <GateTab />}
              </div>
            </div>
          </main>
        </div>

      </div>
    </div>
  );
}

function Header({
  status,
  sessionLabel,
  proxy,
  onStart,
  onStop,
  gateEnabled,
  gateQueueLength,
  gateHeld,
  onToggleGate,
}: {
  status: ReturnType<typeof useStore.getState>["status"];
  sessionLabel?: string;
  proxy: ReturnType<typeof useStore.getState>["proxy"];
  onStart: () => void;
  onStop: () => void;
  gateEnabled: boolean;
  gateQueueLength: number;
  gateHeld: boolean;
  onToggleGate: () => void;
}) {
  const logoSrc = window.__MDDLMN_ASSETS__?.logo ?? frontendLogo;

  return (
    <header className="border-b border-bone-400/10 px-3 py-1.5 flex items-center gap-3 relative">
      <div className="flex items-center gap-2 shrink-0">
        <img src={logoSrc} alt="mddlmn" className="h-7 w-auto shrink-0" />
        <span className="text-[9px] uppercase tracking-widest2 text-bone-400 hidden sm:block">
          v0.1
        </span>
      </div>

      <div className="h-4 w-px bg-bone-400/15 shrink-0" />

      <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest2 min-w-0 overflow-hidden">
        <span className="text-bone-400 shrink-0">sess</span>
        <code className="text-signal truncate">
          <TextScramble
            text={sessionLabel ? sessionLabel.split("T")[0] : "—"}
            trigger={sessionLabel ?? "none"}
            duration={500}
          />
        </code>
      </div>

      <div className="flex-1" />

      {proxy.running && (
        <button
          type="button"
          onClick={onToggleGate}
          aria-pressed={gateEnabled}
          title={gateEnabled ? "gate is armed — requests are intercepted" : "gate is open — requests pass through"}
          className={clsx(
            "flex items-center gap-1.5 px-2 py-1 border text-[9px] uppercase tracking-widest2 transition-colors",
            gateEnabled
              ? "border-signal/60 bg-signal/10 text-signal"
              : "border-bone-400/20 text-bone-400 hover:border-bone-400/40 hover:text-bone-200"
          )}
        >
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              gateEnabled
                ? gateHeld
                  ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(252,211,77,0.8)]"
                  : "bg-signal"
                : "bg-bone-400/40"
            )}
          />
          <span>gate</span>
          {gateEnabled && gateQueueLength > 0 && (
            <span className="text-signal tabular-nums">{gateQueueLength}</span>
          )}
        </button>
      )}

      <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest2 shrink-0">
        {proxy.running ? (
          <>
            <code className="text-signal tabular-nums hidden lg:block text-[9px]">
              :{proxy.baseUrl?.split(":").pop()}
            </code>
            <button
              type="button"
              onClick={onStop}
              className="border border-bone-400/20 px-2 py-1 text-bone-300 hover:border-signal/60 hover:text-signal transition-colors"
            >
              stop
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="border border-signal/50 bg-signal/10 px-2 py-1 text-signal hover:bg-signal/20 transition-colors"
          >
            start proxy
          </button>
        )}
      </div>

      <StatusDot status={status} />
    </header>
  );
}

function TabBar({
  tab,
  setTab,
  totalTokens,
  showGate,
  gateHeld,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  totalTokens: number;
  showGate: boolean;
  gateHeld: boolean;
}) {
  const tabs = showGate
    ? [...TABS, { key: "gate" as TabKey, label: "gate", symbol: "06" }]
    : TABS;

  return (
    <div className="border-b border-bone-400/10 px-3 py-1.5 flex items-center gap-0.5 bg-ink-900/40">
      {tabs.map((t) => {
        const active = tab === t.key;
        const urgent = t.key === "gate" && gateHeld;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              "relative px-2.5 py-1 flex items-baseline gap-1.5 transition-colors",
              "text-[10px] uppercase tracking-widest2",
              active
                ? "text-bone-50"
                : urgent
                ? "text-signal"
                : "text-bone-400 hover:text-bone-200"
            )}
          >
            <span
              className={clsx(
                "text-[9px] tabular-nums",
                active || urgent ? "text-signal" : "text-bone-400/60"
              )}
            >
              {t.symbol}
            </span>
            <span>{t.label}</span>
            {urgent && !active && (
              <span className="inline-block h-1 w-1 rounded-full bg-signal animate-pulse" />
            )}
            {active && (
              <motion.span
                layoutId="tab-underline"
                className="absolute left-0 right-0 -bottom-[6px] h-px bg-signal"
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      <div className="flex items-baseline gap-1.5 text-[9px] uppercase tracking-widest2 text-bone-400">
        <span className="text-bone-200 tabular-nums">{formatTokens(totalTokens)}</span>
        <span>tok</span>
      </div>
    </div>
  );
}

