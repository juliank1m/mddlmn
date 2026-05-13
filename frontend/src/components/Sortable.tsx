import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

interface SortableProps {
  id: string;
  deleted?: boolean;
  onDelete?: () => void;
  onRestore?: () => void;
  rightSlot?: ReactNode;
  label?: ReactNode;
  children: ReactNode;
}

export function Sortable({
  id,
  deleted,
  onDelete,
  onRestore,
  rightSlot,
  label,
  children,
}: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "border border-bone-400/10 bg-ink-900/40",
        deleted && "opacity-50",
        isDragging && "border-signal/40"
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1 border-b border-bone-400/10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab active:cursor-grabbing text-bone-400/50 hover:text-bone-200 text-[10px] tracking-widest2 select-none"
        >
          ⋮⋮
        </button>
        {label && (
          <div className="text-[9px] uppercase tracking-widest2 text-bone-400">
            {label}
          </div>
        )}
        <div className="flex-1" />
        {rightSlot}
        {deleted ? (
          <button
            type="button"
            onClick={onRestore}
            className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal"
          >
            restore
          </button>
        ) : (
          onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-red-300"
            >
              delete
            </button>
          )
        )}
      </div>
      <div className={clsx("px-2 py-2", deleted && "line-through")}>{children}</div>
    </div>
  );
}
