/**
 * logger.ts
 *
 * Writes raw request/response data to JSONL files (JSON Lines format).
 *
 * JSONL means one JSON object per line. It's the simplest possible
 * structured log format:
 * - Append-only (just add a line, never rewrite the file)
 * - Easy to parse (read line by line, JSON.parse each one)
 * - Easy to inspect (open in any text editor)
 * - No schema to manage
 * - No database to corrupt
 *
 * Each proxy session gets its own file. A "session" here just means
 * one run of the proxy — you start it, use Claude Code, stop it.
 * Later we might make sessions smarter (group by project, by
 * conversation, etc.) but for now one file per proxy run is fine.
 */

import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

export const LOG_DIR = path.resolve("logs");

// Generate a session ID when the proxy starts. This is just a timestamp
// for now — good enough to sort files chronologically and avoid collisions.
export const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
export const logFile = path.join(LOG_DIR, `session-${sessionId}.jsonl`);

let initialized = false;

async function ensureDir(): Promise<void> {
  if (!initialized) {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

export interface LogEntry {
  /** Unique ID for this request/response pair */
  requestId: string;

  /** When this event was logged */
  timestamp: string;

  /** "request" when Claude Code sends to us, "response" when Anthropic replies */
  type: "request" | "response";

  /** The API path, e.g. "/v1/messages" */
  path: string;

  /** The full payload. For requests this is the JSON body. For responses
   *  this is the reassembled response (after we've collected all SSE chunks). */
  payload: unknown;

  /** How long the request took (only present on response entries) */
  durationMs?: number;
}

/**
 * Append one log entry to the session file.
 *
 * This is intentionally fire-and-forget in the proxy handler — we don't
 * want logging failures to break the proxy. If the write fails, we log
 * to console and move on.
 */
export function getSessionInfo(): { id: string; logFile: string } {
  return { id: sessionId, logFile };
}

export async function log(entry: LogEntry): Promise<number | null> {
  try {
    await ensureDir();
    const offset = await stat(logFile)
      .then((stats) => stats.size)
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          return 0;
        }

        throw err;
      });
    const line = JSON.stringify(entry) + "\n";
    await appendFile(logFile, line, "utf-8");
    return offset;
  } catch (err) {
    console.error("[logger] Failed to write log entry:", err);
    return null;
  }
}
