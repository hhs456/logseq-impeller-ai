# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [0.11.0] - 2026-10-11

### Added
- **GraphAdapter layer** (`src/graph/{types,text,canary,kind,index,file,db}.ts`): all schema-specific Logseq queries converge into a five-method adapter (`fetchAllBlocks` / `blocksReferencingPage` / `keywordSearch` / `pageTree` / `blockTree`). `FileGraphAdapter` is a verbatim port — its outputs are byte-identical to v0.10.1 (enforced by the file-graph snapshot, now with a 6th `getTxt` baseline).
- **DB graph support is enabled in this release** (`DB_ADAPTER_ENABLED = true`). `DbGraphAdapter` reads DB graphs through `datascriptQuery` only, and was verified on a real Logseq **2.0.2 beta** DB graph (1684 indexable blocks): indexed block count exactly matches the host's own count query, link names resolve to readable titles, `clojure.string/includes?` keyword search works, `getPageBlocksTree` nesting is preserved (3 roots → 28 nodes), and page-vs-block uuid behaviour matches the plan. Rollback = flip the flag back to `false` (DB returns to v0.10.1's explicit "unsupported"), or revert the release; no data migration.
- **Unified text/display helpers** (`src/graph/text.ts`): `blockText()` prefers human-readable `fullTitle`/`full-title` over raw `content`/`title` (kills `[[uuid]]` noise for DB, fixes silent-`undefined` reads); `pageDisplayName()` is DB-title-first (chat headers keep their case); `slug()` shared by both backends. Page context (`agent.ts`), `getTxt` and all graph tools now read through the adapter.
- **SDK type augmentation** (`src/graph/sdk-augment.d.ts`): module augmentation declares `AppInfo.supportDb`, `IAppProxy.checkCurrentIsDbGraph` and `IDBProxy.customQuery` without upgrading `@logseq/libs` (stays 0.0.17, zero runtime change); delete the file when upgrading. Verified resolvable under `moduleResolution: bundler`.
- **Shared canary** (`src/graph/canary.ts`): the zero-result `(count ?b)` schema-drift probe now serves both adapters, so a DB "successful but empty" fetch is reported as `unsupported/schema-mismatch` instead of a silent empty index.
- **Tests**: `tests/graph-file.test.ts` (adapter-level mapping/limits/fallbacks), `tests/graph-db.test.ts` (every DB datalog asserted to contain `:block/title` and never `:block/content`, plus field mapping — first consumer of the schema fake's `dbBlockRow`), `tests/rag-race.test.ts` (6 graph-switch race scenarios), `blockText`/`pageDisplayName`/`slug` cases in `tests/markdown.test.ts`.

### Changed
- `DB_ADAPTER_ENABLED` and `isGraphUnsupported()` moved to `src/graph/index.ts` (adapter selection lives with the flag); `rag.ts`'s DB branch and `tools.ts`'s two guards still share the single predicate.
- `onCurrentGraphChanged` handler order is now ① `onGraphSwitched()` (synchronous) → ② `handleGraphChange()` → ③ `initRAG()`, closing the window where the old graph's index stays queryable during UI isolation.
- DB-graph navigation: `openPage` pushes `{ name: uuid }` (host prefers uuid); file graphs keep the original-case name.
- **Known limitations carried into this release** (all measured on 2.0.2 beta, documented in the implementation plan's appendix A.3–A.6):
  - *Keyword search matches raw block titles*, so text that only appears as a link's display name is not found (`global_keyword_search`). Plain-text matches work normally.
  - *Deleted (recycled) pages' blocks can still be indexed* after a page deletion until the next full re-sync settles. No attribute names were invented to exclude them — that needs a verified property first.
  - *Sidebar panel needs two clicks after closing the sidebar with the panel open, and does not survive a sidebar re-open* (N3/N4). Cause is the host re-rendering `.sidebar-item-list` with React — **unrelated to graph type; file graphs on 2.0.2 hit it identically.** Fixing it means moving to the official sidebar renderer (separate task).
  - *Chat history from pre-2.0 installs may appear missing*: storage keys derive from `graph.path`, which shifted across the major version. Old entries are orphaned, **not deleted**, and remain in localStorage.
  - *R1 (file-graph regression on a real 0.10.x host) was **not** run for this release* — waived by decision. Compensating evidence: byte-identical file snapshot, two dedicated CI probe scenarios for the old-host shape, 181 green tests. Every new DB code path is inert on file graphs.

### Fixed
- **DB page-context link noise (N14, found on 2.0.2 beta)**: the Editor API's `fullTitle` keeps raw `[[uuid]]` for page links and `((uuid))` for block refs, unlike datalog's `full-title` (which resolves them via a refs pull). `DbGraphAdapter.pageTree`/`blockTree` now keep the Editor API for *structure* (verified not flattened on 2.0.2: 3 roots → 28 nodes) and substitute link uuids with readable names from one ref-target map query (`:block/refs` + `:block/uuid` + `:block/title` — all three verified present, so no new unproven attribute surface and no per-page binding needed). Aliased links (`[[uuid|label]]`) keep their label; unmapped uuids are left verbatim rather than invented; if the map query fails the tree degrades to raw text and logs `ref-resolve-failed`, so a cosmetic lookup can never break an agent run. `FileGraphAdapter` is untouched — file graphs store readable link names.
- **DB-graph misclassification on 2.0.2 beta (four diag timelines, 2026-10-11)**: on a real DB graph the sync settled in `schema-mismatch` instead of the intended `db-adapter-disabled`. Root cause (confirmed by fingerprint evidence `title=2780 content=0` on a live DB graph): the host's `getInfo()` does not report `supportDb: true` on 2.0.2, so the capability gate never opens, `checkCurrentIsDbGraph()` is never consulted, and every DB graph classifies as `file`. Fix: `schema-mismatch` is now treated as an *anomaly worth re-checking* rather than a terminal verdict — its definition ("`:block/page` has rows but `:block/content` returns none") has exactly two causes, real attribute drift **or** a misclassification, so a one-shot schema fingerprint (`:block/title` rows + `:block/content` none → DB) re-checks it and re-runs the guarded path. The probe itself stays zero-query, so healthy file graphs pay nothing extra (R1 preserved). Consequence to note: on 2.0.2, DB-graph identification rides entirely on the fingerprint fallback; `checkCurrentIsDbGraph` remains unverified on this host (manual N1 still worth running from the console).
- **DB-graph startup race**: the host's db worker initializes after plugin load, so early queries reject with `db-worker has not been initialized`. Sync retries those with backoff (6×500 ms), invalidating the probe cache each attempt — no more spurious ❌ toast at startup. The `onCurrentGraphChanged` handler also skips same-graph events (the host re-fires one ~380 ms after boot — N21 confirmed; previously it killed the in-flight first sync).
- **Cross-graph index race (N17)**: the `isSyncing` drop-lock is replaced by a generation token + serialized chain. Switching graphs while a sync is in flight no longer (a) silently abandons the new graph's index, nor (b) lets the old graph's late completion write into the current index (`semantic_search` on B could previously return A's content). Late arrivals — successes *and* errors — are discarded at every await boundary, including mid-embedding-loop, and a discarded round never fires the failure toast. `IndexState.building` now carries its `gen` (fills the Phase 0 scaffold).
# [0.10.1] - 2026-10-11

### Added
- **Graph-type detection** (`src/graph/kind.ts`): the plugin now distinguishes file-based vs Logseq DB graphs at startup, using `App.getInfo().supportDb` as a capability gate and `checkCurrentIsDbGraph()` as the authoritative probe (cached per graph, keyed on `graph.url ?? path`). Detection is intentionally un-caught: a failing probe surfaces as a visible sync error instead of being swallowed.
- **Typed RAG state machine** (`src/graph/types.ts`): `FetchBlocksResult` / `IndexState` / `SearchOutcome` string-discriminated unions replace silent `[]` returns. `syncVectorDB` now has four explicit terminal paths — `ready` / `empty` / `unsupported` / `failed` — exposed via `getIndexState()`.
- **DB-graph guard (Phase 0)**: on a DB graph, indexing stops before any legacy file-schema query runs; the user gets a one-time persistent warning per graph (`ragDbUnsupported`, new i18n key in zh-TW/en), and `semantic_search` / `graph_tag_search` / `global_keyword_search` return declarative `GRAPH_TYPE_UNSUPPORTED` JSON with `results: null` so the agent can no longer conclude "no relevant notes exist" from an unreadable graph.
- **Schema-drift canary**: a file-graph fetch returning zero rows is cross-checked with a cheap `(count ?b)` query; a graph with many blocks but no readable content is reported as `unsupported/schema-mismatch` instead of silently producing an empty index.
- **Structured `semantic_search` results for the LLM**: responses are now `OK` / `NO_MATCH_ABOVE_THRESHOLD` (with threshold) / `GRAPH_HAS_NO_INDEXABLE_BLOCKS` / `INDEX_UNAVAILABLE` (with reason) / `GRAPH_TYPE_UNSUPPORTED`, each carrying a `meaning` field that discourages over-inference from missing results.
- **Tests**: `tests/rag-state.test.ts` (6 sync-path scenarios incl. warm-cache regression) and `tests/tools-unavailable.test.ts` (12 status-string/guard assertions); schema-aware query fake (`tests/helpers/graph-fake.ts`); `fake-indexeddb` dev dependency for IndexedDB success paths.

### Changed
- **Mock hardening**: in `tests/helpers/logseq-mock.ts` every `logseq.DB.*` method now throws `unstubbed logseq.DB.<name>` by default (unstubbed DB calls can no longer pass silently in CI), `App.getInfo` / `App.checkCurrentIsDbGraph` are stubbable, and `getCurrentGraph` returns `{ path, name, url }`.

### Fixed
- **Warm-cache semantic search dead end**: when startup found all embeddings cached, the feature-extraction pipeline was never loaded and `semantic_search` silently returned `[]` forever (pre-existing bug, affects file graphs too). The extractor is now lazily loaded on first search via `ensureExtractor()`.
- **Silent fetch failures**: `fetchLogseqBlocks` no longer catches exceptions and returns `[]`; query failures now propagate to the sync error path (error toast + `failed` state), and the vector DB is cleared on failure/unsupported/empty so a stale index from another graph is never served.

# [0.10.0] - 2026-10-11

### Added
- **Test & CI infrastructure**: `vitest` + `jsdom` unit/e2e suite (`tests/`), `npm run typecheck`/`npm test`, and a new `.github/workflows/ci.yml` running typecheck → test → build on every push/PR. `publish.yml` now runs `npm test` before building.
- **Token-by-token streaming (SSE)**: replies stream into the answer bubble by default (`enableStreaming`, default on). New pure-function layer `src/llm/stream.ts` (`parseSSE`, `ToolCallAccumulator`). Degradation paths: server-ignored stream → JSON parse; `stream:true` rejected with 4xx → automatic one-shot non-stream retry (remembered per `basePath|model` for the session). Idle/connect timeouts (60 s each) enforced.
- **Syntax highlighting**: fenced code blocks are highlighted via `highlight.js` core with 14 explicitly registered languages (incl. Lua). Hand-written light/dark theme through `--ai-hl-*` variables; oversized blocks (>20 000 chars) and unknown languages fall back to escaping.
- **Collapsible tool traces**: each agentic run records a `ToolTraceEntry[]` trace (tool name, argument summary, status, duration) shown under the answer and persisted with the message. Traces are UI-only — never sent to the API or folded into the compression summary.
- **Per-page drafts**: the input draft is kept per page, so switching pages no longer loses an unsent message.
- **`Impeller AI: Purge other graphs' chats` command**: manual, confirm-gated cleanup that deletes `impeller_chat_*` keys belonging to other graphs (never auto-run; current graph untouched).
- **Accessibility**: semantic `<button>` controls with `aria-label`/`aria-expanded`/`aria-controls`, a `role="log"` conversation region (`aria-live="off"`), a visually-hidden `role="status"` announcer updated only at thinking/done/aborted/error nodes, `:focus-visible` rings, and `prefers-reduced-motion` handling.

### Changed
- **Event pipeline rewritten**: a single capture-phase delegation on `parent.document` (installed once, removed on `beforeunload`) replaces per-render `data-on-click` wiring. Model content carries no action attributes; trusted chrome uses a `data-ai-act` allowlist. `provideModel` now exposes only `togglePanel`.
- **Markdown sanitizer hardened**: `renderMarkdown` runs through a dedicated `Marked` instance + DOMPurify with `ALLOW_DATA_ATTR:false`; `[[page|alias]]` is a real inline extension (never fires inside code), GFM task lists render as `☑/☐` spans, and results are memoized (LRU ≈200).
- **Focus & IME safety**: `renderUI` no longer force-focuses the textarea or resets the caret; focus is returned to the input only on a busy→idle transition when nothing else holds it. Composition (`isComposing`/`keyCode 229`) is ignored so IME Enter never sends.
- **Concurrency & state machine**: a single `withRun` owner sets `isBusy`/`processingPageUuid`; page-context updates are generation-guarded (`contextGen`) so stale route callbacks are discarded; graph switches abort any in-flight run before clearing caches. Requests carry a 120 s non-stream timeout and non-JSON/HTTP-status handling.
- **Memory layer**: a non-obfuscated `impeller_idx_*` index (with in-memory cache) replaces the full `localStorage` scan on every render; a single corrupt record no longer empties the whole history list; `buildApiPayload` sends only `{role, content}`.
- **Styles**: all inline styles migrated to `src/ui/styles.ts` behind `--ai-*` tokens; container/shell driven by `.is-collapsed`; bubbles use borders + accent bars instead of shadows; dead `.logseq-page-ref` rules removed.
- **Neutral busy wording**: the `working` notification no longer references the removed Apply feature.
- **Wiki-link guidance softened**: the system prompt now carries a single §4 rule ("MAY wrap likely pages in `[[double square brackets]]`") applying to all replies, replacing the previous page-write-only §5.

### Fixed
- **Compression abort no longer poisons long-term memory**: aborting during auto-compression returns without writing a summary and without issuing the main request (previously the abort marker string was persisted as the summary).
- **Clipboard fallback**: the double-`removeChild` `NotFoundError` is gone; failures now show the error toast, leave no stray textarea, and restore the previously focused element.
- **Graph-switch crash**: in-flight runs no longer throw `TypeError` when the chat store is cleared underneath them (path-vs-prefix comparison bug fixed).

### Removed
- **Smart Apply / Format Page**: the `formatPage` command and its page-write engine (`writeToLogseq`, `parseMarkdownToTree`, `src/engine.ts` → now `src/busyFeedback.ts`) are gone; the sidebar is a pure chat + agentic-tool assistant that never writes AI output back into Logseq blocks.
- **`Custom Tag` setting**: removed with the write engine. Previously saved `tag` values may remain in settings but are ignored (harmless; no migration needed).
- **Dead i18n keys**: `applyBtn`, `stopBtn`, `clearBtn`, `settingResetDesc`, `done`, `baseCondition`, `applyReformat`, `applyContext`, `tagDefault`, `settingTagDesc`.
- **`role === 'tool'` bubble branch**: tool messages are no longer rendered as chat bubbles (superseded by collapsible traces).

# [0.9.7] - 2026-09-04

### Added
- **GitHub Actions CI/CD**: Added `.github/workflows/publish.yml` to automate release builds. When a version tag (e.g., `v0.9.7`) is pushed, the workflow automatically builds the plugin, packages it into a zip file, and attaches it to the GitHub Release.

### Changed
- **Unified Logging System**: Replaced all direct `console.log/error/warn` calls with the centralized `logger` utility. The `info()` and `warn()` methods are now gated by `import.meta.env.DEV`, ensuring sensitive debug output is excluded from production builds while preserving error logs for troubleshooting.
- **Tool Error Sanitization**: Tool execution errors no longer include `error.message` in the response, preventing internal implementation details from being exposed to the LLM.

### Fixed
- **Marked Deprecation Warning**: Removed `marked-mangle` package and related code. Investigation confirmed the warning originates from Logseq core, not this plugin.

### Removed
- **Unused Dependency**: Removed `vite-plugin-logseq` from devDependencies as it was not being used in the build configuration.

# [0.9.6] - 2026-09-03

### Fixed
- **XSS Prevention (Wiki-link Attribute Escape)**: The `[[page-name]]` regex replacement in `renderMarkdown()` now uses a callback function with `escapeHTML()` to sanitize page names before inserting them into HTML attributes. This prevents malicious page names containing `"` from escaping the `data-page-name` attribute boundary and injecting arbitrary HTML attributes.
- **Datalog Injection Hardening**: `escapeDsString()` now escapes control characters (`\n`, `\r`, `\t`, `\f`) in addition to backslashes and double quotes, preventing newline injection attacks in Clojure/Datalog query strings.
- **SSRF Prevention (basePath Validation)**: The `ask()` function now validates `basePath` using `new URL()` with a strict protocol whitelist (`http:` / `https:`), rejecting dangerous schemes like `file://` or `javascript:` before any fetch request is made.
- **Prompt Injection Mitigation**: User input in `sendMsg()` is now capped at 8,000 characters. Inputs exceeding this limit are automatically truncated with a warning notification, preventing context-window flooding attacks.
- **Sensitive Data Leakage**: Removed two `console.log` statements that printed the full request body (including chat history) and model response to the browser console, reducing the risk of API key or conversation data exposure in DevTools.
- **Settings Validation**: `onSettingsChanged()` now validates `basePath` URL format and protocol whenever settings are modified, displaying a warning if the user enters an invalid or non-http(s) endpoint.
- **Clipboard Fallback Deprecation Warning**: Added a `console.warn` before the deprecated `execCommand('copy')` fallback to flag its usage during development.

- **CSS Injection Prevention (Code Block Language)**: The `renderer.code` function now applies `escapeHTML()` to the `lang` parameter before inserting it into the `class="language-${language}"` attribute. This prevents malicious language identifiers containing `"` from escaping the attribute boundary and injecting arbitrary `style` attributes that could bypass DOMPurify sanitization.
- **Tool Execution Parameter Leakage**: Removed the `args` parameter from the console.log statement in `executeToolCall()`, preventing sensitive tool parameters (search queries, block UUIDs, keywords) from being exposed in the browser DevTools console.

### Changed
- **Memory Section Safety Confirmation**: Added an explicit comment in `buildMemorySection()` confirming that `escapeHTML()` is correctly applied to both `data-page-name` attribute values and display text for saved page names.

# [0.9.5] - 2026-09-02

### Added
- **Reasoning Effort Setting**: New `reasoningEffort` option (valid values: `low` / `medium` / `high`) to control the thinking depth of reasoning models (e.g. o3, o4-mini). The field is only sent in the API request body when non-empty, so it has no effect on non-reasoning models.
- **Version Bump Script**: Added `scripts/bump-version.mjs` and `npm run bump` to synchronise version numbers across `package.json`, README badges, and `CHANGELOG.md` in a single command. Zero external dependencies.

### Changed
- **System Prompt Description**: The `systemPromptOverride` setting description now documents the structure of the built-in system prompt (sections §1–§5), so users know exactly what defaults they are overriding without reading source code.

### Fixed
- **Reset Settings Sync**: `resetSettings()` now also resets the new `reasoningEffort` field, keeping the manual default mirror in sync with the settings schema.

# [0.9.4] - 2026-09-02

### Changed
- **RAG Hash Batching**: Replaced sequential per-block `computeContentHash` calls with a single `Promise.all` batch pre-computation, eliminating redundant hash calculations across both sync loops.
- **i18n Type Safety**: Tightened `I18N` dictionary typing from `Record<string, Record<string, string>>` to `as const`-derived literal types (`LangKey`, `I18NKey`), enabling compile-time key validation.
- **`state.t` Typing**: Replaced `any` with `Record<I18NKey, string> | null` in `AppState`, restoring full type protection across all i18n access sites.
- **Dynamic Debug Flag**: `logger.ts` now uses `import.meta.env.DEV` instead of a hardcoded `false`, automatically enabling debug output in development builds.

### Fixed
- **Clipboard Error Logging**: Bound the outer `catch` error variable and included it in the fallback failure log, preventing silent loss of the original clipboard error.
- **Datascript Escape Deduplication**: Extracted duplicated `.replace(/\\/g, '\\\\').replace(/"/g, '\\"')` logic from `rag.ts` and `tools.ts` into a shared `escapeDsString` utility (`src/utils/query.ts`).

# [0.9.3] - 2026-09-01

### Changed
- **Codebase Modularization**: Extracted i18n dictionary, clipboard utilities, logger, and shared markdown helpers into dedicated modules (`src/i18n.ts`, `src/utils/clipboard.ts`, `src/utils/logger.ts`, `src/utils/markdown.ts`).
- **Type Safety**: Replaced loose `any[]` tool call types with strict `ToolCall` / `ToolCallFunction` interfaces.
- **RAG Cache Optimization**: Replaced raw-content cache keys with SHA-256 content hashes for more reliable embedding invalidation.

### Fixed
- **AbortController State**: Fixed nested agent calls clobbering the abort controller by saving/restoring the previous reference.
- **Datalog Injection Safety**: Added proper escaping for user-supplied keywords in Datalog queries (`tools.ts`, `rag.ts`).
- **IndexedDB Connection Leak**: Ensured DB connections are properly closed after read/write transactions.
- **Tab Indentation Parsing**: Normalized tab characters to spaces before computing block indentation depth in the write engine.

# [0.9.2] - 2026-09-01

### Added
- **Full-Graph RAG Scanning**: Removed the legacy content filter that restricted vector indexing to blocks containing `[[wiki-links]]` or `#tags`. The RAG pipeline now ingests every non-empty block across the entire graph, ensuring comprehensive semantic coverage for knowledge retrieval.

## [0.9.1] - 2026-07-18

### Added
- **Customizable Iteration Limit**: Added a `maxIterations` option within the settings page, empowering users to freely adjust the maximum number of AI iterations based on their specific needs.

### Fixed
- **Page Navigation**: Resolved an execution issue with the `openPage` function, ensuring smooth and reliable target page loading.
- **UI Rendering Stability**: Optimized the sidebar rendering mechanism to eliminate visual flickering during content updates and ensures consistent input focus.

## [0.9.0] - 2026-07-08

### Added
- **Persistent Chat History**: Introduced a permanent chat history system complete with a paginated list, allowing users to effortlessly navigate and resume past sessions.
- **Message Timestamps**: Chat messages now feature precise timestamps formatted as `YYYY-MM-DD HH:mm`, providing clear temporal context for all AI interactions.
- **Clear History Failsafe**: Added a designated failsafe confirmation mechanism when attempting to clear the chat history, preventing accidental deletions.

### Changed
- **Advanced Memory Management**: Upgraded the `MemoryManager` to utilize a sliding window approach combined with lossless compression. This significantly expands the effective context capacity without risking token overflow.
- **Sidebar UI & Layout Refactor**: Optimized the sidebar interface to occupy full width for maximum readability. Re-positioned the chat action buttons (`Retry`, `Copy`, `Delete`) to ensure a more intuitive and ergonomic user layout.

## [0.8.0] - 2026-07-01

### Added
- **Rich Markdown Rendering**: Upgraded the AI response interface to fully support standard Markdown syntax, seamlessly rendering headers, blockquotes, tables, and code blocks.
- **Code Block Quick Copy**: Introduced a native "Copy" button to all rendered code blocks, drastically improving the developer workflow and clipboard experience.
- **Native Text Selection**: Enabled cursor text selection across the entire chat conversation, allowing users to effortlessly highlight and copy specific parts of the AI's output.

### Changed
- **UI Architecture Modularization**: Refactored the monolithic UI rendering logic into a clean, decoupled structure to maintain code readability and separation of concerns. Responsibilities are now neatly split across `src/utils/markdown.ts`, `src/ui/styles.ts`, `src/ui/components.ts`, and the core `src/ui.ts`.

## [0.7.0] - 2026-06-24

Added
  - **Repository Map & Cross-File Navigation** : Introduced advanced agentic tools (`get_page_outline`, `read_target_block`, and `global_keyword_search`), empowering the AI to inspect large note hierarchies and perform full-graph Datalog Grep-like searches, entirely overcoming the context window limitations.
  - **Robust Tool Schemas** : Standardized all backend tool descriptions and parameter fields into high-quality English JSON schemas, optimizing tool-calling efficiency and eliminating multi-language interpretation hallucinations for future local LLM extensions.

Changed
  - **God Object Decoupling** : Fully dismantled the monolithic `actions.ts` script into a clean, decoupled "Golden Triangle" architecture (`agent.ts` for reasoning loops, `panel.ts` for UI view logic, and `actions.ts` for lean Logseq controller bridge).
  - **Event Binding Safety** : Flattened the model registration interface within `logseq.provideModel` via object spreading, completely resolving broken UI component callback context issues and implicit `this` binding leaks.

## [0.6.0] - 2026-06-21

### Added
- **Autonomous Agentic Loop**: Impeller AI now autonomously manages tool execution. It dynamically decides whether to use web search, semantic search, or graph queries based on conversation context.
- **Incremental RAG Sync**: Implemented IndexedDB-based embedding cache. Startup times are now near-instant, with background incremental updates for modified blocks only.
- **Cross-Graph Isolation**: Vector databases are now uniquely scoped to the active Logseq graph.
- **Export Chat**: Users can now export entire conversation histories (including system execution traces) to Markdown.
- **Localization**: Added full i18n support for all new background processes and notifications.

### Changed
- **Architecture Refactor**: Stripped all hardcoded tool logic from `actions.ts`. The system now relies on a centralized `tools.ts` registry, following the Open-Closed Principle.
- **Type Definitions**: Updated `ChatMessage` to support tool-calling schemas natively.

## [0.5.0] - 2026-06-09

### Added
- **Smart Memory Management**: Introduced `MemoryManager` with a sliding window approach and auto-compression to prevent context overflow and save API tokens.
- **Advanced Message Controls**: Added hover UI buttons for individual chat messages (Copy, Delete, Regenerate) with robust state handling and iframe clipboard bypass.

### Changed
- **Keyboard UX Optimization**: Intercepted textarea event bubbling for `Enter` (send) and `Shift+Enter` (newline) to prevent conflicts with Logseq's native keybindings.
- **Graceful Task Abort**: Refactored `AbortError` handling to preserve tool execution logs (e.g., Web Search traces) and output a clean summary.
- **Render Optimization & Safeguards**: Automatically prepends a horizontal rule (`---`) to custom tags and added an empty-page check for the Format Page command to prevent unnecessary API calls.

## [0.4.0] - 2026-06-03

### Added
- **Web Search Integration**: Implemented `web_search` tool calling capability to fetch real-time data, current events, and effectively eliminate AI hallucinations.
- **Native Hierarchical Parsing**: Introduced a custom Markdown parser that intelligently converts AI flat text into Logseq's native nested tree structure (`IBatchBlock`).
- **Prompt Engineering Enhancements**: 
  - Dynamic local time injection for accurate temporal context.
  - Strict citation rules enforcing a dedicated "Sources" section.
  - Auto bi-directional linking rules to wrap key entities in `[[ ]]` wiki-links.

### Changed
- **Prompt Management**: Extracted monolithic system instructions into a centralized, dynamically generated `src/prompts.ts` module for better maintainability.
- **Write Engine Optimization**: Upgraded `writeToLogseq` to use `insertBatchBlock` for bulk insertion, completely replacing the legacy flat-list rendering behavior.

## [0.3.0] - 2026-05-27

### Added
- **TypeScript Support**: Full codebase migration to TypeScript, introducing static typing for higher stability and cleaner architecture.
- **Vite Build Pipeline**: Integrated Vite to enable fast HMR (Hot Module Replacement) during development and production-ready bundling.

### Changed
- **Physical Modularization**: Refactored the monolithic `index.js` into dedicated, decoupled modules (`main.ts`, `config.ts`, `ui.ts`, etc.) under the `src/` directory.
- **Marketplace Compatibility**: Updated the build target and `package.json` entry point to `dist/index.html` to prepare for the official Logseq Marketplace release.
- **Optimized Asset Pipeline**: Configured production minification to ensure the plugin asset is ultra-lightweight and standalone.

## [0.2.0] - 2026-05-04

### Added
- **Sidebar Integration**: The UI is now fully integrated into the Logseq Right Sidebar for a more seamless workflow.
- **Stop Button**: Added `AbortController` support to manually cancel AI tasks in progress.
- **Smart Apply Logic**: 
  - **Pure Reformat**: Automatically detects when to only fix indentation without adding text.
  - **Smart Execution**: Analyzes chat history to decide whether to rewrite the page or append new blocks.
- **Background Awareness**: Added notifications (showMsg) when AI completes a task on a background page.
- **Theme Sync**: Enhanced UI using native Logseq CSS variables to match any user theme.

### Changed
- Moved the main interface from a floating portal to the native Right Sidebar.
- Improved the toolbar button styling for better visibility.
- Refactored the internal state management for better stability.

---

## [0.1.0] - 2026-05-01

### Added
- Initial release of **Impeller AI**.
- Basic AI chat interface with page context awareness.
- `AI-Format-Page` command for structured Markdown refactoring.
- Multi-language support (English & Traditional Chinese).
- Customizable API endpoints and model settings.