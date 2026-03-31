import { CliError, CliUsageError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";
import { renderTable } from "../lib/table.js";
import { isInteractiveTerminal } from "../lib/terminal.js";
import { type SelectOption, selectOne } from "../lib/tui/select.js";
import {
  type ChromeSession,
  type ChromeTab,
  getSessions,
  getTabsInSession,
} from "../platform/macos/chrome/index.js";

interface ListCommandOptions {
  args: string[];
  deps?: ListCommandDependencies;
  json: boolean;
  logger: Logger;
  output: Output;
}

interface ListCommandDependencies {
  getSessions: typeof getSessions;
  getTabsInSession: typeof getTabsInSession;
  isInteractiveTerminal: typeof isInteractiveTerminal;
  selectOne: typeof selectOne;
}

const LIST_HELP_TEXT = `Usage:
  chrome-spill list sessions [--json]
  chrome-spill list tabs <session-id> [--json]
  chrome-spill list tabs

Commands:
  sessions   List all open Chrome windows.
  tabs       List tabs for one Chrome window.

Examples:
  chrome-spill list sessions
  chrome-spill list sessions --json
  chrome-spill list tabs 123
  chrome-spill list tabs
`;

const defaultDependencies: ListCommandDependencies = {
  getSessions,
  getTabsInSession,
  isInteractiveTerminal,
  selectOne,
};

export async function runListCommand(options: ListCommandOptions): Promise<number> {
  const deps = options.deps ?? defaultDependencies;
  const [subcommand, ...rest] = options.args;

  if (!subcommand || subcommand === "help") {
    options.output.stdout(LIST_HELP_TEXT);
    return 0;
  }

  switch (subcommand) {
    case "sessions":
      return await runListSessionsCommand({
        args: rest,
        deps,
        json: options.json,
        logger: options.logger,
        output: options.output,
      });
    case "tabs":
      return await runListTabsCommand({
        args: rest,
        deps,
        json: options.json,
        logger: options.logger,
        output: options.output,
      });
    default:
      throw new CliUsageError(`Unknown list subcommand: ${subcommand}`);
  }
}

async function runListSessionsCommand(
  options: Omit<ListCommandOptions, "logger"> & { deps: ListCommandDependencies; logger: Logger },
): Promise<number> {
  if (options.args.length > 0) {
    throw new CliUsageError(`Unexpected arguments for list sessions: ${options.args.join(" ")}`);
  }

  const sessions = await options.deps.getSessions();
  options.logger.debug(`Found ${sessions.length} Chrome session(s)`);

  if (options.json) {
    options.output.json(sessions);
    return 0;
  }

  if (sessions.length === 0) {
    options.output.stdout("No Chrome sessions found.");
    return 0;
  }

  options.output.stdout(renderSessionsTable(sessions));
  return 0;
}

async function runListTabsCommand(
  options: Omit<ListCommandOptions, "logger"> & { deps: ListCommandDependencies; logger: Logger },
): Promise<number> {
  if (options.args.length > 1) {
    throw new CliUsageError(`Unexpected arguments for list tabs: ${options.args.join(" ")}`);
  }

  const sessionId =
    options.args[0] ??
    (await selectSessionInteractively({ deps: options.deps, json: options.json }));
  const tabs = await options.deps.getTabsInSession(sessionId);
  options.logger.debug(`Found ${tabs.length} tab(s) in session ${sessionId}`);

  if (options.json) {
    options.output.json(tabs);
    return 0;
  }

  if (tabs.length === 0) {
    options.output.stdout(`No tabs found for session ${sessionId}.`);
    return 0;
  }

  options.output.stdout(renderTabsTable(tabs));
  return 0;
}

async function selectSessionInteractively(options: {
  deps: ListCommandDependencies;
  json: boolean;
}): Promise<string> {
  if (options.json) {
    throw new CliUsageError(
      "Session ID is required for JSON output. Usage: chrome-spill list tabs <session-id> --json",
    );
  }

  if (!options.deps.isInteractiveTerminal()) {
    throw new CliUsageError(
      "Session ID is required when not running interactively. Usage: chrome-spill list tabs <session-id>",
    );
  }

  const sessions = await options.deps.getSessions();

  if (sessions.length === 0) {
    throw new CliError("No Chrome sessions found.", 1);
  }

  const selectOptions: SelectOption<string>[] = sessions.map((session) => ({
    hint: `${session.tabCount} tabs · ${session.mode}`,
    label: `${session.name}  (${session.id})`,
    value: session.id,
  }));

  return options.deps.selectOne({
    message: "Select a Chrome session",
    options: selectOptions,
  });
}

function renderSessionsTable(sessions: ChromeSession[]): string {
  const rows = sessions.map((session) => [
    session.id,
    session.mode,
    String(session.tabCount),
    String(session.activeTabIndex),
    session.name,
  ]);

  return renderTable(["ID", "MODE", "TABS", "ACTIVE", "NAME"], rows);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderTabsTable(tabs: ChromeTab[]): string {
  const rows = tabs.map((tab) => [
    tab.active ? `* ${tab.index}` : `  ${tab.index}`,
    tab.id,
    truncate(tab.title, 50),
    truncate(tab.url, 60),
  ]);

  return renderTable(["#", "ID", "TITLE", "URL"], rows);
}
