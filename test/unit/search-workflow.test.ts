import { describe, expect, test } from "bun:test";

import { chunkMarkdown } from "../../src/lib/workflows/search/chunk.js";
import { preprocessHtml } from "../../src/lib/workflows/search/preprocess.js";
import { buildIndex } from "../../src/lib/workflows/search/index.js";
import { parseSearchArgs } from "../../src/commands/search.js";

// ---------------------------------------------------------------------------
// preprocessHtml
// ---------------------------------------------------------------------------

describe("preprocessHtml", () => {
  test("converts HTML to markdown", () => {
    const result = preprocessHtml("<p>Hello world</p>", "");
    expect(result.markdown).toContain("Hello world");
  });

  test("extracts title from first heading", () => {
    const html = "<h1>My Title</h1><p>body</p>";
    const result = preprocessHtml(html, "fallback");
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
      { url: "https://a.com", windowId: "1", tabId: "10", title: "React Hooks Guide", html: "<p>useState and useEffect</p>" },
      { url: "https://b.com", windowId: "1", tabId: "20", title: "Cooking Recipes", html: "<p>How to bake bread</p>" },
    ]);

    const results = index.search("react hooks");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toBe("https://a.com");
  });

  test("finds a page by body content", () => {
    const index = buildIndex([
      { url: "https://a.com", windowId: "1", tabId: "10", title: "Page A", html: "<p>TypeScript generics tutorial</p>" },
      { url: "https://b.com", windowId: "1", tabId: "20", title: "Page B", html: "<p>Python decorators guide</p>" },
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
      { url: "https://a.com", windowId: "1", tabId: "10", title: "Test", html: "<p>hello world</p>" },
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
    expect(result.top).toBe(4);
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
});
