import { loadMemory, saveMemory, type MemoryEntry } from "./memory.js";

/**
 * In-RAM source of truth for memory entries.
 *
 * Loaded from `~/.mddlmn/memory.json` on first access. `setMemoryEntries`
 * updates the RAM list AND persists via `saveMemory` — which deliberately
 * drops `session`-scoped entries, so those live only here and vanish on
 * proxy restart.
 */
let entries: MemoryEntry[] | null = null;

export function getMemoryEntries(): MemoryEntry[] {
  if (entries === null) {
    entries = loadMemory();
  }
  return entries;
}

export function setMemoryEntries(next: MemoryEntry[]): void {
  entries = next;
  saveMemory(next);
}
