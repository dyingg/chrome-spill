import type { TabSource } from "../../../browser/types.js";
import bm25 from "wink-bm25-text-search";
import nlp from "wink-nlp-utils";
import { chunkMarkdown } from "./chunk.js";
import { preprocessHtml } from "./preprocess.js";
import type { IndexedChunk, RagChunkMatch, RagSearchResult, SearchResult } from "./types.js";

export { chunkMarkdown } from "./chunk.js";
export { preprocessHtml } from "./preprocess.js";
export type {
  IndexedChunk,
  RagChunkMatch,
  RagSearchResult,
  SearchResult,
} from "./types.js";

const PREP_TASKS = [
  nlp.string.lowerCase,
  nlp.string.tokenize0,
  nlp.tokens.removeWords,
  nlp.tokens.stem,
  nlp.tokens.propagateNegations,
];

export interface BuildIndexOptions {
  /** When true, retain full page markdown for RAG retrieval via searchWithPages. */
  retainPageContent?: boolean;
}

export interface SearchIndex {
  /** Run a query against the index. Returns ranked chunk results. */
  search: (query: string, topK?: number) => SearchResult[];
  /** Search and group results by page, including full page content. Requires retainPageContent. */
  searchWithPages: (query: string, topK?: number) => RagSearchResult[];
  /** Number of chunks in the index. */
  size: number;
}

/**
 * Build a BM25 search index from tab source data.
 *
 * 1. Converts each page's HTML to markdown (turndown, noise stripped).
 * 2. Chunks the markdown by paragraph boundaries (~500 chars).
 * 3. Indexes every chunk with BM25 (title weighted 3x, body 1x).
 */
export function buildIndex(pages: TabSource[], options?: BuildIndexOptions): SearchIndex {
  const engine = bm25();
  const chunks: IndexedChunk[] = [];
  const pageMarkdowns = new Map<number, string>();
  const retainContent = options?.retainPageContent ?? false;

  engine.defineConfig({ fldWeights: { title: 3, body: 1 } });
  engine.definePrepTasks(PREP_TASKS);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { title, markdown } = preprocessHtml(page.html, page.title);

    if (retainContent) {
      pageMarkdowns.set(pageIndex, markdown);
    }

    const pageChunks = chunkMarkdown(markdown, {
      title,
      url: page.url,
      windowId: page.windowId,
      tabId: page.tabId,
      pageIndex,
    });

    for (const chunk of pageChunks) {
      const docId = chunks.length;
      chunks.push(chunk);
      engine.addDoc({ title: chunk.title, body: chunk.body }, docId);
    }
  }

  if (chunks.length === 0) {
    return {
      search: () => [],
      searchWithPages: () => [],
      size: 0,
    };
  }

  // BM25 requires at least 3 documents to consolidate. For tiny corpora
  // fall back to simple case-insensitive substring matching.
  if (chunks.length < 3) {
    const searchFn = (query: string, topK = 5): SearchResult[] => {
      const lower = query.toLowerCase();
      return chunks
        .map((chunk) => {
          const titleHit = chunk.title.toLowerCase().includes(lower) ? 3 : 0;
          const bodyHit = chunk.body.toLowerCase().includes(lower) ? 1 : 0;
          return { ...chunk, score: titleHit + bodyHit };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    };

    return {
      search: searchFn,
      searchWithPages: (query, topK) =>
        groupByPage(searchFn(query, topK === undefined ? undefined : topK * 10), pageMarkdowns, retainContent, topK),
      size: chunks.length,
    };
  }

  engine.consolidate();

  const searchFn = (query: string, topK = 5): SearchResult[] => {
    const raw: [number, number][] = engine.search(query, topK);
    return raw.map(([docIndex, score]) => ({
      ...chunks[docIndex],
      score,
    }));
  };

  return {
    search: searchFn,
    searchWithPages(query: string, topK = 5): RagSearchResult[] {
      // Get a generous set of chunks so we have good page coverage.
      const chunkResults = searchFn(query, Math.min(topK * 10, chunks.length));
      return groupByPage(chunkResults, pageMarkdowns, retainContent, topK);
    },
    size: chunks.length,
  };
}

function groupByPage(
  results: SearchResult[],
  pageMarkdowns: Map<number, string>,
  retainContent: boolean,
  topK = 5,
): RagSearchResult[] {
  if (!retainContent) {
    throw new Error("searchWithPages requires retainPageContent: true");
  }

  const byPage = new Map<number, { meta: SearchResult; chunks: RagChunkMatch[] }>();

  for (const r of results) {
    if (!byPage.has(r.pageIndex)) {
      byPage.set(r.pageIndex, { meta: r, chunks: [] });
    }
    byPage.get(r.pageIndex)!.chunks.push({
      body: r.body,
      chunkIndex: r.chunkIndex,
      score: r.score,
    });
  }

  return Array.from(byPage.values())
    .map(({ meta, chunks }) => ({
      title: meta.title,
      url: meta.url,
      windowId: meta.windowId,
      tabId: meta.tabId,
      pageIndex: meta.pageIndex,
      fullContent: pageMarkdowns.get(meta.pageIndex) ?? "",
      chunks: chunks.sort((a, b) => b.score - a.score),
      topScore: Math.max(...chunks.map((c) => c.score)),
    }))
    .sort((a, b) => b.topScore - a.topScore)
    .slice(0, topK);
}
