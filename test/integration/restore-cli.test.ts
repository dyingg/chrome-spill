import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAllTabs } from "../../src/platform/macos/chrome/index.js";
import { runJxa } from "../../src/platform/macos/chrome/jxa.js";
import { spawnCli, waitForExit } from "../helpers/process.js";

let chromeReady = false;
let skipReason: string | undefined;
let tempDir = "";
let restoreUrl = "";

async function closeWindowsByUrl(url: string): Promise<void> {
  await runJxa(`(() => {
    const chrome = Application("Google Chrome");
    const winCount = chrome.windows.length;
    for (let i = winCount - 1; i >= 0; i--) {
      const win = chrome.windows[i];
      const tabCount = win.tabs.length;
      for (let j = 0; j < tabCount; j++) {
        if (win.tabs[j].url() === "${url}") {
          win.close();
          break;
        }
      }
    }
  })()`);
}

describe("restore CLI integration", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chromectx-restore-"));
    restoreUrl = `https://example.com/?restore-cli-test=${Date.now()}`;

    try {
      await runJxa(`(() => {
        const chrome = Application("Google Chrome");
        return chrome.name();
      })()`);
      chromeReady = true;
    } catch (error) {
      chromeReady = false;
      skipReason = error instanceof Error ? error.message : "Chrome JXA setup failed";
    }
  });

  afterEach(async () => {
    if (chromeReady) {
      await closeWindowsByUrl(restoreUrl).catch(() => {});
    }

    chromeReady = false;
    skipReason = undefined;
    await fs.rm(tempDir, { force: true, recursive: true });
  });

  test("restore opens tabs from an explicit session file", async () => {
    if (!chromeReady) {
      expect(skipReason).toBeDefined();
      return;
    }

    const sessionPath = path.join(tempDir, "restore.json");
    await Bun.write(
      sessionPath,
      `${JSON.stringify(
        {
          capturedAt: "2026-03-31T12:00:00.000Z",
          name: "restore test",
          profile: null,
          version: 1,
          windows: [
            {
              activeTabIndex: 1,
              mode: "normal",
              tabs: [{ title: "Restore", url: restoreUrl }],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const child = spawnCli(["restore", sessionPath, "--json"]);
    const result = await waitForExit(child);

    expect(result.code).toBe(0);

    let found = false;
    for (let attempt = 0; attempt < 15 && !found; attempt++) {
      await Bun.sleep(1_000);
      const tabs = await getAllTabs();
      found = tabs.some((tab) => tab.url === restoreUrl);
    }
    expect(found).toBe(true);
    expect(JSON.parse(result.stdout)).toMatchObject({
      filePath: sessionPath,
      restoredTabs: 1,
      restoredWindows: 1,
    });
  }, 20_000);
});
