# 🌀 Impeller AI

**Impeller AI** is the high-performance engine for your Logseq graph. It brings a deep, type-safe integration with the **Logseq Right Sidebar**, providing a natural, fast, and powerful workspace for AI-human collaboration.

Crafted by **TinkerPump (Hanson)**, it acts as a **Universal LLM Portal** that pumps intelligence into your notes while strictly respecting your graph's structure.

---

### 🌟 New in v0.3.0: The Industrial-Grade Evolution

1. **Vite & TypeScript Engine ⚡** The entire plugin has been refactored from scratch using TypeScript and Vite. This physical modularization ensures blazing-fast UI responsiveness, ultra-lightweight asset footprint, and robust stability.
2. **Marketplace Ready 📦** Fully optimized bundling pipeline compiled into a standalone `dist/` distribution, perfectly aligned with the official Logseq Marketplace standard.

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
- **Base Path**: Custom endpoints for OpenRouter or Local LLMs.
- **Custom Tag**: Define the header under which AI results are placed.

### 📺 Video Demo

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(Note: Video demonstrates core features and interface)*

---

## 🗺️ Roadmap

Impeller AI is under active development. Here is what's coming next:

- **v0.4.0 (Planned)**: 
  - [ ] **AI Tool Calling**: Let the AI decide when to apply changes or search.
  - [ ] **Web Search**: Real-time information fetching.
- **v0.5.0 (Goal)**: 
  - [ ] **Local LLM Support**: Seamless integration with Ollama and LM Studio.
  - [ ] **Onboarding Experience**: Improved settings and first-time guide.

---

## 📜 Versioning & Changes

We use [Semantic Versioning](https://semver.org/) for this project.  
Check out the [CHANGELOG.md](./CHANGELOG.md) for full release notes and update history.

---

### 📄 License

This project is licensed under the **MIT License**.