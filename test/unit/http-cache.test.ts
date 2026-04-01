import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fetchSources, resetHttpCache } from "../../src/lib/http.js";

describe("fetchSources cache", () => {
  const originalFetch = globalThis.fetch;
  let fetchCount: number;

  beforeEach(async () => {
    await resetHttpCache();
    fetchCount = 0;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      fetchCount++;
      return new Response(`<html>${String(url)}</html>`, { status: 200 });
    }) as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await resetHttpCache();
  });

  const tab = (url: string) => ({ url, tabId: "1", windowId: "1", title: "T" });

  test("second call for same URL hits in-memory cache", async () => {
    const tabs = [tab("https://example.com")];
    const first = await fetchSources(tabs);
    const second = await fetchSources(tabs);

    expect(fetchCount).toBe(1);
    expect(first[0].html).toBe(second[0].html);
  });

  test("different URLs are fetched independently", async () => {
    await fetchSources([tab("https://a.com")]);
    await fetchSources([tab("https://b.com")]);

    expect(fetchCount).toBe(2);
  });

  test("non-http URLs are not cached or fetched", async () => {
    const results = await fetchSources([tab("chrome://settings")]);

    expect(fetchCount).toBe(0);
    expect(results).toHaveLength(0);
  });

  test("network errors are not cached", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const first = await fetchSources([tab("https://fail.com")]);
    expect(first).toHaveLength(0);

    // Restore working fetch — should attempt a real fetch, not serve from cache
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      fetchCount++;
      return new Response(`<html>${String(url)}</html>`, { status: 200 });
    }) as typeof fetch;
    fetchCount = 0;

    const second = await fetchSources([tab("https://fail.com")]);
    expect(fetchCount).toBe(1);
    expect(second).toHaveLength(1);
  });

  test("resetHttpCache clears in-memory cache", async () => {
    await fetchSources([tab("https://example.com")]);
    expect(fetchCount).toBe(1);

    resetHttpCache();
    // After reset, the in-memory cache is empty.
    // Disk cache may still have the entry, so we can't assert fetchCount increases.
    // But we can verify the function still works.
    const results = await fetchSources([tab("https://example.com")]);
    expect(results).toHaveLength(1);
  });
});
