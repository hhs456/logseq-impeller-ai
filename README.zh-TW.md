# 🌀 Impeller AI

![Version](https://img.shields.io/badge/version-v0.6.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Logseq](https://img.shields.io/badge/Logseq-Plugin-0f172a?logo=logseq)

🌐 **Language / 語言**: [English](./README.md) | [繁體中文](./README.zh-TW.md)

---

**Impeller AI** 是專為你的 Logseq 知識圖譜打造的高效能自主 AI 引擎。它與 **Logseq 右側邊欄 (Right Sidebar)** 深度整合，提供一個自然、快速且強大的 AI-人類協作工作區。

由 **TinkerPump (Hanson)** 精心打造，它作為一個 **通用 LLM 入口面板**，在嚴格遵循並尊重你知識圖譜原生結構的前提下，為你的筆記源源不絕地泵入智慧。

### 📸 功能預覽

|<img src="./img/screenshot_format.jpg" width="400" alt="Format Page Feature">|<img src="./img/screenshot_copy.jpg" width="400" alt="Advanced Message Controls">|
|:---:|:---:|
| *智慧原生階層格式化* | *進階對話控制 (複製/重新生成)* |

---

## 核心功能

Impeller AI 深度整合 Logseq 底層架構，它不僅是一個對話側邊欄，而是真正在你工作區內運作的自動化代理引擎：

### 🧠 自動化代理與檢索 (Agentic Engine)
* **動態工具調用 (最高 7 次迭代)**：內建強大的推理迴圈。AI 會根據上下文，自主決定觸發 `semantic_search` (本地向量庫)、全域關鍵字查詢 (Datalog)，或是 `web_search` (網路搜尋)。
* **嚴格防幻覺機制**：System Prompt 強制要求 AI 在面對時事或未知數據時，必須呼叫網路搜尋，並在文末嚴格附上「參考來源 (Sources)」，將事實與推理分開。
* **增量 RAG 與 IndexedDB 快取**：底層結合 Orama 與 Transformers.js。向量特徵值會持久化儲存於 IndexedDB (`ImpellerRAG_Cache`) 中。系統啟動時僅針對「已修改的區塊」進行背景差異同步，實現極速啟動。

### 🌳 原生區塊與上下文處理
* **AST 巢狀區塊寫入**：內建 AST 解析器 (`parseMarkdownToTree`)，將 AI 產出的 Markdown 精準映射為 Logseq 原生的父子巢狀區塊。插入時會自動加上水平分割線與自訂標籤 (例如：`--- \n#AI`) 以保持版面整潔。
* **自動雙向連結感知**：透過 Prompt 約束，AI 在生成內容時會自動識別核心概念與專有名詞，並主動包覆 `[[雙向連結]]`，無縫融入你的圖譜。
* **記憶體自動壓縮**：嚴格的 Token 控管機制。當歷史訊息超過 12 筆，系統會在背景自動將最舊的 6 筆對話壓縮成「精華摘要」，在保留長期脈絡的同時，完美控制 API 成本。

### ✨ 流暢的側邊欄工作流
* **智慧套用邏輯 (Smart Apply)**：「✨ 套用」按鈕會動態分析對話狀態。自動判斷是要執行 `applyReformat` (純重構：僅修復縮排不新增資訊)，還是 `applyContext` (智慧執行：附加新產出的區塊)。
* **無損 Markdown 剪貼簿**：懸停對話即可觸發控制選單 (複製、重新生成、刪除)。複製功能會直接抓取預處理好的 `rawMarkdown`，繞過瀏覽器 DOM 渲染污染，確保貼上時保有最純淨的 Logseq 縮排格式。
* **非同步執行與匯出**：支援 `AbortController` 隨時急停任務。並註冊了快捷指令 (`export-ai-chat`)，支援將包含工具執行軌跡的完整對話，一鍵匯出為 Markdown 檔案。

---

### 📥 安裝方式 (解壓縮外掛)

目前 Impeller AI 處於活躍開發階段，你可以透過以下簡單步驟手動安裝：

1. 下載此 GitHub 儲存庫（點選右上角 `Code` -> `Download ZIP`）並解壓縮至電腦中安全的資料夾。
2. 開啟 Logseq，點擊右上角三點選單 `...` 並進入 **Settings (設定)**。
3. 前往 **Advanced (進階)** 分頁，將 **Developer mode (開發者模式)** 切換為開啟。
4. 關閉設定，再次點擊 `...` 選單，這次選擇 **Plugins (外掛)**。
5. 點擊 **Load unpacked plugin (載入解壓縮外掛)** 按鈕，並選擇你剛剛解壓縮的 `logseq-impeller-ai` 資料夾。
6. 外掛已成功啟動！

---

### 📦 使用指南

Impeller UI 常駐於你的 **右側邊欄**，伴隨你漫遊在不同的筆記頁面中。

- **啟動大腦**: 點擊工具列上的 **AI Assistant** 按鈕，即可自由切換側邊欄的顯示。
- **對話發想**: 在底部輸入框中輸入你的需求。按 **Enter** 傳送，或按 **Shift+Enter** 換行。
- **對話節點控制**: 將滑鼠移至任何對話泡泡上，即可 reveal 進階動作：
  - **📋 複製**: 立即複製 AI 回應（完美繞過 Logseq 核心 iframe 的剪貼簿沙盒限制）。
  - **⏹️ 刪除**: 移除此筆使用者 prompt 並自動截斷其後的歷史，維持情境連續性。
  - **🔄 重新生成**: 強制 AI 對該節點重新思考，並附帶生成失敗時的安全自動回滾機制。
- **底部操作按鈕**:
  - **✒️ Format**: 根據對話情境或複雜指令，重新編織或優化當前頁面。
  - **🧹 Clear**: 徹底抹除當前頁面的 AI 對話歷史，開啟全新主題。
  - **■ Stop**: 在生成途中隨時踩煞車，中斷請求並優雅保留已輸出的殘跡與工具日誌。
  - **📥 Export**: 一鍵將當前對話（包含工具調用日誌）匯出為獨立的結構化 Markdown 檔案。亦可透過指令面板（`Ctrl+Shift+P` -> `Export Chat`）觸發。

---

### 🛠️ 組態設定

你可以在 Logseq 的外掛設定面板中調整以下參數：

- **API Key**: 你的大語言模型 Secret Key。
- **Model**: 你偏好的模型 ID (預設為 `openai/gpt-4o-mini`，支援任何相容 OpenAI 格式的模型)。
- **API Endpoint (Base Path)**：自訂反向代理或路由端點。極度適合搭配 OpenRouter、自建代理，或串接本機端 LLM（如 Ollama / LM Studio）。
- **Web Search API Key**: *(選填)* 填入你的 Tavily API Key，即可解除封印 AI 的實體聯網搜尋與事實查核能力。
- **Custom Tag**: 定義 AI 格式化結果放置的標頭標籤（例如 `#AI`）。Impeller 會自動在標籤上方 prepend 一條乾淨的 `---` 分隔線以呈現優美的區塊視覺。
- **智慧索引效能說明**: 首次在圖譜上啟用 AI時，系統會在背景進行一次完整的索引同步；後續的所有操作都將透過本地差異快取實現近乎零等待的極速體驗。

---

### 📺 影片示範

[![Impeller AI Demo](https://img.youtube.com/vi/NQm55NCPv98/maxresdefault.jpg)](https://youtu.be/NQm55NCPv98)  
*(註：此示範影片基於 v0.2.0 的早期介面與核心工作流。雖然基礎互動邏輯相同，但較新的功能如網頁搜尋、增量向量快取、智慧記憶體與訊息控制並未在影片中呈現。)*

---

## 🐞 反饋與問題

如果您在寫筆記的過程中發現 Bug，或者有更瘋狂的功能狂想，我們誠摯地邀請您至 GitHub [開啟一個全新的 Issue](https://github.com/hhs456/logseq-impeller-ai/issues)。

---

## 📜 版本與更動歷史

本專案嚴格遵循 [語意化版本號 (Semantic Versioning)](https://semver.org/) 規範。  
關於歷史上各個階段的完整修復與更新細節，請隨時查閱獨立的 [CHANGELOG.md](./CHANGELOG.md)。

---

### 📄 授權條款

本專案採用 **MIT License** 條款開源授權。