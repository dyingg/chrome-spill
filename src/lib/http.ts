import path from "node:path";
import type { TabSource } from "../browser/types.js";
import { TtlCache } from "./cache.js";
import { pMap } from "./concurrent.js";
import { resolveAppPaths } from "./config.js";
import { DiskCache } from "./disk-cache.js";
import type { Logger } from "./logger.js";

const DEFAULT_CONCURRENCY = 50;
const DEFAULT_TTL_MS = 1_200_000; // 20 minutes

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
        const response = await fetch(tab.url);
        const html = await response.text();
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

/** @internal Reset in-memory cache — for test isolation. */
export function resetHttpCache(): void {
  memoryCache.clear();
}
