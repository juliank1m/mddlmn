export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const clampedTo = Math.max(0, Math.min(items.length - 1, to));
  if (from === clampedTo) return items.slice();

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}
