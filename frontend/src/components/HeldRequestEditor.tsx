import { useStore } from "../store/store";
import { MetadataPanel } from "./MetadataPanel";
import { SystemPanel } from "./SystemPanel";
import { ToolsPanel } from "./ToolsPanel";
import { MessagesPanel } from "./MessagesPanel";

export function HeldRequestEditor() {
  const editorBody = useStore((s) => s.editorBody);
  const setEditorBody = useStore((s) => s.setEditorBody);

  if (!editorBody) return null;

  const update = (updater: Parameters<typeof setEditorBody>[0]) =>
    setEditorBody(updater);

  return (
    <div className="space-y-3">
      <MetadataPanel body={editorBody} onChange={update} />
      <SystemPanel body={editorBody} onChange={update} />
      <ToolsPanel body={editorBody} onChange={update} />
      <MessagesPanel body={editorBody} onChange={update} />
    </div>
  );
}
