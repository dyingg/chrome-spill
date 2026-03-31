import { CliUsageError, errorToExitCode, formatError } from "../lib/errors.js";
import { createLogger } from "../lib/logger.js";
import { APP_NAME, APP_VERSION } from "../lib/meta.js";
import { createOutput } from "../lib/output.js";
import { assertMacOS } from "../platform/guard.js";
import { runDoctorCommand } from "./doctor.js";
import { runMcpCommand } from "./mcp.js";

type CommandName = "doctor" | "mcp";

interface GlobalFlags {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
}

interface ParsedArgs {
  command?: CommandName;
  commandArgs: string[];
  flags: GlobalFlags;
}

const HELP_TEXT = `${APP_NAME} is a macOS-only CLI and local stdio MCP server.

Usage:
  ${APP_NAME} [global flags] <command> [args]

Commands:
  doctor    Inspect the local runtime and report macOS-specific readiness.
  mcp       Start the local MCP server over stdin/stdout.
  help      Show this help text.

Global flags:
  -h, --help     Show help and exit.
  --version      Print the current version.
  --json         Emit structured JSON when the command supports it.
  -q, --quiet    Reduce diagnostic output.
  -v, --verbose  Increase diagnostic output on stderr.

Examples:
  ${APP_NAME} doctor
  ${APP_NAME} doctor --json
  ${APP_NAME} mcp
`;

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const output = createOutput();

  try {
    const parsed = parseCliArgs(argv);
    const logger = createLogger({
      quiet: parsed.flags.quiet,
      verbose: parsed.flags.verbose,
    });

    if (parsed.flags.help) {
      output.stdout(HELP_TEXT);
      return 0;
    }

    if (parsed.flags.version) {
      output.stdout(APP_VERSION);
      return 0;
    }

    if (!parsed.command) {
      output.stdout(HELP_TEXT);
      return 0;
    }

    assertMacOS({ env });

    switch (parsed.command) {
      case "doctor":
        return await runDoctorCommand({
          env,
          json: parsed.flags.json,
          logger,
          output,
        });
      case "mcp":
        return await runMcpCommand({
          env,
          logger,
        });
      default:
        throw new CliUsageError(`Unknown command: ${parsed.command}`);
    }
  } catch (error) {
    output.stderr(formatError(error));
    return errorToExitCode(error);
  }
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const flags: GlobalFlags = {
    help: false,
    version: false,
    json: false,
    quiet: false,
    verbose: false,
  };

  let command: CommandName | undefined;
  const commandArgs: string[] = [];

  for (const token of argv) {
    if (token === "-h" || token === "--help") {
      flags.help = true;
      continue;
    }

    if (token === "--version") {
      flags.version = true;
      continue;
    }

    if (token === "--json") {
      flags.json = true;
      continue;
    }

    if (token === "-q" || token === "--quiet") {
      flags.quiet = true;
      continue;
    }

    if (token === "-v" || token === "--verbose") {
      flags.verbose = true;
      continue;
    }

    if (!command) {
      if (token === "help") {
        flags.help = true;
        continue;
      }

      if (token === "doctor" || token === "mcp") {
        command = token;
        continue;
      }
    }

    commandArgs.push(token);
  }

  if (flags.help) {
    return {
      command,
      commandArgs,
      flags,
    };
  }

  if (!command && commandArgs.length > 0) {
    throw new CliUsageError(`Unknown command: ${commandArgs[0]}`);
  }

  if (commandArgs.length > 0) {
    throw new CliUsageError(`Unexpected arguments: ${commandArgs.join(" ")}`);
  }

  return {
    command,
    commandArgs,
    flags,
  };
}
