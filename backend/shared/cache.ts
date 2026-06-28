const store = new Map<string, { data: unknown; expiry: number }>();
const TTL_MS = 5_000;

let hits = 0;
let misses = 0;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) {
    misses++;
    return undefined;
  }
  if (Date.now() > entry.expiry) {
    store.delete(key);
    misses++;
    return undefined;
  }
  hits++;
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, expiry: Date.now() + TTL_MS });
}

export function cacheStats(): { size: number; hits: number; misses: number } {
  return { size: store.size, hits, misses };
}
