export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 5000;
export const BACKOFF_FACTOR = 1.5;

export function nextBackoffDelay(
  previousMs: number,
  maxMs: number = BACKOFF_MAX_MS,
  factor: number = BACKOFF_FACTOR,
): number {
  return Math.min(Math.round(previousMs * factor), maxMs);
}
