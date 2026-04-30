export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return n.toString();
  if (n < 10_000) return (n / 1000).toFixed(2) + "k";
  if (n < 100_000) return (n / 1000).toFixed(1) + "k";
  if (n < 1_000_000) return Math.round(n / 1000) + "k";
  return (n / 1_000_000).toFixed(2) + "M";
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "————";
  return hash.slice(0, 7);
}

export function relativeTimestamp(start: string, current: string): string {
  const ms = new Date(current).getTime() - new Date(start).getTime();
  if (ms < 0) return "+00.000";
  const seconds = ms / 1000;
  if (seconds < 60) return `+${seconds.toFixed(3)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = (seconds % 60).toFixed(2);
  return `+${minutes}m ${rem}s`;
}
