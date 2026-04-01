import { afterEach, describe, expect, test } from "bun:test";
import { TtlCache } from "../../src/lib/cache.js";

describe("TtlCache", () => {
  let cache: TtlCache<string>;

  afterEach(() => {
    cache?.clear();
  });

  test("get returns value that was set", () => {
    cache = new TtlCache<string>();
    cache.set("a", "hello");
    expect(cache.get("a")).toBe("hello");
  });

  test("get returns undefined for missing key", () => {
    cache = new TtlCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  test("has returns true for live entry", () => {
    cache = new TtlCache<string>();
    cache.set("a", "hello");
    expect(cache.has("a")).toBe(true);
  });

  test("has returns false for missing key", () => {
    cache = new TtlCache<string>();
    expect(cache.has("missing")).toBe(false);
  });

  test("expired entry returns undefined", async () => {
    cache = new TtlCache<string>(50);
    cache.set("a", "hello");
    await Bun.sleep(60);
    expect(cache.get("a")).toBeUndefined();
  });

  test("has returns false for expired entry", async () => {
    cache = new TtlCache<string>(50);
    cache.set("a", "hello");
    await Bun.sleep(60);
    expect(cache.has("a")).toBe(false);
  });

  test("size reflects stored entries", () => {
    cache = new TtlCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  test("clear removes all entries", () => {
    cache = new TtlCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  test("set overwrites existing entry and resets TTL", async () => {
    cache = new TtlCache<string>(80);
    cache.set("a", "old");
    await Bun.sleep(50);
    cache.set("a", "new");
    await Bun.sleep(50);
    // Original would have expired at 80ms, but re-set at 50ms resets the clock
    expect(cache.get("a")).toBe("new");
  });
});
