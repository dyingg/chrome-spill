import { describe, expect, test } from "bun:test";

import { withMcpServer } from "../helpers/mcp-client.js";

describe("mcp integration", () => {
  test("initializes and lists tools over stdio", async () => {
    await withMcpServer(async (server) => {
      const initializeResponse = await server.request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "0.0.0",
          },
        },
      });

      expect(initializeResponse.error).toBeUndefined();
      expect(initializeResponse.result).toMatchObject({
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
      });

      const toolsResponse = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(toolsResponse.error).toBeUndefined();
      const toolsList = toolsResponse.result as { tools: Array<Record<string, unknown>> };
      expect(toolsList.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "doctor" }),
          expect.objectContaining({
            name: "rag_chrome_search",
            inputSchema: expect.objectContaining({
              type: "object",
              required: expect.arrayContaining(["query"]),
            }),
          }),
        ]),
      );
      expect(server.stderr()).toBe("");
    });
  });

  test("calls the doctor tool and returns structured content", async () => {
    await withMcpServer(async (server) => {
      await server.request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "0.0.0",
          },
        },
      });

      const response = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "doctor",
          arguments: {},
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        content: [
          expect.objectContaining({
            type: "text",
          }),
        ],
        structuredContent: {
          platform: {
            platform: "darwin",
          },
        },
      });
    });
  });

  test("returns error for unknown tool", async () => {
    await withMcpServer(async (server) => {
      await server.request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.0.0" },
        },
      });

      const response = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "nonexistent", arguments: {} },
      });

      const hasError =
        response.error != null || (response.result as Record<string, unknown>)?.isError === true;
      expect(hasError).toBe(true);
    });
  });

  test("returns error when rag_chrome_search is called without required query param", async () => {
    await withMcpServer(async (server) => {
      await server.request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.0.0" },
        },
      });

      const response = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "rag_chrome_search", arguments: {} },
      });

      const hasError =
        response.error != null || (response.result as Record<string, unknown>)?.isError === true;
      expect(hasError).toBe(true);
    });
  });
});
