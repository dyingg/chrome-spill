import { CliUsageError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { startMcpServer } from "../mcp/server.js";
import type { CommandDefinition } from "./types.js";

export const MCP_HELP_TEXT = `Usage:
  chrome-spill mcp

Start the local MCP server over stdin/stdout.

Notes:
  stdout is reserved for protocol messages
  diagnostics are written to stderr
`;

interface McpCommandOptions {
  env: NodeJS.ProcessEnv;
  logger: Logger;
}

export async function runMcpCommand(options: McpCommandOptions): Promise<number> {
  await startMcpServer({
    env: options.env,
    logger: options.logger,
  });

  return 0;
}

export const mcpCommand: CommandDefinition = {
	description: "Start the local MCP server over stdin/stdout.",
	helpText: MCP_HELP_TEXT,
	examples: ["mcp"],
	run: async ({ args, env, logger }) => {
		if (args.length > 0) {
			throw new CliUsageError(
				`Unexpected arguments for mcp: ${args.join(" ")}`,
			);
		}

		return await runMcpCommand({ env, logger });
	},
};
