import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Default sweep interval: 5 minutes. */
const DEFAULT_SWEEP_MS = 300_000;

/**
 * Disk-backed cache that stores raw values as files, keyed by SHA-256 of the key.
 *
 * Uses file **mtime** as the `cachedAt` timestamp — no JSON wrapping overhead.
 * A background sweep runs periodically to delete expired files that are never
 * re-accessed. The timer is `unref()`'d so it does not block CLI exit.
 */
export class DiskCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private dirReady: Promise<void> | null = null;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(cacheDir: string, ttlMs: number, sweepMs = DEFAULT_SWEEP_MS) {
    this.cacheDir = cacheDir;
    this.ttlMs = ttlMs;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      this.sweepTimer.unref();
    } else {
      this.sweepTimer = null;
    }
  }

  async get(key: string): Promise<string | undefined> {
    const filePath = this.pathFor(key);
    try {
      const info = await stat(filePath);
      if (Date.now() - info.mtimeMs > this.ttlMs) {
        rm(filePath, { force: true }).catch(() => {});
        return undefined;
      }
      return await readFile(filePath, "utf8");
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureDir();
    const filePath = this.pathFor(key);
    await writeFile(filePath, value, "utf8");
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(files.map((f) => rm(path.join(this.cacheDir, f), { force: true })));
    } catch {
      // Directory may not exist yet — nothing to clear.
    }
  }

  private pathFor(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex").substring(0, 32);
    return path.join(this.cacheDir, hash);
  }

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private ensureDir(): Promise<void> {
    if (!this.dirReady) {
      this.dirReady = mkdir(this.cacheDir, { recursive: true }).then(() => {});
    }
    return this.dirReady;
  }

  private async sweep(): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.cacheDir);
    } catch {
      return; // Directory doesn't exist yet — nothing to sweep.
    }
    const now = Date.now();
    await Promise.all(
      files.map(async (f) => {
        const filePath = path.join(this.cacheDir, f);
        try {
          const info = await stat(filePath);
          if (now - info.mtimeMs > this.ttlMs) {
            await rm(filePath, { force: true });
          }
        } catch {
          // File may have been removed concurrently — ignore.
        }
      }),
    );
  }
}
