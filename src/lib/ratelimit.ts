// In-memory sliding-window limiter. Good for a single server / local dev. On serverless hosting each
// instance has its own memory, so swap the Map for a shared store (e.g. Upstash Redis) before relying on it.

type Entry = { hits: number[] };
const store = new Map<string, Entry>();

function prune(e: Entry, windowMs: number, now: number) {
  e.hits = e.hits.filter((t) => now - t < windowMs);
}

/** True when `key` has already used up `max` attempts inside the window. Does not record a hit. */
export function isLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const e = store.get(key);
  if (!e) return false;
  prune(e, windowMs, now);
  return e.hits.length >= max;
}

export function recordHit(key: string, windowMs: number, now = Date.now()) {
  const e = store.get(key) ?? { hits: [] };
  prune(e, windowMs, now);
  e.hits.push(now);
  store.set(key, e);
  if (store.size > 10_000) for (const [k, v] of store) if (!v.hits.length) store.delete(k); // bound memory
}

export function reset(key: string) {
  store.delete(key);
}

export const LOGIN_MAX = 5;
export const LOGIN_WINDOW = 15 * 60_000;
