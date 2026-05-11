import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyInjection,
  loadInjectionRules,
  saveInjectionRules,
  type InjectionRule,
} from "./injection.js";
import type { AnthropicRequest } from "../classifier/index.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mddlmn-injection-"));
  process.env.MDDLMN_CONFIG_DIR = tempDir;
});

afterEach(() => {
  delete process.env.MDDLMN_CONFIG_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const rule = (overrides: Partial<InjectionRule> = {}): InjectionRule => ({
  id: "r1",
  name: "Test rule",
  content: "INJECTED",
  target: "system_append",
  enabled: true,
  applyTo: "all",
  ...overrides,
});

const ctx = (overrides: Partial<{ isMainConversation: boolean; isTopLevel: boolean }> = {}) => ({
  isMainConversation: true,
  isTopLevel: true,
  ...overrides,
});

describe("applyInjection — system targeting", () => {
  test("appends to string system prompt with separator", () => {
    const body: AnthropicRequest = { system: "you are helpful" };
    const result = applyInjection(body, [rule({ target: "system_append" })], ctx());
    expect(result.body.system).toBe("you are helpful\n\nINJECTED");
  });

  test("prepends to string system prompt with separator", () => {
    const body: AnthropicRequest = { system: "you are helpful" };
    const result = applyInjection(body, [rule({ target: "system_prepend" })], ctx());
    expect(result.body.system).toBe("INJECTED\n\nyou are helpful");
  });

  test("appends text block to array system prompt", () => {
    const body: AnthropicRequest = {
      system: [{ type: "text", text: "intro" }],
    };
    const result = applyInjection(body, [rule({ target: "system_append" })], ctx());
    expect(result.body.system).toEqual([
      { type: "text", text: "intro" },
      { type: "text", text: "INJECTED" },
    ]);
  });

  test("prepends text block to array system prompt", () => {
    const body: AnthropicRequest = {
      system: [{ type: "text", text: "intro" }],
    };
    const result = applyInjection(body, [rule({ target: "system_prepend" })], ctx());
    expect(result.body.system).toEqual([
      { type: "text", text: "INJECTED" },
      { type: "text", text: "intro" },
    ]);
  });

  test("creates system prompt when missing", () => {
    const body: AnthropicRequest = {};
    const result = applyInjection(body, [rule({ target: "system_append" })], ctx());
    expect(result.body.system).toBe("INJECTED");
  });
});

describe("applyInjection — user message targeting", () => {
  test("appends to last user message string", () => {
    const body: AnthropicRequest = {
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "ack" },
        { role: "user", content: "second" },
      ],
    };
    const result = applyInjection(body, [rule({ target: "user_append" })], ctx());
    const msgs = result.body.messages as Array<{ role: string; content: unknown }>;
    expect(msgs[2].content).toBe("second\n\nINJECTED");
    expect(msgs[0].content).toBe("first"); // earlier user untouched
  });

  test("prepends to last user message string", () => {
    const body: AnthropicRequest = {
      messages: [{ role: "user", content: "question" }],
    };
    const result = applyInjection(body, [rule({ target: "user_prepend" })], ctx());
    const msgs = result.body.messages as Array<{ content: unknown }>;
    expect(msgs[0].content).toBe("INJECTED\n\nquestion");
  });

  test("appends text block to array user content", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "question" }],
        },
      ],
    };
    const result = applyInjection(body, [rule({ target: "user_append" })], ctx());
    const msgs = result.body.messages as Array<{ content: Array<Record<string, unknown>> }>;
    expect(msgs[0].content).toEqual([
      { type: "text", text: "question" },
      { type: "text", text: "INJECTED" },
    ]);
  });

  test("prepends text block to array user content", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "question" }],
        },
      ],
    };
    const result = applyInjection(body, [rule({ target: "user_prepend" })], ctx());
    const msgs = result.body.messages as Array<{ content: Array<Record<string, unknown>> }>;
    expect(msgs[0].content).toEqual([
      { type: "text", text: "INJECTED" },
      { type: "text", text: "question" },
    ]);
  });

  test("skips user-targeted injection when no user message exists", () => {
    const body: AnthropicRequest = {
      messages: [{ role: "assistant", content: "hello" }],
    };
    const result = applyInjection(body, [rule({ target: "user_append" })], ctx());
    const msgs = result.body.messages as Array<{ content: unknown }>;
    expect(msgs[0].content).toBe("hello");
    expect(result.applied).toEqual([]);
  });
});

describe("applyInjection — new_user_message target", () => {
  test("appends a new user message", () => {
    const body: AnthropicRequest = {
      messages: [{ role: "user", content: "question" }],
    };
    const result = applyInjection(body, [rule({ target: "new_user_message" })], ctx());
    const msgs = result.body.messages as Array<{ role: string; content: unknown }>;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "INJECTED" }],
    });
  });

  test("creates messages array when missing", () => {
    const body: AnthropicRequest = {};
    const result = applyInjection(body, [rule({ target: "new_user_message" })], ctx());
    expect(result.body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "INJECTED" }] },
    ]);
  });
});

describe("applyInjection — applyTo filtering", () => {
  test("'all' applies to every kind", () => {
    const body: AnthropicRequest = { system: "x" };
    const top = applyInjection(body, [rule({ applyTo: "all" })], ctx({ isTopLevel: true }));
    const chain = applyInjection(
      body,
      [rule({ applyTo: "all" })],
      ctx({ isTopLevel: false, isMainConversation: true })
    );
    expect(top.applied).toHaveLength(1);
    expect(chain.applied).toHaveLength(1);
  });

  test("'top_level' applies only to user-initiated turns", () => {
    const body: AnthropicRequest = { system: "x" };
    const top = applyInjection(body, [rule({ applyTo: "top_level" })], ctx({ isTopLevel: true }));
    const chain = applyInjection(
      body,
      [rule({ applyTo: "top_level" })],
      ctx({ isTopLevel: false, isMainConversation: true })
    );
    expect(top.applied).toHaveLength(1);
    expect(chain.applied).toHaveLength(0);
  });

  test("'tool_chain' applies only to assistant follow-ups in the loop", () => {
    const body: AnthropicRequest = { system: "x" };
    const top = applyInjection(body, [rule({ applyTo: "tool_chain" })], ctx({ isTopLevel: true }));
    const chain = applyInjection(
      body,
      [rule({ applyTo: "tool_chain" })],
      ctx({ isTopLevel: false, isMainConversation: true })
    );
    expect(top.applied).toHaveLength(0);
    expect(chain.applied).toHaveLength(1);
  });

  test("aux requests (non-main conversation) get nothing even with 'all'", () => {
    const body: AnthropicRequest = { system: "x" };
    const result = applyInjection(
      body,
      [rule({ applyTo: "all" })],
      ctx({ isMainConversation: false, isTopLevel: false })
    );
    expect(result.applied).toEqual([]);
    expect(result.body.system).toBe("x");
  });
});

describe("applyInjection — multiple rules", () => {
  test("applies in declared order, system_prepend stacks newest-first at the top", () => {
    const body: AnthropicRequest = { system: "core" };
    const result = applyInjection(
      body,
      [
        rule({ id: "a", content: "A", target: "system_prepend" }),
        rule({ id: "b", content: "B", target: "system_prepend" }),
      ],
      ctx()
    );
    // After applying A (prepend): "A\n\ncore"
    // After applying B (prepend): "B\n\nA\n\ncore"
    expect(result.body.system).toBe("B\n\nA\n\ncore");
    expect(result.applied.map((a) => a.ruleId)).toEqual(["a", "b"]);
  });

  test("skips disabled rules", () => {
    const body: AnthropicRequest = { system: "core" };
    const result = applyInjection(
      body,
      [rule({ enabled: false })],
      ctx()
    );
    expect(result.body.system).toBe("core");
    expect(result.applied).toEqual([]);
  });
});

describe("applyInjection — immutability", () => {
  test("does not mutate input body", () => {
    const body: AnthropicRequest = {
      system: "core",
      messages: [{ role: "user", content: "x" }],
    };
    const snapshot = JSON.stringify(body);
    applyInjection(body, [rule({ target: "system_append" })], ctx());
    expect(JSON.stringify(body)).toBe(snapshot);
  });
});

describe("loadInjectionRules / saveInjectionRules", () => {
  test("loadInjectionRules returns empty array on first run", () => {
    expect(loadInjectionRules()).toEqual([]);
  });

  test("loadInjectionRules returns persisted rules", () => {
    const rules: InjectionRule[] = [rule({ id: "x" })];
    fs.writeFileSync(
      path.join(tempDir, "injection-rules.json"),
      JSON.stringify(rules)
    );
    expect(loadInjectionRules()).toEqual(rules);
  });

  test("loadInjectionRules returns empty array on malformed JSON", () => {
    fs.writeFileSync(path.join(tempDir, "injection-rules.json"), "not json");
    expect(loadInjectionRules()).toEqual([]);
  });

  test("saveInjectionRules persists to disk", () => {
    const rules: InjectionRule[] = [rule({ id: "x" })];
    saveInjectionRules(rules);
    const raw = fs.readFileSync(
      path.join(tempDir, "injection-rules.json"),
      "utf-8"
    );
    expect(JSON.parse(raw)).toEqual(rules);
  });
});
