import clsx from "clsx";
import type { SectionType } from "../lib/types";

const META: Record<SectionType, { glyph: string; tone: string; short: string }> = {
  system: { glyph: "§", tone: "text-violet bg-violet/10 border-violet/30", short: "SYS" },
  user_text: { glyph: "▶", tone: "text-signal bg-signal/10 border-signal/30", short: "USR" },
  injected_context: {
    glyph: "↳",
    tone: "text-bone-300 bg-bone-300/5 border-bone-300/20",
    short: "INJ",
  },
  assistant_text: { glyph: "✦", tone: "text-veridian bg-veridian/10 border-veridian/30", short: "ASST" },
  assistant_tool_call: {
    glyph: "⌘",
    tone: "text-coral bg-coral/10 border-coral/30",
    short: "TOOL",
  },
  user_tool_result: {
    glyph: "⤴",
    tone: "text-coral/80 bg-coral/5 border-coral/20",
    short: "RES",
  },
  thinking: { glyph: "◐", tone: "text-violet/80 bg-violet/5 border-violet/20", short: "THK" },
  tools: { glyph: "⚙", tone: "text-bone-200 bg-bone-200/5 border-bone-200/25", short: "DEFS" },
  metadata: { glyph: "·", tone: "text-bone-400 bg-bone-400/5 border-bone-400/20", short: "META" },
};

export function SectionTypeBadge({
  type,
  size = "sm",
}: {
  type: SectionType;
  size?: "sm" | "xs";
}) {
  const meta = META[type];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 border rounded-sm uppercase tracking-widest2 font-mono",
        meta.tone,
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[9px] px-1 py-0.5"
      )}
    >
      <span aria-hidden>{meta.glyph}</span>
      <span>{meta.short}</span>
    </span>
  );
}

export function getSectionTone(type: SectionType): string {
  return META[type].tone;
}
