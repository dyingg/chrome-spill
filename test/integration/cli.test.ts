import { describe, expect, test } from "bun:test";

import { TEST_PLATFORM_ENV } from "../../src/lib/env.js";
import { spawnCli, waitForExit } from "../helpers/process.js";

describe("cli integration", () => {
  test("shows help text", async () => {
    const child = spawnCli(["--help"]);
    const result = await waitForExit(child);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toBe("");
  });

  test("shows command-specific help for save --help", async () => {
    const child = spawnCli(["save", "--help"]);
    const result = await waitForExit(child);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("chrome-spill save [session-id]");
    expect(result.stdout).not.toContain("chrome-spill mcp");
    expect(result.stderr).toBe("");
  });

  test("shows command-specific help for doctor help", async () => {
    const child = spawnCli(["doctor", "help"]);
    const result = await waitForExit(child);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("chrome-spill doctor [--json]");
    expect(result.stdout).not.toContain("chrome-spill list tabs");
    expect(result.stderr).toBe("");
  });

  test("prints a structured doctor report on macOS", async () => {
    const child = spawnCli(["doctor", "--json"]);
    const result = await waitForExit(child);

    expect(result.code).toBe(0);

    const report = JSON.parse(result.stdout) as {
      chrome: { installed: boolean; path: string | null };
      platform: { platform: string };
    };

    expect(report.platform.platform).toBe("darwin");
    expect(typeof report.chrome.installed).toBe("boolean");
    expect(result.stderr).toBe("");
  });

  test("fails cleanly on unsupported platforms", async () => {
    const child = spawnCli(["doctor"], {
      env: {
        [TEST_PLATFORM_ENV]: "linux",
      },
    });
    const result = await waitForExit(child);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("only runs on macOS");
    expect(result.stderr).toContain("linux");
  });
});
