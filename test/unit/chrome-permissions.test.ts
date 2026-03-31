import { describe, expect, test } from "bun:test";
import type { JxaRunner } from "../../src/platform/macos/chrome/jxa.js";
import { checkAutomationPermission } from "../../src/platform/macos/chrome/permissions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function grantedRunner(): JxaRunner {
  return async () => "ok";
}

function failingRunner(message: string): JxaRunner {
  return async () => {
    throw new Error(message);
  };
}

// ---------------------------------------------------------------------------
// checkAutomationPermission
// ---------------------------------------------------------------------------

describe("checkAutomationPermission", () => {
  test("returns granted when the JXA script succeeds", async () => {
    const result = await checkAutomationPermission(grantedRunner());
    expect(result).toEqual({ permitted: true, status: "granted", detail: null });
  });

  test("returns denied when error contains -1743", async () => {
    const result = await checkAutomationPermission(
      failingRunner(
        "execution error: Error on line 1: Error: Not authorized to send Apple events to Google Chrome. (-1743)",
      ),
    );
    expect(result.permitted).toBe(false);
    expect(result.status).toBe("denied");
    expect(result.detail).toContain("-1743");
  });

  test("returns denied when error contains the authorization message", async () => {
    const result = await checkAutomationPermission(
      failingRunner("Not authorized to send Apple events to Google Chrome"),
    );
    expect(result.permitted).toBe(false);
    expect(result.status).toBe("denied");
  });

  test("returns unknown for unexpected errors", async () => {
    const result = await checkAutomationPermission(failingRunner("osascript: command not found"));
    expect(result.permitted).toBe(false);
    expect(result.status).toBe("unknown");
    expect(result.detail).toContain("osascript");
  });

  test("never throws", async () => {
    const result = await checkAutomationPermission(
      failingRunner("something completely unexpected"),
    );
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("permitted");
  });
});
