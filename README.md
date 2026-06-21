# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.6.0-blue.svg)
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

### 🚀 Core Features

Impeller AI goes far beyond basic API chat wrappers by natively interweaving with the Logseq block ecosystem.

- **Autonomous Agentic Engine 🤖**: Powered by a robust reasoning loop. The AI autonomously orchestrates backend tool calls—triggering `semantic_search` across your vector brain, Datalog-driven `graph_tag_search`, or live Google/Tavily web queries—to fetch the absolute best answer based on context.
- **Lightning-Fast Incremental RAG ⚡**: Built on top of Orama and Transformers.js, featuring persistent IndexedDB caching. Startup is immediate as it only indexes mutated blocks dynamically in the background. Full **Cross-Graph Brain Isolation** guarantees workspace data separation.
- **Native Hierarchical Trees 🌳**: Rejects flat text walls. The AST compiler maps AI Markdown directly into Logseq's native nested tree nodes (`IBatchBlock`), keeping your workflows cleanly indented and collapsible.
- **Sliding-Window Memory 🧠**: Managed gracefully by a smart `MemoryManager` that dynamically sliding-slices older threads and automatically condenses overflowing contexts into clean background summaries to save your API tokens.
- **Context-Aware Formatting (✒️Format) ✨**: The layout engine dynamically alters its behavior based on layout state:
  - **Empty Page?** Intercepts unnecessary operations to prevent wasting remote API usage.
  - **No Active History?** Runs high-fidelity structural reformatting and style polishing over your current page.
  - **With History?** Deeply maps the context to append or weave new intelligence precisely where it belongs.
- **Isolated Power-User UX 🛡️**: Designed for fluent hotkey operations. Safely isolates `Enter` (Send) and `Shift+Enter` (Newline) bubble propagation to prevent conflicts with Logseq keybindings. Offers click controls for individual messages (Clipboard bypass copy/Context slicing delete/Safe rollbacked regenerate).

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