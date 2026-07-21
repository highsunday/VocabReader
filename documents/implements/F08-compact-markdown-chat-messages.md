---
author: Codex
date: 2026-07-21
title: 精簡 AI 對話訊息並渲染 Markdown
uuid: 8bf1a96f83c747339174fb32ca9fd046
version: 1.0.0
---

# Feature Specification - 精簡 Markdown 對話訊息

## 1. Feature Overview

右側 **AI 對話面板**目前在每則訊息前顯示「AI」或「你」的方形角色標籤，固定占用水平空間；訊息文字也以一般段落呈現，使 Codex 回傳的 Markdown 標題、清單、強調、引用、連結、表格及程式碼無法形成正確結構。

本功能移除可見的角色標籤，以對齊與底色區分使用者訊息和 AI 回覆，讓 AI 回覆取得完整可用寬度；同時以安全的 Markdown Renderer 呈現訊息內容，不執行 AI 或使用者輸入中的原始 HTML。

## 2. Requirements (User Story)

- **As a** 使用 AI 對話面板的閱讀者
- **I want** 對話訊息不顯示占空間的角色標籤，並正確呈現 Markdown
- **So that** 我能在窄側欄中閱讀更完整、層次清楚的 AI 說明

## 3. Acceptance Criteria

- **Scenario 1：訊息不顯示角色標籤**
  - **Given** 對話中同時存在使用者訊息與 AI 回覆
  - **When** AI 對話面板顯示訊息
  - **Then** 訊息旁不顯示「你」或「AI」角色文字，且不保留角色標籤占用的固定欄寬

- **Scenario 2：以精簡視覺區分角色**
  - **Given** 對話中同時存在使用者訊息與 AI 回覆
  - **When** AI 對話面板顯示訊息
  - **Then** 使用者訊息以靠右淡色氣泡呈現，AI 回覆以滿寬正文呈現；兩者仍保有可供輔助技術辨識的訊息角色名稱

- **Scenario 3：渲染常用 Markdown**
  - **Given** 訊息包含標題、粗體、清單、引用、連結、行內程式碼、程式碼區塊或表格 Markdown
  - **When** AI 對話面板顯示訊息
  - **Then** 內容被渲染為對應的語意化 HTML 元素，並具有適合窄側欄閱讀的間距與溢位處理

- **Scenario 4：安全處理原始 HTML**
  - **Given** AI 或使用者訊息包含原始 HTML 或可執行標記
  - **When** AI 對話面板顯示訊息
  - **Then** 原始 HTML 不會被當成可執行 DOM 插入，既有 Renderer 安全邊界不被放寬

- **Scenario 5：保留串流占位內容**
  - **Given** AI 回覆已建立但尚未收到第一段文字
  - **When** AI 對話面板顯示該串流訊息
  - **Then** 畫面仍顯示「…」占位，收到文字後以 Markdown 內容取代

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 無可見角色標籤 | user 與 assistant 訊息各一則 | Renderer 顯示 snapshot | 不存在訊息角色徽章，訊息容器保留角色語意 | Critical |
| TC2 | Markdown 語意渲染 | assistant 訊息含標題、粗體、清單、引用、連結、程式碼與表格 | Renderer 顯示 snapshot | 對應 heading、strong、list、blockquote、anchor、code、pre、table 元素存在 | Critical |
| TC3 | 角色精簡排版 | user 與 assistant 訊息各一則 | 檢查訊息 class 與結構 | user 與 assistant 使用不同 class，內容不再套用固定標籤欄格 | High |
| TC4 | 原始 HTML 不執行 | 訊息含 `<script>` 或 HTML 元素 | Renderer 顯示 snapshot | 不產生對應可執行／原始 HTML DOM | Critical |
| TC5 | 空串流占位 | assistant 訊息文字為空且狀態為 streaming | Renderer 顯示 snapshot | 顯示「…」 | Medium |

## 5. Implementation Notes

- 在 React Renderer 使用成熟的 Markdown 元件；預設不啟用 raw HTML 解析。
- 支援 GitHub Flavored Markdown，以涵蓋表格、刪除線與工作清單等 Codex 常見輸出。
- 外部連結另開分頁並加入安全的 `rel` 屬性。
- Markdown 樣式只作用於 AI 對話面板的訊息內容，不影響 EPUB 正文或其他產品畫面。
- 表格與程式碼區塊在窄側欄中可水平捲動，不撐寬整個工作區。
- 保留既有 `ChatMessage.role`、串流狀態、訊息順序、輸入及送出流程。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「不需要顯示我與 AI」是移除可見標籤，而非刪除訊息角色資料或輔助技術語意。
- 使用者與 AI 訊息都允許 Markdown；主要價值在 AI 長篇回覆。
- 視覺不要求逐像素複製參考圖片，重點是精簡、可讀與不壓縮正文寬度。

### Open Questions

- 無。角色區分方式、Markdown 安全邊界與串流行為皆可由現有需求及模組邊界確定。

### Non-goals

- 不變更 Codex prompt、模型、推理強度、thread／turn 或串流協定。
- 不保存對話、不新增複製按鈕、語法高亮、訊息編輯或重新生成。
- 不允許 Markdown 內嵌原始 HTML、script、iframe 或自訂 React 元件。
- 不調整 AI 對話面板以外的 EPUB 正文 Markdown／HTML 呈現。

## 7. Affected Modules and Files

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/ai-conversation.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 移除每則訊息前可見的「你／AI」角色標籤與固定 28px 格線，改由使用者訊息靠右淡色氣泡、AI 回覆滿寬正文區分角色。
- 訊息容器改用帶有「使用者訊息／AI 回覆」無障礙名稱的 `article`，在不占視覺空間的前提下保留角色語意。
- 加入 `react-markdown` 與 `remark-gfm`，支援標題、段落、強調、清單、引用、連結、行內／區塊程式碼、表格、刪除線及工作清單。
- 原始 HTML 解析保持停用；外部連結使用新分頁與 `noreferrer`，表格及程式碼區塊在窄側欄可水平捲動。
- 空的串流訊息持續顯示「…」占位。

### Test Coverage

- `App.test.tsx`：TC1–TC4 由 `renders compact role-aware messages with safe GitHub Flavored Markdown` 覆蓋。
- `App.test.tsx`：TC5 由 `keeps the streaming placeholder in the compact message body` 覆蓋。
- 全專案既有測試 67/67 通過；Electron E2E 2/2 通過。

### Changed Files

#### Production Code

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/F08-compact-markdown-chat-messages.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 訊息不顯示角色標籤 | Pass | 角色訊息測試確認無角色標籤子元素，訊息結構不再使用固定標籤格線 |
| 以精簡視覺區分角色 | Pass | user／assistant class、`article` aria-label 與 scoped CSS |
| 渲染常用 Markdown | Pass | heading、strong、list、blockquote、anchor、inline／block code 與 GFM table 行為測試 |
| 安全處理原始 HTML | Pass | `skipHtml` 與原始 HTML 不產生 DOM 的測試；production audit 0 vulnerability |
| 保留串流占位內容 | Pass | 空 streaming message 顯示「…」測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `renders compact role-aware messages with safe GitHub Flavored Markdown` |
| TC2 | Pass | 同上，驗證所有指定 Markdown 語意元素 |
| TC3 | Pass | 同上，驗證 user／assistant role class 與容器結構 |
| TC4 | Pass | 同上，驗證不建立原始 HTML DOM |
| TC5 | Pass | `keeps the streaming placeholder in the compact message body` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t 'renders compact role-aware messages|keeps the streaming placeholder'
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
npm audit --omit=dev --json
npm audit --json
```

結果：目標測試 2/2、Server 3/3、Desktop 67/67、Electron E2E 2/2 通過；全專案型別檢查與 production build 通過；production dependency audit 為 0 個已知漏洞。

### Hypotheses and Decisions

- 原始需求已授權直接實作；現有領域文件與程式碼探索未發現需另行確認的產品邊界。
- 選擇成熟的 React Markdown AST Renderer，而非自行把 Markdown 轉為 HTML；沒有啟用 `rehype-raw`，避免放寬 AI／使用者文字的 DOM 安全邊界。
- 完整 Renderer 測試第一次執行時，一個既有閱讀區段右鍵選單測試因非同步時序未出現選單；該測試單獨重跑通過，完整全專案測試隨後 67/67 通過，確認不是本次訊息呈現造成的回歸。
- Electron E2E 在檔案沙箱內無法啟動 GUI，改於允許桌面程序的環境重跑後 2/2 通過。

### Deferred Items

- 程式碼語法高亮未納入本次精簡與 Markdown 語意渲染範圍。

### Notes

- Markdown 樣式全部限制在 `.message-content`，不會影響 EPUB 正文或其他畫面。
- 實作未改變 `ChatMessage`、Codex thread／turn、串流協定、輸入送出或上下文組裝。
- 完整 dependency audit 仍列出既有開發工具 `concurrently` 經 `shell-quote` 帶來的 2 個 high findings；production audit 為 0，且問題不在本次新增的 Markdown 套件。
- 實作過程未暴露新的模組耦合、測試接縫或責任邊界問題，無需新增 RXX。

## Appendix: TDD Implementation Checklist

1. 先以 Renderer 行為測試證明角色標籤仍存在、Markdown 仍是純文字。
2. 加入最小 Markdown Renderer 與精簡訊息結構。
3. 驗證 Markdown 語意、安全邊界、串流占位及既有對話流程。
4. 同步本文件與 AI 對話模組文件。
