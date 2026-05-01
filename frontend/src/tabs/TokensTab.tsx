import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "../store/store";
import { bridge } from "../lib/bridge";
import type { SectionType, TokenStatsPoint } from "../lib/types";
import { TokenBar } from "../components/TokenBar";
import { SectionTypeBadge } from "../components/SectionTypeBadge";
import { formatTokens } from "../lib/format";

const TYPE_TONES: Record<SectionType, "signal" | "veridian" | "violet" | "coral" | "bone"> = {
  system: "violet",
  user_text: "signal",
  injected_context: "bone",
  assistant_text: "veridian",
  assistant_tool_call: "coral",
  user_tool_result: "coral",
  thinking: "violet",
  tools: "bone",
  metadata: "bone",
};

const TYPE_HEX: Record<SectionType, string> = {
  system: "#a78bfa",
  user_text: "#ffb547",
  injected_context: "#9a9483",
  assistant_text: "#4ad295",
  assistant_tool_call: "#ff6b6b",
  user_tool_result: "#ff6b6b",
  thinking: "#a78bfa",
  tools: "#c9c2ae",
  metadata: "#6b6657",
};

export function TokensTab() {
  const requestId = useStore((s) => s.selectedRequestId);
  const sessionId = useStore((s) => s.activeSessionId);
  const cached = useStore((s) => (requestId ? s.sectionsCache[requestId] : null));
  const loadSections = useStore((s) => s.loadSections);

  const [stats, setStats] = useState<TokenStatsPoint[] | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    bridge
      .fetch<{ points: TokenStatsPoint[] }>(`/api/stats/tokens/${sessionId}`)
      .then((res) => {
        if (!cancelled) setStats(res.points);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!requestId || cached) return;
    void loadSections(requestId);
  }, [requestId, cached, loadSections]);

  const breakdown = useMemo(() => {
    if (!cached) return [];
    const grouped = new Map<SectionType, number>();
    for (const section of cached) {
      const tokens = section.tokenCount ?? 0;
      grouped.set(section.type, (grouped.get(section.type) ?? 0) + tokens);
    }
    return Array.from(grouped.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [cached]);

  if (!requestId)
    return <Empty hint="select a request to see its token breakdown." />;

  const totalRequest = breakdown.reduce((a, [, v]) => a + v, 0);
  const max = Math.max(1, ...breakdown.map(([, v]) => v));

  return (
    <div className="p-4 max-w-5xl">
      <header className="mb-3">
        <div className="text-[9px] uppercase tracking-widest2 text-bone-400 mb-1">
          tokens · breakdown + session trend
        </div>
        <div className="dash-divider" />
      </header>

      <section className="mb-6">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display italic text-xl text-bone-100">
            {formatTokens(totalRequest)}
          </span>
          <span className="text-[9px] uppercase tracking-widest2 text-bone-400">
            tokens · current request
          </span>
        </div>

        <StackedBar breakdown={breakdown} total={totalRequest} />

        <div className="mt-3 space-y-1.5">
          {breakdown.map(([type, value], i) => (
            <div key={type} className="grid grid-cols-[max-content_1fr_max-content] gap-2 items-center">
              <SectionTypeBadge type={type} />
              <TokenBar
                value={value}
                max={max}
                tone={TYPE_TONES[type]}
                index={i}
              />
              <span className="text-[10px] tabular-nums text-bone-200 w-16 text-right">
                {formatTokens(value)}
                <span className="text-bone-400 text-[9px] ml-1">
                  {((value / totalRequest) * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[9px] uppercase tracking-widest2 text-bone-400 mb-2">
          session context growth
        </div>
        {stats && stats.length > 0 ? (
          <SessionTrend points={stats} />
        ) : (
          <div className="text-bone-400 text-xs italic">no session data yet</div>
        )}
      </section>
    </div>
  );
}

function StackedBar({
  breakdown,
  total,
}: {
  breakdown: [SectionType, number][];
  total: number;
}) {
  if (total === 0) return null;
  let cursor = 0;
  return (
    <div className="relative h-3 bg-ink-800 border border-bone-400/10 overflow-hidden flex">
      {breakdown.map(([type, value], i) => {
        const pct = (value / total) * 100;
        const left = cursor;
        cursor += pct;
        return (
          <motion.div
            key={type}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: TYPE_HEX[type], left: `${left}%` }}
            title={`${type}: ${formatTokens(value)}`}
          />
        );
      })}
    </div>
  );
}

function SessionTrend({ points }: { points: TokenStatsPoint[] }) {
  const requests = useStore((s) => s.requests);
  const selectRequest = useStore((s) => s.selectRequest);
  const selectedId = useStore((s) => s.selectedRequestId);

  const data = points
    .map((p) => ({
      ...p,
      kind: requests.find((r) => r.id === p.requestId)?.isMainConversation ?? true,
    }))
    .filter((p) => p.totalTokens != null);

  if (data.length === 0)
    return <div className="text-bone-400 text-xs italic">no points</div>;

  const max = Math.max(...data.map((p) => p.totalTokens ?? 0));
  const width = 1000;
  const height = 200;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const path =
    "M " +
    data
      .map((p, i) => `${i * stepX} ${height - ((p.totalTokens ?? 0) / max) * height}`)
      .join(" L ");

  return (
    <div className="border border-bone-400/10 bg-ink-850 p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb547" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1="0"
            x2={width}
            y1={height * p}
            y2={height * p}
            stroke="rgba(245, 241, 232, 0.05)"
            strokeWidth="1.5"
          />
        ))}

        {/* fill */}
        <path
          d={`${path} L ${(data.length - 1) * stepX} ${height} L 0 ${height} Z`}
          fill="url(#trendFill)"
        />
        {/* line */}
        <motion.path
          d={path}
          stroke="#ffb547"
          strokeWidth="3"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* points */}
        {data.map((p, i) => {
          const cx = i * stepX;
          const cy = height - ((p.totalTokens ?? 0) / max) * height;
          const isSelected = p.requestId === selectedId;
          return (
            <g
              key={p.requestId}
              onClick={() => selectRequest(p.requestId)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={cx} cy={cy} r={isSelected ? 10 : 5} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 7 : 4}
                fill={isSelected ? "#ffcd6b" : "#ffb547"}
                stroke="#070708"
                strokeWidth="1.5"
              />
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  fill="none"
                  stroke="#ffb547"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-bone-400 mt-2 tabular-nums">
        <span>{formatTokens(data[0].totalTokens ?? 0)}</span>
        <span className="uppercase tracking-widest2">peak {formatTokens(max)}</span>
        <span>{formatTokens(data[data.length - 1].totalTokens ?? 0)}</span>
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="font-display italic text-3xl text-bone-200 mb-3">no signal</div>
        <div className="text-xs text-bone-400 leading-relaxed">{hint}</div>
      </div>
    </div>
  );
}
