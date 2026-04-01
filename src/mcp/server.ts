import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Logger } from "../lib/logger.js";
import { APP_NAME, APP_VERSION } from "../lib/meta.js";
import { registerDoctorTool } from "./tools/doctor.js";
import { registerRagTool } from "./tools/rag.js";

interface StartMcpServerOptions {
  env: NodeJS.ProcessEnv;
  logger: Logger;
}

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  options.logger.debug("Starting stdio MCP server");

  const server = new McpServer({
    name: APP_NAME,
    version: APP_VERSION,
  });

  registerDoctorTool(server, options.env);
  registerRagTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
