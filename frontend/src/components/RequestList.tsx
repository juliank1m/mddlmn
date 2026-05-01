import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { useStore } from "../store/store";
import { classify, type RequestRecord } from "../lib/types";
import { formatTokens, formatTime, relativeTimestamp } from "../lib/format";

const KIND_TONE: Record<ReturnType<typeof classify>, { dot: string; tag: string; label: string }> = {
  top_level: {
    dot: "bg-signal",
    tag: "text-signal border-signal/40 bg-signal/5",
    label: "TOP",
  },
  tool_chain: {
    dot: "bg-veridian",
    tag: "text-veridian border-veridian/40 bg-veridian/5",
    label: "TOOL",
  },
  aux: { dot: "bg-bone-400", tag: "text-bone-400 border-bone-400/30 bg-bone-400/5", label: "AUX" },
};

export function RequestList() {
  const requests = useStore((s) => s.requests);
  const selectedId = useStore((s) => s.selectedRequestId);
  const flashIds = useStore((s) => s.flashIds);
  const showAux = useStore((s) => s.showAux);
  const setShowAux = useStore((s) => s.setShowAux);
  const followLive = useStore((s) => s.followLive);
  const setFollowLive = useStore((s) => s.setFollowLive);
  const selectRequest = useStore((s) => s.selectRequest);

  const filtered = useMemo(() => {
    if (showAux) return requests;
    return requests.filter((r) => r.isMainConversation);
  }, [requests, showAux]);

  const sessionStart = requests[0]?.timestamp ?? new Date().toISOString();

  return (
    <div className="flex flex-col min-h-0 h-full border-r border-bone-400/10 bg-ink-900/60 overflow-hidden">
      <div className="px-3 pt-2 pb-2 border-b border-bone-400/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-widest2 text-bone-400">
            Intercepts · {filtered.length}
          </span>
          <span className="text-[9px] uppercase tracking-widest2 text-bone-400 tabular-nums">
            ∑ {formatTokens(filtered.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0))}
          </span>
        </div>

        <div className="flex gap-1 text-[9px]">
          <FilterToggle
            active={!showAux}
            label="MAIN"
            onClick={() => setShowAux(false)}
          />
          <FilterToggle
            active={showAux}
            label="ALL"
            onClick={() => setShowAux(true)}
          />
          <div className="flex-1" />
          <FilterToggle
            active={followLive}
            label="◉ FOLLOW"
            onClick={() => setFollowLive(!followLive)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && <EmptyState />}

        <AnimatePresence initial={false}>
          {filtered.map((req, i) => (
            <motion.div
              key={req.id}
              layout
              initial={
                flashIds.has(req.id)
                  ? { opacity: 0, x: -8, backgroundColor: "rgba(255, 181, 71, 0.18)" }
                  : false
              }
              animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255, 181, 71, 0)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <RequestRow
                request={req}
                index={i}
                sessionStart={sessionStart}
                isSelected={req.id === selectedId}
                isFlashing={flashIds.has(req.id)}
                onClick={() => selectRequest(req.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-2 py-1 uppercase tracking-widest2 border transition-colors",
        active
          ? "text-signal border-signal/50 bg-signal/10"
          : "text-bone-400 border-bone-400/20 hover:border-bone-300/40 hover:text-bone-200"
      )}
    >
      {label}
    </button>
  );
}

function RequestRow({
  request,
  index,
  sessionStart,
  isSelected,
  isFlashing,
  onClick,
}: {
  request: RequestRecord;
  index: number;
  sessionStart: string;
  isSelected: boolean;
  isFlashing: boolean;
  onClick: () => void;
}) {
  const kind = classify(request);
  const tone = KIND_TONE[kind];
  const preview =
    request.lastUserPreview?.trim() ||
    auxLabel(request.path) ||
    "untitled exchange";

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full text-left px-3 py-2 border-b border-bone-400/5 relative transition-colors",
        "hover:bg-bone-50/[0.02]",
        isSelected && "bg-signal/[0.04]"
      )}
    >
      {isSelected && (
        <span className="absolute left-0 inset-y-0 w-px bg-signal" aria-hidden />
      )}

      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] text-bone-400 tabular-nums">
          {String(index + 1).padStart(3, "0")}
        </span>
        <span className={clsx("h-1 w-1 rounded-full shrink-0", tone.dot)} aria-hidden />
        <span className="text-[9px] text-bone-300 tabular-nums">
          {formatTime(request.timestamp)}
        </span>
        <span className="text-[9px] text-bone-400 tabular-nums">
          {relativeTimestamp(sessionStart, request.timestamp)}
        </span>
        <div className="flex-1" />
        <span
          className={clsx(
            "text-[9px] uppercase tracking-widest2 px-1 py-0.5 border rounded-sm",
            tone.tag
          )}
        >
          {tone.label}
        </span>
      </div>

      <div
        className={clsx(
          "text-xs leading-snug truncate",
          isSelected ? "text-bone-50" : "text-bone-100"
        )}
      >
        {isFlashing ? (
          <span className="text-signal">▌ {preview}</span>
        ) : (
          <>"{preview}"</>
        )}
      </div>

      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-bone-400 tabular-nums">
        <span>
          <span className="text-bone-300">{formatTokens(request.totalTokens)}</span>{" "}
          tok
        </span>
        <span className="text-bone-400/40">·</span>
        <span className="truncate">{request.model?.replace("claude-", "") ?? "—"}</span>
      </div>
    </button>
  );
}

function auxLabel(path: string): string | null {
  if (path.includes("count_tokens")) return "[token count]";
  if (path.includes("/v1/messages")) return "[aux message]";
  return path;
}

function EmptyState() {
  return (
    <div className="px-6 py-12 text-center">
      <div className="text-bone-400 text-[10px] uppercase tracking-widest2 mb-3">
        no traffic
      </div>
      <div className="text-xs text-bone-300 leading-relaxed max-w-[24ch] mx-auto">
        the wire is silent. start your agent with{" "}
        <code className="text-signal">ANTHROPIC_BASE_URL</code> set to the proxy.
      </div>
    </div>
  );
}
