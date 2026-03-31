import os from "node:os";
import path from "node:path";

export interface ChromeProfile {
  /** Directory name in Chrome's user data folder, e.g. "Default", "Profile 1" */
  directoryName: string;
  /** User-set display name for the profile */
  name: string;
  /** Google account email — empty string when not signed in */
  userName: string;
}

export async function getProfiles(homeDir = os.homedir()): Promise<ChromeProfile[]> {
  const localStatePath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Local State",
  );

  const file = Bun.file(localStatePath);
  if (!(await file.exists())) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
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
