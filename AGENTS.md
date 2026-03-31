## Micro-commits

**Commit immediately after completing each logical unit of work** — do not batch unrelated changes and do not wait to be asked. A "logical unit" is one self-contained change to the codebase: implementing a function, adding a command, writing a test, fixing a bug, wiring up a new module, adding a skill, etc. A unit may touch multiple files if they belong together (e.g. a module + its test, or a skill's directory of files). When in doubt, commit more often rather than less.

Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`

## Project shape

This repo is a Bun-first TypeScript codebase with one executable surface:

- `chrome-spill doctor`
- `chrome-spill save ...`
- `chrome-spill list ...`
- `chrome-spill mcp`

The MCP server is local-only and uses stdio. Treat the CLI and MCP server as two transports around shared code rather than as separate applications.

## Source layout

- `src/bin`: executable entrypoints only
- `src/commands`: CLI-facing orchestration
- `src/mcp`: MCP protocol handling and tool registration
- `src/platform/macos`: macOS-specific integrations and checks
- `src/platform/macos/chrome/`: Chrome browser interaction (install detection, session/tab queries, page source retrieval)
- `src/lib`: shared support modules such as config, errors, output, and logging
- `src/lib/tui/`: interactive terminal UI components built on `@clack/prompts` — `select.ts` exports `selectOne<T>()` (and will gain `selectMany<T>()` later). Use these for any arrow-key selection in CLI commands; inject via `deps` for testing.
- `src/lib/store/`: session persistence — `types.ts` defines the schema contract (`Session`, `SessionWindow`, `SessionTab`); `io.ts` handles read/write/list to `{AppPaths.sessions}/*.json`

## Default store

Session files are stored under `~/Library/Application Support/chrome-spill/sessions/` by default (`AppPaths.sessions` in `config.ts`). This follows macOS conventions for persistent user data. Commands should accept an optional output directory flag to override this default.
- `test/unit`: fast tests for pure helpers and command parsing
- `test/integration`: subprocess tests for CLI and MCP contracts, plus Chrome integration tests that require a live browser

Current store-facing commands:

- `chrome-spill save [session-id] [--output <file>]`
- `chrome-spill list saved`

Do not introduce a deep `core/domain/services` split until the shared runtime logic actually needs it.

## Runtime rules

- This is a Bun project. Use Bun-native APIs (`Bun.spawn`, `Bun.write`, `Bun.file`, `Bun.Glob`, `bun:test`, etc.) instead of Node equivalents. Only fall back to `node:` modules when no Bun-native alternative exists (e.g. `node:fs/promises` for `mkdir`, `node:path`).
- The project is macOS-only. Any real command execution on a non-macOS platform must fail with a friendly error.
- `--help` and `--version` may remain platform-agnostic.
- In MCP mode, stdout is protocol-only. Never print logs, banners, or debug text to stdout.
- Any diagnostics in MCP mode must go to stderr.

## Testing rules

- Use `bun:test`.
- Prefer unit tests for pure logic in `src/lib` and argument parsing.
- Prefer integration tests that spawn the CLI or MCP server as subprocesses and assert stdout, stderr, and exit codes.
- `bun run test` runs all tests including Chrome integration tests. `bun run test:unit` runs only fast unit tests with no external dependencies.
- Chrome integration tests (`test/integration/chrome.test.ts`) open and close their own Chrome window. They do **not** touch pre-existing windows. These tests require Chrome to be installed. If Chrome is unavailable, they degrade to a no-op path instead of failing unrelated CLI work.

## Chrome infrastructure

All Chrome interaction goes through JXA (JavaScript for Automation) executed via `osascript -l JavaScript`. The runtime layer lives in `src/platform/macos/chrome/`:

- `jxa.ts` — `runJxa(script)` spawns `osascript` via `Bun.spawn`, returns stdout. Exports the `JxaRunner` function type `(script: string) => Promise<string>`.
- `sessions.ts` — five public functions, each accepting an optional `JxaRunner` parameter for dependency injection:
  - `getSessions()` → all Chrome windows (id, name, mode, tab count, bounds, active tab index)
  - `getTabsInSession(windowId)` → tabs in one window (id, title, url, loading, active)
  - `getAllTabs()` → every tab across all windows
  - `getSourceForTab(tabId)` → fetches the tab's URL via `fetch()` and returns the HTML. No macOS file permissions or Apple Events JS toggle needed.
  - `getSourceForSession(windowId, run?, concurrency?)` → fetches HTML for every tab in a window. Makes one JXA call to list tabs, then fetches all URLs concurrently in chunks (default 20). Returns `TabSource[]`.
- `install.ts` — `detectChromeInstallation()` checks known `.app` paths (no JXA needed).

**ID types**: Chrome window and tab IDs are strings as returned by JXA. All interfaces use `string` for `id`, `windowId`, and `tabId`.

**Testing pattern**: every function takes `run: JxaRunner = runJxa` as its last parameter. Unit tests inject a mock runner that returns canned JSON — no Chrome or osascript needed. Integration tests use the real runner against a live Chrome session.

## Linting and formatting

- Use Biome as the repo's formatter and linter.
- Prefer `bun run lint` for CI-grade verification and `bun run lint:fix` for safe autofixes.
- Prefer `bun run format` only when you explicitly want formatting-only changes.
- Keep configuration in the repo root `biome.json`.
