import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import type { SectionRecord } from "../lib/types";
import { Collapsible } from "../components/Collapsible";
import { SectionTypeBadge } from "../components/SectionTypeBadge";
import { TokenBar } from "../components/TokenBar";
import { formatTokens, shortHash } from "../lib/format";

export function InspectorTab() {
  const requestId = useStore((s) => s.selectedRequestId);
  const sections = useSectionsForRequest(requestId);

  if (!requestId) return <SelectPrompt />;
  if (sections === null)
    return (
      <div className="p-8 text-bone-400 text-xs uppercase tracking-widest2">
        decoding payload…
      </div>
    );

  const max = Math.max(1, ...sections.map((s) => s.tokenCount ?? 0));

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-widest2 text-bone-400 mb-1">
          inspector / {sections.length} sections
        </div>
        <div className="dash-divider" />
      </header>

      <div className="space-y-2">
        {sections.map((section, i) => (
          <SectionRow key={section.id} section={section} max={max} index={i} />
        ))}
      </div>
    </div>
  );
}

function SectionRow({
  section,
  max,
  index,
}: {
  section: SectionRecord;
  max: number;
  index: number;
}) {
  const tokenCount = section.tokenCount ?? 0;
  const content = section.content ?? "";
  const preview = previewLine(content);

  return (
    <Collapsible
      header={
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-bone-400 text-[10px] tabular-nums w-6 shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <SectionTypeBadge type={section.type} />
          <span className="text-bone-200 text-sm truncate min-w-0 flex-1">
            {section.label ?? "—"}
          </span>
          <span className="text-bone-400 text-[10px] tabular-nums shrink-0">
            {shortHash(section.contentHash)}
          </span>
          <span className="text-bone-100 text-xs tabular-nums shrink-0 w-16 text-right">
            {formatTokens(tokenCount)}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        <TokenBar
          value={tokenCount}
          max={max}
          tone="signal"
          detail={preview}
          index={index}
        />
        <pre className="code-block">{content || "(empty)"}</pre>
      </div>
    </Collapsible>
  );
}

function previewLine(content: string): string {
  const first = content.split("\n").find((line) => line.trim()) ?? "";
  return first.length > 80 ? first.slice(0, 80) + "…" : first;
}

function SelectPrompt() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="font-display italic text-3xl text-bone-200 mb-3">
          nothing under the lens
        </div>
        <div className="text-xs text-bone-400 leading-relaxed">
          select an intercepted request from the sidebar to inspect its sections,
          token distribution, and full payload.
        </div>
      </div>
    </div>
  );
}

/** hook: read sections from cache, kick a load if missing */
function useSectionsForRequest(requestId: string | null): SectionRecord[] | null {
  const cached = useStore((s) => (requestId ? s.sectionsCache[requestId] : null));
  const loadSections = useStore((s) => s.loadSections);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!requestId) return;
    if (cached) return;
    void loadSections(requestId).then(() => setTick((t) => t + 1));
  }, [requestId, cached, loadSections]);

  // reference tick so React re-renders after load
  void tick;

  if (!requestId) return [];
  return cached ?? null;
}
