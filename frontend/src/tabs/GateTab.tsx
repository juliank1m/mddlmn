import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "../store/store";
import type { HeldRequest } from "../store/store";
import { HeldRequestEditor } from "../components/HeldRequestEditor";
import { serializeForApproval } from "../lib/requestSerializer";

export function GateTab() {
  const heldRequest = useStore((s) => s.heldRequest);
  const gateEnabled = useStore((s) => s.gateEnabled);
  const queueLength = useStore((s) => s.gateQueueLength);

  if (!heldRequest) {
    return <Empty gateEnabled={gateEnabled} queueLength={queueLength} />;
  }

  return <Held held={heldRequest} queueLength={queueLength} />;
}

function Empty({
  gateEnabled,
  queueLength,
}: {
  gateEnabled: boolean;
  queueLength: number;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="font-display italic text-3xl text-bone-200 mb-3">
          {gateEnabled ? "armed. nothing held." : "gate is open."}
        </div>
        <div className="text-xs text-bone-400 leading-relaxed">
          {gateEnabled
            ? "the proxy is intercepting traffic. requests will appear here when held."
            : "toggle the gate in the header to start intercepting requests before they reach the api."}
        </div>
        {queueLength > 1 && (
          <div className="mt-6 text-[9px] uppercase tracking-widest2 text-bone-400">
            queue depth · <span className="text-signal tabular-nums">{queueLength}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Held({ held, queueLength }: { held: HeldRequest; queueLength: number }) {
  const approveHeld = useStore((s) => s.approveHeld);
  const cancelHeld = useStore((s) => s.cancelHeld);
  const editorBody = useStore((s) => s.editorBody);
  const elapsed = useElapsed(held.timestamp);

  const serializeResult = editorBody ? serializeForApproval(editorBody) : null;
  const canApprove = serializeResult?.ok === true;
  const errors = serializeResult && !serializeResult.ok ? serializeResult.errors : [];

  async function onApprove() {
    if (!serializeResult || !serializeResult.ok) return;
    await approveHeld(serializeResult.body);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="relative flex flex-col h-full min-h-0"
    >
      {/* leading-edge signal bar */}
      <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-signal/80 shadow-[0_0_12px_rgba(252,211,77,0.4)]" />

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 pl-5">
        <header className="mb-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-widest2 text-signal">
              ▌ holding
            </span>
            <span className="text-[9px] uppercase tracking-widest2 text-bone-400 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
            {queueLength > 1 && (
              <>
                <span className="text-bone-400/40">·</span>
                <span className="text-[9px] uppercase tracking-widest2 text-bone-400">
                  +{queueLength - 1} queued
                </span>
              </>
            )}
            <div className="flex-1" />
            <code className="text-[9px] tabular-nums text-bone-400 truncate max-w-[40ch]">
              {held.requestId.slice(0, 8)}
            </code>
          </div>
          <div className="dash-divider" />
        </header>

        <HeldRequestEditor />
      </div>

      {/* sticky decision bar */}
      <div className="border-t border-bone-400/15 bg-ink-900/80 backdrop-blur-sm px-3 py-2 pl-5 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-widest2 text-bone-400 hidden sm:block">
          decision required
        </span>
        {!canApprove && errors.length > 0 && (
          <span
            className="text-[9px] uppercase tracking-widest2 text-red-300"
            title={errors.join("\n")}
          >
            ✕ {errors[0]}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void cancelHeld()}
          className="border border-bone-400/30 px-3 py-1 text-[10px] uppercase tracking-widest2 text-bone-300 hover:border-red-400/60 hover:text-red-300 transition-colors"
        >
          abort
        </button>
        <button
          type="button"
          disabled={!canApprove}
          onClick={() => void onApprove()}
          className="border border-signal/60 bg-signal/15 px-3 py-1 text-[10px] uppercase tracking-widest2 text-signal hover:bg-signal/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-signal/15"
        >
          release
        </button>
      </div>
    </motion.div>
  );
}

function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - since);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m${rs.toString().padStart(2, "0")}s`;
}
