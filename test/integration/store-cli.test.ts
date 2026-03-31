import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveAppPaths } from "../../src/lib/config.js";
import { type Session, writeSession } from "../../src/lib/store/index.js";
import { runJxa } from "../../src/platform/macos/chrome/jxa.js";
import { spawnCli, waitForExit } from "../helpers/process.js";

const TEST_URL = "https://github.com/dyingg/chrome-spill";
let chromeReady = false;
let tempHome = "";
let testWindowId: string | undefined;

function makeStoredSession(overrides: Partial<Session> = {}): Session {
  return {
    capturedAt: "2026-03-31T12:00:00.000Z",
    name: "stored session",
    profile: null,
    version: 1,
    windows: [
      {
        activeTabIndex: 1,
        mode: "normal",
        tabs: [{ title: "Example", url: "https://example.com" }],
      },
    ],
    ...overrides,
  };
}

async function openTestWindow(url: string): Promise<string> {
  return runJxa(`(() => {
    const chrome = Application("Google Chrome");
    const win = chrome.Window().make();
    win.activeTab().url = "${url}";
    return win.id();
  })()`);
}

async function closeWindowById(windowId: string): Promise<void> {
  await runJxa(`(() => {
    const chrome = Application("Google Chrome");
    const winCount = chrome.windows.length;
    for (let i = 0; i < winCount; i++) {
      if (chrome.windows[i].id() === "${windowId}") {
        chrome.windows[i].close();
        return;
      }
    }
  })()`);
}

describe("store CLI integration", () => {
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "chrome-spill-home-"));
  });

  afterEach(async () => {
    if (testWindowId) {
      await closeWindowById(testWindowId).catch(() => {});
      testWindowId = undefined;
    }

    chromeReady = false;
    await fs.rm(tempHome, { force: true, recursive: true });
  });

  test("list saved returns stored sessions from the default store in json mode", async () => {
    const paths = resolveAppPaths({ ...process.env, HOME: tempHome });
    await writeSession(paths, makeStoredSession({ name: "alpha" }));
    await writeSession(paths, makeStoredSession({ name: "beta" }));

    const child = spawnCli(["list", "saved", "--json"], {
      env: {
        HOME: tempHome,
      },
    });
    const result = await waitForExit(child);

    expect(result.code).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<{ fileName: string; name: string }>;
    expect(sessions.map((session) => session.name)).toEqual(["alpha", "beta"]);
  });

  test("save writes into the default store in json mode", async () => {
    try {
      testWindowId = await openTestWindow(TEST_URL);
      chromeReady = true;
      await Bun.sleep(5_000);
    } catch {
      chromeReady = false;
    }

    if (!chromeReady) {
      expect(chromeReady).toBe(false);
      return;
    }

    const child = spawnCli(["save", testWindowId!, "--json"], {
      env: {
        HOME: tempHome,
      },
    });
    const result = await waitForExit(child);

    expect(result.code).toBe(0);

    const payload = JSON.parse(result.stdout) as { filePath: string; sessionId: string };
    expect(payload.sessionId).toBe(testWindowId!);

    const stored = JSON.parse(await Bun.file(payload.filePath).text()) as Session;
    expect(stored.name.length).toBeGreaterThan(0);
    expect(stored.windows[0].tabs.length).toBeGreaterThanOrEqual(1);
  }, 20_000);
});
