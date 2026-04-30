import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import clsx from "clsx";

interface Props {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  accentColor?: string;
}

export function Collapsible({
  header,
  children,
  defaultOpen = false,
  className,
  accentColor,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={clsx(
        "border-l-2 border-bone-400/10 hover:border-bone-300/30 transition-colors",
        className
      )}
      style={accentColor ? { borderLeftColor: accentColor } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-bone-50/[0.02] transition-colors"
      >
        <span
          className={clsx(
            "text-bone-300 text-[10px] transition-transform duration-200",
            open && "rotate-90"
          )}
        >
          ▶
        </span>
        <span className="flex-1 min-w-0">{header}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
