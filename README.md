# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.10.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Logseq](https://img.shields.io/badge/Logseq-Plugin-0f172a?logo=logseq)

🌐 **Language / 語言**: [English](./README.md) | [繁體中文](./README.zh-TW.md)

---

**Impeller AI** is a high-performance autonomous AI engine tailored for your Logseq graph. It features deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, lightning-fast, and powerful workspace for AI-human collaboration.

Acting as a **Universal LLM Portal**, it pumps contextual intelligence directly into your outlines while strictly respecting your graph's native structure.

### 📸 See it in Action

Screenshots for each version (0.5.0 – 0.9.0) are available in [SCREENSHOTS.md](https://github.com/hhs456/logseq-impeller-ai/blob/main/SCREENSHOTS.md).

---

## Core Features

Impeller AI deeply integrates with Logseq's block ecosystem. It is not just a chat UI, but an autonomous inference engine running directly inside your workspace:

### 🧠 Autonomous Agentic Engine
* **Dynamic Tool Calling (Up to 7 Iterations)**: Powered by a robust reasoning loop (`maxIterations: 7`). The AI autonomously decides when to trigger `semantic_search` (local vector base), global keyword queries (Datalog), or `web_search`.
* **Strict Anti-Hallucination**: System prompts force the AI to use `web_search` for current affairs and append a mandatory "Sources" citation section, strictly separating facts from inferences.
* **Incremental RAG & IndexedDB Cache**: Built on Orama and Transformers.js (`bge-small-zh-v1.5`). Vector embeddings are persistently cached in IndexedDB (`ImpellerRAG_Cache`). Startup performs a lightning-fast background diff-sync, updating only newly modified blocks.
* **Full-Graph Semantic Scanning**: The RAG indexing pipeline now scans every non-empty block across the entire graph, removing the legacy filter that restricted embedding to blocks containing `[[wiki-links]]` or `#tags`. This ensures comprehensive semantic coverage for knowledge retrieval.

### 🌳 Native Block & Context Processing
* **Clickable Wiki-Links**: Chat replies may contain clickable `[[bidirectional links]]`; clicking one navigates to the page when it exists (missing pages are flagged instead of silently created).
* **Advanced Memory Management & Auto-Compression**: Powered by an upgraded `MemoryManager` that utilizes a sliding window approach combined with lossless compression. This significantly expands the effective context capacity without risking token overflow, seamlessly preserving your long-term conversation context.

### ✨ Polished Sidebar Workflow
* **Persistent History & Timestamps**: A permanent per-page chat history backed by a lightweight index, surfaced as a horizontal **memory rail** of past chats above the conversation for one-click resume. Every interaction is grounded with precise timestamps (`YYYY-MM-DD HH:mm`).
* **Sidebar Layout Refactor**: Ergonomically optimized sidebar interface that intelligently occupies full width for maximum readability.
* **Token-by-Token Streaming**: Replies stream over SSE by default, rendering incrementally into the answer bubble. Endpoints that reject `stream:true` automatically fall back to a full reply, and malformed/incomplete tool-call fragments are never executed on abort.
* **Rich Markdown Rendering & Syntax Highlighting**: Full native Markdown out of the box — layered **Headers**, **Links**, **Lists**, **Blockquotes**, complex **Tables**, GFM task lists, and **syntax-highlighted Code** blocks (14 languages via highlight.js, light/dark aware).
* **Visible Chat Controls & Markdown Clipboard**: Copy, Regenerate and Delete controls are shown directly beneath each bubble (no hover required). Copying extracts pre-processed pure Markdown from the DOM, preventing HTML pollution.
* **Collapsible Tool Traces**: Agentic tool calls (semantic search, graph queries, web search) record a collapsible **tool trace** under the answer, showing each tool, its arguments and timing — persisted with the message but never sent back to the API.
* **Non-Blocking & Exportable**: Supports manual task cancellation via `AbortController`. Export entire chat histories (including tool execution traces) to clean Markdown via the Command Palette (`export-ai-chat`).

---

### 📥 Installation (Unpacked Plugin)

1. Download this repository (Click `Code` -> `Download ZIP` on GitHub) and extract the folder to a safe location on your computer.
2. Open Logseq. Click the three-dot menu `...` in the top right corner and select **Settings**.
3. Go to the **Advanced** tab and toggle on **Developer mode**.
4. Close Settings, click the three-dot menu `...` again, and select **Plugins**.
5. Click the **Load unpacked plugin** button and select the extracted `logseq-impeller-ai` folder.
6. The plugin is now active!

---

### 📦 Usage Guide

The Impeller UI lives permanently inside your **Right Sidebar**, acting as a persistent creative companion across pages.

- **Toggle Sidebar**: Click the **AI Assistant** link in your toolbar to show/hide the panel.
- **Conversations**: Write your instructions at the input box. Press `Enter` to submit or `Shift+Enter` for a newline. Resume past chats from the **memory rail** above the conversation.
- **Chat Node Actions**: Controls are shown beneath each bubble:
  - **📋 Copy**: Instantly snapshots responses (bypasses iframe sandbox boundaries).
  - **⏹️ Delete**: Destroys the prompt node and safely slices all forward context to maintain continuity.
  - **🔄 Regenerate**: Force re-evaluates the node step with automatic structural rollback safeguards.
- **Action Buttons**:
  - **🧹 Clear**: Flushes the active page's thread store to restart fresh. Includes a **failsafe confirmation mechanism** to prevent accidental context deletion.
  - **■ Stop**: Kills hanging remote server requests while gracefully preserving tool logs and partial traces.
  - **📥 Export**: Instantly exports your conversation logs and system tool execution traces into structured local Markdown files.

---

### 🛠️ Configuration

Adjust the values directly inside the official Logseq Plugin Settings panel:

- **API Key**: Your secret token for the chosen inference provider.
- **Model**: Your target LLM deployment identifier (e.g., `openai/gpt-4o-mini`, compatible with any standard OpenAI-spec formats).
- **Base Path**: Custom connection routing. Ideal for connecting with OpenRouter, API gateways, or disconnected local endpoints (e.g., Ollama / LM Studio).
- **Web Search API Key**: *(Optional)* Insert your Tavily API string to unlock real-time search grounding and automated factual checking.
- **Enable Streaming (SSE)**: *(Default on)* Token-by-token replies. Endpoints that reject streaming automatically fall back to full replies.
- **Smart Indexing Performance**: Initial setup processes a full sync pass across your graph nodes; all successive workflows load instantly via localized difference cache layers.

---

### 📺 Video Demo

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(Note: This video demonstrates the core interface and workflow from **v0.2.0**. While the basic interaction remains the same, newer capabilities like Persistent History, Web Search, System Traces, and Advanced Message Controls are not shown but follow the same intuitive design.)*

---

## 🐞 Feedback & Issues

Found a bug or have an optimization idea? We'd love to hear from you! Please feel free to [open an issue](https://github.com/hhs456/logseq-impeller-ai/issues) on GitHub.

---

## 📜 Versioning & Releases

We strictly follow [Semantic Versioning](https://semver.org/). For full change logs and fine-grained version trace records, check out the dedicated [CHANGELOG.md](./CHANGELOG.md).

---

### 📄 License

This project is open-sourced under the **MIT License**.