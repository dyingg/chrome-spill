import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProfiles } from "../../src/platform/macos/chrome/profiles.js";

const localStatePath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "Local State",
);
const chromeExists = fs.existsSync(localStatePath);

describe("Chrome profiles integration", () => {
  test("reads real profiles from Local State", async () => {
    if (!chromeExists) {
      expect(true).toBe(true); // no Chrome, skip gracefully
      return;
    }

    const profiles = await getProfiles();

    expect(profiles.length).toBeGreaterThanOrEqual(1);

    for (const p of profiles) {
      expect(typeof p.directoryName).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.userName).toBe("string");
      expect(p.directoryName.length).toBeGreaterThan(0);
    }
  });
});
