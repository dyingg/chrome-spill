import { spawn } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

export function spawnCli(args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return spawn(process.execPath, ["run", "src/bin/cli.ts", ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function waitForExit(
  child: ReturnType<typeof spawnCli>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on("close", (code, signal) => resolve({ code, signal }));
    },
  );

  return {
    ...result,
    stdout,
    stderr,
  };
}
