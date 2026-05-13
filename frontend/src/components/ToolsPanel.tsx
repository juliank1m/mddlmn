import { useState } from "react";
import type { EditorBody, EditableBlock } from "../lib/editorModel";
import { SortableList } from "./SortableList";
import { Sortable } from "./Sortable";
import { JsonEditor } from "./JsonEditor";

interface ToolsPanelProps {
  body: EditorBody;
  onChange: (updater: (b: EditorBody) => EditorBody) => void;
}

let toolIdCounter = 0;
function nextToolId() {
  toolIdCounter += 1;
  return `tool_${toolIdCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export function ToolsPanel({ body, onChange }: ToolsPanelProps) {
  const tools = body.tools;
  if (!Array.isArray(tools)) return null;

  return (
    <section>
      <div className="text-[9px] uppercase tracking-widest2 text-bone-200 mb-1">
        tools · {tools.filter((t) => !t.__deleted).length}
      </div>
      <SortableList<EditableBlock>
        items={tools}
        getId={(t) => t.__id}
        onReorder={(next) => onChange((b) => ({ ...b, tools: next }))}
      >
        <div className="space-y-1">
          {tools.map((tool) => (
            <ToolRow
              key={tool.__id}
              tool={tool}
              onChange={(next) =>
                onChange((b) => ({
                  ...b,
                  tools: (b.tools as EditableBlock[]).map((x) =>
                    x.__id === tool.__id ? next : x
                  ),
                }))
              }
              onDelete={() =>
                onChange((b) => ({
                  ...b,
                  tools: (b.tools as EditableBlock[]).map((x) =>
                    x.__id === tool.__id ? { ...x, __deleted: true } : x
                  ),
                }))
              }
              onRestore={() =>
                onChange((b) => ({
                  ...b,
                  tools: (b.tools as EditableBlock[]).map((x) =>
                    x.__id === tool.__id ? { ...x, __deleted: false } : x
                  ),
                }))
              }
            />
          ))}
        </div>
      </SortableList>
      <div className="mt-1">
        <button
          type="button"
          onClick={() =>
            onChange((b) => ({
              ...b,
              tools: [
                ...((b.tools as EditableBlock[]) ?? []),
                { __id: nextToolId(), name: "new_tool", description: "", input_schema: { type: "object", properties: {} } },
              ],
            }))
          }
          className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
        >
          + add tool definition
        </button>
      </div>
    </section>
  );
}

function ToolRow({
  tool,
  onChange,
  onDelete,
  onRestore,
}: {
  tool: EditableBlock;
  onChange: (next: EditableBlock) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const serializable = { ...tool };
  delete (serializable as Record<string, unknown>).__id;
  delete (serializable as Record<string, unknown>).__deleted;
  const [draft, setDraft] = useState(JSON.stringify(serializable, null, 2));
  const name = typeof tool.name === "string" ? tool.name : "tool";

  function commit(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      onChange({ ...parsed, __id: tool.__id, __deleted: tool.__deleted } as EditableBlock);
    } catch {
      // wait for valid JSON
    }
  }

  return (
    <Sortable
      id={tool.__id}
      deleted={tool.__deleted}
      onDelete={onDelete}
      onRestore={onRestore}
      label={name}
    >
      <JsonEditor value={draft} onChange={commit} />
    </Sortable>
  );
}
