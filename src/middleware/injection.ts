import fs from "node:fs";
import path from "node:path";
import { configDir, configFile } from "../storage/paths.js";
import type { AnthropicRequest } from "../classifier/index.js";
import type { MiddlewareContext } from "./pipeline.js";

export type InjectionTarget =
  | "system_prepend"
  | "system_append"
  | "user_prepend"
  | "user_append"
  | "new_user_message";

export type InjectionScope = "all" | "top_level" | "tool_chain";

export interface InjectionRule {
  id: string;
  name: string;
  content: string;
  target: InjectionTarget;
  enabled: boolean;
  applyTo: InjectionScope;
}

export interface AppliedInjection {
  ruleId: string;
  target: InjectionTarget;
}

export interface InjectionResult {
  body: AnthropicRequest;
  applied: AppliedInjection[];
}

export interface InjectionRequestKind {
  isMainConversation: boolean;
  isTopLevel: boolean;
}

const RULES_FILE = "injection-rules.json";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scopeMatches(scope: InjectionScope, kind: InjectionRequestKind): boolean {
  // Aux requests never get injection — they are not user-meaningful traffic.
  if (!kind.isMainConversation) return false;
  if (scope === "all") return true;
  if (scope === "top_level") return kind.isTopLevel;
  if (scope === "tool_chain") return !kind.isTopLevel;
  return false;
}

function injectSystem(
  system: unknown,
  content: string,
  position: "prepend" | "append"
): unknown {
  if (system === undefined || system === null) {
    return content;
  }
  if (typeof system === "string") {
    return position === "prepend"
      ? `${content}\n\n${system}`
      : `${system}\n\n${content}`;
  }
  if (Array.isArray(system)) {
    const block = { type: "text", text: content };
    return position === "prepend" ? [block, ...system] : [...system, block];
  }
  return system;
}

interface InjectIntoUserResult {
  messages: unknown[];
  applied: boolean;
}

function injectIntoLastUser(
  messages: unknown[],
  content: string,
  position: "prepend" | "append"
): InjectIntoUserResult {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isObject(msg) || msg.role !== "user") continue;

    const next = [...messages];
    const c = msg.content;
    if (typeof c === "string") {
      next[i] = {
        ...msg,
        content: position === "prepend" ? `${content}\n\n${c}` : `${c}\n\n${content}`,
      };
    } else if (Array.isArray(c)) {
      const block = { type: "text", text: content };
      next[i] = {
        ...msg,
        content: position === "prepend" ? [block, ...c] : [...c, block],
      };
    } else {
      // unknown content shape — skip
      return { messages, applied: false };
    }
    return { messages: next, applied: true };
  }
  return { messages, applied: false };
}

function appendNewUserMessage(messages: unknown[], content: string): unknown[] {
  return [
    ...messages,
    { role: "user", content: [{ type: "text", text: content }] },
  ];
}

export function applyInjection(
  body: AnthropicRequest,
  rules: InjectionRule[],
  kind: InjectionRequestKind
): InjectionResult {
  let current: AnthropicRequest = { ...body };
  const applied: AppliedInjection[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!scopeMatches(rule.applyTo, kind)) continue;

    switch (rule.target) {
      case "system_prepend":
        current = { ...current, system: injectSystem(current.system, rule.content, "prepend") };
        applied.push({ ruleId: rule.id, target: rule.target });
        break;

      case "system_append":
        current = { ...current, system: injectSystem(current.system, rule.content, "append") };
        applied.push({ ruleId: rule.id, target: rule.target });
        break;

      case "user_prepend":
      case "user_append": {
        const messages = Array.isArray(current.messages) ? (current.messages as unknown[]) : [];
        const position = rule.target === "user_prepend" ? "prepend" : "append";
        const result = injectIntoLastUser(messages, rule.content, position);
        if (result.applied) {
          current = { ...current, messages: result.messages };
          applied.push({ ruleId: rule.id, target: rule.target });
        }
        break;
      }

      case "new_user_message": {
        const messages = Array.isArray(current.messages) ? (current.messages as unknown[]) : [];
        current = { ...current, messages: appendNewUserMessage(messages, rule.content) };
        applied.push({ ruleId: rule.id, target: rule.target });
        break;
      }
    }
  }

  return { body: current, applied };
}

export function loadInjectionRules(): InjectionRule[] {
  const file = configFile(RULES_FILE);
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InjectionRule[]) : [];
  } catch {
    return [];
  }
}

export function saveInjectionRules(rules: InjectionRule[]): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, RULES_FILE),
    JSON.stringify(rules, null, 2),
    "utf-8"
  );
}

export interface InjectionMiddlewareOptions {
  loadRules?: () => InjectionRule[];
  detectKind: (apiPath: string, body: AnthropicRequest) => InjectionRequestKind;
  onApplied?: (requestId: string, applied: AppliedInjection[]) => void;
}

export function createInjectionMiddleware(
  options: InjectionMiddlewareOptions
): (ctx: MiddlewareContext) => MiddlewareContext {
  const load = options.loadRules ?? loadInjectionRules;

  return (ctx) => {
    const rules = load();
    if (rules.length === 0) return ctx;

    const kind = options.detectKind(ctx.apiPath, ctx.body);
    const result = applyInjection(ctx.body, rules, kind);
    if (result.applied.length > 0 && options.onApplied) {
      options.onApplied(ctx.requestId, result.applied);
    }
    return { ...ctx, body: result.body };
  };
}
