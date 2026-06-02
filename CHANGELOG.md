# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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