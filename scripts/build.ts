import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf-8"));

const result = await Bun.build({
  entrypoints: ["src/bin/cli.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  external: [
    "@modelcontextprotocol/sdk",
    "@clack/prompts",
    "turndown",
    "wink-bm25-text-search",
    "wink-nlp-utils",
    "zod",
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outPath = join("dist", "cli.js");
let contents = await readFile(outPath, "utf-8");
contents = contents.replace(/^#!.*\n/gm, "");
await writeFile(outPath, `#!/usr/bin/env node\n${contents}`);
await chmod(outPath, 0o755);

console.log(`Built dist/cli.js (${(contents.length / 1024).toFixed(1)} KB)`);
