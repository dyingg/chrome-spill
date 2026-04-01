import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetHttpCache } from "../../src/lib/http.js";
import type { JxaRunner } from "../../src/platform/macos/chrome/jxa.js";
import {
  getAllTabs,
  getSessions,
  getSourceForSession,
  getSourceForTab,
  getTabsInSession,
} from "../../src/platform/macos/chrome/sessions.js";

// ---------------------------------------------------------------------------
// Helpers — mock JxaRunners that return canned JSON
// ---------------------------------------------------------------------------

function mockRunner(payload: unknown): JxaRunner {
  return async () => JSON.stringify(payload);
}

function failingRunner(message: string): JxaRunner {
  return async () => {
    throw new Error(message);
  };
}

// ---------------------------------------------------------------------------
// getSessions
// ---------------------------------------------------------------------------

describe("getSessions", () => {
  test("parses a multi-window response", async () => {
    const sessions = await getSessions(
      mockRunner([
        {
          id: "100",
          name: "GitHub - Google Chrome",
          mode: "normal",
          tabCount: 3,
          bounds: { x: 0, y: 0, width: 1440, height: 900 },
          activeTabIndex: 1,
        },
        {
          id: "200",
          name: "Private - Google Chrome",
          mode: "incognito",
          tabCount: 1,
          bounds: { x: 100, y: 100, width: 800, height: 600 },
          activeTabIndex: 1,
        },
      ]),
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("100");
    expect(sessions[0].mode).toBe("normal");
    expect(sessions[0].tabCount).toBe(3);
    expect(sessions[1].mode).toBe("incognito");
  });

  test("returns empty array when no windows are open", async () => {
    const sessions = await getSessions(mockRunner([]));
    expect(sessions).toEqual([]);
  });

  test("propagates runner errors (e.g. Chrome not running)", async () => {
    await expect(getSessions(failingRunner("application is not running"))).rejects.toThrow(
      "application is not running",
    );
  });
});

// ---------------------------------------------------------------------------
// getTabsInSession
// ---------------------------------------------------------------------------

describe("getTabsInSession", () => {
  test("parses tabs for a window", async () => {
    const tabs = await getTabsInSession(
      "100",
      mockRunner([
        {
          id: "10",
          windowId: "100",
          index: 0,
          title: "Google",
          url: "https://google.com",
          loading: false,
          active: true,
        },
        {
          id: "11",
          windowId: "100",
          index: 1,
          title: "GitHub",
          url: "https://github.com",
          loading: false,
          active: false,
        },
      ]),
    );

    expect(tabs).toHaveLength(2);
    expect(tabs[0].active).toBe(true);
    expect(tabs[1].url).toBe("https://github.com");
  });

  test("propagates error when window is not found", async () => {
    await expect(getTabsInSession("999", failingRunner("Window not found: 999"))).rejects.toThrow(
      "Window not found: 999",
    );
  });
});

// ---------------------------------------------------------------------------
// getAllTabs
// ---------------------------------------------------------------------------

describe("getAllTabs", () => {
  test("returns tabs across multiple windows", async () => {
    const tabs = await getAllTabs(
      mockRunner([
        {
          id: "1",
          windowId: "100",
          index: 0,
          title: "A",
          url: "https://a.com",
          loading: false,
          active: true,
        },
        {
          id: "2",
          windowId: "100",
          index: 1,
          title: "B",
          url: "https://b.com",
          loading: true,
          active: false,
        },
        {
          id: "3",
          windowId: "200",
          index: 0,
          title: "C",
          url: "https://c.com",
          loading: false,
          active: true,
        },
      ]),
    );

    expect(tabs).toHaveLength(3);
    expect(tabs[1].loading).toBe(true);
    expect(tabs[2].windowId).toBe("200");
  });

  test("returns empty array when Chrome has no tabs", async () => {
    const tabs = await getAllTabs(mockRunner([]));
    expect(tabs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSourceForTab
// ---------------------------------------------------------------------------

describe("getSourceForTab", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await resetHttpCache();
    globalThis.fetch = mock(
      async () => new Response("<html><body><h1>Example</h1></body></html>", { status: 200 }),
    ) as unknown as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await resetHttpCache();
  });

  test("returns HTML source for a tab", async () => {
    const source = await getSourceForTab(
      "10",
      mockRunner({
        tabId: "10",
        windowId: "100",
        url: "https://example.com",
        title: "Example Domain",
      }),
    );

    expect(source.tabId).toBe("10");
    expect(source.url).toBe("https://example.com");
    expect(source.html).toContain("<h1>Example</h1>");
  });

  test("propagates error when tab is not found", async () => {
    await expect(getSourceForTab("999", failingRunner("Tab not found: 999"))).rejects.toThrow(
      "Tab not found: 999",
    );
  });
});

// ---------------------------------------------------------------------------
// getSourceForSession
// ---------------------------------------------------------------------------

describe("getSourceForSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await resetHttpCache();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await resetHttpCache();
  });

  const fakeTabs = [
    {
      id: "1",
      windowId: "100",
      index: 0,
      title: "A",
      url: "https://a.com",
      loading: false,
      active: true,
    },
    {
      id: "2",
      windowId: "100",
      index: 1,
      title: "B",
      url: "https://b.com",
      loading: false,
      active: false,
    },
    {
      id: "3",
      windowId: "100",
      index: 2,
      title: "C",
      url: "https://c.com",
      loading: false,
      active: false,
    },
    {
      id: "4",
      windowId: "100",
      index: 3,
      title: "D",
      url: "https://d.com",
      loading: false,
      active: false,
    },
    {
      id: "5",
      windowId: "100",
      index: 4,
      title: "E",
      url: "https://e.com",
      loading: false,
      active: false,
    },
  ];

  test("fetches source for all tabs in a session", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      return new Response(`<html>${url}</html>`, { status: 200 });
    }) as unknown as typeof fetch;

    const sources = await getSourceForSession("100", mockRunner(fakeTabs));

    expect(sources).toHaveLength(5);
    expect(sources[0].tabId).toBe("1");
    expect(sources[0].url).toBe("https://a.com");
    expect(sources[0].html).toContain("https://a.com");
    expect(sources[4].tabId).toBe("5");
    expect(sources[4].title).toBe("E");
  });

  test("fetches all tabs regardless of count", async () => {
    globalThis.fetch = mock(
      async () => new Response("<html></html>", { status: 200 }),
    ) as unknown as typeof fetch;

    const sources = await getSourceForSession("100", mockRunner(fakeTabs));

    expect(sources).toHaveLength(5);
    expect(sources.map((s) => s.tabId)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("returns empty array for a session with no tabs", async () => {
    globalThis.fetch = mock(
      async () => new Response("", { status: 200 }),
    ) as unknown as typeof fetch;

    const sources = await getSourceForSession("100", mockRunner([]));
    expect(sources).toEqual([]);
  });

  test("includes non-2xx responses instead of throwing", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response("Server Error", { status: 500, statusText: "Internal Server Error" }),
    ) as unknown as typeof fetch;

    const sources = await getSourceForSession("100", mockRunner(fakeTabs));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].html).toBe("Server Error");
  });

  test("propagates JXA errors (window not found)", async () => {
    await expect(
      getSourceForSession("999", failingRunner("Window not found: 999")),
    ).rejects.toThrow("Window not found: 999");
  });
});
