import clsx from "clsx";
import { motion } from "motion/react";

interface Props {
  value: number;
  max: number;
  label?: string;
  tone?: "signal" | "veridian" | "violet" | "coral" | "bone";
  detail?: string;
  index?: number;
}

const TONES = {
  signal: "bg-signal",
  veridian: "bg-veridian",
  violet: "bg-violet",
  coral: "bg-coral",
  bone: "bg-bone-300",
};

/** Horizontal token meter — tape-deck VU vibe. */
export function TokenBar({ value, max, label, tone = "signal", detail, index = 0 }: Props) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="group">
      {(label || detail) && (
        <div className="flex items-baseline justify-between mb-1">
          {label && (
            <span className="text-[10px] uppercase tracking-widest2 text-bone-300">
              {label}
            </span>
          )}
          {detail && (
            <span className="text-[10px] text-bone-400 tabular-nums">{detail}</span>
          )}
        </div>
      )}
      <div className="relative h-1.5 bg-ink-800 border border-bone-400/10 overflow-hidden">
        <motion.div
          className={clsx("absolute inset-y-0 left-0", TONES[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
        />
        <div
          className="absolute inset-y-0 right-0 left-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, transparent 0, transparent 7px, rgba(0,0,0,0.4) 7px, rgba(0,0,0,0.4) 8px)",
            opacity: 0.35,
          }}
        />
      </div>
    </div>
  );
}
