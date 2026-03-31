export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class CliUsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class UnsupportedPlatformError extends CliError {
  readonly platform: string;

  constructor(platform: string) {
    super(`chromectx only runs on macOS. Detected platform: ${platform}.`, 1);
    this.platform = platform;
  }
}

export function errorToExitCode(error: unknown): number {
  if (error instanceof CliError) {
    return error.exitCode;
  }

  return 1;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
