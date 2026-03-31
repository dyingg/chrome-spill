import path from "node:path";
import type { ChromeSession } from "../browser/index.js";
import { resolveAppPaths } from "../lib/config.js";
import { CliUsageError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";
import {
  buildSessionFromChromeSession,
  type Session,
  writeSession,
  writeSessionFile,
} from "../lib/store/index.js";
import { isInteractiveTerminal } from "../lib/terminal.js";
import { type SelectOption, selectOne } from "../lib/tui/select.js";
import { getSessions, getTabsInSession } from "../platform/macos/chrome/index.js";
import type { CommandDefinition } from "./types.js";

interface SaveCommandOptions {
  args: string[];
  deps?: SaveCommandDependencies;
  env: NodeJS.ProcessEnv;
  json: boolean;
  logger: Logger;
  output: Output;
}

interface SaveCommandDependencies {
  getSessions: typeof getSessions;
  getTabsInSession: typeof getTabsInSession;
  isInteractiveTerminal: typeof isInteractiveTerminal;
  selectOne: typeof selectOne;
  writeSession: typeof writeSession;
  writeSessionFile: typeof writeSessionFile;
}

interface SaveArguments {
  outputFile?: string;
  sessionId?: string;
}

export const SAVE_HELP_TEXT = `Usage:
  chrome-spill save [session-id] [--output <file>] [--json]
  chrome-spill save session [session-id] [--output <file>] [--json]

Examples:
  chrome-spill save
  chrome-spill save 123
  chrome-spill save 123 --output ./work-session.json
`;

export const saveCommand: CommandDefinition = {
  description: "Save Chrome sessions into the store format.",
  helpText: SAVE_HELP_TEXT,
  aliases: ["dump"],
  examples: ["save", "save 123"],
  run: ({ args, env, flags, logger, output }) =>
    runSaveCommand({ args, env, json: flags.json, logger, output }),
};

const defaultDependencies: SaveCommandDependencies = {
  getSessions,
  getTabsInSession,
  isInteractiveTerminal,
  selectOne,
  writeSession,
  writeSessionFile,
};

export async function runSaveCommand(options: SaveCommandOptions): Promise<number> {
  const deps = options.deps ?? defaultDependencies;
  const [firstArg, ...rest] = options.args;
  const normalizedArgs = firstArg && isSaveSubcommand(firstArg) ? rest : options.args;

  return await runSaveSessionCommand({
    args: normalizedArgs,
    deps,
    env: options.env,
    json: options.json,
    logger: options.logger,
    output: options.output,
  });
}

export function parseSaveArgs(args: string[]): SaveArguments {
  let outputFile: string | undefined;
  let sessionId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "-o" || token === "--output") {
      const value = args[index + 1];

      if (!value) {
        throw new CliUsageError("Missing value for --output");
      }

      outputFile = value;
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new CliUsageError(`Unknown flag for save: ${token}`);
    }

    if (sessionId) {
      throw new CliUsageError(`Unexpected arguments for save: ${args.join(" ")}`);
    }

    sessionId = token;
  }

  return {
    outputFile,
    sessionId,
  };
}

async function runSaveSessionCommand(options: {
  args: string[];
  deps: SaveCommandDependencies;
  env: NodeJS.ProcessEnv;
  json: boolean;
  logger: Logger;
  output: Output;
}): Promise<number> {
  const parsed = parseSaveArgs(options.args);
  const sessions = await options.deps.getSessions();
  const sessionId =
    parsed.sessionId ??
    (await selectOpenSession({
      deps: options.deps,
      sessions,
      usage:
        "Session ID is required when not running interactively. Usage: chrome-spill save <session-id>",
    }));
  const session = sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    throw new CliUsageError(`Unknown session id: ${sessionId}`);
  }

  const tabs = await options.deps.getTabsInSession(sessionId);
  const storedSession = buildSessionFromChromeSession(session, tabs);
  const filePath = await saveSession({
    deps: options.deps,
    outputFile: parsed.outputFile,
    paths: resolveAppPaths(options.env),
    session: storedSession,
  });

  options.logger.debug(`Saved session ${sessionId} to ${filePath}`);

  if (options.json) {
    options.output.json({
      capturedAt: storedSession.capturedAt,
      filePath,
      name: storedSession.name,
      sessionId,
      tabCount: tabs.length,
      windowCount: storedSession.windows.length,
    });
    return 0;
  }

  options.output.stdout(
    [
      "Saved session",
      "",
      `session: ${sessionId}`,
      `name: ${storedSession.name}`,
      `tabs: ${tabs.length}`,
      `file: ${filePath}`,
    ].join("\n"),
  );

  return 0;
}

function isSaveSubcommand(token: string): boolean {
  return token === "session" || token === "sessions";
}

async function saveSession(options: {
  deps: SaveCommandDependencies;
  outputFile?: string;
  paths: ReturnType<typeof resolveAppPaths>;
  session: Session;
}): Promise<string> {
  if (!options.outputFile) {
    return await options.deps.writeSession(options.paths, options.session);
  }

  return await options.deps.writeSessionFile(path.resolve(options.outputFile), options.session);
}

async function selectOpenSession(options: {
  deps: SaveCommandDependencies;
  sessions: ChromeSession[];
  usage: string;
}): Promise<string> {
  if (!options.deps.isInteractiveTerminal()) {
    throw new CliUsageError(options.usage);
  }

  if (options.sessions.length === 0) {
    throw new CliUsageError("No open Chrome sessions found.");
  }

  const selectOptions: SelectOption<string>[] = options.sessions.map((session) => ({
    hint: `${session.tabCount} tabs · ${session.mode}`,
    label: `${session.name}  (${session.id})`,
    value: session.id,
  }));

  return await options.deps.selectOne({
    message: "Select a Chrome session",
    options: selectOptions,
  });
}
