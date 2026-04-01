import { describe, expect, test } from "bun:test";
import { parseRagArgs } from "../../src/commands/rag.js";
import { parseSearchArgs } from "../../src/commands/search.js";
import { pMap } from "../../src/lib/concurrent.js";
import { chunkMarkdown } from "../../src/lib/workflows/search/chunk.js";
import { buildIndex } from "../../src/lib/workflows/search/index.js";
import { preprocessHtml } from "../../src/lib/workflows/search/preprocess.js";

// ---------------------------------------------------------------------------
// preprocessHtml
// ---------------------------------------------------------------------------

describe("preprocessHtml", () => {
  test("converts HTML to markdown", () => {
    const result = preprocessHtml("<p>Hello world</p>", "");
    expect(result.markdown).toContain("Hello world");
  });

  test("prefers fallback title over markdown heading", () => {
    const html = "<h1>My Title</h1><p>body</p>";
    const result = preprocessHtml(html, "fallback");
    expect(result.title).toBe("fallback");
  });

  test("extracts title from heading when no fallback", () => {
    const html = "<h1>My Title</h1><p>body</p>";
    const result = preprocessHtml(html, "");
    expect(result.title).toBe("My Title");
  });

  test("falls back to provided title when no heading", () => {
    const result = preprocessHtml("<p>no heading here</p>", "Fallback Title");
    expect(result.title).toBe("Fallback Title");
  });

  test("strips noise elements", () => {
    const html = `
      <nav>navigation</nav>
      <header>header</header>
      <main><p>content</p></main>
      <footer>footer</footer>
      <script>alert(1)</script>
      <style>.x{}</style>
    `;
    const result = preprocessHtml(html, "");
    expect(result.markdown).toContain("content");
    expect(result.markdown).not.toContain("navigation");
    expect(result.markdown).not.toContain("footer");
    expect(result.markdown).not.toContain("alert");
    expect(result.markdown).not.toContain(".x{}");
  });
});

// ---------------------------------------------------------------------------
// chunkMarkdown
// ---------------------------------------------------------------------------

describe("chunkMarkdown", () => {
  const meta = { title: "T", url: "u", windowId: "w", tabId: "t", pageIndex: 0 };

  test("produces a single chunk for short text", () => {
    const chunks = chunkMarkdown("Short paragraph.", meta);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].body).toBe("Short paragraph.");
    expect(chunks[0].chunkIndex).toBe(0);
  });

  test("splits on double newlines", () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const chunks = chunkMarkdown(text, meta, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].body).toBe("Paragraph one.");
  });

  test("never splits mid-paragraph", () => {
    const longParagraph = "A".repeat(600);
    const chunks = chunkMarkdown(longParagraph, meta, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].body).toBe(longParagraph);
  });

  test("carries page metadata on every chunk", () => {
    const text = "A\n\nB\n\nC";
    const chunks = chunkMarkdown(text, meta, 1);
    for (const chunk of chunks) {
      expect(chunk.title).toBe("T");
      expect(chunk.windowId).toBe("w");
      expect(chunk.tabId).toBe("t");
    }
  });

  test("returns empty array for blank input", () => {
    expect(chunkMarkdown("", meta)).toHaveLength(0);
    expect(chunkMarkdown("   \n\n  ", meta)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildIndex + search
// ---------------------------------------------------------------------------

describe("buildIndex", () => {
  test("returns empty results for empty input", () => {
    const index = buildIndex([]);
    expect(index.size).toBe(0);
    expect(index.search("anything")).toEqual([]);
  });

  test("finds a page by title keyword", () => {
    const index = buildIndex([
      {
        url: "https://a.com",
        windowId: "1",
        tabId: "10",
        title: "React Hooks Guide",
        html: "<p>useState and useEffect</p>",
      },
      {
        url: "https://b.com",
        windowId: "1",
        tabId: "20",
        title: "Cooking Recipes",
        html: "<p>How to bake bread</p>",
      },
    ]);

    const results = index.search("react hooks");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toBe("https://a.com");
  });

  test("finds a page by body content", () => {
    const index = buildIndex([
      {
        url: "https://a.com",
        windowId: "1",
        tabId: "10",
        title: "Page A",
        html: "<p>TypeScript generics tutorial</p>",
      },
      {
        url: "https://b.com",
        windowId: "1",
        tabId: "20",
        title: "Page B",
        html: "<p>Python decorators guide</p>",
      },
    ]);

    const results = index.search("typescript generics");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tabId).toBe("10");
  });

  test("respects topK limit", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}`,
      windowId: "1",
      tabId: String(i),
      title: `Page about JavaScript ${i}`,
      html: `<p>JavaScript content number ${i}</p>`,
    }));

    const index = buildIndex(pages);
    const results = index.search("javascript", 3);
    expect(results).toHaveLength(3);
  });

  test("results include score", () => {
    const index = buildIndex([
      {
        url: "https://a.com",
        windowId: "1",
        tabId: "10",
        title: "Test",
        html: "<p>hello world</p>",
      },
    ]);

    const results = index.search("hello");
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0].score).toBe("number");
    expect(results[0].score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// parseSearchArgs
// ---------------------------------------------------------------------------

describe("parseSearchArgs", () => {
  test("parses a simple query", () => {
    const result = parseSearchArgs(["react hooks"]);
    expect(result.query).toBe("react hooks");
    expect(result.top).toBeUndefined();
  });

  test("parses --top flag", () => {
    const result = parseSearchArgs(["react", "--top", "7"]);
    expect(result.query).toBe("react");
    expect(result.top).toBe(7);
  });

  test("throws on missing query", () => {
    expect(() => parseSearchArgs([])).toThrow("Search query is required");
  });

  test("throws on unknown flag", () => {
    expect(() => parseSearchArgs(["--bogus", "query"])).toThrow("Unknown flag");
  });

  test("throws on invalid --top value", () => {
    expect(() => parseSearchArgs(["query", "--top", "abc"])).toThrow("Invalid --top value");
  });

  test("parses --deep flag", () => {
    const result = parseSearchArgs(["query", "--deep"]);
    expect(result.deep).toBe(true);
  });

  test("defaults deep to false", () => {
    const result = parseSearchArgs(["query"]);
    expect(result.deep).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseRagArgs
// ---------------------------------------------------------------------------

describe("parseRagArgs", () => {
  test("parses a simple query", () => {
    const result = parseRagArgs(["react hooks"]);
    expect(result.query).toBe("react hooks");
    expect(result.top).toBeUndefined();
  });

  test("parses --top flag", () => {
    const result = parseRagArgs(["react", "--top", "3"]);
    expect(result.query).toBe("react");
    expect(result.top).toBe(3);
  });

  test("throws on missing query", () => {
    expect(() => parseRagArgs([])).toThrow("Search query is required");
  });

  test("throws on unknown flag", () => {
    expect(() => parseRagArgs(["--bogus", "query"])).toThrow("Unknown flag");
  });
});

// ---------------------------------------------------------------------------
// pMap
// ---------------------------------------------------------------------------

describe("pMap", () => {
  test("runs items concurrently up to the limit", async () => {
    let running = 0;
    let maxRunning = 0;

    const results = await pMap(
      [1, 2, 3, 4, 5, 6],
      async (item) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return item * 2;
      },
      2,
    );

    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  test("preserves order", async () => {
    const results = await pMap(
      [30, 10, 20],
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
      3,
    );

    expect(results).toEqual([30, 10, 20]);
  });

  test("handles empty input", async () => {
    const results = await pMap([], async (x: number) => x, 5);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// searchWithPages (RAG)
// ---------------------------------------------------------------------------

describe("searchWithPages", () => {
  const pages = [
    {
      url: "https://react.dev",
      windowId: "1",
      tabId: "10",
      title: "React Docs",
      html: "<h1>React</h1><p>React is a JavaScript library for building user interfaces.</p><p>Components let you split the UI into independent pieces.</p>",
    },
    {
      url: "https://vue.dev",
      windowId: "1",
      tabId: "20",
      title: "Vue Guide",
      html: "<h1>Vue</h1><p>Vue is a progressive framework for building user interfaces.</p>",
    },
    {
      url: "https://angular.dev",
      windowId: "2",
      tabId: "30",
      title: "Angular Docs",
      html: "<h1>Angular</h1><p>Angular is a platform for building mobile and desktop applications.</p>",
    },
  ];

  test("returns grouped results with full content", () => {
    const index = buildIndex(pages, { retainPageContent: true });
    const results = index.searchWithPages("javascript library user interfaces");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fullContent).toBeTruthy();
    expect(results[0].chunks.length).toBeGreaterThan(0);
    expect(typeof results[0].topScore).toBe("number");
  });

  test("deduplicates chunks from the same page", () => {
    const index = buildIndex(pages, { retainPageContent: true });
    const results = index.searchWithPages("react");

    const reactResult = results.find((r) => r.url === "https://react.dev");
    // Should be a single page entry even if multiple chunks matched
    const reactCount = results.filter((r) => r.url === "https://react.dev").length;
    expect(reactCount).toBeLessThanOrEqual(1);
    if (reactResult) {
      expect(reactResult.chunks.length).toBeGreaterThan(0);
    }
  });

  test("throws when retainPageContent was false", () => {
    const index = buildIndex(pages);
    expect(() => index.searchWithPages("react")).toThrow("retainPageContent");
  });

  test("returns empty for no matches", () => {
    const index = buildIndex(pages, { retainPageContent: true });
    const results = index.searchWithPages("xyznonexistent");
    expect(results).toEqual([]);
  });

  test("empty index returns empty for searchWithPages", () => {
    const index = buildIndex([], { retainPageContent: true });
    expect(index.searchWithPages("anything")).toEqual([]);
  });
});
