import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyRedaction,
  builtinRedactionRules,
  loadRedactionRules,
  saveRedactionRules,
  redactBody,
  type RedactionRule,
} from "./redaction.js";
import type { AnthropicRequest } from "../classifier/index.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mddlmn-redaction-"));
  process.env.MDDLMN_CONFIG_DIR = tempDir;
});

afterEach(() => {
  delete process.env.MDDLMN_CONFIG_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const rule = (overrides: Partial<RedactionRule> = {}): RedactionRule => ({
  id: "r1",
  name: "Test rule",
  pattern: "secret",
  flags: "g",
  replacement: "[REDACTED]",
  enabled: true,
  builtin: false,
  ...overrides,
});

describe("applyRedaction (string-level)", () => {
  test("replaces matches and counts hits", () => {
    const result = applyRedaction("a secret and another secret", [rule()]);
    expect(result.text).toBe("a [REDACTED] and another [REDACTED]");
    expect(result.hits).toEqual([{ ruleId: "r1", count: 2 }]);
  });

  test("skips disabled rules", () => {
    const result = applyRedaction("a secret", [rule({ enabled: false })]);
    expect(result.text).toBe("a secret");
    expect(result.hits).toEqual([]);
  });

  test("ignores rules with invalid regex", () => {
    const result = applyRedaction("a secret", [rule({ pattern: "[" })]);
    expect(result.text).toBe("a secret");
    expect(result.hits).toEqual([]);
  });

  test("applies multiple rules in order", () => {
    const result = applyRedaction("alpha beta", [
      rule({ id: "a", pattern: "alpha", replacement: "[A]" }),
      rule({ id: "b", pattern: "beta", replacement: "[B]" }),
    ]);
    expect(result.text).toBe("[A] [B]");
    expect(result.hits).toEqual([
      { ruleId: "a", count: 1 },
      { ruleId: "b", count: 1 },
    ]);
  });
});

describe("redactBody — targeted text-field walking", () => {
  test("redacts string system prompt", () => {
    const body: AnthropicRequest = { system: "leak: secret" };
    const result = redactBody(body, [rule()]);
    expect(result.body.system).toBe("leak: [REDACTED]");
  });

  test("redacts text blocks inside structured system prompt", () => {
    const body: AnthropicRequest = {
      system: [
        { type: "text", text: "intro" },
        { type: "text", text: "leak: secret" },
      ],
    };
    const result = redactBody(body, [rule()]);
    expect((result.body.system as Array<{ text: string }>)[1].text).toBe(
      "leak: [REDACTED]"
    );
    // unchanged block stays
    expect((result.body.system as Array<{ text: string }>)[0].text).toBe("intro");
  });

  test("redacts string message content", () => {
    const body: AnthropicRequest = {
      messages: [{ role: "user", content: "my secret" }],
    };
    const result = redactBody(body, [rule()]);
    expect(
      (result.body.messages as Array<{ content: string }>)[0].content
    ).toBe("my [REDACTED]");
  });

  test("redacts text blocks inside structured message content", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "say secret" },
            { type: "image", source: { data: "secret-not-text" } },
          ],
        },
      ],
    };
    const result = redactBody(body, [rule()]);
    const blocks = (result.body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]
      .content;
    expect(blocks[0].text).toBe("say [REDACTED]");
    // image source data is NOT a text block — left untouched
    expect(blocks[1].source).toEqual({ data: "secret-not-text" });
  });

  test("redacts string tool_result content", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "secret leaked" },
          ],
        },
      ],
    };
    const result = redactBody(body, [rule()]);
    const blocks = (result.body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]
      .content;
    expect(blocks[0].content).toBe("[REDACTED] leaked");
  });

  test("redacts text blocks inside structured tool_result content", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [
                { type: "text", text: "secret here" },
                { type: "text", text: "no leak" },
              ],
            },
          ],
        },
      ],
    };
    const result = redactBody(body, [rule()]);
    const inner = (
      (result.body.messages as Array<{ content: Array<{ content: Array<{ text: string }> }> }>)[0]
        .content[0].content
    );
    expect(inner[0].text).toBe("[REDACTED] here");
    expect(inner[1].text).toBe("no leak");
  });

  test("does not touch model, role, or top-level identifiers", () => {
    const body: AnthropicRequest = {
      model: "claude-secret-3-5",
      messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
    };
    const result = redactBody(body, [rule()]);
    expect(result.body.model).toBe("claude-secret-3-5");
  });

  test("does not touch tool definitions or tool_use names/inputs", () => {
    const body: AnthropicRequest = {
      tools: [{ name: "secret_tool", description: "secret tool" }],
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "secret_tool",
              input: { path: "secret/path" },
            },
          ],
        },
      ],
    };
    const result = redactBody(body, [rule()]);
    // tool definitions untouched
    expect(result.body.tools).toEqual([
      { name: "secret_tool", description: "secret tool" },
    ]);
    // tool_use untouched (name + input)
    const block = (result.body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]
      .content[0];
    expect(block.name).toBe("secret_tool");
    expect(block.input).toEqual({ path: "secret/path" });
  });

  test("aggregates hit counts across the body", () => {
    const body: AnthropicRequest = {
      system: "secret one",
      messages: [
        { role: "user", content: "secret two" },
        {
          role: "user",
          content: [{ type: "text", text: "secret three" }],
        },
      ],
    };
    const result = redactBody(body, [rule()]);
    expect(result.hits).toEqual([{ ruleId: "r1", count: 3 }]);
  });

  test("zero matches returns empty hits and structurally-equivalent body", () => {
    const body: AnthropicRequest = {
      system: "nothing here",
      messages: [{ role: "user", content: "clean" }],
    };
    const result = redactBody(body, [rule()]);
    expect(result.hits).toEqual([]);
    expect(result.body).toEqual(body);
  });

  test("does not mutate input body", () => {
    const body: AnthropicRequest = {
      system: "secret one",
      messages: [{ role: "user", content: "secret two" }],
    };
    const snapshot = JSON.stringify(body);
    redactBody(body, [rule()]);
    expect(JSON.stringify(body)).toBe(snapshot);
  });
});

describe("loadRedactionRules / saveRedactionRules", () => {
  test("loadRedactionRules seeds builtins when file missing", () => {
    const loaded = loadRedactionRules();
    expect(loaded.length).toBe(builtinRedactionRules().length);
    expect(loaded.every((r) => r.builtin)).toBe(true);
    // file is now persisted
    expect(fs.existsSync(path.join(tempDir, "redaction-rules.json"))).toBe(true);
  });

  test("loadRedactionRules returns persisted rules verbatim", () => {
    const custom: RedactionRule[] = [rule({ id: "custom", builtin: false })];
    fs.writeFileSync(
      path.join(tempDir, "redaction-rules.json"),
      JSON.stringify(custom)
    );
    const loaded = loadRedactionRules();
    expect(loaded).toEqual(custom);
  });

  test("loadRedactionRules tolerates malformed JSON by re-seeding", () => {
    fs.writeFileSync(path.join(tempDir, "redaction-rules.json"), "{ not json");
    const loaded = loadRedactionRules();
    expect(loaded.length).toBe(builtinRedactionRules().length);
  });

  test("saveRedactionRules creates the config dir if needed", () => {
    const nested = path.join(tempDir, "nested-not-yet-created");
    process.env.MDDLMN_CONFIG_DIR = nested;
    saveRedactionRules([rule()]);
    expect(fs.existsSync(path.join(nested, "redaction-rules.json"))).toBe(true);
  });
});

describe("builtinRedactionRules", () => {
  test("matches sk-ant- API keys", () => {
    const rules = builtinRedactionRules();
    // Anthropic keys are long; require ≥16 chars after the prefix
    const fake = "sk-ant-api03-abcdefghijklmnop_qrstuv";
    const result = applyRedaction(`key=${fake}`, rules);
    expect(result.text).not.toContain(fake);
    expect(result.text).toContain("[REDACTED");
  });

  test("matches AWS access key IDs", () => {
    const rules = builtinRedactionRules();
    const result = applyRedaction("AKIAIOSFODNN7EXAMPLE", rules);
    expect(result.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  test("matches PEM private key blocks", () => {
    const rules = builtinRedactionRules();
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    const result = applyRedaction(pem, rules);
    expect(result.text).not.toContain("MIIE");
  });

  test("does not match plain prose containing the words", () => {
    const rules = builtinRedactionRules();
    // None of the builtins should fire on this innocuous text
    const result = applyRedaction("the AWS console requires a key id", rules);
    expect(result.text).toBe("the AWS console requires a key id");
  });

  test("all builtins are flagged builtin=true and enabled=true", () => {
    const rules = builtinRedactionRules();
    expect(rules.every((r) => r.builtin)).toBe(true);
    expect(rules.every((r) => r.enabled)).toBe(true);
  });
});
