---
author: Codex
date: 2026-07-21
title: 新增閱讀區段理解測驗預設功能
uuid: 676df7a68eb74607a14550108a03e954
version: 1.3.0
status: implemented
---

# Feature Specification - 區段閱讀理解測驗

## 1. Feature Overview

在閱讀頁的 AI 對話面板中，於既有「解釋標記」旁提供「閱讀測驗」預設動作。使用者點擊後，系統只把目前 START／END 界定的**閱讀區段**交給 Codex AI 執行層，依區段英文詞數決定題數，產生題面語言遵循全域講解語言設定的閱讀理解選擇題與 1 至 3 題問答題。

第一輪只顯示題目，不揭露答案、解析或問答題參考回答。使用者可在同一個 AI 對話中回答選擇題，並以英文完整句回答問答題，再利用既有多輪對話取得批改、英文表達建議與解釋。這是**區段練習**，不要求區段內已有標記，也不建立或更新 Anki 式間隔複習資料。

## 2. Requirements (User Story)

- **As a** 閱讀英文 EPUB 的學習者
- **I want** 對目前 START／END 閱讀區段立即產生符合講解語言設定的選擇題與問答題
- **So that** 我能檢查閱讀理解，並用英文完整表達答案以練習輸出

## 3. Acceptance Criteria

- **Scenario 1：顯示區段練習入口**
  - **Given** 使用者位於章節閱讀頁
  - **When** AI 對話面板可用
  - **Then** 「解釋標記」旁顯示可辨識的「閱讀測驗」預設按鈕
  - **And** AI 正在回覆、對話管理中或 Codex 尚未就緒時，兩個預設按鈕使用相同的停用規則

- **Scenario 2：每次提供目前閱讀區段**
  - **Given** START／END 已界定非空閱讀區段
  - **When** 使用者點擊「閱讀測驗」
  - **Then** Renderer 送出型別化 `practiceReading` 意圖與當下閱讀區段
  - **And** 即使相同區段先前已在同一 AI 對話提供過，本次仍重新附上最新區段
  - **And** 不讀取 START／END 之外的章節內容

- **Scenario 3：依區段長度與語言設定產生固定格式的閱讀理解題**
  - **Given** `practiceReading` 意圖包含目前閱讀區段
  - **When** Main Process 組成 Codex 輸入
  - **Then** 忽略閱讀器 XML 標籤後計算區段英文詞數
  - **And** 每 100 詞產生一題並向上取整，最少三題、最多十題
  - **And** 明確要求只依閱讀區段產生該數量的閱讀理解題
  - **And** 標題、題目、選項、問答題與作答說明使用目前講解語言設定
  - **And** 每題包含 A、B、C、D 四個選項且只有一個最佳答案
  - **And** 題目優先測驗主旨、細節、推論、作者意圖或上下文，而不是孤立字義
  - **And** 另依每 300 詞一題並向上取整，產生 1 至 3 題問答題
  - **And** 問答題要求使用者用英文完整句回答，重點是摘要、解釋、推論或以自己的話重述
  - **And** 第一輪不得顯示正確答案、解析或問答題參考回答
  - **And** 邀請使用者以題號加選項回答選擇題，並用英文完整句回答問答題

- **Scenario 4：標記不是前置條件**
  - **Given** 閱讀區段不含任何 `<reader-annotation>`
  - **When** 使用者點擊「閱讀測驗」
  - **Then** 系統仍送出區段練習要求
  - **And** AI 被要求把標記標籤只視為閱讀器邊界資訊，不偏重或只考標記內容

- **Scenario 5：與一般對話及間隔複習隔離**
  - **Given** 使用者輸入一般問題或使用「解釋標記」
  - **When** 系統組成 Codex 輸入
  - **Then** 既有一般問答與標記解析行為不變
  - **And** `practiceReading` 不呼叫標記解析 skill、不新增學習項目，也不更新複習排程

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 顯示測驗預設動作 | 閱讀頁且 Codex ready | 呈現 AI 對話面板 | 顯示可用的「閱讀測驗」按鈕 | Critical |
| TC2 | 送出目前區段 | 相同區段已被一般訊息提供過 | 點擊「閱讀測驗」 | 仍送出 `practiceReading` 與最新 `readingSegment` | Critical |
| TC3 | 動態題數邊界 | 區段分別含 50、300、301、600、601、1001 個英文詞 | 計算題數 | 選擇題遵守 3–10 題；問答題分別為 1、1、2、2、3、3 題；XML 標籤不列入詞數 | Critical |
| TC4 | 混合測驗格式契約 | `practiceReading` 含非空區段與講解語言 | 組成 Codex 輸入 | 題面使用設定語言，含動態選擇題、1–3 題問答、英文完整句輸出、延後揭露答案與參考回答要求 | Critical |
| TC5 | 無標記仍可測驗 | 區段沒有 `<reader-annotation>` | 點擊「閱讀測驗」 | 正常送出區段與 `practiceReading` | High |
| TC6 | IPC 意圖白名單 | Renderer 傳入 `practiceReading` | IPC 驗證輸入 | 接受此意圖；其他任意意圖仍拒絕 | Critical |
| TC7 | 既有行為隔離 | 一般訊息或 `explainAnnotations` | 組成 turn input | 一般訊息不套用測驗規則；解析意圖仍使用原 skill | High |

## 5. Implementation Notes

- 影響 `annotation` 與 `ai-conversation` 既有模組，不建立新的資料保存邊界。
- `SendChatMessageInput.intent` 新增 `practiceReading`；IPC 仍以列舉白名單驗證。
- 測驗規則由 Main Process 針對型別化意圖組成，Renderer 只能選擇意圖，不能提供任意 system prompt。
- `practiceReading` 與 `explainAnnotations` 都必須略過閱讀區段去重，每次預設動作都送出當下區段。
- 第一版沿用安全 Markdown 對話呈現與既有多輪輸入框，不新增可點選答案卡、成績保存、題數／難度設定或專用測驗狀態。

## 6. Assumptions and Non-goals

- 選擇題數由閱讀區段英文詞數決定：`ceil(wordCount / 100)`，限制於 3–10 題；問答題數為 `ceil(wordCount / 300)`，限制於 1–3 題；本版不提供設定。
- 標題、題目、選項、問答題與作答說明沿用全域講解語言設定；問答題仍要求使用者以英文完整句作答。後續批改由一般 AI 對話自然承接，本版不新增測驗專屬語言設定。
- 不保存答案、分數、作答歷史或區段練習完成狀態。
- 不影響學習項目、回答評估、複習排程與到期項目。
- 不以滑鼠暫時反白選取作為測驗範圍。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- AI 對話面板新增「閱讀測驗」預設按鈕，與「解釋標記」共用連線、回覆中及對話管理中的停用規則。
- Renderer 以白名單 `practiceReading` 意圖送出當下 START／END 閱讀區段與講解語言；即使同一區段已提供過也會重新附上最新版本。
- Main Process 去除閱讀器 XML 標籤後計算英文詞數，以 `ceil(wordCount / 100)` 決定 3–10 題選擇題，再以 `ceil(wordCount / 300)` 決定 1–3 題英文問答題。
- Codex 輸入把測驗分成 Part A 選擇題與 Part B 問答題；問答題要求使用者用英文完整句摘要、解釋、推論或重述段落內容。
- Main Process 將 `source | zh-TW | en | ja` 映射為原文語言、繁體中文、English 或日本語，整份題面使用該語言；Part B 英文輸出要求獨立保留。
- 第一輪不顯示選擇題答案、解析或問答題參考回答，並邀請使用者在同一 AI 對話提交兩部分答案。
- 區段練習不注入標記解析 skill；使用者可沿用既有 AI 對話輸入答案並取得後續批改。

### Test Coverage

- TC1、TC2、TC5：`App.test.tsx` 驗證閱讀頁按鈕、無標記可用、相同區段再次送出、`practiceReading` payload 與目前講解語言。
- TC3、TC4、TC7：`chat-controller.test.ts` 驗證 3–10 題選擇題、1–3 題問答題、XML 標籤排除、四種題面語言、英文完整句輸出契約與標記 skill 隔離。
- TC6：`chat-ipc.test.ts` 驗證 `practiceReading` 白名單並維持任意 intent 拒絕。

### Changed Files

#### Production code

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/modules/annotation.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 閱讀頁顯示「閱讀測驗」並共用停用規則 | Pass | Renderer 行為測試與共用 disabled 條件 |
| 每次提供目前 START／END 閱讀區段 | Pass | 相同區段先送一般問題再點擊測驗的 Renderer 測試 |
| 依英文詞數產生 3–10 題選擇題 | Pass | 50／300／301／600／601／1001 詞參數化測試 |
| 依英文詞數產生 1–3 題問答題 | Pass | 同一參數化測試驗證 1／1／2／2／3／3 題 |
| 每題英文 A–D、單一最佳答案且以閱讀理解為主 | Pass | Main prompt 契約測試 |
| 問答題要求以英文完整句摘要、解釋、推論或重述 | Pass | Main prompt 契約測試 |
| 第一輪不顯示答案、解析或參考回答 | Pass | Main prompt 契約測試 |
| 無標記仍可測驗且標記不縮小範圍 | Pass | 無標記 Renderer 測試與 Main prompt 契約測試 |
| 一般問答、標記解析 skill 與間隔複習維持隔離 | Pass | turn input 隔離測試；未新增學習／排程資料路徑 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `starts a reading comprehension quiz from the current range without annotations` |
| TC2 | Pass | 同一測試先送一般問題，再驗證測驗仍含完整 context |
| TC3 | Pass | `uses %i passage words to request %i multiple-choice and %i open questions` |
| TC4 | Pass | `requests a length-based English reading comprehension quiz without revealing answers`，含英文輸出與參考回答隔離斷言 |
| TC5 | Pass | 無標記閱讀區段的 Renderer payload 測試 |
| TC6 | Pass | chat IPC 結構化 context 與 intent 白名單測試 |
| TC7 | Pass | 一般、`practiceReading`、`explainAnnotations` 三種 turn input 隔離測試 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-ipc.test.ts src/main/chat-controller.test.ts src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

結果：Server Vitest 3/3、Desktop Vitest 131/131、Electron Playwright 2/2、TypeScript typecheck 與 production build 全數通過；新增回歸涵蓋四種測驗題面語言映射與 Renderer 語言傳值。

### Hypotheses and Decisions

- 使用者已確認測驗範圍是 START／END 閱讀區段，不是滑鼠暫時反白文字。
- 採用四選一、第一輪不揭露答案、同一 AI 對話後續批改的 MVP 互動。
- 使用者在 red phase 後調整需求：題數不固定為三題，改為每 100 個英文詞約一題、向上取整，最少三題、最多十題。
- 使用者追加英文輸出目標：同一次測驗另含 1–3 題問答題；依先前的長度原則採每 300 詞約一題，並要求使用者以英文完整句回答。
- 使用者追加一致性要求：閱讀測驗題面沿用講解語言設定；Part B 仍固定要求英文完整句，以保留英文輸出目標。
- 完整型別檢查發現 IPC 驗證後的 intent 在物件展開時被推導成一般字串；以明確列舉收斂修正，未改變 runtime 白名單行為。
- Electron E2E 第一次在受限沙箱內無法啟動程序；取得桌面執行權限後相同測試 2/2 通過，確認不是功能回歸。

### Deferred Items

- 可點選答案的專用互動元件、結構化題目資料、分數保存及題數／難度設定均延後。
- 不新增測驗專屬語言設定；沿用既有全域講解語言。

### Notes

- 本功能不得被命名或實作成 Anki 式間隔複習。
- 既有 `App.tsx` 同時協調閱讀範圍、標記與 AI 預設動作的耦合仍存在，已記錄於 annotation 模組的後續限制；本次沒有擴張權限或新增資料保存邊界。
