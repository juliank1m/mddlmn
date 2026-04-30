import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.resolve("logs");
const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(LOG_DIR, `session-${sessionId}.jsonl`);

let initialized = false;

async function ensureDir(): Promise<void> {
  if (!initialized) {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

export interface LogEntry {
  requestId: string;
  timestamp: string;
  type: "request" | "response";
  path: string;
  payload: unknown;
  durationMs?: number;
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    await ensureDir();
    const line = JSON.stringify(entry) + "\n";
    await appendFile(logFile, line, "utf-8");
  } catch (err) {
    console.error("[logger] Failed to write log entry:", err);
  }
}
