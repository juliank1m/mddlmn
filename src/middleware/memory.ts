import fs from "node:fs";
import path from "node:path";
import { configDir, configFile } from "../storage/paths.js";
import type { AnthropicRequest } from "../classifier/index.js";
import type { MiddlewareContext } from "./pipeline.js";
import {
  applyInjection,
  type InjectionRule,
  type InjectionTarget,
  type InjectionRequestKind,
  type AppliedInjection,
} from "./injection.js";

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

const MEMORY_FILE = "memory.json";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Extract the plain text of the most recent user message. Used for
 * conditional-scope regex matching. Array content joins text blocks with
 * newlines; non-text blocks are ignored.
 */
export function lastUserMessageText(body: AnthropicRequest): string {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isObject(msg) || msg.role !== "user") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter(
          (b): b is { type: "text"; text: string } =>
            isObject(b) && b.type === "text" && typeof b.text === "string"
        )
        .map((b) => b.text)
        .join("\n");
    }
    return "";
  }
  return "";
}

function isExpired(entry: MemoryEntry, now: Date): boolean {
  if (!entry.expiresAt) return false;
  const ts = Date.parse(entry.expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts <= now.getTime();
}

function conditionMatches(condition: string | undefined, text: string): boolean {
  if (!condition) return false;
  try {
    return new RegExp(condition, "i").test(text);
  } catch {
    return false;
  }
}

/**
 * Filter memory entries down to the ones that apply to the current request.
 * Pure — the caller supplies the last user message text and the clock.
 */
export function selectApplicableEntries(
  entries: MemoryEntry[],
  lastUserText: string,
  now: Date
): MemoryEntry[] {
  return entries.filter((entry) => {
    if (!entry.enabled) return false;
    if (isExpired(entry, now)) return false;
    if (entry.scope === "always" || entry.scope === "session") return true;
    if (entry.scope === "conditional") {
      return conditionMatches(entry.condition, lastUserText);
    }
    return false;
  });
}

export function memoryEntryToInjectionRule(entry: MemoryEntry): InjectionRule {
  return {
    id: entry.id,
    name: entry.name,
    content: entry.content,
    target: entry.target,
    enabled: true,
    applyTo: "all",
  };
}

export function loadMemory(): MemoryEntry[] {
  const file = configFile(MEMORY_FILE);
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist memory entries. Session-scoped entries are intentionally excluded —
 * they live only in RAM and must vanish on proxy restart.
 */
export function saveMemory(entries: MemoryEntry[]): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const persistable = entries.filter((e) => e.scope !== "session");
  fs.writeFileSync(
    path.join(dir, MEMORY_FILE),
    JSON.stringify(persistable, null, 2),
    "utf-8"
  );
}

export interface MemoryMiddlewareOptions {
  loadEntries?: () => MemoryEntry[];
  detectKind: (apiPath: string, body: AnthropicRequest) => InjectionRequestKind;
  onApplied?: (requestId: string, applied: AppliedInjection[]) => void;
  now?: () => Date;
}

export function createMemoryMiddleware(
  options: MemoryMiddlewareOptions
): (ctx: MiddlewareContext) => MiddlewareContext {
  const load = options.loadEntries ?? loadMemory;
  const clock = options.now ?? (() => new Date());

  return (ctx) => {
    const entries = load();
    if (entries.length === 0) return ctx;

    const kind = options.detectKind(ctx.apiPath, ctx.body);
    // Aux requests get nothing — same policy as injection.
    if (!kind.isMainConversation) return ctx;

    const lastUserText = lastUserMessageText(ctx.body);
    const applicable = selectApplicableEntries(entries, lastUserText, clock());
    if (applicable.length === 0) return ctx;

    const rules = applicable.map(memoryEntryToInjectionRule);
    const result = applyInjection(ctx.body, rules, kind);
    if (result.applied.length > 0 && options.onApplied) {
      options.onApplied(ctx.requestId, result.applied);
    }
    return { ...ctx, body: result.body };
  };
}
