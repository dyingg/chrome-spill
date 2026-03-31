import type { TabSource } from "../browser/types.js";
import { pMap } from "./concurrent.js";
import type { Logger } from "./logger.js";

const DEFAULT_CONCURRENCY = 15;

interface FetchSourcesOptions {
  concurrency?: number;
  logger?: Pick<Logger, "debug">;
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

      try {
        const response = await fetch(tab.url);
        const html = await response.text();
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
  );

  return results.filter((r): r is TabSource => r !== null);
}
