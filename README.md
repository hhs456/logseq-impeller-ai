# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.5.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Logseq](https://img.shields.io/badge/Logseq-Plugin-0f172a?logo=logseq)

**Impeller AI** is the high-performance engine for your Logseq graph. It brings a deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, fast, and powerful workspace for AI-human collaboration.

Crafted by **TinkerPump (Hanson)**, it acts as a **Universal LLM Portal** that pumps intelligence into your notes while strictly respecting your graph's structure.

### 📸 See it in Action

|<img src="./img/screenshot_format.jpg" width="400" alt="Format Page Feature">|<img src="./img/screenshot_copy.jpg" width="400" alt="Advanced Message Controls">|
|:---:|:---:|
| *Intelligent Native Hierarchical Formatting* | *Advanced Message Controls (Copy/Regenerate)* |

---

### 🌟 New in v0.5.0: The Memory & Control Evolution

1. **Smart Memory Management 🧠** Say goodbye to context overflow and wasted API tokens! The new `MemoryManager` introduces a sliding window mechanism and intelligently auto-compresses long conversations into concise summaries behind the scenes.
2. **Advanced Message Controls 🕹️** Hover over any chat bubble to unlock precise controls: **Copy 📋** (bypassing iframe restrictions), **Delete ⏹️** (safely slicing subsequent history to maintain continuity), and **Regenerate 🔄** (with auto-rollback if the generation fails). 
3. **Refined UX & Graceful Aborts 🛡️** Keyboard inputs (**Enter** to send, **Shift+Enter** to newline) are now perfectly isolated, preventing any conflicts with Logseq's native hotkeys. Plus, aborting a task now elegantly preserves tool execution traces (like Web Search logs) instead of just throwing an error.

*(Note: The write engine also received an upgrade, automatically prepending `---` separators to custom tags for cleaner block rendering!)*

---

### 🚀 Core Features

Impeller AI is not just a chat wrapper; it's deeply integrated into the Logseq ecosystem to respect and enhance your graph network.

- **Native Hierarchical Engine 🌳**: No more flat text walls. Impeller intelligently parses AI-generated Markdown into Logseq's native nested tree structure (`IBatchBlock`), keeping your outlines perfectly indented and collapsible.
- **Web-Grounded Intelligence 🌍**: Equipped with Tool Calling capabilities, the AI can autonomously search the web for current events and real-time data, completely eliminating hallucinations and citing its sources.
- **Smart Memory Management 🧠**: Never worry about token limits or context overflow. The built-in `MemoryManager` uses a sliding window and automatically compresses older conversations into concise summaries behind the scenes.
- **Context-Aware Formatting (✒️Format) ✨**: The formatting engine dynamically adapts to your current state:
  - **Empty Page?** Safe-guards prevent unnecessary API calls.
  - **No Chat History?** Performs a high-fidelity **Reformat** of your existing page structure without losing the original meaning.
  - **With Chat History?** Analyzes your conversation to intelligently weave AI insights, rewriting or appending data precisely where it belongs.
- **Non-Intrusive UX 🛡️**: Designed for power users. Features completely isolated keyboard events (preventing Logseq hotkey conflicts), granular message controls, and graceful task aborts that preserve your web search traces.
- **Background Awareness 💬**: Working on multiple pages? Impeller keeps track. If an AI task finishes while you're on a different page, a native notification will let you know.

---

### 📥 Installation (Unpacked Plugin)

Currently, Impeller AI is in active development. You can install it manually in a few simple steps:

1. Download this repository (Click `Code` -> `Download ZIP` on GitHub) and extract the folder to a safe location on your computer.
2. Open Logseq. Click the three-dot menu `...` in the top right corner and select **Settings**.
3. Go to the **Advanced** tab and toggle on **Developer mode**.
4. Close Settings, click the three-dot menu `...` again, and select **Plugins**.
5. Click the **Load unpacked plugin** button and select the extracted `logseq-impeller-ai` folder.
6. The plugin is now active!

---

### 📦 Usage

Impeller UI lives directly in your **Right Sidebar**, staying with you as a persistent companion across different pages.

- **Activate**: Click the **AI Assistant** text in your toolbar to toggle the **Impeller Sidebar**.
- **Chat & Ideate**: Type your needs in the input box. Press **Enter** to send, or **Shift+Enter** for a newline.
- **Message Controls**: Hover over any chat bubble to reveal advanced actions:
  - **📋 Copy**: Instantly copy the AI's response (bypasses iframe restrictions).
  - **⏹️ Delete**: Remove a user prompt and seamlessly slice all subsequent history to maintain context continuity.
  - **🔄 Regenerate**: Force the AI to re-think a specific node with safe rollback mechanisms.
- **Action Buttons**:
  - **✒️ Format**: Execute complex instructions or reformat your current page based on the chat context.
  - **🧹 Clear**: Wipe the current page's chat history to start a fresh conversation.
  - **■ Stop**: Instantly abort an ongoing AI generation and preserve the partial trace.

---

### 🛠️ Configuration

Configure via Logseq Settings (accessible via the plugin menu):

- **API Key**: Your secret key for the chosen LLM provider.
- **Model**: Your preferred model (e.g., `openai/gpt-4o-mini`, `anthropic/claude-3-haiku`).
- **Base Path**: Custom endpoints. Perfect for routing through OpenRouter, proxy servers, or connecting to Local LLMs (like Ollama/LM Studio).
- **Web Search API Key**: (Optional) Your search engine API key (e.g., Tavily) to enable the AI's real-time internet access.
- **Custom Tag**: Define the header tag under which AI results are placed (e.g., `#AI`). Impeller now automatically prepends a clean `---` horizontal rule before this tag for beautiful block separation.

---

### 📺 Video Demo

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(Note: This video demonstrates the core interface and workflow from **v0.2.0**. While the basic interaction remains the same, newer capabilities like Web Search, Memory Management, and Advanced Message Controls are not shown but follow the same intuitive design.)*

---

## 🗺️ Roadmap

Impeller AI is under active development. Here is what's coming next:

- **v0.6.0 (Goal)**: 
  - [ ] **Cross-Page Context**: Give AI the ability to read multiple referenced pages or blocks at once for deeper graph awareness.
  - [ ] **Enhanced Bi-Directional Linking**: Smarter automatic generation and weaving of `[[wiki-links]]` based on conversation context.
- **v0.7.0 (Vision)**: 
  - [ ] **Local LLM Support**: Seamless integration with Ollama and LM Studio for offline privacy.
  - [ ] **Onboarding Experience**: Improved settings UI and first-time user guide.
  - [ ] **Custom Prompt Library**: Allow users to save and trigger specific workflows.

---

## 🐞 Feedback & Issues

Found a bug or have a feature request? We'd love to hear from you!  
Please feel free to [open an issue](https://github.com/hhs456/logseq-impeller-ai/issues) on GitHub.

---

## 📜 Versioning & Changes

We use [Semantic Versioning](https://semver.org/) for this project.  
Check out the [CHANGELOG.md](./CHANGELOG.md) for full release notes and update history.

---

### 📄 License

This project is licensed under the **MIT License**.