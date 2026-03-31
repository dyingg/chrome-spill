import { execFile } from "node:child_process";

/**
 * Runs a JXA (JavaScript for Automation) script via osascript and returns stdout.
 * Accepts an arbitrary script string; the script's return value is printed to stdout.
 */
export type JxaRunner = (script: string) => Promise<string>;

export async function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", script], (error, stdout, stderr) => {
      if (error) {
        const message = stderr.trim() || `osascript exited with code ${error.code}`;
        return reject(new Error(message));
      }
      resolve(stdout.trim());
    });
  });
}
