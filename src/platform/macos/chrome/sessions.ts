import type { ChromeSession, ChromeTab, TabSource } from "../../../browser/types.js";
import { fetchSources } from "../../../lib/http.js";
import { type JxaRunner, runJxa } from "./jxa.js";

// Types are defined in src/browser/types.ts and re-exported here for backward compatibility.
export type { ChromeSession, ChromeTab, TabSource };

// ---------------------------------------------------------------------------
// JXA script helpers
// ---------------------------------------------------------------------------

const GET_SESSIONS_SCRIPT = `(() => {
  const chrome = Application("Google Chrome");
  const result = [];
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    result.push({
      id: String(w.id()),
      name: w.name(),
      mode: w.mode(),
      tabCount: w.tabs.length,
      bounds: w.bounds(),
      activeTabIndex: w.activeTabIndex()
    });
  }
  return JSON.stringify(result);
})()`;

const GET_ALL_TABS_SCRIPT = `(() => {
  const chrome = Application("Google Chrome");
  const result = [];
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    const wId = String(w.id());
    const tabCount = w.tabs.length;
    const activeIdx = w.activeTabIndex();
    for (let j = 0; j < tabCount; j++) {
      const t = w.tabs[j];
      result.push({
        id: String(t.id()),
        windowId: wId,
        index: j,
        title: t.title(),
        url: t.url(),
        loading: t.loading(),
        active: (j + 1) === activeIdx
      });
    }
  }
  return JSON.stringify(result);
})()`;

function tabsInSessionScript(windowId: string): string {
  return `(() => {
  const chrome = Application("Google Chrome");
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    if (w.id() === "${windowId}") {
      const tabs = [];
      const tabCount = w.tabs.length;
      const activeIdx = w.activeTabIndex();
      for (let j = 0; j < tabCount; j++) {
        const t = w.tabs[j];
        tabs.push({
          id: String(t.id()),
          windowId: "${windowId}",
          index: j,
          title: t.title(),
          url: t.url(),
          loading: t.loading(),
          active: (j + 1) === activeIdx
        });
      }
      return JSON.stringify(tabs);
    }
  }
  throw new Error("Window not found: ${windowId}");
})()`;
}

function tabMetadataScript(tabId: string): string {
  return `(() => {
  const chrome = Application("Google Chrome");
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    const tabCount = w.tabs.length;
    for (let j = 0; j < tabCount; j++) {
      const t = w.tabs[j];
      if (t.id() === "${tabId}") {
        return JSON.stringify({
          tabId: String(t.id()),
          windowId: String(w.id()),
          url: t.url(),
          title: t.title()
        });
      }
    }
  }
  throw new Error("Tab not found: ${tabId}");
})()`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all open Chrome windows (sessions). */
export async function getSessions(run: JxaRunner = runJxa): Promise<ChromeSession[]> {
  const output = await run(GET_SESSIONS_SCRIPT);
  return JSON.parse(output);
}

/** Returns all tabs in a specific Chrome window. */
export async function getTabsInSession(
  windowId: string,
  run: JxaRunner = runJxa,
): Promise<ChromeTab[]> {
  const output = await run(tabsInSessionScript(windowId));
  return JSON.parse(output);
}

/** Returns every tab across all Chrome windows. */
export async function getAllTabs(run: JxaRunner = runJxa): Promise<ChromeTab[]> {
  const output = await run(GET_ALL_TABS_SCRIPT);
  return JSON.parse(output);
}

/**
 * Returns the HTML source of a tab identified by its Chrome-internal tab id.
 *
 * Fetches the tab's URL directly — no macOS file permissions or
 * "Allow JavaScript from Apple Events" needed.
 */
export async function getSourceForTab(tabId: string, run: JxaRunner = runJxa): Promise<TabSource> {
  const output = await run(tabMetadataScript(tabId));
  const meta: Omit<TabSource, "html"> = JSON.parse(output);
  const [source] = await fetchSources([meta]);

  if (!source) {
    throw new Error(`Failed to fetch source for tab ${tabId} (${meta.url})`);
  }

  return source;
}

/**
 * Returns the HTML source of every tab in a Chrome window.
 *
 * Makes a single JXA call to list tabs, then fetches all URLs concurrently
 * via the shared fetchSources pool (default concurrency 15).
 */
export async function getSourceForSession(
  windowId: string,
  run: JxaRunner = runJxa,
): Promise<TabSource[]> {
  const tabs = await getTabsInSession(windowId, run);
  return fetchSources(
    tabs.map((tab) => ({ tabId: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title })),
  );
}
