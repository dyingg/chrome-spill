import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DiskCache } from "../../src/lib/disk-cache.js";

describe("DiskCache", () => {
  let tmpDir: string;
  let cache: DiskCache;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  async function makeCache(ttlMs = 1_200_000): Promise<DiskCache> {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "dc-test-"));
    cache = new DiskCache(tmpDir, ttlMs);
    return cache;
  }

  test("get returns value that was set", async () => {
    await makeCache();
    await cache.set("https://a.com", "<html>A</html>");
    expect(await cache.get("https://a.com")).toBe("<html>A</html>");
  });

  test("get returns undefined for missing key", async () => {
    await makeCache();
    expect(await cache.get("https://missing.com")).toBeUndefined();
  });

  test("expired entry returns undefined", async () => {
    await makeCache(200);
    await cache.set("https://a.com", "content");

    // Backdate mtime to simulate expiration
    const files = await readdir(tmpDir);
    const filePath = path.join(tmpDir, files[0]);
    const past = new Date(Date.now() - 300);
    await utimes(filePath, past, past);

    expect(await cache.get("https://a.com")).toBeUndefined();
  });

  test("creates directory if missing", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "dc-test-"));
    const nested = path.join(tmpDir, "sub", "dir");
    cache = new DiskCache(nested, 1_200_000);
    await cache.set("https://a.com", "hello");

    const info = await stat(nested);
    expect(info.isDirectory()).toBe(true);
    expect(await cache.get("https://a.com")).toBe("hello");
  });

  test("clear removes all cached files", async () => {
    await makeCache();
    await cache.set("https://a.com", "A");
    await cache.set("https://b.com", "B");
    await cache.clear();

    expect(await cache.get("https://a.com")).toBeUndefined();
    expect(await cache.get("https://b.com")).toBeUndefined();
    expect(await readdir(tmpDir)).toHaveLength(0);
  });

  test("different URLs produce different entries", async () => {
    await makeCache();
    await cache.set("https://a.com", "A");
    await cache.set("https://b.com", "B");

    expect(await cache.get("https://a.com")).toBe("A");
    expect(await cache.get("https://b.com")).toBe("B");
  });
});
