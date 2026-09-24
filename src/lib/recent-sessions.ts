const RECENT_KEY = "partagi-recent-sessions";
export const MAX_RECENT = 5;

export function loadRecent(storage: Storage = localStorage): string[] {
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((c): c is string => typeof c === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(
  code: string,
  storage: Storage = localStorage,
): string[] {
  const codeUpper = code.trim().toUpperCase();
  if (!codeUpper) return loadRecent(storage);
  const next = [
    codeUpper,
    ...loadRecent(storage).filter((c) => c !== codeUpper),
  ].slice(0, MAX_RECENT);
  storage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
