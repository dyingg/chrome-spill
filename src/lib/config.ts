import os from "node:os";
import path from "node:path";

export interface AppPaths {
  support: string;
  cache: string;
  logs: string;
}

export function resolveAppPaths(env: NodeJS.ProcessEnv = process.env): AppPaths {
  const home = env.HOME ?? os.homedir();

  return {
    support: path.join(home, "Library", "Application Support", "chrome-spill"),
    cache: path.join(home, "Library", "Caches", "chrome-spill"),
    logs: path.join(home, "Library", "Logs", "chrome-spill"),
  };
}
