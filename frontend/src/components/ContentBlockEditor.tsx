import { useState } from "react";
import { JsonEditor } from "./JsonEditor";
import type { EditableBlock } from "../lib/editorModel";

interface ContentBlockEditorProps {
  block: EditableBlock;
  onChange: (next: EditableBlock) => void;
}

export function ContentBlockEditor({ block, onChange }: ContentBlockEditorProps) {
  const type = String(block.type ?? "unknown");

  if (type === "text") {
    return (
      <TextBlockEditor
        text={typeof block.text === "string" ? block.text : ""}
        onChange={(text) => onChange({ ...block, text })}
      />
    );
  }

  if (type === "tool_use") {
    return <ToolUseEditor block={block} onChange={onChange} />;
  }

  if (type === "tool_result") {
    return <ToolResultEditor block={block} onChange={onChange} />;
  }

  if (type === "image") {
    return (
      <div className="text-[10px] text-bone-400 italic">
        image block — preview not editable
      </div>
    );
  }

  return <RawJsonEditor block={block} onChange={onChange} />;
}

function TextBlockEditor({
  text,
  onChange,
}: {
  text: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.min(20, Math.max(2, text.split("\n").length))}
      className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
    />
  );
}

function ToolUseEditor({
  block,
  onChange,
}: {
  block: EditableBlock;
  onChange: (next: EditableBlock) => void;
}) {
  const id = typeof block.id === "string" ? block.id : "";
  const name = typeof block.name === "string" ? block.name : "";
  const inputJson = JSON.stringify(block.input ?? {}, null, 2);
  const [inputDraft, setInputDraft] = useState(inputJson);

  function commitInput(text: string) {
    setInputDraft(text);
    try {
      const parsed = JSON.parse(text);
      onChange({ ...block, input: parsed });
    } catch {
      // invalid — keep block.input as-is; serializer will fail later
    }
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <Field label="id">
          <input
            type="text"
            value={id}
            onChange={(e) => onChange({ ...block, id: e.target.value })}
            className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
          />
        </Field>
        <Field label="name">
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ ...block, name: e.target.value })}
            className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
          />
        </Field>
      </div>
      <Field label="input (JSON)">
        <JsonEditor value={inputDraft} onChange={commitInput} />
      </Field>
    </div>
  );
}

function ToolResultEditor({
  block,
  onChange,
}: {
  block: EditableBlock;
  onChange: (next: EditableBlock) => void;
}) {
  const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : "";
  const content = block.content;
  const isString = typeof content === "string";

  const [draft, setDraft] = useState(
    isString ? (content as string) : JSON.stringify(content ?? "", null, 2)
  );

  function commit(text: string) {
    setDraft(text);
    if (isString) {
      onChange({ ...block, content: text });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      onChange({ ...block, content: parsed });
    } catch {
      // invalid — keep prior value
    }
  }

  return (
    <div className="space-y-1">
      <Field label="tool_use_id">
        <input
          type="text"
          value={toolUseId}
          onChange={(e) => onChange({ ...block, tool_use_id: e.target.value })}
          className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
      </Field>
      <Field label={isString ? "content" : "content (JSON)"}>
        {isString ? (
          <textarea
            value={draft}
            onChange={(e) => commit(e.target.value)}
            rows={Math.min(20, Math.max(2, draft.split("\n").length))}
            className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
          />
        ) : (
          <JsonEditor value={draft} onChange={commit} />
        )}
      </Field>
    </div>
  );
}

function RawJsonEditor({
  block,
  onChange,
}: {
  block: EditableBlock;
  onChange: (next: EditableBlock) => void;
}) {
  const serializable = { ...block };
  delete (serializable as Record<string, unknown>).__id;
  delete (serializable as Record<string, unknown>).__deleted;
  const [draft, setDraft] = useState(JSON.stringify(serializable, null, 2));

  function commit(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      onChange({ ...parsed, __id: block.__id, __deleted: block.__deleted } as EditableBlock);
    } catch {
      // invalid — wait for valid JSON
    }
  }

  return <JsonEditor value={draft} onChange={commit} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest2 text-bone-400 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
