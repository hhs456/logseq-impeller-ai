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

### 🚀 核心功能

Impeller AI 不僅僅是聊天外掛，它深入 Logseq 生態，增強你的知識連結。

- **自主 Agent 代理引擎 🤖**: 擁有純粹的推理迴圈。AI 會根據上下文自主決定是直接回答、使用本地向量庫進行**語意搜尋**、執行 Datalog **圖譜標籤搜尋**，還是呼叫網頁搜尋，自動為你尋找最佳答案。
- **極速增量 RAG 大腦 ⚡**: 基於 Orama 與 Transformers.js，採用 IndexedDB 智慧差異比對快取，達成近乎零等待的啟動體驗，且只在背景掃描你修改過的區塊。完整支援 **跨圖譜 (Cross-Graph) 隔離**。
- **原生階層式解析 🌳**: 拒絕死板的平面文字。Impeller 將 AI 生成的 Markdown 智慧轉換為 Logseq 原生的階層大綱結構 (`IBatchBlock`)，保持完美的縮進與折疊性。
- **智慧記憶管理 🧠**: 內建 `MemoryManager` 滑動視窗機制，在背景自動將長對話壓縮為精煉摘要，徹底告別 Token 溢出與 context 浪費。
- **情境感知格式化 (✒️Format) ✨**: 格式化引擎會根據當前頁面與對話狀態動態調整：
  - **空白頁？** 觸發安全防呆，防止浪費遠端遠端 API 呼叫。
  - **無對話紀錄？** 對你現有的頁面結構進行高保真的結構化重組與潤飾。
  - **有對話紀錄？** 深入分析上下文，將 AI 的深刻洞見精準織入或附加到對應的區塊。
- **非侵入式進階 UX 🛡️**: 專為鍵盤流 Power User 設計。完全隔離並攔截 `Enter` 與 `Shift+Enter` 事件冒泡，避免熱鍵衝突；提供懸浮視窗的精準訊息控制（複製/截斷刪除/安全重新生成）；中斷生成時可優雅保留工具軌跡。

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