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
 *  1. `fallbackTitle` (typically the tab's document.title — always plain text)
 *  2. First `# ` heading in the markdown output
 *  3. Empty string
 */
export function preprocessHtml(html: string, fallbackTitle: string): PreprocessedPage {
  const markdown = turndown.turndown(html);

  const headingMatch = markdown.match(/^# (.+)$/m);
  const title = fallbackTitle || headingMatch?.[1]?.trim() || "";

  return { title, markdown };
}
