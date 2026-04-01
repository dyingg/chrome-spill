/** Default TTL: 20 minutes. */
const DEFAULT_TTL_MS = 1_200_000;

/** Default sweep interval: 60 seconds. */
const DEFAULT_SWEEP_MS = 60_000;

interface CacheEntry<V> {
  value: V;
  cachedAt: number;
}

/**
 * In-memory key→value store with time-based expiration.
 *
 * - Entries are lazily evicted on access.
 * - A background sweep runs every `sweepMs` to purge expired entries
 *   that are never re-accessed. The timer is `unref()`'d so it does
 *   not prevent CLI processes from exiting.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  readonly ttlMs: number;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(ttlMs = DEFAULT_TTL_MS, sweepMs = DEFAULT_SWEEP_MS) {
    this.ttlMs = ttlMs;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      this.sweepTimer.unref();
    } else {
      this.sweepTimer = null;
    }
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

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.store.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.cachedAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}
