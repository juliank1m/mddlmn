export type SectionType =
  | "system"
  | "user_text"
  | "injected_context"
  | "assistant_text"
  | "assistant_tool_call"
  | "user_tool_result"
  | "thinking"
  | "tools"
  | "metadata";

export type RequestKind = "top_level" | "tool_chain" | "aux";

export interface SessionRecord {
  id: string;
  startedAt: string;
  agentType: string | null;
  logFile: string | null;
  requestCount: number;
  totalTokens: number | null;
}

export interface RequestRecord {
  id: string;
  sessionId: string;
  timestamp: string;
  path: string;
  model: string | null;
  totalTokens: number | null;
  totalCost: number | null;
  isMainConversation: boolean;
  isTopLevel: boolean;
  lastUserPreview: string | null;
  durationMs: number | null;
  rawLogOffset: number | null;
}

export interface SectionRecord {
  id: string;
  requestId: string;
  type: SectionType;
  label: string | null;
  tokenCount: number | null;
  contentHash: string | null;
  content: string | null;
}

export interface TokenStatsPoint {
  requestId: string;
  timestamp: string;
  totalTokens: number | null;
  sectionTokens: Array<{ type: SectionType; tokenCount: number }>;
}

export type DiffEntry =
  | { status: "unchanged"; key: string; section: SectionRecord }
  | { status: "added"; key: string; section: SectionRecord }
  | { status: "removed"; key: string; section: SectionRecord }
  | {
      status: "modified";
      key: string;
      before: SectionRecord;
      after: SectionRecord;
    };

export interface DiffResponse {
  before: RequestRecord;
  after: RequestRecord;
  diff: DiffEntry[];
}

export type WSEvent =
  | {
      type: "new_request";
      requestId: string;
      sessionId: string;
      totalTokens: number;
      model: string | null;
      kind: RequestKind;
      preview: string | null;
      timestamp: number;
    }
  | {
      type: "request_classified";
      requestId: string;
      sections: Array<{ type: SectionType; tokenCount: number }>;
    };

export function classify(record: RequestRecord): RequestKind {
  if (!record.isMainConversation) return "aux";
  return record.isTopLevel ? "top_level" : "tool_chain";
}
