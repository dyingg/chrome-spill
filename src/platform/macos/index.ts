import type { AppPaths } from "../../lib/config.js";
import type { RuntimePlatform } from "../guard.js";
import {
  type AutomationPermission,
  checkAutomationPermission,
  detectChromeInstallation,
  type JxaRunner,
} from "./chrome/index.js";
import { runJxa } from "./chrome/jxa.js";

interface DoctorSnapshotOptions {
  paths: AppPaths;
  run?: JxaRunner;
  runtime: RuntimePlatform;
}

export interface DoctorSnapshot {
  chrome: {
    automation: AutomationPermission;
    installed: boolean;
    path: string | null;
  };
  paths: AppPaths;
  platform: RuntimePlatform;
}

export async function getMacOSDoctorSnapshot(
  options: DoctorSnapshotOptions,
): Promise<DoctorSnapshot> {
  const chrome = detectChromeInstallation();
  const run = options.run ?? runJxa;

  const automation: AutomationPermission = chrome.installed
    ? await checkAutomationPermission(run)
    : { permitted: false, status: "unknown", detail: "Chrome is not installed" };

  return {
    chrome: { ...chrome, automation },
    paths: options.paths,
    platform: options.runtime,
  };
}
