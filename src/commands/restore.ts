import path from "node:path";

import { resolveAppPaths } from "../lib/config.js";
import { CliError, CliUsageError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";
import {
  listSessions as listStoredSessionFiles,
  readSession,
  type Session,
} from "../lib/store/index.js";
import { isInteractiveTerminal } from "../lib/terminal.js";
import { type SelectOption, selectOne } from "../lib/tui/select.js";
import {
  type ChromeProfile,
  getProfiles,
  type RestoreSessionResult,
  restoreSession,
} from "../platform/macos/chrome/index.js";

interface RestoreCommandOptions {
  args: string[];
  deps?: RestoreCommandDependencies;
  env: NodeJS.ProcessEnv;
  json: boolean;
  logger: Logger;
  output: Output;
}

interface RestoreCommandDependencies {
  getProfiles: typeof getProfiles;
  isInteractiveTerminal: typeof isInteractiveTerminal;
  listStoredSessionFiles: typeof listStoredSessionFiles;
  readSession: typeof readSession;
  restoreSession: typeof restoreSession;
  selectOne: typeof selectOne;
}

interface RestoreArguments {
  profileDirectory?: string;
  source?: string;
}

interface StoredSessionSummary {
  capturedAt: string;
  fileName: string;
  filePath: string;
  name: string;
  tabCount: number;
  windowCount: number;
}

export const RESTORE_HELP_TEXT = `Usage:
  chrome-spill restore [saved-session-or-file] [--profile <directory>] [--json]

Examples:
  chrome-spill restore
  chrome-spill restore morning-tabs
  chrome-spill restore ./sessions/work.json
  chrome-spill restore morning-tabs --profile "Profile 1"
`;

const defaultDependencies: RestoreCommandDependencies = {
  getProfiles,
  isInteractiveTerminal,
  listStoredSessionFiles,
  readSession,
  restoreSession,
  selectOne,
};

export async function runRestoreCommand(options: RestoreCommandOptions): Promise<number> {
  const deps = options.deps ?? defaultDependencies;
  const [firstArg] = options.args;

  if (firstArg === "help") {
    options.output.stdout(RESTORE_HELP_TEXT);
    return 0;
  }

  const parsed = parseRestoreArgs(options.args);
  const interactive = deps.isInteractiveTerminal() && !options.json;
  const resolved = await resolveSavedSession({
    deps,
    env: options.env,
    interactive,
    source: parsed.source,
  });
  const profileDirectory = await resolveProfileDirectory({
    deps,
    interactive,
    profileDirectory: parsed.profileDirectory ?? resolved.session.profile ?? undefined,
  });
  const result = await deps.restoreSession(resolved.session, {
    profileDirectory: profileDirectory ?? undefined,
  });

  options.logger.debug(
    `Restored session from ${resolved.filePath} into ${result.windowCount} window(s)`,
  );

  if (options.json) {
    options.output.json(buildRestorePayload(resolved, result));
    return 0;
  }

  options.output.stdout(
    [
      "Restored session",
      "",
      `name: ${resolved.session.name}`,
      `file: ${resolved.filePath}`,
      `profile: ${result.profileDirectory ?? "default"}`,
      `windows: ${result.windowCount}`,
      `tabs: ${result.tabCount}`,
    ].join("\n"),
  );

  return 0;
}

export function parseRestoreArgs(args: string[]): RestoreArguments {
  let profileDirectory: string | undefined;
  let source: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--profile") {
      const value = args[index + 1];

      if (!value) {
        throw new CliUsageError("Missing value for --profile");
      }

      profileDirectory = value;
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new CliUsageError(`Unknown flag for restore: ${token}`);
    }

    if (source) {
      throw new CliUsageError(`Unexpected arguments for restore: ${args.join(" ")}`);
    }

    source = token;
  }

  return {
    profileDirectory,
    source,
  };
}

async function resolveSavedSession(options: {
  deps: RestoreCommandDependencies;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
  source?: string;
}): Promise<{ filePath: string; session: Session }> {
  const paths = resolveAppPaths(options.env);

  if (options.source) {
    const filePath = await resolveSessionFilePath(paths.sessions, options.source);

    if (!filePath) {
      throw new CliError(`Saved session not found: ${options.source}`, 1);
    }

    return {
      filePath,
      session: await options.deps.readSession(filePath),
    };
  }

  if (!options.interactive) {
    throw new CliUsageError(
      "Saved session is required when not running interactively. Usage: chrome-spill restore <saved-session-or-file>",
    );
  }

  const files = await options.deps.listStoredSessionFiles(paths);

  if (files.length === 0) {
    throw new CliError("No saved sessions found.", 1);
  }

  const summaries = await Promise.all(
    files.map(async (filePath) => {
      const session = await options.deps.readSession(filePath);

      return summarizeStoredSession(filePath, session);
    }),
  );
  const selectedPath = await options.deps.selectOne({
    message: "Select a saved session",
    options: summaries.map((summary) => ({
      hint: `${summary.tabCount} tabs · ${summary.capturedAt}`,
      label: `${summary.name}  (${summary.fileName})`,
      value: summary.filePath,
    })),
  });
  const selected = summaries.find((summary) => summary.filePath === selectedPath);

  if (!selected) {
    throw new CliError(`Saved session not found: ${selectedPath}`, 1);
  }

  return {
    filePath: selected.filePath,
    session: await options.deps.readSession(selected.filePath),
  };
}

async function resolveProfileDirectory(options: {
  deps: RestoreCommandDependencies;
  interactive: boolean;
  profileDirectory?: string;
}): Promise<string | null> {
  if (options.profileDirectory) {
    return options.profileDirectory;
  }

  if (!options.interactive) {
    return null;
  }

  const profiles = await options.deps.getProfiles();

  if (profiles.length === 0) {
    return null;
  }

  if (profiles.length === 1) {
    return profiles[0].directoryName;
  }

  return await selectProfileInteractively(options.deps.selectOne, profiles);
}

async function selectProfileInteractively(
  prompt: RestoreCommandDependencies["selectOne"],
  profiles: ChromeProfile[],
): Promise<string> {
  const profileOptions: SelectOption<string>[] = profiles.map((profile) => ({
    hint: profile.userName || profile.directoryName,
    label: profile.name || profile.directoryName,
    value: profile.directoryName,
  }));

  return await prompt({
    message: "Select a Chrome profile",
    options: profileOptions,
  });
}

function summarizeStoredSession(filePath: string, session: Session): StoredSessionSummary {
  return {
    capturedAt: session.capturedAt,
    fileName: path.basename(filePath),
    filePath,
    name: session.name,
    tabCount: session.windows.reduce((count, window) => count + window.tabs.length, 0),
    windowCount: session.windows.length,
  };
}

async function resolveSessionFilePath(
  defaultSessionsDirectory: string,
  source: string,
): Promise<string | null> {
  const directPath = path.resolve(source);

  if (await Bun.file(directPath).exists()) {
    return directPath;
  }

  const candidateFileName = source.endsWith(".json") ? source : `${source}.json`;
  const storePath = path.join(defaultSessionsDirectory, candidateFileName);

  if (await Bun.file(storePath).exists()) {
    return storePath;
  }

  return null;
}

function buildRestorePayload(
  resolved: { filePath: string; session: Session },
  result: RestoreSessionResult,
) {
  return {
    filePath: resolved.filePath,
    name: resolved.session.name,
    profileDirectory: result.profileDirectory,
    restoredTabs: result.tabCount,
    restoredWindows: result.windowCount,
  };
}
