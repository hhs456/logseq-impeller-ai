# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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