import TurndownService from "turndown";

const NOISE_TAGS = ["script", "style", "nav", "footer", "iframe", "noscript", "header", "aside"];

const turndown = new TurndownService({ headingStyle: "atx" });

// Strip noise elements before conversion.
turndown.remove(NOISE_TAGS);

export interface PreprocessedPage {
  title: string;
  markdown: string;
}

/**
 * Convert raw HTML to markdown and extract a title.
 *
 * Title priority:
 *  1. First `# ` heading in the markdown output
 *  2. `fallbackTitle` (typically the tab's document.title)
 *  3. Empty string
 */
export function preprocessHtml(html: string, fallbackTitle: string): PreprocessedPage {
  const markdown = turndown.turndown(html);

  const headingMatch = markdown.match(/^# (.+)$/m);
  const title = headingMatch?.[1]?.trim() || fallbackTitle || "";

  return { title, markdown };
}
