import { type JxaRunner, runJxa } from "./jxa.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChromeSession {
  /** Chrome-internal window id. */
  id: number;
  /** Window title (usually the active tab's title). */
  name: string;
  /** "normal" or "incognito". */
  mode: "normal" | "incognito";
  /** Number of tabs in this window. */
  tabCount: number;
  /** Window position and size. */
  bounds: { x: number; y: number; width: number; height: number };
  /** 1-based index of the active tab within this window. */
  activeTabIndex: number;
}

export interface ChromeTab {
  /** Chrome-internal tab id (unique across all windows). */
  id: number;
  /** The window this tab belongs to. */
  windowId: number;
  /** 0-based position within its window. */
  index: number;
  title: string;
  url: string;
  loading: boolean;
  /** Whether this tab is the active tab in its window. */
  active: boolean;
}

export interface TabSource {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  /** Full outer HTML of the document element. */
  html: string;
}

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
      id: w.id(),
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
    const wId = w.id();
    const tabCount = w.tabs.length;
    const activeIdx = w.activeTabIndex();
    for (let j = 0; j < tabCount; j++) {
      const t = w.tabs[j];
      result.push({
        id: t.id(),
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

function tabsInSessionScript(windowId: number): string {
  return `(() => {
  const chrome = Application("Google Chrome");
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    if (w.id() === ${windowId}) {
      const tabs = [];
      const tabCount = w.tabs.length;
      const activeIdx = w.activeTabIndex();
      for (let j = 0; j < tabCount; j++) {
        const t = w.tabs[j];
        tabs.push({
          id: t.id(),
          windowId: ${windowId},
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

function sourceForTabScript(tabId: number): string {
  return `(() => {
  const chrome = Application("Google Chrome");
  const winCount = chrome.windows.length;
  for (let i = 0; i < winCount; i++) {
    const w = chrome.windows[i];
    const tabCount = w.tabs.length;
    for (let j = 0; j < tabCount; j++) {
      const t = w.tabs[j];
      if (t.id() === ${tabId}) {
        const html = t.execute({ javascript: "document.documentElement.outerHTML" });
        return JSON.stringify({
          tabId: ${tabId},
          windowId: w.id(),
          url: t.url(),
          title: t.title(),
          html: html
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
  windowId: number,
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
 * Returns the full HTML source of a tab identified by its Chrome-internal tab id.
 *
 * Requires "Allow JavaScript from Apple Events" to be enabled in Chrome
 * (View → Developer → Allow JavaScript from Apple Events).
 */
export async function getSourceForTab(tabId: number, run: JxaRunner = runJxa): Promise<TabSource> {
  const output = await run(sourceForTabScript(tabId));
  return JSON.parse(output);
}
