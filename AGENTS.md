## Micro-commits

**Commit immediately after completing each logical unit of work** — do not batch unrelated changes and do not wait to be asked. A "logical unit" is one self-contained change to the codebase: implementing a function, adding a command, writing a test, fixing a bug, wiring up a new module, adding a skill, etc. A unit may touch multiple files if they belong together (e.g. a module + its test, or a skill's directory of files). When in doubt, commit more often rather than less.

Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`

## Project shape

This repo is a TypeScript codebase (runs on Bun) with one executable surface:

- `chromectx doctor`
- `chromectx restore ...`
- `chromectx save ...`
- `chromectx list ...`
- `chromectx search ...` — fast title+URL search; `--deep` fetches full page content
- `chromectx rag ...` — RAG search across tabs (JSON output for agents/scripts)
- `chromectx mcp`

The MCP server is local-only and uses stdio. Treat the CLI and MCP server as two transports around shared code rather than as separate applications.

## Source layout

- `src/bin`: executable entrypoints only
- `src/browser`: browser-level type definitions (`ChromeSession`, `ChromeTab`, etc.) shared across commands, store, and platform
- `src/commands`: CLI-facing orchestration — each command is a self-contained module exporting a `CommandDefinition` (see "Adding a CLI command" below); `types.ts` defines the shared `CommandDefinition`, `CommandRunContext`, and `GlobalFlags` interfaces; `root.ts` is the registry + dispatcher — each command is a self-contained module exporting a `CommandDefinition` (see "Adding a CLI command" below); `types.ts` defines the shared `CommandDefinition`, `CommandRunContext`, and `GlobalFlags` interfaces; `root.ts` is the registry + dispatcher
- `src/mcp`: MCP protocol handling and tool registration
- `src/platform/macos`: macOS-specific integrations and checks
- `src/platform/macos/chrome/`: Chrome browser interaction (install detection, session/tab queries, page source retrieval)
- `src/lib`: shared support modules such as config, errors, output, logging, `concurrent.ts` (sliding-window `pMap`), and `http.ts` (shared `fetchSources` with concurrency 15)
- `src/lib/tui/`: interactive terminal UI components built on `@clack/prompts` — `select.ts` exports `selectOne<T>()` (and will gain `selectMany<T>()` later). Use these for any arrow-key selection in CLI commands; inject via `deps` for testing.
- `src/lib/store/`: session persistence — `types.ts` defines the schema contract (`Session`, `SessionWindow`, `SessionTab`); `io.ts` handles read/write/list to `{AppPaths.sessions}/*.json`
- `src/lib/workflows/search/`: BM25 search pipeline — `preprocess.ts` (HTML→markdown via turndown), `chunk.ts` (paragraph chunking ~500 chars), `index.ts` (`buildIndex` + `SearchIndex` with `search` and `searchWithPages`)
- `src/lib/workflows/rag.ts`: shared RAG pipeline (`executeRag`) used by both CLI `rag` command and MCP `rag_search` tool

## Default store

Session files are stored under `~/Library/Application Support/chromectx/sessions/` by default (`AppPaths.sessions` in `config.ts`). This follows macOS conventions for persistent user data. Commands should accept an optional output directory flag to override this default.
- `test/unit`: fast tests for pure helpers and command parsing
- `test/integration`: subprocess tests for CLI and MCP contracts, plus Chrome integration tests that require a live browser

Current store-facing commands:

- `chromectx restore [saved-session-or-file] [--profile <directory>]`
- `chromectx save [session-id] [--output <file>]`
- `chromectx list saved`

Do not introduce a deep `core/domain/services` split until the shared runtime logic actually needs it.

## Adding a CLI command

Two steps:

1. Create `src/commands/foo.ts` and export a `fooCommand: CommandDefinition` with `description`, `helpText`, `run`, and optionally `aliases` and `examples`.
2. In `src/commands/root.ts`, import the definition and add one entry to the `COMMANDS` object.

Everything else is derived automatically: `CommandName` type, root help text (commands list + examples), parser recognition, and alias resolution. Do not manually add commands to a union type, a help string, or the parser.

## Runtime rules

- Source code must use `node:` stdlib modules (`node:child_process`, `node:fs/promises`, `node:path`, etc.) for portability. Do **not** use Bun-specific APIs (`Bun.spawn`, `Bun.write`, `Bun.file`, `Bun.Glob`) in production source. Bun is used only as the runtime and test runner (`bun:test`).
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

- `jxa.ts` — `runJxa(script)` spawns `osascript` via `node:child_process` `execFile`, returns stdout. Exports the `JxaRunner` function type `(script: string) => Promise<string>`.
- `sessions.ts` — five public functions, each accepting an optional `JxaRunner` parameter for dependency injection:
  - `getSessions()` → all Chrome windows (id, name, mode, tab count, bounds, active tab index)
  - `getTabsInSession(windowId)` → tabs in one window (id, title, url, loading, active)
  - `getAllTabs()` → every tab across all windows
  - `getSourceForTab(tabId)` → fetches the tab's URL via shared `fetchSources` and returns the HTML. No macOS file permissions or Apple Events JS toggle needed.
  - `getSourceForSession(windowId)` → fetches HTML for every tab in a window. Makes one JXA call to list tabs, then fetches all URLs concurrently via shared `fetchSources` (concurrency 15). Returns `TabSource[]`.
- `install.ts` — `detectChromeInstallation()` checks known `.app` paths (no JXA needed).

**ID types**: Chrome window and tab IDs are strings as returned by JXA. All interfaces use `string` for `id`, `windowId`, and `tabId`.

**Testing pattern**: every function takes `run: JxaRunner = runJxa` as its last parameter. Unit tests inject a mock runner that returns canned JSON — no Chrome or osascript needed. Integration tests use the real runner against a live Chrome session.

## Linting and formatting

- Use Biome as the repo's formatter and linter.
- Prefer `bun run lint` for CI-grade verification and `bun run lint:fix` for safe autofixes.
- Prefer `bun run format` only when you explicitly want formatting-only changes.
- Keep configuration in the repo root `biome.json`.
