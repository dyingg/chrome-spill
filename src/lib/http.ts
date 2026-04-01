import path from "node:path";
import type { TabSource } from "../browser/types.js";
import { TtlCache } from "./cache.js";
import { pMap } from "./concurrent.js";
import { resolveAppPaths } from "./config.js";
import { DiskCache } from "./disk-cache.js";
import type { Logger } from "./logger.js";

const DEFAULT_CONCURRENCY = 50;
const DEFAULT_TTL_MS = 1_200_000; // 20 minutes
const FETCH_TIMEOUT_MS = 15_000; // 15 seconds per request

/**
 * Request headers that mimic Chrome on macOS.
 * Prevents simple bot-detection that blocks non-browser User-Agents.
 * Does NOT spoof the TLS fingerprint (JA3/JA4) — Bun/Node use OpenSSL,
 * not BoringSSL. For advanced anti-bot, a native lib like wreq-js would
 * be needed.
 */
const CHROME_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const memoryCache = new TtlCache<string>(DEFAULT_TTL_MS);
const diskCache = new DiskCache(path.join(resolveAppPaths().cache, "html"), DEFAULT_TTL_MS);

interface FetchSourcesOptions {
  concurrency?: number;
  logger?: Pick<Logger, "debug">;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Fetch HTML for a list of tabs concurrently.
 *
 * - Non-http URLs (chrome://, about:, etc.) are skipped.
 * - Network errors are skipped (debug-logged when a logger is provided).
 * - Non-2xx responses are **included** — the response body is returned as html
 *   so the caller can inspect error pages or debug rate-limiting.
 */
export async function fetchSources(
  tabs: { url: string; tabId: string; windowId: string; title: string }[],
  options?: FetchSourcesOptions,
): Promise<TabSource[]> {
  // Fire-and-forget: clean up stale disk entries from previous runs.
  // Not awaited — must never block or slow the fetch pipeline.
  diskCache.sweep().catch(() => {});

  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const logger = options?.logger;

  const results = await pMap(
    tabs,
    async (tab): Promise<TabSource | null> => {
      if (!tab.url.startsWith("http")) {
        return null;
      }

      // L1: in-memory cache
      const memoryCached = memoryCache.get(tab.url);
      if (memoryCached !== undefined) {
        return {
          tabId: tab.tabId,
          windowId: tab.windowId,
          url: tab.url,
          title: tab.title,
          html: memoryCached,
        };
      }

      // L2: disk cache
      const diskCached = await diskCache.get(tab.url);
      if (diskCached !== undefined) {
        memoryCache.set(tab.url, diskCached);
        return {
          tabId: tab.tabId,
          windowId: tab.windowId,
          url: tab.url,
          title: tab.title,
          html: diskCached,
        };
      }

      // L3: network fetch
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(tab.url, {
          headers: CHROME_HEADERS,
          signal: controller.signal,
        });
        const html = await response.text();
        clearTimeout(timer);
        memoryCache.set(tab.url, html);
        diskCache.set(tab.url, html).catch(() => {});
        return {
          tabId: tab.tabId,
          windowId: tab.windowId,
          url: tab.url,
          title: tab.title,
          html,
        };
      } catch (error) {
        logger?.debug(`Fetch failed for ${tab.url}: ${error}`);
        return null;
      }
    },
    concurrency,
    options?.onProgress,
  );

  return results.filter((r): r is TabSource => r !== null);
}

/** @internal Reset both cache layers — for test isolation. */
export async function resetHttpCache(): Promise<void> {
  memoryCache.clear();
  await diskCache.clear();
}
