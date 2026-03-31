import { resolveAppPaths } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";
import { getRuntimePlatform } from "../platform/guard.js";
import { getMacOSDoctorSnapshot } from "../platform/macos/index.js";

export const DOCTOR_HELP_TEXT = `Usage:
  chrome-spill doctor [--json]

Inspect the local runtime and report macOS-specific readiness.

Options:
  --json    Output the doctor report as JSON

Examples:
  chrome-spill doctor
  chrome-spill doctor --json
`;

interface DoctorCommandOptions {
  env: NodeJS.ProcessEnv;
  json: boolean;
  logger: Logger;
  output: Output;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<number> {
  const runtime = getRuntimePlatform({ env: options.env });
  const paths = resolveAppPaths(options.env);
  const report = await getMacOSDoctorSnapshot({ runtime, paths });

  options.logger.debug("Generated macOS doctor report");

  if (options.json) {
    options.output.json(report);
    return 0;
  }

  const chromeLine = report.chrome.installed
    ? `installed at ${report.chrome.path}`
    : "not found in the standard application directories";

  const automationLine =
    report.chrome.automation.status === "granted"
      ? "granted"
      : report.chrome.automation.status === "denied"
        ? `denied — ${report.chrome.automation.detail}`
        : `unknown — ${report.chrome.automation.detail}`;

  options.output.stdout(
    [
      "chrome-spill doctor",
      "",
      `platform: ${report.platform.name} ${report.platform.release} (${report.platform.arch})`,
      `chrome: ${chromeLine}`,
      `automation: ${automationLine}`,
      "paths:",
      `  support: ${report.paths.support}`,
      `  cache: ${report.paths.cache}`,
      `  logs: ${report.paths.logs}`,
    ].join("\n"),
  );

  return 0;
}
