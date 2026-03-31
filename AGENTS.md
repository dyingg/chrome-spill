## Micro-commits

**Commit immediately after completing each logical unit of work** — do not batch unrelated changes and do not wait to be asked. A "logical unit" is one self-contained change to the codebase: implementing a function, adding a command, writing a test, fixing a bug, wiring up a new module, adding a skill, etc. A unit may touch multiple files if they belong together (e.g. a module + its test, or a skill's directory of files). When in doubt, commit more often rather than less.

Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`

## Project shape

This repo is a Bun-first TypeScript codebase with one executable surface:

- `chrome-spill doctor`
- `chrome-spill mcp`

The MCP server is local-only and uses stdio. Treat the CLI and MCP server as two transports around shared code rather than as separate applications.

## Source layout

- `src/bin`: executable entrypoints only
- `src/commands`: CLI-facing orchestration
- `src/mcp`: MCP protocol handling and tool registration
- `src/platform/macos`: macOS-specific integrations and checks
- `src/lib`: shared support modules such as config, errors, output, and logging
- `test/unit`: fast tests for pure helpers and command parsing
- `test/integration`: subprocess tests for CLI and MCP contracts

Do not introduce a deep `core/domain/services` split until the shared runtime logic actually needs it.

## Runtime rules

- The project is macOS-only. Any real command execution on a non-macOS platform must fail with a friendly error.
- `--help` and `--version` may remain platform-agnostic.
- In MCP mode, stdout is protocol-only. Never print logs, banners, or debug text to stdout.
- Any diagnostics in MCP mode must go to stderr.

## Testing rules

- Use `bun:test`.
- Prefer unit tests for pure logic in `src/lib` and argument parsing.
- Prefer integration tests that spawn the CLI or MCP server as subprocesses and assert stdout, stderr, and exit codes.
- Do not make the default test suite depend on a live Chrome session or real macOS permissions prompts.
- If end-to-end Chrome automation is added later, keep it in a separate opt-in test layer.

## Linting and formatting

- Use Biome as the repo's formatter and linter.
- Prefer `bun run lint` for CI-grade verification and `bun run lint:fix` for safe autofixes.
- Prefer `bun run format` only when you explicitly want formatting-only changes.
- Keep configuration in the repo root `biome.json`.
