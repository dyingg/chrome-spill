import { fetchSources } from "../../lib/http.js";
import { buildIndex } from "../../lib/workflows/search/index.js";
import { getAllTabs } from "../../platform/macos/chrome/index.js";
import type { McpTool } from "./doctor.js";

export const searchTool: McpTool = {
  name: "search_tabs",
  title: "Search Chrome Tabs",
  description:
    "Search the content of all open Chrome tabs using BM25 ranking. " +
    "Returns matched chunks by default. Set return_full_site to true to also get " +
    "full page markdown for each matching page (useful for RAG context).",
  inputSchema: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
      top: {
        type: "number",
        description: "Maximum number of results to return. Default: 5.",
      },
      return_full_site: {
        type: "boolean",
        description:
          "When true, results are grouped by page and include the full page markdown. Default: false.",
      },
    },
  },

  async execute(args, _env) {
    const query = args.query as string;
    const top = (args.top as number | undefined) ?? 5;
    const returnFullSite = (args.return_full_site as boolean | undefined) ?? false;

    const tabs = await getAllTabs();

    if (tabs.length === 0) {
      return {
        content: [{ type: "text", text: "No open Chrome tabs found." }],
      };
    }

    const pages = await fetchSources(
      tabs.map((tab) => ({
        url: tab.url,
        windowId: tab.windowId,
        tabId: tab.id,
        title: tab.title,
      })),
    );

    if (pages.length === 0) {
      return {
        content: [{ type: "text", text: "Could not fetch content from any tabs." }],
      };
    }

    const index = buildIndex(pages, { retainPageContent: returnFullSite });

    if (returnFullSite) {
      const results = index.searchWithPages(query, top);
      const summary =
        results.length === 0
          ? `No results for "${query}".`
          : results
              .map(
                (r) =>
                  `${r.title} — ${r.url} (${r.chunks.length} chunks, top score: ${r.topScore})`,
              )
              .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { query, resultCount: results.length, results },
      };
    }

    const rawResults = index.search(query, index.size);
    const seen = new Set<string>();
    const results = rawResults
      .filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      })
      .slice(0, top);
    const summary =
      results.length === 0
        ? `No results for "${query}".`
        : results.map((r) => `${r.title} — ${r.url} (score: ${r.score})`).join("\n");

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { query, resultCount: results.length, results },
    };
  },
};
