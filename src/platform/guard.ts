import os from "node:os";
import { TEST_PLATFORM_ENV } from "../lib/env.js";
import { UnsupportedPlatformError } from "../lib/errors.js";

export interface RuntimePlatform {
  arch: string;
  name: string;
  platform: string;
  release: string;
}

interface RuntimePlatformOptions {
  env?: NodeJS.ProcessEnv;
}

export function getRuntimePlatform(options: RuntimePlatformOptions = {}): RuntimePlatform {
  const env = options.env ?? process.env;
  const overriddenPlatform = env[TEST_PLATFORM_ENV];
  const platform = overriddenPlatform ?? process.platform;
  const release = platform === process.platform ? os.release() : "test-release";
  const arch = process.arch;

  return {
    arch,
    name: platform === "darwin" ? "macOS" : platform,
    platform,
    release,
  };
}

interface AssertMacOSOptions {
  env?: NodeJS.ProcessEnv;
}

export function assertMacOS(options: AssertMacOSOptions = {}): RuntimePlatform {
  const runtime = getRuntimePlatform(options);

  if (runtime.platform !== "darwin") {
    throw new UnsupportedPlatformError(runtime.platform);
  }

  return runtime;
}
