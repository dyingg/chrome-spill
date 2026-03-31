/**
 * Runs a JXA (JavaScript for Automation) script via osascript and returns stdout.
 * Accepts an arbitrary script string; the script's return value is printed to stdout.
 */
export type JxaRunner = (script: string) => Promise<string>;

export async function runJxa(script: string): Promise<string> {
  const proc = Bun.spawn(["osascript", "-l", "JavaScript", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const message = stderr.trim() || `osascript exited with code ${exitCode}`;
    throw new Error(message);
  }

  return stdout.trim();
}
