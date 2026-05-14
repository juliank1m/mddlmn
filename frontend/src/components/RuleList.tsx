import { useState, type ReactNode } from "react";
import clsx from "clsx";

interface RuleListProps<T> {
  title: string;
  entries: T[];
  getId: (e: T) => string;
  getName: (e: T) => string;
  getEnabled: (e: T) => boolean;
  getSummary: (e: T) => string;
  getBadge?: (e: T) => string | null;
  canDelete?: (e: T) => boolean;
  onToggle: (e: T) => void;
  onDelete: (e: T) => void;
  /** Renders the add/edit form. `entry` is null for the add form.
   *  `onDone` closes the form; call it after a successful save. */
  renderForm: (entry: T | null, onDone: () => void) => ReactNode;
  emptyHint: string;
}

export function RuleList<T>({
  title,
  entries,
  getId,
  getName,
  getEnabled,
  getSummary,
  getBadge,
  canDelete,
  onToggle,
  onDelete,
  renderForm,
  emptyHint,
}: RuleListProps<T>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-[10px] uppercase tracking-widest2 text-bone-200">
          {title}
        </h3>
        <span className="text-[9px] tabular-nums text-bone-400/60">
          {entries.length}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
          }}
          className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
        >
          {adding ? "cancel" : "+ add"}
        </button>
      </div>

      {adding && (
        <div className="mb-2 border border-signal/30 bg-ink-900/40 p-2">
          {renderForm(null, () => setAdding(false))}
        </div>
      )}

      {entries.length === 0 && !adding && (
        <div className="text-[10px] text-bone-400/60 italic py-2">
          {emptyHint}
        </div>
      )}

      <div className="space-y-px">
        {entries.map((entry) => {
          const id = getId(entry);
          const enabled = getEnabled(entry);
          const badge = getBadge?.(entry) ?? null;
          const deletable = canDelete?.(entry) ?? true;
          const isEditing = editingId === id;

          return (
            <div
              key={id}
              className="border border-bone-400/10 bg-ink-900/40"
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(entry)}
                  title={enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  className={clsx(
                    "h-3 w-3 shrink-0 border transition-colors",
                    enabled
                      ? "bg-signal/80 border-signal"
                      : "bg-transparent border-bone-400/40"
                  )}
                />
                <span
                  className={clsx(
                    "text-xs truncate",
                    enabled ? "text-bone-100" : "text-bone-400/60"
                  )}
                >
                  {getName(entry)}
                </span>
                {badge && (
                  <span className="text-[8px] uppercase tracking-widest2 text-bone-400/70 border border-bone-400/20 px-1">
                    {badge}
                  </span>
                )}
                <span className="text-[10px] text-bone-400/50 truncate flex-1 font-mono">
                  {getSummary(entry)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(isEditing ? null : id);
                    setAdding(false);
                  }}
                  className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal"
                >
                  {isEditing ? "close" : "edit"}
                </button>
                {deletable && (
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-red-300"
                  >
                    delete
                  </button>
                )}
              </div>
              {isEditing && (
                <div className="border-t border-bone-400/10 p-2">
                  {renderForm(entry, () => setEditingId(null))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
