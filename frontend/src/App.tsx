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
import { formatTokens } from "./lib/format";

const TABS: Array<{ key: TabKey; label: string; symbol: string }> = [
  { key: "inspector", label: "inspector", symbol: "01" },
  { key: "diff", label: "diff", symbol: "02" },
  { key: "timeline", label: "timeline", symbol: "03" },
  { key: "tokens", label: "tokens", symbol: "04" },
];

export function App() {
  const status = useStore((s) => s.status);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const hydrate = useStore((s) => s.hydrate);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const requests = useStore((s) => s.requests);
  const selectedId = useStore((s) => s.selectedRequestId);

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
        <Header status={status} sessionLabel={activeSession?.id} />

        <div className="grid grid-cols-[clamp(280px,26vw,360px)_1fr] flex-1 min-h-0 overflow-hidden">
          <RequestList />
          <main className="flex flex-col min-h-0 relative overflow-hidden">
            <TabBar tab={tab} setTab={setTab} totalTokens={totalTokens} />
            <div className="relative flex-1 overflow-y-auto">
              {selectedId && (
                <motion.div
                  key={selectedId + tab}
                  className="absolute inset-0 pointer-events-none scanline"
                />
              )}
              <div className="relative z-[1]">
                {tab === "inspector" && <InspectorTab />}
                {tab === "diff" && <DiffTab />}
                {tab === "timeline" && <TimelineTab />}
                {tab === "tokens" && <TokensTab />}
              </div>
            </div>
          </main>
        </div>

        <Footer />
      </div>
    </div>
  );
}

function Header({ status, sessionLabel }: { status: ReturnType<typeof useStore.getState>["status"]; sessionLabel?: string }) {
  return (
    <header className="border-b border-bone-400/10 px-6 py-4 flex items-center gap-6 relative">
      <div className="flex items-baseline gap-3">
        <span className="font-display italic text-2xl text-bone-50 leading-none">
          mddlmn
        </span>
        <span className="text-[10px] uppercase tracking-widest2 text-bone-400">
          interceptor v0.1
        </span>
      </div>

      <div className="hidden md:block h-6 w-px bg-bone-400/15" />

      <div className="hidden md:flex items-center gap-4 text-[10px] uppercase tracking-widest2">
        <span className="text-bone-400">session</span>
        <code className="text-signal">
          <TextScramble
            text={sessionLabel ? sessionLabel.slice(0, 12) : "—"}
            trigger={sessionLabel ?? "none"}
            duration={500}
          />
        </code>
      </div>

      <div className="flex-1" />

      <StatusDot status={status} />
    </header>
  );
}

function TabBar({
  tab,
  setTab,
  totalTokens,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  totalTokens: number;
}) {
  return (
    <div className="border-b border-bone-400/10 px-4 py-2.5 flex items-center gap-1 bg-ink-900/40">
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              "relative px-3.5 py-1.5 flex items-baseline gap-2 transition-colors",
              "text-[11px] uppercase tracking-widest2",
              active
                ? "text-bone-50"
                : "text-bone-400 hover:text-bone-200"
            )}
          >
            <span
              className={clsx(
                "text-[9px] tabular-nums",
                active ? "text-signal" : "text-bone-400/60"
              )}
            >
              {t.symbol}
            </span>
            <span>{t.label}</span>
            {active && (
              <motion.span
                layoutId="tab-underline"
                className="absolute left-0 right-0 -bottom-[10px] h-px bg-signal"
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-widest2 text-bone-400">
        <span>session</span>
        <span className="text-bone-100 tabular-nums">{formatTokens(totalTokens)}</span>
        <span>tokens captured</span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-bone-400/10 px-6 py-2 flex items-center gap-4 text-[10px] uppercase tracking-widest2 text-bone-400">
      <span>◜ wiretap active</span>
      <div className="dash-divider flex-1 max-w-md" />
      <span>JSONL · SQLite</span>
      <span className="text-bone-400/40">/</span>
      <span>fastify · ws</span>
      <span className="text-bone-400/40">/</span>
      <span>react · zustand</span>
    </footer>
  );
}
