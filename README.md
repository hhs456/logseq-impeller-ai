# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.9.4-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Logseq](https://img.shields.io/badge/Logseq-Plugin-0f172a?logo=logseq)

🌐 **Language / 語言**: [English](./README.md) | [繁體中文](./README.zh-TW.md)

---

**Impeller AI** is a high-performance autonomous AI engine tailored for your Logseq graph. It features deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, lightning-fast, and powerful workspace for AI-human collaboration.

Acting as a **Universal LLM Portal**, it pumps contextual intelligence directly into your outlines while strictly respecting your graph's native structure.

### 📸 See it in Action

`0.5.0`
|<img src="./img/screenshot_format.jpg" width="400" alt="Format Page Feature">|<img src="./img/screenshot_copy.jpg" width="400" alt="Advanced Message Controls">|
|:---:|:---:|
| *Smart Hierarchical Formatting* | *Quick Chat Actions (Copy/Regenerate)* |

`0.6.0`
|<img src="./img/screenshot_rag.jpg" width="400" alt="Incremental RAG Sync">|<img src="./img/screenshot_export.jpg" width="400" alt="Export Chat Feature">|
|:---:|:---:|
|<img src="./img/screenshot_rag_2.jpg" width="400" alt="Incremental RAG Sync">|<img src="./img/screenshot_export_2.jpg" width="400" alt="Export Chat Feature">|
| *Incremental RAG Sync* | *One-Click Chat Export* |

`0.7.0`
|<img src="./img/screenshot_auto_serach.jpg" width="400" alt="Agentic Call Traces">|<img src="./img/screenshot_code_review.jpg" width="400" alt="Cross-file Structure Assembly">|
|:---:|:---:|
| *Autonomous Web & KB Exploration* | *Graph Navigation (Precise Line-Level Targeting)* |

`0.8.0`
|<img src="./img/screenshot_md_header.jpg" width="400" alt="Markdown Headers">|<img src="./img/screenshot_md_link&list.jpg" width="400" alt="Markdown Links and Lists">|
|:---:|:---:|
| *Rich Rendering: Headers* | *Rich Rendering: Links & Lists* |
|<img src="./img/screenshot_md_block&table.jpg" width="400" alt="Markdown Blockquotes & Tables">|<img src="./img/screenshot_md_code.jpg" width="400" alt="Markdown Code Blocks">|
| *Rich Rendering: Blockquotes & Tables* | *Rich Rendering: Code Blocks (Copyable)* |

`0.9.0`
|<img src="./img/screenshot_history.jpg" width="800" alt="Persistent Chat History">|
|:---:|
| *Persistent Paged Chat History* |


---

## Core Features

Impeller AI deeply integrates with Logseq's block ecosystem. It is not just a chat UI, but an autonomous inference engine running directly inside your workspace:

### 🧠 Autonomous Agentic Engine
* **Dynamic Tool Calling (Up to 7 Iterations)**: Powered by a robust reasoning loop (`maxIterations: 7`). The AI autonomously decides when to trigger `semantic_search` (local vector base), global keyword queries (Datalog), or `web_search`.
* **Strict Anti-Hallucination**: System prompts force the AI to use `web_search` for current affairs and append a mandatory "Sources" citation section, strictly separating facts from inferences.
* **Incremental RAG & IndexedDB Cache**: Built on Orama and Transformers.js (`bge-small-zh-v1.5`). Vector embeddings are persistently cached in IndexedDB (`ImpellerRAG_Cache`). Startup performs a lightning-fast background diff-sync, updating only newly modified blocks.
* **Full-Graph Semantic Scanning**: The RAG indexing pipeline now scans every non-empty block across the entire graph, removing the legacy filter that restricted embedding to blocks containing `[[wiki-links]]` or `#tags`. This ensures comprehensive semantic coverage for knowledge retrieval.

### 🌳 Native Block & Context Processing
* **AST-to-Nested Blocks**: Bypasses plain text limitations. An internal AST parser (`parseMarkdownToTree`) converts AI Markdown directly into Logseq's native nested parent-child blocks. It also auto-prepends a horizontal divider and custom tag (e.g., `--- \n#AI`) for visual cleanliness.
* **Auto Bi-Directional Linking**: Prompt-level constraints instruct the AI to automatically identify core concepts and wrap them in `<span class="logseq-page-ref">Wiki-links</span>` during generation.
* **Advanced Memory Management & Auto-Compression**: Powered by an upgraded `MemoryManager` that utilizes a sliding window approach combined with lossless compression. This significantly expands the effective context capacity without risking token overflow, seamlessly preserving your long-term conversation context.

### ✨ Polished Sidebar Workflow
* **Persistent History & Timestamps (New in v0.9.0!)**: Introduced a permanent chat history system with a paginated list, allowing effortless navigation to resume past sessions. Every interaction is grounded with precise timestamps (`YYYY-MM-DD HH:mm`).
* **Sidebar Layout Refactor (New in v0.9.0!)**: Ergonomically optimized sidebar interface that intelligently occupies full width for maximum readability.
* **Rich Markdown Rendering**: Full native Markdown rendering out of the box. Output effortlessly displays layered **Headers**, precise **Links**, native **Lists**, elegant **Blockquotes**, complex **Tables**, and syntax-highlighted **Code** blocks.
* **Smart Apply Logic**: The "Apply" command dynamically analyzes chat context. It intelligently switches between `applyReformat` (pure structural indentation fixing without adding text) and `applyContext` (appending newly generated blocks).
* **Zero-Friction Markdown Clipboard**: Hovering over chat messages reveals intuitively re-positioned controls (Copy, Regenerate, Delete). Copying extracts pre-processed pure Markdown directly from the DOM, preventing HTML pollution.
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
- **Conversations**: Write your instructions at the input box. Press `Enter` to submit or `Shift+Enter` for a newline. Navigate previous sessions easily with the new **paginated chat history**.
- **Chat Node Actions**: Hover over any response bubble to reveal ergonomically re-positioned node controls:
  - **📋 Copy**: Instantly snapshots responses (bypasses iframe sandbox boundaries).
  - **⏹️ Delete**: Destroys the prompt node and safely slices all forward context to maintain continuity.
  - **🔄 Regenerate**: Force re-evaluates the node step with automatic structural rollback safeguards.
- **Action Buttons**:
  - **✒️ Format**: Executes contextual page layout rewrites or insight insertion.
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
- **Custom Tag**: Define the tag header for inserted structural updates (e.g., `#AI`). Impeller natively prepends a clean `---` horizontal division rule right before the block for cleaner layout visuals.
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