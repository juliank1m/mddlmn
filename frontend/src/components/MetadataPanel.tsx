import { useState } from "react";
import type { EditorBody } from "../lib/editorModel";

interface MetadataPanelProps {
  body: EditorBody;
  onChange: (updater: (b: EditorBody) => EditorBody) => void;
}

const STRUCTURAL_KEYS = new Set(["system", "tools", "messages"]);

// Known Claude models. Listed newest-first within each family.
// The current value is always added to the dropdown options so existing
// non-canonical names (older dated IDs, custom aliases) never get silently
// overwritten just by rendering.
const KNOWN_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export function MetadataPanel({ body, onChange }: MetadataPanelProps) {
  const entries = Object.entries(body).filter(([k]) => !STRUCTURAL_KEYS.has(k));

  if (entries.length === 0) return null;

  return (
    <Section label={`metadata · ${entries.length}`}>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <MetaRow
            key={key}
            keyName={key}
            value={value}
            onChange={(next) =>
              onChange((b) => ({ ...b, [key]: next }))
            }
          />
        ))}
      </div>
    </Section>
  );
}

function MetaRow({
  keyName,
  value,
  onChange,
}: {
  keyName: string;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const kind = inferKind(value);
  const isModel = keyName === "model";

  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-2">
      <div className="text-[10px] font-mono text-bone-400 truncate" title={keyName}>
        {keyName}
      </div>
      {isModel && kind === "string" && (
        <ModelSelect
          value={String(value ?? "")}
          onChange={(next) => onChange(next)}
        />
      )}
      {!isModel && kind === "string" && (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
      )}
      {kind === "number" && (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
      )}
      {kind === "boolean" && (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-signal"
        />
      )}
      {kind === "object" && (
        <textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              // ignore until valid
            }
          }}
          rows={3}
          className="bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
      )}
    </div>
  );
}

function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [freeText, setFreeText] = useState(false);

  // Include the current value at the top if it's not a known model, so
  // existing non-canonical names stay selectable.
  const options = Array.from(
    new Set([value, ...KNOWN_MODELS].filter(Boolean))
  );

  if (freeText) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setFreeText(false)}
          className="flex-1 bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
        <button
          type="button"
          onClick={() => setFreeText(false)}
          title="Switch to dropdown"
          className="text-[10px] text-bone-400 hover:text-signal border border-bone-400/15 px-1.5 py-0.5"
        >
          ▾
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setFreeText(true)}
        title="Edit as free text"
        className="text-[10px] text-bone-400 hover:text-signal border border-bone-400/15 px-1.5 py-0.5"
      >
        ✎
      </button>
    </div>
  );
}

function inferKind(value: unknown): "string" | "number" | "boolean" | "object" {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[9px] uppercase tracking-widest2 text-bone-200 mb-1">
        {label}
      </div>
      {children}
    </section>
  );
}
