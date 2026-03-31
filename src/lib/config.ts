import os from "node:os";
import path from "node:path";

export interface AppPaths {
  support: string;
  cache: string;
  logs: string;
  sessions: string;
}

export function resolveAppPaths(env: NodeJS.ProcessEnv = process.env): AppPaths {
  const home = env.HOME ?? os.homedir();

  const support = path.join(home, "Library", "Application Support", "chromectx");

  return {
    support,
    cache: path.join(home, "Library", "Caches", "chromectx"),
    logs: path.join(home, "Library", "Logs", "chromectx"),
    sessions: path.join(support, "sessions"),
  };
}
