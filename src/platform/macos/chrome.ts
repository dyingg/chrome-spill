import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ChromeInstallation {
  installed: boolean;
  path: string | null;
}

export function detectChromeInstallation(homeDir = os.homedir()): ChromeInstallation {
  const candidates = [
    "/Applications/Google Chrome.app",
    path.join(homeDir, "Applications", "Google Chrome.app"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        installed: true,
        path: candidate,
      };
    }
  }

  return {
    installed: false,
    path: null,
  };
}
