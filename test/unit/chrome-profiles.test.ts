import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProfiles } from "../../src/platform/macos/chrome/profiles.js";

let tmpDir: string;

async function writeLocalState(homeDir: string, data: unknown): Promise<void> {
  const dir = path.join(homeDir, "Library", "Application Support", "Google", "Chrome");
  await fs.mkdir(dir, { recursive: true });
  await Bun.write(path.join(dir, "Local State"), JSON.stringify(data));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chrome-profiles-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe("getProfiles", () => {
  test("parses multiple profiles from a valid Local State file", async () => {
    await writeLocalState(tmpDir, {
      profile: {
        info_cache: {
          Default: { name: "Person 1", user_name: "" },
          "Profile 1": { name: "Ink", user_name: "inktvo@gmail.com" },
          "Profile 3": { name: "Work", user_name: "alice@company.com" },
        },
      },
    });

    const profiles = await getProfiles(tmpDir);
    expect(profiles).toHaveLength(3);
    expect(profiles).toEqual([
      { directoryName: "Default", name: "Person 1", userName: "" },
      { directoryName: "Profile 1", name: "Ink", userName: "inktvo@gmail.com" },
      {
        directoryName: "Profile 3",
        name: "Work",
        userName: "alice@company.com",
      },
    ]);
  });

  test("returns empty array when Local State file does not exist", async () => {
    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([]);
  });

  test("returns empty array on invalid JSON", async () => {
    const dir = path.join(tmpDir, "Library", "Application Support", "Google", "Chrome");
    await fs.mkdir(dir, { recursive: true });
    await Bun.write(path.join(dir, "Local State"), "not json{{{");

    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([]);
  });

  test("returns empty array when profile key is missing", async () => {
    await writeLocalState(tmpDir, { other: "stuff" });
    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([]);
  });

  test("returns empty array when info_cache key is missing", async () => {
    await writeLocalState(tmpDir, { profile: { other: "stuff" } });
    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([]);
  });

  test("handles blank user_name gracefully", async () => {
    await writeLocalState(tmpDir, {
      profile: {
        info_cache: {
          Default: { name: "Guest", user_name: "" },
        },
      },
    });

    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([{ directoryName: "Default", name: "Guest", userName: "" }]);
  });

  test("defaults missing name and user_name to empty string", async () => {
    await writeLocalState(tmpDir, {
      profile: { info_cache: { Default: {} } },
    });

    const profiles = await getProfiles(tmpDir);
    expect(profiles).toEqual([{ directoryName: "Default", name: "", userName: "" }]);
  });
});
