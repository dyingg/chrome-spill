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
          tools: {
            listChanged: false,
          },
        },
      });

      const toolsResponse = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(toolsResponse.error).toBeUndefined();
      expect(toolsResponse.result).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "doctor" }),
          expect.objectContaining({ name: "search_tabs" }),
        ]),
      });
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
});
