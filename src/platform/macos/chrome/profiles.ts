import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChromeProfile } from "../../../browser/types.js";

// Type is defined in src/browser/types.ts and re-exported here for backward compatibility.
export type { ChromeProfile };

export async function getProfiles(homeDir = os.homedir()): Promise<ChromeProfile[]> {
  const localStatePath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Local State",
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(localStatePath, "utf-8"));
  } catch {
    return [];
  }

  const infoCache = (parsed as Record<string, unknown>)?.profile as
    | Record<string, unknown>
    | undefined;
  const cache = infoCache?.info_cache as Record<string, Record<string, unknown>> | undefined;
  if (!cache || typeof cache !== "object") return [];

  return Object.entries(cache).map(([directoryName, entry]) => ({
    directoryName,
    name: (entry.name as string) ?? "",
    userName: (entry.user_name as string) ?? "",
  }));
}
