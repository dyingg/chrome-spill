import bm25 from "wink-bm25-text-search";
import nlp from "wink-nlp-utils";
import { chunkMarkdown } from "./chunk.js";
import { preprocessHtml } from "./preprocess.js";
import type { IndexedChunk, PageInput, SearchResult } from "./types.js";

export { chunkMarkdown } from "./chunk.js";
export { preprocessHtml } from "./preprocess.js";
export type { IndexedChunk, PageInput, SearchResult } from "./types.js";

const PREP_TASKS = [
  nlp.string.lowerCase,
  nlp.string.tokenize0,
  nlp.tokens.removeWords,
  nlp.tokens.stem,
  nlp.tokens.propagateNegations,
];

export interface SearchIndex {
  /** Run a query against the index. Returns ranked results. */
  search: (query: string, topK?: number) => SearchResult[];
  /** Number of chunks in the index. */
  size: number;
}

/**
 * Build a BM25 search index from raw page data.
 *
 * 1. Converts each page's HTML to markdown (turndown, noise stripped).
 * 2. Chunks the markdown by paragraph boundaries (~500 chars).
 * 3. Indexes every chunk with BM25 (title weighted 3x, body 1x).
 */
export function buildIndex(pages: PageInput[]): SearchIndex {
  const engine = bm25();
  const chunks: IndexedChunk[] = [];

  engine.defineConfig({ fldWeights: { title: 3, body: 1 } });
  engine.definePrepTasks(PREP_TASKS);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { title, markdown } = preprocessHtml(page.html, page.title);
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
      size: 0,
    };
  }

  // BM25 requires at least 3 documents to consolidate. For tiny corpora
  // fall back to simple case-insensitive substring matching.
  if (chunks.length < 3) {
    return {
      search(query: string, topK = 5): SearchResult[] {
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
      },
      size: chunks.length,
    };
  }

  engine.consolidate();

  return {
    search(query: string, topK = 5): SearchResult[] {
      const raw: [number, number][] = engine.search(query, topK);
      return raw.map(([docIndex, score]) => ({
        ...chunks[docIndex],
        score,
      }));
    },
    size: chunks.length,
  };
}
