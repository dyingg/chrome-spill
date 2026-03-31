import { resolveAppPaths } from "../../lib/config.js";
import { getRuntimePlatform } from "../../platform/guard.js";
import { getMacOSDoctorSnapshot } from "../../platform/macos/index.js";

export interface McpTool {
  description: string;
  execute(args: Record<string, unknown>, env: NodeJS.ProcessEnv): Promise<Record<string, unknown>>;
  inputSchema: Record<string, unknown>;
  name: string;
  title: string;
}

export const doctorTool: McpTool = {
  name: "doctor",
  title: "Inspect Local Runtime",
  description: "Inspect the local macOS runtime and report whether Chrome Spill is ready to run.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  async execute(_args, env) {
    const runtime = getRuntimePlatform({ env });
    const report = await getMacOSDoctorSnapshot({
      runtime,
      paths: resolveAppPaths(env),
    });

    return {
      content: [
        {
          type: "text",
          text: [
            `Platform: ${report.platform.name} ${report.platform.release} (${report.platform.arch})`,
            report.chrome.installed
              ? `Chrome: installed at ${report.chrome.path}`
              : "Chrome: not found in the standard application directories",
          ].join("\n"),
        },
      ],
      structuredContent: report,
    };
  },
};
