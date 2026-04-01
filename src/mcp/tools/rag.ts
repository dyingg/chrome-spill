import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchSources } from "../../lib/http.js";
import { executeRag, type RagSearchResult, type SearchResult } from "../../lib/workflows/rag.js";
import { buildIndex } from "../../lib/workflows/search/index.js";
import { getAllTabs } from "../../platform/macos/chrome/index.js";

export function registerRagTool(server: McpServer): void {
  server.registerTool(
    "rag_search",
    {
      title: "RAG Search Chrome Tabs",
      description:
        "Search the content of all open Chrome tabs using BM25 ranking. " +
        "Returns matched chunks by default. Set return_full_site to true to also get " +
        "full page markdown for each matching page (useful for RAG context).",
      inputSchema: {
        query: z.string().describe("The search query."),
        top: z.number().optional().describe("Maximum number of results to return. Default: 5."),
        return_full_site: z
          .boolean()
          .optional()
          .describe(
            "When true, results are grouped by page and include the full page markdown. Default: false.",
          ),
      },
    },
    async ({ query, top: topArg, return_full_site }) => {
      const top = topArg ?? 5;
      const returnFullSite = return_full_site ?? false;

      const { results, pageCount } = await executeRag(
        { query, top, fullContent: returnFullSite },
        { buildIndex, fetchSources, getAllTabs },
      );

      if (results.length === 0) {
        const reason =
          pageCount === 0 ? "No open Chrome tabs found." : `No results for "${query}".`;
        return { content: [{ type: "text" as const, text: reason }] };
      }

      if (returnFullSite) {
        const ragResults = results as RagSearchResult[];
        const summary = ragResults
          .map((r) => `${r.title} — ${r.url} (${r.chunks.length} chunks, top score: ${r.topScore})`)
          .join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            query,
            resultCount: results.length,
            results,
          } as unknown as Record<string, unknown>,
        };
      }

      const chunkResults = results as SearchResult[];
      const summary = chunkResults
        .map((r) => `${r.title} — ${r.url} (score: ${r.score})`)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: summary }],
        structuredContent: {
          query,
          resultCount: results.length,
          results,
        } as unknown as Record<string, unknown>,
      };
    },
  );
}
