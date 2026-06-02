# 🌀 Impeller AI

**Impeller AI** is the high-performance engine for your Logseq graph. It brings a deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, fast, and powerful workspace for AI-human collaboration.

Crafted by **TinkerPump (Hanson)**, it acts as a **Universal LLM Portal** that pumps intelligence into your notes while strictly respecting your graph's structure.

---

### 🌟 New in v0.4.0: The Intelligence & Structure Leap

1. **Web Search Integration 🌍** AI now has real-time internet access via Tool Calling. It autonomously fetches current events and factual data to completely eliminate hallucinations, always citing its sources at the end of the response.
2. **Native Hierarchical Parsing 🌳** No more flat lists. The new write engine intelligently parses AI Markdown into Logseq's native nested tree structure (`IBatchBlock`), keeping your outlines perfectly indented and collapsible.
3. **Auto Bi-Directional Linking 🔗** The prompt engine automatically identifies key entities, proper nouns, and core concepts, wrapping them in `[[wiki-links]]` to instantly weave new knowledge into your existing graph.

*(Note: The codebase is fully modularized with Vite & TypeScript for blazing-fast performance since v0.3.0).*

---

### 🚀 Key Features

- **Native Sidebar Integration 🧬** The UI resides seamlessly in your **Right Sidebar**. It stays with you as you navigate through different pages, making it a true companion to your creative flow.
- **Smart "Apply" Logic ✨** The **Impeller** is context-aware. When you click **Apply**:
  - **No Chat History?** It performs a high-fidelity **Reformat**, optimizing your page structure without losing meaning.
  - **With Chat History?** It analyzes your conversation to either **Rewrite** the page or **Append** new ideas precisely where they belong.
- **Total Control (Abort Task) ⏹️** Supported by `AbortController`. Instantly cancel any AI request if you change your mind, saving your API tokens and time.
- **Background Awareness 💬** Working on multiple pages? Impeller keeps track. If an AI task finishes while you're on a different page, a native notification will let you know.

---

### 🛡️ Core Pillars

- **Preservation Protocol**: Strictly preserves all **[[Backlinks]]** and **#Tags**. Your graph connectivity is never compromised.
- **BYOE (Bring Your Own Engine)**: Connect to any LLM (OpenAI, Claude, OpenRouter) via custom API endpoints.
- **Theme Synchronized**: Automatically adapts to your Logseq theme (Dark/Light) using native CSS variables.

---

### 📦 Usage

- **Activate**: Click the **AI Assistant** text in your toolbar to toggle the **Impeller Sidebar**.
- **Interact**: Type your needs (**Enter** to send, **Shift+Enter** for newline).
- **Reflow**: Click **✨ Apply** to transform your notes or execute complex instructions.
- **Stop**: Use the **⏹️** button to cancel an ongoing generation.

---

### 🛠️ Configuration

Configure via Logseq Settings:
- **API Key**: Your secret key for the LLM.
- **Model**: Your preferred model (e.g., `openai/gpt-4o-mini`).
- **Web Search API Key**: Your search engine API key (e.g., Tavily) to enable AI internet access.
- **Base Path**: Custom endpoints for OpenRouter or Local LLMs.
- **Custom Tag**: Define the header under which AI results are placed.

### 📺 Video Demo

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(Note: Video demonstrates core features and interface)*

---

## 🗺️ Roadmap

Impeller AI is under active development. Here is what's coming next:

- **v0.5.0 (Goal)**: 
  - [ ] **Local LLM Support**: Seamless integration with Ollama and LM Studio for offline privacy.
  - [ ] **Onboarding Experience**: Improved settings UI and first-time user guide.
- **v0.6.0 (Vision)**: 
  - [ ] **Custom Prompt Library**: Allow users to save and trigger specific workflows.
  - [ ] **Cross-Page Context**: Give AI the ability to read multiple referenced pages at once.

---

## 📜 Versioning & Changes

We use [Semantic Versioning](https://semver.org/) for this project.  
Check out the [CHANGELOG.md](./CHANGELOG.md) for full release notes and update history.

---

### 📄 License

This project is licensed under the **MIT License**.