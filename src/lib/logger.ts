import type { Writable } from "node:stream";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

interface CreateLoggerOptions {
  name?: string;
  quiet?: boolean;
  stream?: Writable;
  verbose?: boolean;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const name = options.name ?? "chromectx";
  const quiet = options.quiet ?? false;
  const verbose = options.verbose ?? false;
  const stream = options.stream ?? process.stderr;

  function write(level: "INFO" | "DEBUG" | "ERROR", message: string): void {
    if (quiet && level !== "ERROR") {
      return;
    }

    if (!verbose && level === "DEBUG") {
      return;
    }

    stream.write(`[${name}] ${level} ${message}\n`);
  }

  return {
    debug(message) {
      write("DEBUG", message);
    },
    info(message) {
      write("INFO", message);
    },
    error(message) {
      write("ERROR", message);
    },
  };
}
