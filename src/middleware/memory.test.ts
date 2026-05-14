import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadMemory,
  saveMemory,
  selectApplicableEntries,
  memoryEntryToInjectionRule,
  lastUserMessageText,
  type MemoryEntry,
} from "./memory.js";
import type { AnthropicRequest } from "../classifier/index.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mddlmn-memory-"));
  process.env.MDDLMN_CONFIG_DIR = tempDir;
});

afterEach(() => {
  delete process.env.MDDLMN_CONFIG_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const entry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "m1",
  name: "Test entry",
  content: "remember this",
  scope: "always",
  target: "system_append",
  enabled: true,
  createdAt: "2026-05-13T00:00:00.000Z",
  ...overrides,
});

const NOW = new Date("2026-05-13T12:00:00.000Z");

describe("selectApplicableEntries — scope", () => {
  test("always-scoped entries are always selected", () => {
    const result = selectApplicableEntries([entry({ scope: "always" })], "", NOW);
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });

  test("session-scoped entries are always selected", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "session" })],
      "",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });

  test("conditional entry is selected when its regex matches the last user text", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "conditional", condition: "fastapi" })],
      "tell me about fastapi routing",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });

  test("conditional entry is skipped when its regex does not match", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "conditional", condition: "fastapi" })],
      "tell me about rust",
      NOW
    );
    expect(result).toEqual([]);
  });

  test("conditional entry with an invalid regex is skipped", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "conditional", condition: "[" })],
      "anything",
      NOW
    );
    expect(result).toEqual([]);
  });

  test("conditional entry with no condition string is skipped", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "conditional", condition: undefined })],
      "anything",
      NOW
    );
    expect(result).toEqual([]);
  });

  test("conditional matching is case-insensitive", () => {
    const result = selectApplicableEntries(
      [entry({ scope: "conditional", condition: "FastAPI" })],
      "what is fastapi",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });
});

describe("selectApplicableEntries — enabled + expiry", () => {
  test("disabled entries are skipped", () => {
    const result = selectApplicableEntries([entry({ enabled: false })], "", NOW);
    expect(result).toEqual([]);
  });

  test("entries past their expiresAt are skipped", () => {
    const result = selectApplicableEntries(
      [entry({ expiresAt: "2026-05-13T06:00:00.000Z" })],
      "",
      NOW
    );
    expect(result).toEqual([]);
  });

  test("entries with a future expiresAt are kept", () => {
    const result = selectApplicableEntries(
      [entry({ expiresAt: "2026-05-13T18:00:00.000Z" })],
      "",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });

  test("entries with no expiresAt never expire", () => {
    const result = selectApplicableEntries(
      [entry({ expiresAt: undefined })],
      "",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["m1"]);
  });
});

describe("selectApplicableEntries — ordering and multiples", () => {
  test("preserves input order of selected entries", () => {
    const result = selectApplicableEntries(
      [
        entry({ id: "a" }),
        entry({ id: "b", enabled: false }),
        entry({ id: "c" }),
      ],
      "",
      NOW
    );
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("memoryEntryToInjectionRule", () => {
  test("maps a memory entry to an injection rule shape", () => {
    const rule = memoryEntryToInjectionRule(
      entry({ id: "m9", name: "ctx", content: "hello", target: "user_append" })
    );
    expect(rule).toEqual({
      id: "m9",
      name: "ctx",
      content: "hello",
      target: "user_append",
      enabled: true,
      applyTo: "all",
    });
  });
});

describe("lastUserMessageText", () => {
  test("extracts text from a string-content user message", () => {
    const body: AnthropicRequest = {
      messages: [
        { role: "assistant", content: "hi" },
        { role: "user", content: "what is fastapi" },
      ],
    };
    expect(lastUserMessageText(body)).toBe("what is fastapi");
  });

  test("extracts and joins text blocks from an array-content user message", () => {
    const body: AnthropicRequest = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "first" },
            { type: "tool_result", tool_use_id: "t1", content: "ignored" },
            { type: "text", text: "second" },
          ],
        },
      ],
    };
    expect(lastUserMessageText(body)).toBe("first\nsecond");
  });

  test("returns the LAST user message when several exist", () => {
    const body: AnthropicRequest = {
      messages: [
        { role: "user", content: "older" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "newest" },
      ],
    };
    expect(lastUserMessageText(body)).toBe("newest");
  });

  test("returns empty string when there is no user message", () => {
    const body: AnthropicRequest = {
      messages: [{ role: "assistant", content: "only assistant" }],
    };
    expect(lastUserMessageText(body)).toBe("");
  });

  test("returns empty string when messages is missing", () => {
    expect(lastUserMessageText({})).toBe("");
  });
});

describe("loadMemory / saveMemory", () => {
  test("loadMemory returns empty array on first run", () => {
    expect(loadMemory()).toEqual([]);
  });

  test("loadMemory returns persisted entries", () => {
    const entries = [entry({ id: "x" })];
    fs.writeFileSync(
      path.join(tempDir, "memory.json"),
      JSON.stringify(entries)
    );
    expect(loadMemory()).toEqual(entries);
  });

  test("loadMemory returns empty array on malformed JSON", () => {
    fs.writeFileSync(path.join(tempDir, "memory.json"), "not json");
    expect(loadMemory()).toEqual([]);
  });

  test("saveMemory persists always- and conditional-scoped entries", () => {
    const entries = [
      entry({ id: "a", scope: "always" }),
      entry({ id: "c", scope: "conditional", condition: "x" }),
    ];
    saveMemory(entries);
    const raw = fs.readFileSync(path.join(tempDir, "memory.json"), "utf-8");
    expect(JSON.parse(raw).map((e: MemoryEntry) => e.id)).toEqual(["a", "c"]);
  });

  test("saveMemory excludes session-scoped entries from disk", () => {
    const entries = [
      entry({ id: "a", scope: "always" }),
      entry({ id: "s", scope: "session" }),
    ];
    saveMemory(entries);
    const raw = fs.readFileSync(path.join(tempDir, "memory.json"), "utf-8");
    expect(JSON.parse(raw).map((e: MemoryEntry) => e.id)).toEqual(["a"]);
  });

  test("saveMemory creates the config dir if missing", () => {
    const nested = path.join(tempDir, "not-created-yet");
    process.env.MDDLMN_CONFIG_DIR = nested;
    saveMemory([entry()]);
    expect(fs.existsSync(path.join(nested, "memory.json"))).toBe(true);
  });
});
