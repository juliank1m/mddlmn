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

export type SessionRecord = {
  id: string;
  startedAt: string;
  agentType: string | null;
  logFile: string | null;
  requestCount: number;
  totalTokens: number | null;
};

export type RequestRecord = {
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
};

export type SectionRecord = {
  id: string;
  requestId: string;
  type: string;
  label: string | null;
  tokenCount: number | null;
  contentHash: string | null;
  content: string | null;
};

export type TokenStatsPoint = {
  requestId: string;
  timestamp: string;
  totalTokens: number | null;
  sectionTokens: Array<{
    type: string;
    tokenCount: number;
  }>;
};

type SessionRow = {
  id: string;
  started_at: string;
  agent_type: string | null;
  log_file: string | null;
  request_count: number;
  total_tokens: number | null;
};

type RequestRow = {
  id: string;
  session_id: string;
  timestamp: string;
  path: string;
  model: string | null;
  total_tokens: number | null;
  total_cost: number | null;
  is_main_conversation: 0 | 1;
  is_top_level: 0 | 1;
  last_user_preview: string | null;
  duration_ms: number | null;
  raw_log_offset: number | null;
};

type SectionRow = {
  id: string;
  request_id: string;
  type: string;
  label: string | null;
  token_count: number | null;
  content_hash: string | null;
  content: string | null;
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

const listSessionsStmt = db.prepare(`
  SELECT
    sessions.id,
    sessions.started_at,
    sessions.agent_type,
    sessions.log_file,
    COUNT(requests.id) AS request_count,
    SUM(requests.total_tokens) AS total_tokens
  FROM sessions
  LEFT JOIN requests ON requests.session_id = sessions.id
  GROUP BY sessions.id
  ORDER BY sessions.started_at DESC
`);

const getSessionStmt = db.prepare(`
  SELECT
    sessions.id,
    sessions.started_at,
    sessions.agent_type,
    sessions.log_file,
    COUNT(requests.id) AS request_count,
    SUM(requests.total_tokens) AS total_tokens
  FROM sessions
  LEFT JOIN requests ON requests.session_id = sessions.id
  WHERE sessions.id = ?
  GROUP BY sessions.id
`);

const listRequestsForSessionStmt = db.prepare(`
  SELECT *
  FROM requests
  WHERE session_id = ?
  ORDER BY timestamp ASC
`);

const getRequestStmt = db.prepare(`
  SELECT *
  FROM requests
  WHERE id = ?
`);

const listSectionsForRequestStmt = db.prepare(`
  SELECT *
  FROM sections
  WHERE request_id = ?
  ORDER BY rowid ASC
`);

const tokenStatsStmt = db.prepare(`
  SELECT
    requests.id AS request_id,
    requests.timestamp,
    requests.total_tokens,
    sections.type,
    COALESCE(SUM(sections.token_count), 0) AS token_count
  FROM requests
  LEFT JOIN sections ON sections.request_id = requests.id
  WHERE requests.session_id = ?
  GROUP BY requests.id, sections.type
  ORDER BY requests.timestamp ASC
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

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    startedAt: row.started_at,
    agentType: row.agent_type,
    logFile: row.log_file,
    requestCount: row.request_count,
    totalTokens: row.total_tokens,
  };
}

function requestFromRow(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    path: row.path,
    model: row.model,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    isMainConversation: row.is_main_conversation === 1,
    isTopLevel: row.is_top_level === 1,
    lastUserPreview: row.last_user_preview,
    durationMs: row.duration_ms,
    rawLogOffset: row.raw_log_offset,
  };
}

function sectionFromRow(row: SectionRow): SectionRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    type: row.type,
    label: row.label,
    tokenCount: row.token_count,
    contentHash: row.content_hash,
    content: row.content,
  };
}

export function listSessions(): SessionRecord[] {
  return (listSessionsStmt.all() as SessionRow[]).map(sessionFromRow);
}

export function getSession(id: string): SessionRecord | null {
  const row = getSessionStmt.get(id) as SessionRow | undefined;
  return row ? sessionFromRow(row) : null;
}

export function listRequestsForSession(sessionId: string): RequestRecord[] {
  return (listRequestsForSessionStmt.all(sessionId) as RequestRow[]).map(requestFromRow);
}

export function getRequest(id: string): RequestRecord | null {
  const row = getRequestStmt.get(id) as RequestRow | undefined;
  return row ? requestFromRow(row) : null;
}

export function listSectionsForRequest(requestId: string): SectionRecord[] {
  return (listSectionsForRequestStmt.all(requestId) as SectionRow[]).map(sectionFromRow);
}

export function getTokenStats(sessionId: string): TokenStatsPoint[] {
  const rows = tokenStatsStmt.all(sessionId) as Array<{
    request_id: string;
    timestamp: string;
    total_tokens: number | null;
    type: string | null;
    token_count: number;
  }>;
  const points = new Map<string, TokenStatsPoint>();

  for (const row of rows) {
    let point = points.get(row.request_id);
    if (!point) {
      point = {
        requestId: row.request_id,
        timestamp: row.timestamp,
        totalTokens: row.total_tokens,
        sectionTokens: [],
      };
      points.set(row.request_id, point);
    }

    if (row.type !== null) {
      point.sectionTokens.push({
        type: row.type,
        tokenCount: row.token_count,
      });
    }
  }

  return Array.from(points.values());
}
