import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Disk-backed cache that stores raw values as files, keyed by SHA-256 of the key.
 *
 * Uses file **mtime** as the `cachedAt` timestamp — no JSON wrapping overhead.
 */
export class DiskCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private dirReady: Promise<void> | null = null;

  constructor(cacheDir: string, ttlMs: number) {
    this.cacheDir = cacheDir;
    this.ttlMs = ttlMs;
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

  private ensureDir(): Promise<void> {
    if (!this.dirReady) {
      this.dirReady = mkdir(this.cacheDir, { recursive: true }).then(() => {});
    }
    return this.dirReady;
  }
}
