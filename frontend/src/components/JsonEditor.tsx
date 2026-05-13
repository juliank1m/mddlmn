import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  minHeight?: string;
}

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      fontSize: "11px",
      color: "#e2e8f0",
    },
    ".cm-content": {
      caretColor: "#fcd34d",
      fontFamily:
        "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
      padding: "8px 0",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "rgba(226, 232, 240, 0.3)",
      border: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "rgba(252, 211, 77, 0.04)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(252, 211, 77, 0.18) !important",
    },
  },
  { dark: true }
);

export function JsonEditor({
  value,
  onChange,
  disabled,
  minHeight = "60px",
}: JsonEditorProps) {
  const extensions = useMemo(
    () => [json(), linter(jsonParseLinter()), lintGutter(), editorTheme],
    []
  );

  return (
    <div className="border border-bone-400/15 bg-ink-900/60" style={{ minHeight }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        editable={!disabled}
        extensions={extensions}
        theme="dark"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
    </div>
  );
}

export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
