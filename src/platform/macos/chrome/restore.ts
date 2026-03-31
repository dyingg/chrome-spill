import type { Session, SessionWindow } from "../../../lib/store/types.js";
import { detectChromeInstallation } from "./install.js";

export interface RestoreSessionResult {
  profileDirectory: string | null;
  tabCount: number;
  windowCount: number;
}

export type ChromeOpenRunner = (args: string[]) => Promise<void>;

interface RestoreSessionDependencies {
  detectChromeInstallation: typeof detectChromeInstallation;
  openChrome: ChromeOpenRunner;
}

const defaultDependencies: RestoreSessionDependencies = {
  detectChromeInstallation,
  openChrome: runOpenCommand,
};

export async function restoreSession(
  session: Session,
  options: {
    deps?: Partial<RestoreSessionDependencies>;
    profileDirectory?: string;
  } = {},
): Promise<RestoreSessionResult> {
  if (session.windows.length === 0) {
    throw new Error("Saved session has no windows to restore.");
  }

  const deps: RestoreSessionDependencies = {
    ...defaultDependencies,
    ...options.deps,
  };
  const installation = deps.detectChromeInstallation();

  if (!installation.installed || !installation.path) {
    throw new Error("Google Chrome is not installed.");
  }

  for (const window of session.windows) {
    await deps.openChrome(buildChromeOpenArgs(installation.path, window, options.profileDirectory));
  }

  return {
    profileDirectory: options.profileDirectory ?? null,
    tabCount: session.windows.reduce((count, window) => count + window.tabs.length, 0),
    windowCount: session.windows.length,
  };
}

export function buildChromeOpenArgs(
  chromeAppPath: string,
  window: SessionWindow,
  profileDirectory?: string,
): string[] {
  const urls = window.tabs.map((tab) => tab.url).filter((url) => url.length > 0);

  return [
    "open",
    "-na",
    chromeAppPath,
    "--args",
    "--new-window",
    ...(profileDirectory ? [`--profile-directory=${profileDirectory}`] : []),
    ...(window.mode === "incognito" ? ["--incognito"] : []),
    ...(urls.length > 0 ? urls : ["about:blank"]),
  ];
}

async function runOpenCommand(args: string[]): Promise<void> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(args[0], args.slice(1), (error, _stdout, stderr) => {
      if (error) {
        const detail = stderr.trim();
        return reject(
          new Error(detail.length > 0 ? detail : `open exited with code ${error.code}`),
        );
      }
      resolve();
    });
  });
}
