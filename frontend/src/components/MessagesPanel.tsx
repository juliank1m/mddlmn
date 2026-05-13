import type {
  EditorBody,
  EditableMessage,
  EditableBlock,
} from "../lib/editorModel";
import { SortableList } from "./SortableList";
import { Sortable } from "./Sortable";
import { ContentBlockEditor } from "./ContentBlockEditor";

interface MessagesPanelProps {
  body: EditorBody;
  onChange: (updater: (b: EditorBody) => EditorBody) => void;
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

const BLOCK_TYPES = ["text", "tool_use", "tool_result"] as const;

function newBlock(type: (typeof BLOCK_TYPES)[number]): EditableBlock {
  const __id = nextId("blk");
  if (type === "text") return { __id, type: "text", text: "" };
  if (type === "tool_use")
    return { __id, type: "tool_use", id: nextId("t"), name: "tool", input: {} };
  return { __id, type: "tool_result", tool_use_id: "", content: "" };
}

export function MessagesPanel({ body, onChange }: MessagesPanelProps) {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  function updateMessages(updater: (m: EditableMessage[]) => EditableMessage[]) {
    onChange((b) => ({ ...b, messages: updater((b.messages ?? []) as EditableMessage[]) }));
  }

  function addMessage(role: "user" | "assistant") {
    updateMessages((msgs) => [
      ...msgs,
      { __id: nextId("msg"), role, content: [newBlock("text")] },
    ]);
  }

  return (
    <section>
      <div className="text-[9px] uppercase tracking-widest2 text-bone-200 mb-1">
        messages · {messages.filter((m) => !m.__deleted).length}
      </div>
      <SortableList<EditableMessage>
        items={messages}
        getId={(m) => m.__id}
        onReorder={(next) => updateMessages(() => next)}
      >
        <div className="space-y-2">
          {messages.map((msg) => (
            <MessageRow
              key={msg.__id}
              message={msg}
              onChange={(next) =>
                updateMessages((msgs) =>
                  msgs.map((m) => (m.__id === msg.__id ? next : m))
                )
              }
              onDelete={() =>
                updateMessages((msgs) =>
                  msgs.map((m) =>
                    m.__id === msg.__id ? { ...m, __deleted: true } : m
                  )
                )
              }
              onRestore={() =>
                updateMessages((msgs) =>
                  msgs.map((m) =>
                    m.__id === msg.__id ? { ...m, __deleted: false } : m
                  )
                )
              }
            />
          ))}
        </div>
      </SortableList>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => addMessage("user")}
          className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
        >
          + user message
        </button>
        <button
          type="button"
          onClick={() => addMessage("assistant")}
          className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
        >
          + assistant message
        </button>
      </div>
    </section>
  );
}

function MessageRow({
  message,
  onChange,
  onDelete,
  onRestore,
}: {
  message: EditableMessage;
  onChange: (next: EditableMessage) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const content = message.content;

  return (
    <Sortable
      id={message.__id}
      deleted={message.__deleted}
      onDelete={onDelete}
      onRestore={onRestore}
      label={
        <select
          value={message.role}
          onChange={(e) => onChange({ ...message, role: e.target.value })}
          className="bg-ink-900/60 border border-bone-400/15 text-[10px] uppercase tracking-widest2 text-signal px-1 py-0.5"
        >
          <option value="user">user</option>
          <option value="assistant">assistant</option>
        </select>
      }
    >
      {typeof content === "string" ? (
        <div className="space-y-1">
          <textarea
            value={content}
            onChange={(e) => onChange({ ...message, content: e.target.value })}
            rows={Math.min(12, Math.max(2, content.split("\n").length))}
            className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
          />
          <button
            type="button"
            onClick={() =>
              onChange({
                ...message,
                content: [{ __id: nextId("blk"), type: "text", text: content }],
              })
            }
            className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
          >
            convert to block list
          </button>
        </div>
      ) : (
        <BlockList
          blocks={content as EditableBlock[]}
          onChange={(next) => onChange({ ...message, content: next })}
        />
      )}
    </Sortable>
  );
}

function BlockList({
  blocks,
  onChange,
}: {
  blocks: EditableBlock[];
  onChange: (next: EditableBlock[]) => void;
}) {
  return (
    <div className="space-y-1">
      <SortableList<EditableBlock>
        items={blocks}
        getId={(b) => b.__id}
        onReorder={(next) => onChange(next)}
      >
        <div className="space-y-1">
          {blocks.map((block) => (
            <Sortable
              key={block.__id}
              id={block.__id}
              deleted={block.__deleted}
              onDelete={() =>
                onChange(
                  blocks.map((x) =>
                    x.__id === block.__id ? { ...x, __deleted: true } : x
                  )
                )
              }
              onRestore={() =>
                onChange(
                  blocks.map((x) =>
                    x.__id === block.__id ? { ...x, __deleted: false } : x
                  )
                )
              }
              label={String(block.type ?? "unknown")}
            >
              <ContentBlockEditor
                block={block}
                onChange={(next) =>
                  onChange(
                    blocks.map((x) => (x.__id === block.__id ? next : x))
                  )
                }
              />
            </Sortable>
          ))}
        </div>
      </SortableList>
      <div className="flex gap-1">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange([...blocks, newBlock(t)])}
            className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
          >
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}
