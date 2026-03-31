import { CliUsageError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { APP_NAME, APP_VERSION, MCP_PROTOCOL_VERSION } from "../lib/meta.js";
import { resolveDoctorTool, tools } from "./tools/index.js";

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface StartMcpServerOptions {
  env: NodeJS.ProcessEnv;
  logger: Logger;
}

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  options.logger.debug("Starting stdio MCP server");

  let initialized = false;
  let receivedInitializedNotification = false;
  let buffer = "";

  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");

      if (newlineIndex === -1) {
        break;
      }

      const rawMessage = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (rawMessage.length === 0) {
        continue;
      }

      void handleIncomingMessage(rawMessage);
    }
  });

  process.stdin.on("end", () => {
    options.logger.debug("stdin ended; stopping MCP server");
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", () => resolve());
  });

  async function handleIncomingMessage(rawMessage: string): Promise<void> {
    let message: JsonRpcRequest;

    try {
      message = JSON.parse(rawMessage) as JsonRpcRequest;
    } catch {
      options.logger.error("Ignoring invalid JSON-RPC payload");
      return;
    }

    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      if (message.id !== undefined) {
        writeMessage({
          jsonrpc: "2.0",
          id: message.id ?? null,
          error: {
            code: -32600,
            message: "Invalid Request",
          },
        });
      }
      return;
    }

    if (message.method === "notifications/initialized") {
      receivedInitializedNotification = true;
      options.logger.debug("Client completed MCP initialization");
      return;
    }

    if (message.id === undefined) {
      options.logger.debug(`Ignoring unsupported notification: ${message.method}`);
      return;
    }

    const response = await handleRequest(message, {
      env: options.env,
      initialized,
      receivedInitializedNotification,
    });

    if (message.method === "initialize" && !response.error) {
      initialized = true;
    }

    writeMessage(response);
  }
}

async function handleRequest(
  request: JsonRpcRequest,
  context: {
    env: NodeJS.ProcessEnv;
    initialized: boolean;
    receivedInitializedNotification: boolean;
  },
): Promise<JsonRpcResponse> {
  if (request.method !== "initialize" && request.method !== "ping" && !context.initialized) {
    return jsonRpcError(request.id ?? null, -32002, "Server not initialized");
  }

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: APP_NAME,
            version: APP_VERSION,
          },
          instructions:
            "Use tools/list to discover available tools. This server is local, macOS-only, and expects newline-delimited JSON-RPC on stdio.",
        },
      };
    case "ping":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {},
      };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      };
    case "tools/call": {
      const toolName = request.params?.name;

      if (typeof toolName !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid tool call parameters");
      }

      const tool = resolveDoctorTool(toolName);

      if (!tool) {
        return jsonRpcError(request.id ?? null, -32601, `Unknown tool: ${toolName}`);
      }

      const result = await tool.execute(
        typeof request.params?.arguments === "object" && request.params?.arguments
          ? (request.params.arguments as Record<string, unknown>)
          : {},
        context.env,
      );

      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result,
      };
    }
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}

function writeMessage(message: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

export function assertMcpInvocation(argv: string[]): void {
  if (argv.length > 0) {
    throw new CliUsageError(`Unexpected arguments for mcp: ${argv.join(" ")}`);
  }
}
