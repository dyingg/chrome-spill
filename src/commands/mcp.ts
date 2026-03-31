import type { Logger } from "../lib/logger.js";
import { startMcpServer } from "../mcp/server.js";

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
