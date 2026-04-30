import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Section } from "../classifier/index.js";
import { getSessionInfo } from "./logger.js";

const DATA_DIR = path.resolve("data");
const DB_FILE = path.join(DATA_DIR, "mddlmn.sqlite");

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    agent_type TEXT,
    log_file TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp TEXT NOT NULL,
    path TEXT NOT NULL,
    model TEXT,
    total_tokens INTEGER,
    total_cost REAL,
    is_main_conversation BOOLEAN,
    is_top_level BOOLEAN,
    last_user_preview TEXT,
    duration_ms INTEGER,
    raw_log_offset INTEGER
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    label TEXT,
    token_count INTEGER,
    content_hash TEXT,
    content TEXT
  );
`);

const session = getSessionInfo();

db.prepare(
  `
    INSERT OR IGNORE INTO sessions (id, started_at, agent_type, log_file)
    VALUES (@id, @startedAt, @agentType, @logFile)
  `
).run({
  id: session.id,
  startedAt: new Date().toISOString(),
  agentType: "claude_code",
  logFile: session.logFile,
});

export type RequestRecordInput = {
  id: string;
  timestamp: string;
  path: string;
  model: string | null;
  totalTokens: number | null;
  totalCost?: number | null;
  isMainConversation: boolean;
  isTopLevel: boolean;
  lastUserPreview: string | null;
  durationMs?: number | null;
  rawLogOffset: number | null;
};

const upsertRequestStmt = db.prepare(`
  INSERT INTO requests (
    id,
    session_id,
    timestamp,
    path,
    model,
    total_tokens,
    total_cost,
    is_main_conversation,
    is_top_level,
    last_user_preview,
    duration_ms,
    raw_log_offset
  )
  VALUES (
    @id,
    @sessionId,
    @timestamp,
    @path,
    @model,
    @totalTokens,
    @totalCost,
    @isMainConversation,
    @isTopLevel,
    @lastUserPreview,
    @durationMs,
    @rawLogOffset
  )
  ON CONFLICT(id) DO UPDATE SET
    model = excluded.model,
    total_tokens = excluded.total_tokens,
    total_cost = excluded.total_cost,
    is_main_conversation = excluded.is_main_conversation,
    is_top_level = excluded.is_top_level,
    last_user_preview = excluded.last_user_preview,
    duration_ms = COALESCE(excluded.duration_ms, requests.duration_ms),
    raw_log_offset = COALESCE(excluded.raw_log_offset, requests.raw_log_offset)
`);

const deleteSectionsStmt = db.prepare("DELETE FROM sections WHERE request_id = ?");
const insertSectionStmt = db.prepare(`
  INSERT INTO sections (
    id,
    request_id,
    type,
    label,
    token_count,
    content_hash,
    content
  )
  VALUES (
    @id,
    @requestId,
    @type,
    @label,
    @tokenCount,
    @contentHash,
    @content
  )
`);

const updateDurationStmt = db.prepare(`
  UPDATE requests
  SET duration_ms = @durationMs
  WHERE id = @id
`);

const replaceSectionsTx = db.transaction((requestId: string, sections: Section[]) => {
  deleteSectionsStmt.run(requestId);

  for (const section of sections) {
    insertSectionStmt.run({
      id: section.id,
      requestId,
      type: section.type,
      label: section.label,
      tokenCount: section.tokenCount,
      contentHash: section.contentHash,
      content: section.content,
    });
  }
});

export function upsertRequest(input: RequestRecordInput): void {
  upsertRequestStmt.run({
    ...input,
    sessionId: session.id,
    totalCost: input.totalCost ?? null,
    durationMs: input.durationMs ?? null,
    isMainConversation: input.isMainConversation ? 1 : 0,
    isTopLevel: input.isTopLevel ? 1 : 0,
  });
}

export function replaceRequestSections(requestId: string, sections: Section[]): void {
  replaceSectionsTx(requestId, sections);
}

export function updateRequestDuration(requestId: string, durationMs: number): void {
  updateDurationStmt.run({ id: requestId, durationMs });
}

export function getCurrentSessionId(): string {
  return session.id;
}
