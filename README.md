# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.7.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Logseq](https://img.shields.io/badge/Logseq-Plugin-0f172a?logo=logseq)

🌐 **Language / 語言**: [English](./README.md) | [繁體中文](./README.zh-TW.md)

---

**Impeller AI** is a high-performance autonomous AI engine tailored for your Logseq graph. It features deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, lightning-fast, and powerful workspace for AI-human collaboration.

Acting as a **Universal LLM Portal**, it pumps contextual intelligence directly into your outlines while strictly respecting your graph's native structure.

### 📸 See it in Action

|<img src="./img/screenshot_format.jpg" width="400" alt="Format Page Feature">|<img src="./img/screenshot_copy.jpg" width="400" alt="Advanced Message Controls">|
|:---:|:---:|
| *Intelligent Native Hierarchical Formatting* | *Advanced Message Controls (Copy/Regenerate)* |

---

## Core Features

Impeller AI deeply integrates with Logseq's block ecosystem. It is not just a chat UI, but an autonomous inference engine running directly inside your workspace:

### 🧠 Autonomous Agentic Engine
* **Dynamic Tool Calling (Up to 7 Iterations)**: Powered by a robust reasoning loop (`maxIterations: 7`). The AI autonomously decides when to trigger `semantic_search` (local vector base), global keyword queries (Datalog), or `web_search`.
* **Strict Anti-Hallucination**: System prompts force the AI to use `web_search` for current affairs and append a mandatory "Sources" citation section, strictly separating facts from inferences.
* **Incremental RAG & IndexedDB Cache**: Built on Orama and Transformers.js (`bge-small-zh-v1.5`). Vector embeddings are persistently cached in IndexedDB (`ImpellerRAG_Cache`). Startup performs a lightning-fast background diff-sync, updating only newly modified blocks.

### 🌳 Native Block & Context Processing
* **AST-to-Nested Blocks**: Bypasses plain text limitations. An internal AST parser (`parseMarkdownToTree`) converts AI Markdown directly into Logseq's native nested parent-child blocks. It also auto-prepends a horizontal divider and custom tag (e.g., `--- \n#AI`) for visual cleanliness.
* **Auto Bi-Directional Linking**: Prompt-level constraints instruct the AI to automatically identify core concepts and wrap them in `[[Wiki-links]]` during generation.
* **Auto-Compression Memory**: Implements a strict token-saving mechanism. When the chat history exceeds 12 messages, a background worker automatically compresses the oldest 6 messages into a concise summary, preserving long-term context while strictly limiting the sliding window.

### ✨ Polished Sidebar Workflow
* **Smart Apply Logic**: The "Apply" command dynamically analyzes chat context. It intelligently switches between `applyReformat` (pure structural indentation fixing without adding text) and `applyContext` (appending newly generated blocks).
* **Zero-Friction Markdown Clipboard**: Hovering over chat messages reveals precise controls (Copy, Regenerate, Delete). The copy function extracts the pre-processed `rawMarkdown` directly from the DOM dataset, preventing browser HTML pollution and preserving pure Logseq formatting.
* **Non-Blocking & Exportable**: Supports manual task cancellation via `AbortController`. You can easily export entire chat histories (including tool execution traces) to a clean Markdown file via the Command Palette (`export-ai-chat`).

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
- **Conversations**: Write your instructions at the input box. Press `Enter` to submit or `Shift+Enter` for a newline.
- **Chat Node Actions**: Hover over any response bubble to reveal node controls:
  - **📋 Copy**: Instantly snapshots responses (bypasses iframe sandbox boundaries).
  - **⏹️ Delete**: Destroys the prompt node and safely slices all forward context to maintain continuity.
  - **🔄 Regenerate**: Force re-evaluates the node step with automatic structural rollback safeguards.
- **Action Buttons**:
  - **✒️ Format**: Executes contextual page layout rewrites or insight insertion.
  - **🧹 Clear**: Flushes the active page's thread store to restart fresh.
  - **■ Stop**: Kills hanging remote server requests while gracefully preserving tool logs and partial traces.
  - **📥 Export**: Instantly exports your conversation logs and system tool execution traces into structured local Markdown files. Can also be invoked via the Command Palette (`Ctrl+Shift+P` -> `Export Chat`).

---

### 🛠️ Configuration

Adjust the values directly inside the official Logseq Plugin Settings panel:

- **API Key**: Your secret token for the chosen inference provider.
- **Model**: Your target LLM deployment identifier (e.g., `openai/gpt-4o-mini`, compatible with any standard OpenAI-spec formats).
- **Base Path**: Custom connection routing. Ideal for connecting with OpenRouter, API gateways, or disconnected local endpoints (e.g., Ollama / LM Studio).
- **Web Search API Key**: *(Optional)* Insert your Tavily API string to unlock real-time search grounding and automated factual checking.
- **Custom Tag**: Define the tag header for inserted structural updates (e.g., `#AI`). Impeller natively prepends a clean `---` horizontal division rule right before the block for cleaner layout visuals.
- **Smart Indexing Performance**: Initial setup processes a full sync pass across your graph nodes; all successive workflows load instantly via localized difference cache layers.

---

### 📺 Video Demo

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(Note: This video demonstrates the core interface and workflow from **v0.2.0**. While the basic interaction remains the same, newer capabilities like Web Search, Memory Management, and Advanced Message Controls are not shown but follow the same intuitive design.)*

---

## 🐞 Feedback & Issues

Found a bug or have an optimization idea? We'd love to hear from you! Please feel free to [open an issue](https://github.com/hhs456/logseq-impeller-ai/issues) on GitHub.

---

## 📜 Versioning & Releases

We strictly follow [Semantic Versioning](https://semver.org/). For full change logs and fine-grained version trace records, check out the dedicated [CHANGELOG.md](./CHANGELOG.md).

---

### 📄 License

This project is open-sourced under the **MIT License**.