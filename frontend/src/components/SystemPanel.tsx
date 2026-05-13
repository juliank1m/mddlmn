import type { EditorBody, EditableBlock } from "../lib/editorModel";
import { SortableList } from "./SortableList";
import { Sortable } from "./Sortable";

interface SystemPanelProps {
  body: EditorBody;
  onChange: (updater: (b: EditorBody) => EditorBody) => void;
}

let blockIdCounter = 0;
function nextBlockId() {
  blockIdCounter += 1;
  return `sys_${blockIdCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SystemPanel({ body, onChange }: SystemPanelProps) {
  const system = body.system;

  if (typeof system === "string") {
    return (
      <Section label="system">
        <textarea
          value={system}
          onChange={(e) => onChange((b) => ({ ...b, system: e.target.value }))}
          rows={Math.min(20, Math.max(3, system.split("\n").length))}
          className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
        />
        <div className="mt-1">
          <ConvertButton
            onClick={() =>
              onChange((b) => ({
                ...b,
                system: [{ __id: nextBlockId(), type: "text", text: typeof b.system === "string" ? b.system : "" }],
              }))
            }
          >
            convert to block list
          </ConvertButton>
        </div>
      </Section>
    );
  }

  if (Array.isArray(system)) {
    return (
      <Section label={`system · ${system.filter((b) => !b.__deleted).length}`}>
        <SortableList<EditableBlock>
          items={system}
          getId={(b) => b.__id}
          onReorder={(next) => onChange((b) => ({ ...b, system: next }))}
        >
          <div className="space-y-1">
            {system.map((block) => (
              <Sortable
                key={block.__id}
                id={block.__id}
                deleted={block.__deleted}
                onDelete={() =>
                  onChange((b) => ({
                    ...b,
                    system: (b.system as EditableBlock[]).map((x) =>
                      x.__id === block.__id ? { ...x, __deleted: true } : x
                    ),
                  }))
                }
                onRestore={() =>
                  onChange((b) => ({
                    ...b,
                    system: (b.system as EditableBlock[]).map((x) =>
                      x.__id === block.__id ? { ...x, __deleted: false } : x
                    ),
                  }))
                }
                label={String(block.type ?? "text")}
              >
                <textarea
                  value={typeof block.text === "string" ? block.text : ""}
                  onChange={(e) =>
                    onChange((b) => ({
                      ...b,
                      system: (b.system as EditableBlock[]).map((x) =>
                        x.__id === block.__id ? { ...x, text: e.target.value } : x
                      ),
                    }))
                  }
                  rows={Math.min(
                    12,
                    Math.max(2, String(block.text ?? "").split("\n").length)
                  )}
                  className="w-full bg-ink-900/60 border border-bone-400/15 px-2 py-1 text-xs font-mono text-bone-100 focus:outline-none focus:border-signal/40"
                />
              </Sortable>
            ))}
          </div>
        </SortableList>
        <div className="mt-1">
          <AddButton
            onClick={() =>
              onChange((b) => ({
                ...b,
                system: [
                  ...((b.system as EditableBlock[]) ?? []),
                  { __id: nextBlockId(), type: "text", text: "" },
                ],
              }))
            }
          >
            + add text block
          </AddButton>
        </div>
      </Section>
    );
  }

  // no system — offer to add one
  return (
    <Section label="system">
      <AddButton
        onClick={() => onChange((b) => ({ ...b, system: "" }))}
      >
        + add system prompt
      </AddButton>
    </Section>
  );
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

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[9px] uppercase tracking-widest2 text-bone-400 hover:text-signal border border-bone-400/15 px-2 py-1"
    >
      {children}
    </button>
  );
}

function ConvertButton(props: { children: React.ReactNode; onClick: () => void }) {
  return <AddButton {...props} />;
}
