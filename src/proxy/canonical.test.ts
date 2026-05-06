import { describe, expect, test } from "vitest";
import { CanonicalConversation } from "./canonical.js";

type Msg = { role: string; content: unknown };

const userMsg = (text: string): Msg => ({ role: "user", content: text });
const asstMsg = (text: string): Msg => ({ role: "assistant", content: text });

describe("CanonicalConversation", () => {
  test("starts empty", () => {
    const c = new CanonicalConversation();
    expect(c.getMessages()).toEqual([]);
    expect(c.size()).toBe(0);
  });

  test("first ingest stores all messages and returns them", () => {
    const c = new CanonicalConversation();
    const incoming = [userMsg("hello")];
    const result = c.ingest(incoming);
    expect(result).toEqual(incoming);
    expect(c.getMessages()).toEqual(incoming);
  });

  test("subsequent ingest appends only the tail (new messages)", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("hello")]);
    const result = c.ingest([userMsg("hello"), asstMsg("hi"), userMsg("more")]);
    expect(result).toEqual([
      userMsg("hello"),
      asstMsg("hi"),
      userMsg("more"),
    ]);
    expect(c.size()).toBe(3);
  });

  test("ignores client-side replay; canonical is the source of truth for the prefix", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("hello"), asstMsg("hi")]);
    // Suppose the user excises the last assistant turn between calls.
    c.popLastTurn();
    expect(c.size()).toBe(1);

    // Claude Code replays everything (it doesn't know we excised).
    // The canonical prefix should be preserved; only the tail is appended.
    const result = c.ingest([
      userMsg("hello"),
      asstMsg("hi"),
      userMsg("next"),
    ]);
    expect(result).toEqual([userMsg("hello"), userMsg("next")]);
  });

  test("shorter incoming than canonical is treated as a new session and resets", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("a"), asstMsg("b"), userMsg("c")]);
    expect(c.size()).toBe(3);

    const result = c.ingest([userMsg("fresh start")]);
    expect(result).toEqual([userMsg("fresh start")]);
    expect(c.size()).toBe(1);
  });

  test("popLastTurn removes the trailing user message", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("a"), asstMsg("b"), userMsg("c")]);
    c.popLastTurn();
    expect(c.getMessages()).toEqual([userMsg("a"), asstMsg("b")]);
  });

  test("popLastTurn on empty canonical is a no-op", () => {
    const c = new CanonicalConversation();
    expect(() => c.popLastTurn()).not.toThrow();
    expect(c.getMessages()).toEqual([]);
  });

  test("reset() clears all state", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("a"), asstMsg("b")]);
    c.reset();
    expect(c.size()).toBe(0);
    // After reset, the next ingest should accept all messages as new
    const result = c.ingest([userMsg("x"), asstMsg("y")]);
    expect(result).toEqual([userMsg("x"), asstMsg("y")]);
  });

  test("noteSyntheticAppend skips messages on the next replay", () => {
    const c = new CanonicalConversation();
    // Conversation: user m1, assistant m2, user m3 (held).
    c.ingest([userMsg("m1"), asstMsg("m2"), userMsg("m3")]);
    // User cancels m3 — pop it from canonical, and tell canonical the client
    // will replay m3 plus a synthetic empty assistant we returned.
    c.popLastTurn();
    c.noteSyntheticAppend(1);
    // Next request: client sends m1, m2, m3, synthetic, m4.
    const result = c.ingest([
      userMsg("m1"),
      asstMsg("m2"),
      userMsg("m3"),
      asstMsg(""),
      userMsg("m4"),
    ]);
    expect(result).toEqual([userMsg("m1"), asstMsg("m2"), userMsg("m4")]);
  });

  test("ingest with no messages array returns empty without altering canonical", () => {
    const c = new CanonicalConversation();
    c.ingest([userMsg("a")]);
    const result = c.ingest([]);
    // No new messages, so canonical stays at 1 — but length 0 < 1 triggers reset per spec.
    // We want: empty incoming should reset (matches "client restarted with empty conversation").
    expect(result).toEqual([]);
    expect(c.size()).toBe(0);
  });
});
