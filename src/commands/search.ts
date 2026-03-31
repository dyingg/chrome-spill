import { CliUsageError } from "../lib/errors.js";
import { fetchSources } from "../lib/http.js";
import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";
import { isInteractiveTerminal } from "../lib/terminal.js";
import { type SelectOption, selectOne } from "../lib/tui/select.js";
import { buildIndex, type SearchResult } from "../lib/workflows/search/index.js";
import { focusTab, getAllTabs } from "../platform/macos/chrome/index.js";
import type { CommandDefinition } from "./types.js";

interface SearchCommandOptions {
  args: string[];
  deps?: SearchCommandDependencies;
  env: NodeJS.ProcessEnv;
  json: boolean;
  logger: Logger;
  output: Output;
}

interface SearchCommandDependencies {
  buildIndex: typeof buildIndex;
  fetchSources: typeof fetchSources;
  focusTab: typeof focusTab;
  getAllTabs: typeof getAllTabs;
  isInteractiveTerminal: typeof isInteractiveTerminal;
  selectOne: typeof selectOne;
}

interface SearchArguments {
  query: string;
  top: number;
}

export const SEARCH_HELP_TEXT = `Usage:
  chrome-spill search <query> [--top <n>] [--json]

Search open Chrome tabs by content. Fetches each tab's page source,
builds a BM25 index, and ranks results by relevance.

Options:
  --top <n>   Number of results to show (default: 4)
  --json      Output results as JSON instead of interactive selection

Examples:
  chrome-spill search "react hooks"
  chrome-spill search "login bug" --top 5
  chrome-spill search "API docs" --json
`;

const DEFAULT_TOP = 4;

export const searchCommand: CommandDefinition = {
  description: "Search open Chrome tabs by page content.",
  helpText: SEARCH_HELP_TEXT,
  examples: ['search "react hooks"'],
  run: ({ args, env, flags, logger, output }) =>
    runSearchCommand({ args, env, json: flags.json, logger, output }),
};

const defaultDependencies: SearchCommandDependencies = {
  buildIndex,
  fetchSources,
  focusTab,
  getAllTabs,
  isInteractiveTerminal,
  selectOne,
};

export async function runSearchCommand(options: SearchCommandOptions): Promise<number> {
  const deps = options.deps ?? defaultDependencies;
  const parsed = parseSearchArgs(options.args);
  const tabs = await deps.getAllTabs();

  if (tabs.length === 0) {
    options.output.stdout("No open Chrome tabs found.");
    return 0;
  }

  options.logger.info(`Fetching content from ${tabs.length} tab(s)…`);

  const pages = await deps.fetchSources(
    tabs.map((tab) => ({ url: tab.url, windowId: tab.windowId, tabId: tab.id, title: tab.title })),
    { logger: options.logger },
  );

  if (pages.length === 0) {
    options.output.stdout("Could not fetch content from any tabs.");
    return 0;
  }

  options.logger.info(`Indexing ${pages.length} page(s)…`);
  const index = deps.buildIndex(pages);
  const results = index.search(parsed.query, parsed.top);

  if (results.length === 0) {
    options.output.stdout(`No results for "${parsed.query}".`);
    return 0;
  }

  if (options.json) {
    options.output.json(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        windowId: r.windowId,
        tabId: r.tabId,
        score: r.score,
        snippet: truncate(r.body, 120),
      })),
    );
    return 0;
  }

  if (!deps.isInteractiveTerminal()) {
    for (const result of results) {
      options.output.stdout(`${result.title}\n  ${result.url}`);
    }
    return 0;
  }

  const selectOptions: SelectOption<SearchResult>[] = results.map((result) => ({
    hint: truncate(result.url, 60),
    label: result.title || result.url,
    value: result,
  }));

  const selected = await deps.selectOne({
    message: `Results for "${parsed.query}"`,
    options: selectOptions,
  });

  await deps.focusTab(selected.windowId, selected.tabId);
  options.logger.info(`Focused: ${selected.title}`);

  return 0;
}

export function parseSearchArgs(args: string[]): SearchArguments {
  let query: string | undefined;
  let top = DEFAULT_TOP;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (token === "--top") {
      const value = args[i + 1];
      if (!value) throw new CliUsageError("Missing value for --top");
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < 1) throw new CliUsageError(`Invalid --top value: ${value}`);
      top = n;
      i += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new CliUsageError(`Unknown flag for search: ${token}`);
    }

    if (query !== undefined) {
      throw new CliUsageError("Only one search query is allowed.");
    }
    query = token;
  }

  if (!query) {
    throw new CliUsageError("Search query is required. Usage: chrome-spill search <query>");
  }

  return { query, top };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
