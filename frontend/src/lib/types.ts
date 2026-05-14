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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnthropicRequestBody = Record<string, any>;

export type InjectionTarget =
  | "system_prepend"
  | "system_append"
  | "user_prepend"
  | "user_append"
  | "new_user_message";

export type InjectionScope = "all" | "top_level" | "tool_chain";

export interface RedactionRule {
  id: string;
  name: string;
  pattern: string;
  flags?: string;
  replacement: string;
  enabled: boolean;
  builtin: boolean;
}

export interface InjectionRule {
  id: string;
  name: string;
  content: string;
  target: InjectionTarget;
  enabled: boolean;
  applyTo: InjectionScope;
}

export type MemoryScope = "always" | "session" | "conditional";

export interface MemoryEntry {
  id: string;
  name: string;
  content: string;
  scope: MemoryScope;
  condition?: string;
  target: InjectionTarget;
  enabled: boolean;
  createdAt: string;
  expiresAt?: string;
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
    }
  | {
      type: "request_held";
      requestId: string;
      sessionId: string;
      body: AnthropicRequestBody;
      kind: RequestKind;
      timestamp: number;
    }
  | {
      type: "request_released";
      requestId: string;
    }
  | {
      type: "gate:status";
      enabled: boolean;
      queueLength: number;
    }
  | {
      type: "redaction:hits";
      requestId: string;
      hits: Array<{ ruleId: string; count: number }>;
    }
  | {
      type: "injection:applied";
      requestId: string;
      applied: Array<{ ruleId: string; target: string }>;
    }
  | {
      type: "memory:injected";
      requestId: string;
      applied: Array<{ ruleId: string; target: string }>;
    };

export function classify(record: RequestRecord): RequestKind {
  if (!record.isMainConversation) return "aux";
  return record.isTopLevel ? "top_level" : "tool_chain";
}
