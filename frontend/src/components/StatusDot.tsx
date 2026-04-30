import clsx from "clsx";
import type { BridgeStatus } from "../lib/bridge";

const COLORS: Record<BridgeStatus, string> = {
  open: "bg-veridian",
  connecting: "bg-signal",
  closed: "bg-bone-400",
  error: "bg-coral",
};

const LABELS: Record<BridgeStatus, string> = {
  open: "LIVE",
  connecting: "SYNC",
  closed: "OFFLINE",
  error: "ERR",
};

export function StatusDot({ status }: { status: BridgeStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest2 text-bone-300">
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          COLORS[status],
          status === "open" && "pulse-signal"
        )}
      />
      {LABELS[status]}
    </span>
  );
}
