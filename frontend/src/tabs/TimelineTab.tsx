import { useEffect, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { useStore } from "../store/store";
import type { SectionRecord, SectionType } from "../lib/types";
import { SectionTypeBadge } from "../components/SectionTypeBadge";
import { formatTokens } from "../lib/format";

export function TimelineTab() {
  const requestId = useStore((s) => s.selectedRequestId);
  const cached = useStore((s) => (requestId ? s.sectionsCache[requestId] : null));
  const loadSections = useStore((s) => s.loadSections);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!requestId || cached) return;
    void loadSections(requestId).then(() => setTick((t) => t + 1));
  }, [requestId, cached, loadSections]);

  if (!requestId)
    return <EmptyTimeline hint="select a request to see its conversation timeline." />;
  const sections = cached;
  if (!sections)
    return (
      <div className="p-8 text-bone-400 text-xs uppercase tracking-widest2">
        loading timeline…
      </div>
    );

  const events = sections.filter(isTimelineEvent);

  if (events.length === 0)
    return <EmptyTimeline hint="no conversation events in this request (likely an aux call)." />;

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-widest2 text-bone-400 mb-1">
          timeline · {events.length} event{events.length === 1 ? "" : "s"}
        </div>
        <div className="dash-divider" />
      </header>

      <div className="relative pl-6">
        <div
          className="absolute left-1.5 top-0 bottom-0 w-px bg-bone-400/20"
          aria-hidden
        />
        <div className="space-y-3">
          {events.map((section, i) => (
            <TimelineEvent key={section.id} section={section} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function isTimelineEvent(section: SectionRecord): boolean {
  const t = section.type;
  return (
    t === "user_text" ||
    t === "assistant_text" ||
    t === "assistant_tool_call" ||
    t === "user_tool_result" ||
    t === "thinking"
  );
}

const NODE_TONE: Partial<Record<SectionType, string>> = {
  user_text: "bg-signal",
  assistant_text: "bg-veridian",
  assistant_tool_call: "bg-coral",
  user_tool_result: "bg-coral/50",
  thinking: "bg-violet",
};

function TimelineEvent({ section, index }: { section: SectionRecord; index: number }) {
  const tone = NODE_TONE[section.type] ?? "bg-bone-400";
  const content = section.content ?? "";
  const summary = summarize(section);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div
        className={clsx(
          "absolute -left-[18px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-ink-950",
          tone
        )}
        aria-hidden
      />
      <div className="border border-bone-400/10 bg-ink-850 px-4 py-3 hover:border-bone-300/30 transition-colors">
        <div className="flex items-baseline gap-3 mb-1.5">
          <SectionTypeBadge type={section.type} size="xs" />
          <span className="text-[10px] uppercase tracking-widest2 text-bone-400 truncate">
            {section.label ?? ""}
          </span>
          <span className="ml-auto text-[10px] tabular-nums text-bone-400">
            {formatTokens(section.tokenCount)}t
          </span>
        </div>
        <div className="text-xs text-bone-200 leading-relaxed whitespace-pre-wrap break-words">
          {summary || <span className="italic text-bone-400">(empty)</span>}
        </div>
        {content.length > summary.length && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] uppercase tracking-widest2 text-bone-400 hover:text-signal">
              ▸ expand full
            </summary>
            <pre className="code-block mt-2">{content}</pre>
          </details>
        )}
      </div>
    </motion.div>
  );
}

function summarize(section: SectionRecord): string {
  const content = section.content ?? "";
  if (section.type === "assistant_tool_call") {
    try {
      const obj = JSON.parse(content) as { name?: string; input?: unknown };
      const inputPreview = JSON.stringify(obj.input ?? {}).slice(0, 120);
      return `${obj.name ?? "tool"}(${inputPreview}${inputPreview.length === 120 ? "…" : ""})`;
    } catch {
      // fallthrough
    }
  }
  if (section.type === "user_tool_result") {
    try {
      const obj = JSON.parse(content) as { content?: unknown };
      const inner =
        typeof obj.content === "string"
          ? obj.content
          : JSON.stringify(obj.content ?? "");
      return inner.slice(0, 200);
    } catch {
      // fallthrough
    }
  }
  return content.length > 320 ? content.slice(0, 320) + "…" : content;
}

function EmptyTimeline({ hint }: { hint: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="font-display italic text-3xl text-bone-200 mb-3">silent</div>
        <div className="text-xs text-bone-400 leading-relaxed">{hint}</div>
      </div>
    </div>
  );
}
