---
author: Codex
date: 2026-07-21
title: 讓閱讀測驗沿用講解語言設定
uuid: f35ab3709edf48f4a476f21a55515e2e
version: 1.0.0
status: implemented
---

# Bug Fix Specification - 閱讀測驗未套用講解語言

## 1. Bug Overview

「解釋標記」會依全域**講解語言**設定產生內容，但同一 AI 對話面板中的「閱讀測驗」沒有傳送該設定，Main Process 也把測驗題面固定要求為英文。因此使用者選擇繁體中文或日本語後，測驗仍不遵守設定。

修正後，測驗的標題、題目、選項與作答說明依 `原文語言／繁體中文／English／日本語` 設定產生；Part B 的學習目標仍是英文輸出，所以無論題面語言為何，都要求使用者用英文完整句回答。

## 2. Root Cause

- Renderer 的 `practiceReading()` 只傳 `intent: "practiceReading"`，沒有像 `explainAnnotations()` 一樣附上 `settings.explanationLanguage`。
- `composeCodexInput()` 的測驗分支硬編碼 `English`，沒有把 `input.explanationLanguage` 映射為原文語言、繁體中文、English 或日本語。
- IPC 已能驗證並保留合法 `explanationLanguage`，不需要擴張白名單或新增設定欄位。

## 3. Expected Behavior

- `source`：測驗題面使用目前閱讀區段的語言。
- `zh-TW`：測驗題面使用繁體中文。
- `en`：測驗題面使用 English。
- `ja`：測驗題面使用日本語。
- 題面語言包含標題、選擇題、選項、問答題與作答說明。
- Part B 在所有設定下仍明確要求使用者以英文完整句作答。
- 選擇／問答題數、閱讀區段邊界、第一輪不揭露答案及標記 skill 隔離行為不變。

## 4. Acceptance Criteria

- **Scenario 1：Renderer 傳送目前語言設定**
  - **Given** 使用者把講解語言設為日本語並開啟具有閱讀區段的章節
  - **When** 使用者點擊「閱讀測驗」
  - **Then** `SendChatMessageInput` 包含 `intent: "practiceReading"`、目前閱讀區段及 `explanationLanguage: "ja"`

- **Scenario 2：四種測驗題面語言映射**
  - **Given** `practiceReading` 分別帶入四種合法講解語言
  - **When** Main Process 組成 Codex 輸入
  - **Then** 明確要求整份測驗題面使用對應的原文語言、繁體中文、English 或日本語
  - **And** 不把講解語言設定誤用為 EPUB 原文或使用者答案的語言

- **Scenario 3：英文輸出目標保持不變**
  - **Given** 測驗題面使用任一設定語言
  - **When** Main Process 組成 Part B 問答題要求
  - **Then** 仍要求使用者以英文完整句回答
  - **And** 第一輪不提供問答題參考回答

- **Scenario 4：既有標記解析與安全邊界不回歸**
  - **Given** 使用者執行「解釋標記」或一般提問
  - **When** 系統組成 turn input
  - **Then** 標記解析仍使用相同四種語言映射與固定 skill
  - **And** 一般提問不套用測驗語言規則或標記 skill

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Renderer 傳送日本語設定 | 講解語言為 `ja` | 點擊閱讀測驗 | payload 含 `practiceReading`、`ja` 與目前區段 | Critical |
| TC2 | 四種題面語言 | `source / zh-TW / en / ja` | 組成測驗輸入 | 分別要求原文語言、繁體中文、English、日本語 | Critical |
| TC3 | 英文輸出固定 | 任一題面語言 | 組成問答題要求 | 仍要求英文完整句且不提供參考回答 | Critical |
| TC4 | 標記解析回歸 | `explainAnnotations` 與四種語言 | 組成輸入 | 原有 skill 與語言映射測試通過 | High |

## 6. Implementation Notes

- 沿用既有 `explanationLanguage` 設定與 IPC 契約，不遷移設定檔。
- Renderer 的閱讀測驗預設動作補送 `settings.explanationLanguage`。
- Main 將共用語言值映射為動態指令；題面語言與 Part B 英文作答要求必須分開描述。
- 不新增測驗專屬語言設定，也不改變題數或資料保存行為。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- Renderer 的「閱讀測驗」預設動作現在會和「講解標記內容」一樣，附上目前持久化設定中的 `explanationLanguage`。
- Main Process 共用一份語言映射，把 `source | zh-TW | en | ja` 轉為原文語言、繁體中文、English 或日本語。
- 測驗提示明確要求標題、選擇題、選項、問答題與作答說明使用映射後語言；不再把整份測驗硬編碼為英文。
- Part B 與題面語言分離，任何設定下都保留「使用英文完整句回答」及「第一輪不提供參考回答」的學習契約。
- IPC 已有的 enum 驗證與設定儲存格式維持不變；一般問答和固定標記解析 skill 的隔離亦未改變。

### Test Coverage

- TC1：`App.test.tsx` 驗證選擇日本語後，「講解標記內容」與「閱讀測驗」都送出 `explanationLanguage: "ja"`。
- TC2、TC3：`chat-controller.test.ts` 參數化驗證四種測驗題面語言映射、完整英文句作答及不提供參考回答。
- TC4：既有四種標記解析語言、一般問答和 skill marker gate 測試全數通過。
- IPC 回歸：`chat-ipc.test.ts` 驗證 `practiceReading` payload 保留合法 `explanationLanguage`。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/main/chat-controller.ts`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`

#### Documents

- `CONTEXT.md`
- `documents/modules/annotation.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/B04-use-language-setting-for-reading-quiz.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Renderer 傳送目前講解語言 | Pass | App 行為測試驗證日本語設定同時傳入兩個預設動作 |
| 四種測驗題面語言正確映射 | Pass | Main 參數化 prompt 契約測試 |
| Part B 固定要求英文完整句且不提供參考回答 | Pass | 四種語言各自驗證英文輸出與延後揭露契約 |
| 標記解析與一般問答安全邊界不回歸 | Pass | 完整 controller 測試與既有 skill 隔離斷言 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `uses the selected explanation language for annotation analysis and reading quiz presets` |
| TC2 | Pass | `uses %s as the reading quiz language while keeping English output` 四組參數 |
| TC3 | Pass | 同一參數化測試的英文完整句及無參考回答斷言 |
| TC4 | Pass | 既有 `explainAnnotations` 四種語言、一般 turn 與 marker gate 隔離測試 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-ipc.test.ts src/main/chat-controller.test.ts src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

結果：聚焦測試 89/89、Server Vitest 3/3、Desktop Vitest 131/131、Electron Playwright 2/2、TypeScript typecheck 與 production build 全數通過。

### Hypotheses and Decisions

- 修正位置已知，依 `ddd-start` E1 路線建立 B04 後直接進入 `ddd-tdd`。
- 題面語言遵守設定，但使用者的 Part B 回答固定為英文，以保留先前確認的英文輸出學習目標。
- 語言映射上移為 Main prompt 組成的共用值，讓標記解析與閱讀測驗使用同一來源，避免兩個預設動作再次分歧。
- 本修正沒有發現新的架構問題；既有 Renderer `App.tsx` 協調責任偏重已由 annotation 模組文件追蹤。

### Deferred Items

- 不重新命名持久化欄位 `explanationLanguage`，也不新增測驗專屬設定。

### Notes

- 本文件的「問答題固定英文」屬當時決策；B05 已依使用者後續回報覆蓋，現行行為改為題面、問答題回答與批改共同遵守講解語言。詳見 `documents/implements/B05-use-quiz-language-for-open-ended-answers.md`。

- 本修正不擴張 Renderer 權限、IPC method 或 Codex 工具能力。
