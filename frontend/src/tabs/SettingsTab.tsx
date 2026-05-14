import { useCallback, useEffect, useState } from "react";
import { bridge } from "../lib/bridge";
import { RuleList } from "../components/RuleList";
import type {
  RedactionRule,
  InjectionRule,
  InjectionTarget,
  InjectionScope,
  MemoryEntry,
  MemoryScope,
} from "../lib/types";

const TARGETS: InjectionTarget[] = [
  "system_prepend",
  "system_append",
  "user_prepend",
  "user_append",
  "new_user_message",
];
const INJECTION_SCOPES: InjectionScope[] = ["all", "top_level", "tool_chain"];
const MEMORY_SCOPES: MemoryScope[] = ["always", "session", "conditional"];

const inputCls =
  "w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40 disabled:opacity-40";

export function SettingsTab() {
  const [redaction, setRedaction] = useState<RedactionRule[]>([]);
  const [injection, setInjection] = useState<InjectionRule[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);

  const refetchRedaction = useCallback(async () => {
    const r = await bridge.fetch<{ rules: RedactionRule[] }>(
      "/api/redaction/rules"
    );
    setRedaction(r.rules);
  }, []);
  const refetchInjection = useCallback(async () => {
    const r = await bridge.fetch<{ rules: InjectionRule[] }>(
      "/api/injection/rules"
    );
    setInjection(r.rules);
  }, []);
  const refetchMemory = useCallback(async () => {
    const r = await bridge.fetch<{ entries: MemoryEntry[] }>("/api/memory");
    setMemory(r.entries);
  }, []);

  useEffect(() => {
    void refetchRedaction();
    void refetchInjection();
    void refetchMemory();
  }, [refetchRedaction, refetchInjection, refetchMemory]);

  return (
    <div className="p-3 max-w-3xl">
      <header className="mb-3">
        <div className="text-[9px] uppercase tracking-widest2 text-bone-400 mb-1">
          settings / middleware rules
        </div>
        <div className="dash-divider" />
      </header>

      <RuleList<RedactionRule>
        title="redaction"
        entries={redaction}
        getId={(r) => r.id}
        getName={(r) => r.name}
        getEnabled={(r) => r.enabled}
        getSummary={(r) => `/${r.pattern}/${r.flags ?? ""} → ${r.replacement}`}
        getBadge={(r) => (r.builtin ? "builtin" : null)}
        canDelete={(r) => !r.builtin}
        onToggle={async (r) => {
          await bridge.patch(`/api/redaction/rules/${r.id}`, {
            enabled: !r.enabled,
          });
          void refetchRedaction();
        }}
        onDelete={async (r) => {
          await bridge.del(`/api/redaction/rules/${r.id}`);
          void refetchRedaction();
        }}
        renderForm={(entry, close) => (
          <RedactionForm
            entry={entry}
            onDone={() => {
              close();
              void refetchRedaction();
            }}
          />
        )}
        emptyHint="no redaction rules — built-ins seed on first proxy run"
      />

      <RuleList<InjectionRule>
        title="injection"
        entries={injection}
        getId={(r) => r.id}
        getName={(r) => r.name}
        getEnabled={(r) => r.enabled}
        getSummary={(r) => `${r.target} · ${r.applyTo}`}
        onToggle={async (r) => {
          await bridge.patch(`/api/injection/rules/${r.id}`, {
            enabled: !r.enabled,
          });
          void refetchInjection();
        }}
        onDelete={async (r) => {
          await bridge.del(`/api/injection/rules/${r.id}`);
          void refetchInjection();
        }}
        renderForm={(entry, close) => (
          <InjectionForm
            entry={entry}
            onDone={() => {
              close();
              void refetchInjection();
            }}
          />
        )}
        emptyHint="no injection rules"
      />

      <RuleList<MemoryEntry>
        title="memory"
        entries={memory}
        getId={(e) => e.id}
        getName={(e) => e.name}
        getEnabled={(e) => e.enabled}
        getSummary={(e) =>
          e.scope === "conditional"
            ? `${e.scope} /${e.condition ?? ""}/ → ${e.target}`
            : `${e.scope} → ${e.target}`
        }
        getBadge={(e) => e.scope}
        onToggle={async (e) => {
          await bridge.patch(`/api/memory/${e.id}`, { enabled: !e.enabled });
          void refetchMemory();
        }}
        onDelete={async (e) => {
          await bridge.del(`/api/memory/${e.id}`);
          void refetchMemory();
        }}
        renderForm={(entry, close) => (
          <MemoryForm
            entry={entry}
            onDone={() => {
              close();
              void refetchMemory();
            }}
          />
        )}
        emptyHint="no memory entries"
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-1.5">
      <div className="text-[9px] uppercase tracking-widest2 text-bone-400 mb-0.5">
        {label}
      </div>
      {children}
    </label>
  );
}

function SubmitRow({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="mt-1 border border-signal/60 bg-signal/15 px-3 py-1 text-[10px] uppercase tracking-widest2 text-signal hover:bg-signal/25 transition-colors"
    >
      {label}
    </button>
  );
}

function RedactionForm({
  entry,
  onDone,
}: {
  entry: RedactionRule | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [pattern, setPattern] = useState(entry?.pattern ?? "");
  const [flags, setFlags] = useState(entry?.flags ?? "g");
  const [replacement, setReplacement] = useState(
    entry?.replacement ?? "[REDACTED]"
  );
  const builtin = entry?.builtin ?? false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, pattern, flags, replacement };
    if (entry) {
      await bridge.patch(`/api/redaction/rules/${entry.id}`, payload);
    } else {
      await bridge.post("/api/redaction/rules", payload);
    }
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <Field label="name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label={builtin ? "pattern (read-only for built-ins)" : "pattern"}>
        <input
          className={inputCls}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          disabled={builtin}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="flags">
          <input
            className={inputCls}
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            disabled={builtin}
          />
        </Field>
        <Field label="replacement">
          <input
            className={inputCls}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </Field>
      </div>
      <SubmitRow label={entry ? "save" : "create"} />
    </form>
  );
}

function InjectionForm({
  entry,
  onDone,
}: {
  entry: InjectionRule | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [target, setTarget] = useState<InjectionTarget>(
    entry?.target ?? "system_append"
  );
  const [applyTo, setApplyTo] = useState<InjectionScope>(
    entry?.applyTo ?? "all"
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, content, target, applyTo };
    if (entry) {
      await bridge.patch(`/api/injection/rules/${entry.id}`, payload);
    } else {
      await bridge.post("/api/injection/rules", payload);
    }
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <Field label="name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="content">
        <textarea
          className={inputCls}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="target">
          <select
            className={inputCls}
            value={target}
            onChange={(e) => setTarget(e.target.value as InjectionTarget)}
          >
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="apply to">
          <select
            className={inputCls}
            value={applyTo}
            onChange={(e) => setApplyTo(e.target.value as InjectionScope)}
          >
            {INJECTION_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SubmitRow label={entry ? "save" : "create"} />
    </form>
  );
}

function MemoryForm({
  entry,
  onDone,
}: {
  entry: MemoryEntry | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [scope, setScope] = useState<MemoryScope>(entry?.scope ?? "always");
  const [condition, setCondition] = useState(entry?.condition ?? "");
  const [target, setTarget] = useState<InjectionTarget>(
    entry?.target ?? "system_append"
  );
  const [expiresAt, setExpiresAt] = useState(entry?.expiresAt ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name,
      content,
      scope,
      target,
      expiresAt: expiresAt || undefined,
    };
    if (scope === "conditional") payload.condition = condition;
    if (entry) {
      await bridge.patch(`/api/memory/${entry.id}`, payload);
    } else {
      await bridge.post("/api/memory", payload);
    }
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <Field label="name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="content">
        <textarea
          className={inputCls}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="scope">
          <select
            className={inputCls}
            value={scope}
            onChange={(e) => setScope(e.target.value as MemoryScope)}
          >
            {MEMORY_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="target">
          <select
            className={inputCls}
            value={target}
            onChange={(e) => setTarget(e.target.value as InjectionTarget)}
          >
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {scope === "conditional" && (
        <Field label="condition (regex, matched against last user message)">
          <input
            className={inputCls}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            required
          />
        </Field>
      )}
      <Field label="expires at (ISO timestamp, optional)">
        <input
          className={inputCls}
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          placeholder="2026-12-31T00:00:00.000Z"
        />
      </Field>
      <SubmitRow label={entry ? "save" : "create"} />
    </form>
  );
}
