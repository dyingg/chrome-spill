/** Default TTL: 20 minutes. */
const DEFAULT_TTL_MS = 1_200_000;

interface CacheEntry<V> {
  value: V;
  cachedAt: number;
}

/**
 * In-memory key→value store with time-based expiration.
 *
 * Entries are lazily evicted on access — no timers or background threads.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, cachedAt: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
