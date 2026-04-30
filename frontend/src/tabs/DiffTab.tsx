import { useEffect, useMemo, useState } from "react";
import { diffWords } from "diff";
import clsx from "clsx";
import { motion } from "motion/react";
import { useStore } from "../store/store";
import { bridge } from "../lib/bridge";
import type { DiffEntry, DiffResponse, RequestRecord } from "../lib/types";
import { SectionTypeBadge } from "../components/SectionTypeBadge";
import { Collapsible } from "../components/Collapsible";
import { formatTime, formatTokens, shortHash } from "../lib/format";

export function DiffTab() {
  const requests = useStore((s) => s.requests);
  const selectedId = useStore((s) => s.selectedRequestId);
  const override = useStore((s) => s.diffPairOverride);
  const setDiffPair = useStore((s) => s.setDiffPair);

  const pair = useMemo(() => {
    if (override) return override;
    if (!selectedId) return null;
    const idx = requests.findIndex((r) => r.id === selectedId);
    if (idx <= 0) return null;
    return { idA: requests[idx - 1].id, idB: selectedId };
  }, [override, selectedId, requests]);

  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pair) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    bridge
      .fetch<DiffResponse>(`/api/diff/${pair.idA}/${pair.idB}`)
      .then((res) => {
        if (!cancelled) setDiff(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair]);

  if (!selectedId) return <Empty hint="select a request" />;
  if (!pair) return <Empty hint="no previous request to diff against" />;

  return (
    <div className="p-6 max-w-6xl">
      <header className="mb-5">
        <div className="text-[10px] uppercase tracking-widest2 text-bone-400 mb-2">
          delta · request a → request b
        </div>
        {diff && <DiffHeader before={diff.before} after={diff.after} />}
      </header>

      <div className="mb-3 flex items-center gap-2 text-[10px]">
        <button
          type="button"
          onClick={() => setDiffPair(null)}
          className="px-2 py-1 uppercase tracking-widest2 border border-bone-400/20 text-bone-300 hover:border-signal/50 hover:text-signal"
        >
          ↻ this vs previous
        </button>
        {override && (
          <span className="text-bone-400 uppercase tracking-widest2">
            custom pair active
          </span>
        )}
      </div>

      {loading && (
        <div className="text-bone-400 text-xs uppercase tracking-widest2 py-8">
          computing delta…
        </div>
      )}

      {error && <div className="text-coral text-xs">error: {error}</div>}

      {diff && (
        <div className="space-y-2">
          {summary(diff.diff)}
          {diff.diff.map((entry, i) => (
            <DiffRow key={entry.key} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffHeader({ before, after }: { before: RequestRecord; after: RequestRecord }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <RequestStub label="◀ A" record={before} />
      <RequestStub label="B ▶" record={after} />
    </div>
  );
}

function RequestStub({ label, record }: { label: string; record: RequestRecord }) {
  return (
    <div className="border border-bone-400/10 px-3 py-2.5 bg-ink-850">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-signal text-[10px] uppercase tracking-widest2">{label}</span>
        <span className="text-bone-300 text-[10px] tabular-nums">
          {formatTime(record.timestamp)}
        </span>
        <span className="text-bone-400 text-[10px] tabular-nums ml-auto">
          {formatTokens(record.totalTokens)}t
        </span>
      </div>
      <div className="text-xs text-bone-200 truncate">
        "{record.lastUserPreview ?? "—"}"
      </div>
    </div>
  );
}

function summary(diff: DiffEntry[]) {
  const counts = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const e of diff) counts[e.status] += 1;
  return (
    <div className="flex gap-3 text-[10px] uppercase tracking-widest2 mb-4 pb-3 border-b border-bone-400/10">
      <span className="text-veridian">+ {counts.added} added</span>
      <span className="text-coral">− {counts.removed} removed</span>
      <span className="text-signal">~ {counts.modified} modified</span>
      <span className="text-bone-400">= {counts.unchanged} unchanged</span>
    </div>
  );
}

const STATUS_TONES: Record<DiffEntry["status"], { color: string; label: string; glyph: string }> = {
  added: { color: "#4ad295", label: "added", glyph: "+" },
  removed: { color: "#ff6b6b", label: "removed", glyph: "−" },
  modified: { color: "#ffb547", label: "modified", glyph: "~" },
  unchanged: { color: "#6b6657", label: "unchanged", glyph: "=" },
};

function DiffRow({ entry, index }: { entry: DiffEntry; index: number }) {
  const tone = STATUS_TONES[entry.status];
  const section =
    entry.status === "modified"
      ? entry.after
      : entry.status === "removed"
      ? entry.section
      : entry.section;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.025 }}
    >
      <Collapsible
        defaultOpen={entry.status !== "unchanged"}
        accentColor={tone.color}
        header={
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-[10px] uppercase tracking-widest2 w-16 shrink-0"
              style={{ color: tone.color }}
            >
              {tone.glyph} {tone.label}
            </span>
            <SectionTypeBadge type={section.type} />
            <span className="text-bone-200 text-sm truncate flex-1">
              {section.label ?? "—"}
            </span>
            {entry.status === "modified" && (
              <span className="text-bone-400 text-[10px] tabular-nums">
                {shortHash(entry.before.contentHash)} → {shortHash(entry.after.contentHash)}
              </span>
            )}
          </div>
        }
      >
        {entry.status === "modified" ? (
          <InlineDiff before={entry.before.content ?? ""} after={entry.after.content ?? ""} />
        ) : entry.status === "unchanged" ? (
          <div className="text-bone-400 text-xs italic px-1">
            (content identical, hash {shortHash(entry.section.contentHash)})
          </div>
        ) : (
          <pre className="code-block" style={{ borderColor: tone.color + "40" }}>
            {section.content ?? "(empty)"}
          </pre>
        )}
      </Collapsible>
    </motion.div>
  );
}

function InlineDiff({ before, after }: { before: string; after: string }) {
  // Cap diff size to avoid expensive renders
  const cap = 8000;
  const a = before.length > cap ? before.slice(0, cap) + "\n…" : before;
  const b = after.length > cap ? after.slice(0, cap) + "\n…" : after;
  const parts = diffWords(a, b);

  return (
    <pre className="code-block">
      {parts.map((part, i) => (
        <span
          key={i}
          className={clsx(
            part.added && "bg-veridian/20 text-veridian",
            part.removed && "bg-coral/20 text-coral line-through"
          )}
        >
          {part.value}
        </span>
      ))}
    </pre>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="font-display italic text-3xl text-bone-200 mb-3">no delta</div>
        <div className="text-xs text-bone-400 leading-relaxed">{hint}</div>
      </div>
    </div>
  );
}
