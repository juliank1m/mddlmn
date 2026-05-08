import fs from "node:fs";
import path from "node:path";
import { configDir, configFile } from "../storage/paths.js";
import type { AnthropicRequest } from "../classifier/index.js";
import type { MiddlewareContext } from "./pipeline.js";

export interface RedactionRule {
  id: string;
  name: string;
  pattern: string;
  flags?: string;
  replacement: string;
  enabled: boolean;
  builtin: boolean;
}

export interface RedactionHit {
  ruleId: string;
  count: number;
}

export interface RedactionStringResult {
  text: string;
  hits: RedactionHit[];
}

export interface RedactionBodyResult {
  body: AnthropicRequest;
  hits: RedactionHit[];
}

const RULES_FILE = "redaction-rules.json";

export function builtinRedactionRules(): RedactionRule[] {
  return [
    {
      id: "builtin:anthropic-key",
      name: "Anthropic API key",
      pattern: "sk-ant-[A-Za-z0-9_-]{16,}",
      flags: "g",
      replacement: "[REDACTED:anthropic-key]",
      enabled: true,
      builtin: true,
    },
    {
      id: "builtin:openai-key",
      name: "OpenAI-style API key",
      pattern: "sk-[A-Za-z0-9]{32,}",
      flags: "g",
      replacement: "[REDACTED:openai-key]",
      enabled: true,
      builtin: true,
    },
    {
      id: "builtin:aws-access-key",
      name: "AWS access key ID",
      pattern: "AKIA[0-9A-Z]{16}",
      flags: "g",
      replacement: "[REDACTED:aws-key]",
      enabled: true,
      builtin: true,
    },
    {
      id: "builtin:pem-private-key",
      name: "PEM private key block",
      pattern:
        "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
      flags: "g",
      replacement: "[REDACTED:private-key]",
      enabled: true,
      builtin: true,
    },
  ];
}

function compile(rule: RedactionRule): RegExp | null {
  try {
    const flags = rule.flags ?? "";
    return new RegExp(rule.pattern, flags.includes("g") ? flags : flags + "g");
  } catch {
    return null;
  }
}

export function applyRedaction(
  text: string,
  rules: RedactionRule[]
): RedactionStringResult {
  let current = text;
  const hits: RedactionHit[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const re = compile(rule);
    if (!re) continue;

    let count = 0;
    current = current.replace(re, () => {
      count++;
      return rule.replacement;
    });
    if (count > 0) hits.push({ ruleId: rule.id, count });
  }

  return { text: current, hits };
}

function mergeHits(into: Map<string, number>, from: RedactionHit[]): void {
  for (const hit of from) {
    into.set(hit.ruleId, (into.get(hit.ruleId) ?? 0) + hit.count);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function redactString(
  text: string,
  rules: RedactionRule[],
  hits: Map<string, number>
): string {
  const result = applyRedaction(text, rules);
  mergeHits(hits, result.hits);
  return result.text;
}

function redactSystem(
  system: unknown,
  rules: RedactionRule[],
  hits: Map<string, number>
): unknown {
  if (typeof system === "string") {
    return redactString(system, rules, hits);
  }
  if (Array.isArray(system)) {
    return system.map((block) => redactTextBlock(block, rules, hits));
  }
  return system;
}

function redactTextBlock(
  block: unknown,
  rules: RedactionRule[],
  hits: Map<string, number>
): unknown {
  if (!isObject(block)) return block;
  if (block.type === "text" && typeof block.text === "string") {
    return { ...block, text: redactString(block.text, rules, hits) };
  }
  return block;
}

function redactToolResultContent(
  content: unknown,
  rules: RedactionRule[],
  hits: Map<string, number>
): unknown {
  if (typeof content === "string") {
    return redactString(content, rules, hits);
  }
  if (Array.isArray(content)) {
    return content.map((block) => redactTextBlock(block, rules, hits));
  }
  return content;
}

function redactMessageContentBlock(
  block: unknown,
  rules: RedactionRule[],
  hits: Map<string, number>
): unknown {
  if (!isObject(block)) return block;
  if (block.type === "text" && typeof block.text === "string") {
    return { ...block, text: redactString(block.text, rules, hits) };
  }
  if (block.type === "tool_result") {
    return {
      ...block,
      content: redactToolResultContent(block.content, rules, hits),
    };
  }
  // tool_use, image, thinking, etc. — leave untouched
  return block;
}

function redactMessage(
  message: unknown,
  rules: RedactionRule[],
  hits: Map<string, number>
): unknown {
  if (!isObject(message)) return message;
  const content = message.content;
  if (typeof content === "string") {
    return { ...message, content: redactString(content, rules, hits) };
  }
  if (Array.isArray(content)) {
    return {
      ...message,
      content: content.map((block) =>
        redactMessageContentBlock(block, rules, hits)
      ),
    };
  }
  return message;
}

export function redactBody(
  body: AnthropicRequest,
  rules: RedactionRule[]
): RedactionBodyResult {
  const hits = new Map<string, number>();
  const next: AnthropicRequest = { ...body };

  if (body.system !== undefined) {
    next.system = redactSystem(body.system, rules, hits);
  }
  if (Array.isArray(body.messages)) {
    next.messages = body.messages.map((msg) => redactMessage(msg, rules, hits));
  }

  const flat: RedactionHit[] = Array.from(hits.entries()).map(([ruleId, count]) => ({
    ruleId,
    count,
  }));

  return { body: next, hits: flat };
}

export function loadRedactionRules(): RedactionRule[] {
  const file = configFile(RULES_FILE);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RedactionRule[];
    }
  } catch {
    // fall through and re-seed
  }
  const seeded = builtinRedactionRules();
  saveRedactionRules(seeded);
  return seeded;
}

export function saveRedactionRules(rules: RedactionRule[]): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, RULES_FILE),
    JSON.stringify(rules, null, 2),
    "utf-8"
  );
}

export interface RedactionMiddlewareOptions {
  loadRules?: () => RedactionRule[];
  onHits?: (requestId: string, hits: RedactionHit[]) => void;
}

export function createRedactionMiddleware(
  options: RedactionMiddlewareOptions = {}
): (ctx: MiddlewareContext) => MiddlewareContext {
  const load = options.loadRules ?? loadRedactionRules;

  return (ctx) => {
    const rules = load();
    if (rules.length === 0) return ctx;

    const result = redactBody(ctx.body, rules);
    if (result.hits.length > 0 && options.onHits) {
      options.onHits(ctx.requestId, result.hits);
    }
    return { ...ctx, body: result.body };
  };
}
