---
author: Codex
date: 2026-07-21
title: 優化 AI 對話模型與輸入互動
uuid: 3e80f76df2994776a1989a3d27ca7fcd
version: 1.0.0
status: implemented
---

# Feature Specification - 優化 AI 對話模型與輸入互動

## 1. Feature Overview

目前 **AI 對話面板**會在提問框下方顯示帳戶連線明細，AI 回覆中狀態也位於提問框內；使用者無法選擇對話模型或停止進行中的回答。輸入框雖支援 Enter 送出，但沒有提示快捷鍵，且中文輸入法仍在組字／選字時按 Enter 會誤送訊息。

本功能把模型選擇與回答控制整合進對話介面：使用 Codex AI 執行層提供的可用模型目錄、允許在未回覆時切換模型、提供停止按鈕，並把處理中狀態放入對話訊息流。提問框固定呈現輸入快捷鍵提示，不再顯示登入信箱或「已連線：帳戶」字樣，同時正確辨識輸入法組字事件。

## 2. Requirements (User Story)

- **As a** 使用 AI 對話面板的閱讀者
- **I want** 選擇 AI 模型、停止回答，並使用可靠的鍵盤送出操作
- **So that** 我可以掌控回答方式，不被技術狀態干擾，也不會在中文選字時誤送尚未完成的文字

## 3. Acceptance Criteria

- **Scenario 1：選擇可用 AI 模型**
  - **Given** Codex AI 執行層已回傳至少一個可用模型
  - **When** 使用者在 AI 對話面板選擇另一個模型
  - **Then** 介面顯示新的選取值，之後建立的 thread 與 turn 使用該模型及其預設推理強度

- **Scenario 2：模型目錄不可用時保持可對話**
  - **Given** Codex AI 執行層無法取得模型目錄
  - **When** 使用者開啟 AI 對話面板
  - **Then** 模型選擇顯示不可用狀態，但仍可使用 Codex 預設模型送出問題

- **Scenario 3：回覆中停止回答**
  - **Given** 目前 AI turn 正在建立或串流回覆
  - **When** 使用者按下「停止」
  - **Then** 系統向 Codex AI 執行層中斷目前 turn，停止按鈕於處理期間防止重複操作，完成通知後恢復一般送出狀態

- **Scenario 4：處理中狀態位於對話區**
  - **Given** AI 正在回覆
  - **When** 使用者查看 AI 對話面板
  - **Then** 「Codex 正在回覆…」顯示為對話區底部的狀態，不顯示在提問框的輔助文字位置

- **Scenario 5：提問框顯示鍵盤提示**
  - **Given** 使用者查看可輸入的提問框
  - **When** AI 未在回覆
  - **Then** 提問框的預設提示為「輸入你的疑問」，下方顯示「Enter 送出 · Shift+Enter 換行」

- **Scenario 6：Enter 與 Shift+Enter 行為**
  - **Given** 輸入法未在組字，且提問框已有非空白文字
  - **When** 使用者按 Enter
  - **Then** 訊息送出；若按 Shift+Enter，則保留換行且不送出

- **Scenario 7：輸入法組字期間 Enter 不送出**
  - **Given** 中文或其他輸入法仍在 composition 組字／選字階段
  - **When** 使用者按 Enter 確認選字
  - **Then** 只完成輸入法選字，不觸發表單送出

- **Scenario 8：不顯示登入信箱連線字樣**
  - **Given** Codex AI 執行層已登入並連線
  - **When** 使用者查看側欄狀態卡與提問框
  - **Then** 畫面只顯示一般連線狀態與額度，不顯示信箱或「已連線：信箱」文字

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 載入並切換模型 | 分頁模型目錄含兩個可見模型 | 選擇第二個模型並送出問題 | snapshot 更新，thread/start 與 turn/start 使用第二個模型及預設 effort | Critical |
| TC2 | 模型目錄失敗降級 | model/list 回傳錯誤 | 送出問題 | 選擇器不可用，turn 不帶 model／effort 且對話可完成 | High |
| TC3 | 停止 active turn | activeTurnId 已存在 | 執行停止 | 呼叫 turn/interrupt，完成前不重複呼叫 | Critical |
| TC4 | 回覆狀態位置與輸入提示 | snapshot 有 activeTurnId | 渲染面板 | 對話區顯示狀態；提問框預設提示為「輸入你的疑問」，下方仍為快捷鍵 | High |
| TC5 | Enter 送出 | 非 composition 且未按 Shift | 按 Enter | 表單送出一次 | Critical |
| TC6 | Shift+Enter 換行 | 非 composition 且按 Shift | 按 Enter | 不送出 | High |
| TC7 | 中文輸入法 Enter | nativeEvent.isComposing 為 true或 keyCode 為 229 | 按 Enter | 不送出且不阻止輸入法確認 | Critical |
| TC8 | 隱藏帳戶信箱 | snapshot 含 account.email | 渲染側欄與提問框 | DOM 不含信箱與「已連線：」 | High |
| TC9 | 回覆中鎖定模型 | activeTurnId 已存在 | 查看模型選擇器 | 模型不可切換，但停止按鈕可用 | High |

## 5. Implementation Notes

- 從 Codex App Server 的 `model/list` 分頁取得可見模型；模型資料須經 Main Process 驗證後才進入型別化 snapshot。
- Renderer 只可透過白名單 IPC 更新已驗證的模型 id；不可直接呼叫任意 Codex method。
- 模型切換沿用該模型的預設推理強度。本功能不另外提供推理強度 UI。
- `thread/start` 與 `turn/start` 都帶入目前選定模型；`turn/start` 同時帶入選定模型的預設 effort。
- 停止回答使用 `turn/interrupt`，參數必須同時包含目前 thread id 與真實 turn id；`activeTurnId === "starting"` 時先等待 `turn/start` 取得 turn id，再執行中斷。
- IME 防誤送同時檢查 React keyboard event 的 `nativeEvent.isComposing` 與相容性用 `keyCode === 229`。
- Ready connection detail 改為不含帳戶資料的一般訊息；Renderer 不呈現 `account.email`。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 模型選擇為全域目前設定，套用於之後的 AI turn；不為每筆 AI 對話永久保存獨立模型。
- 「可以停止」指中斷目前 AI 回覆，不移除已完成訊息，也不刪除對話。
- 中斷後若已收到部分 assistant 內容，保留該內容並標示為未完整完成。

### Open Questions

- 無。第一版採 Codex 模型目錄、模型預設推理強度與單一 active turn 的既有安全邊界。

### Non-goals

- 不新增推理強度、API key、帳戶切換或登入 UI。
- 不允許同一 AI 對話並行多個 turn。
- 不變更對話保存、閱讀區段上下文或額度計算邏輯。

## 7. Affected Modules and Files

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/ai-conversation.md`

## 8. Implementation Record

### Status

Implemented.

### Implementation Summary

- `ChatController` 分頁載入並驗證 `model/list`，選取 server default；使用者切換後，`thread/start` 與 `turn/start` 使用目前模型，turn 同時使用模型預設推理強度。模型目錄失敗時保持可對話並交由 Codex 使用預設模型。
- 新增 `turn/interrupt` 停止流程；已取得 turn id 時立即中斷，thread／turn 仍在 starting 時等待真實 id 後中斷，並以共享 promise 與 `stopRequested` 狀態防止完成通知前重複停止 request。
- IPC／Preload 白名單新增模型選擇與停止能力，Renderer 不能傳送任意 Codex method。
- AI 對話面板加入模型選擇器與停止按鈕；「Codex 正在回覆…」移至訊息流底部，提問框顯示「輸入你的疑問」及「Enter 送出 · Shift+Enter 換行」。
- Enter 送出同時檢查 `nativeEvent.isComposing` 與 `keyCode === 229`，避免中文輸入法選字誤送；Shift+Enter 保留換行。
- 左側 Codex 狀態卡與提問框不再呈現登入信箱或含帳戶資料的 ready detail。

### Test Coverage

- `chat-controller.test.ts`：TC1–TC3，涵蓋模型載入／選擇、目錄失敗降級、active 與 starting turn 中斷。
- `chat-ipc.test.ts`：TC1、TC3，涵蓋 `chat:select-model` 與 `chat:stop` 白名單。
- `App.test.tsx`：TC4–TC9，涵蓋狀態位置、placeholder、快捷鍵、IME、信箱隱藏、模型鎖定與停止操作。
- `desktop.spec.ts`：驗證新增後的九項型別化 chat bridge 與 Node 隔離。
- 修正 3 個既有閱讀範圍測試的非同步等待競態：先等待範圍標籤 effect 完成，再操作拖曳或目前行選單；產品閱讀邏輯未變更。

### Changed Files

#### Production Code

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/fake-codex-app-server.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/F11-improve-ai-conversation-composer.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 選擇可用 AI 模型 | Pass | Controller model request assertions 與 Renderer selector test |
| 模型目錄不可用時保持可對話 | Pass | `keeps chat usable with the Codex default...` |
| 回覆中停止回答 | Pass | active／starting interrupt tests 與 Renderer stop action test |
| 處理中狀態位於對話區 | Pass | Renderer 驗證 `.chat-reply-status` 位於 `.messages` |
| 提問框顯示鍵盤提示 | Pass | placeholder 與 shortcut assertions |
| Enter 與 Shift+Enter 行為 | Pass | Renderer keyboard test |
| 輸入法組字期間 Enter 不送出 | Pass | isComposing／keyCode 229 regression test |
| 不顯示登入信箱連線字樣 | Pass | snapshot 含 email 但 DOM 不含 email／`已連線：` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `loads visible models and applies the selected model...` |
| TC2 | Pass | `keeps chat usable with the Codex default...` |
| TC3 | Pass | `interrupts the active Codex turn`、`waits for a starting thread...` |
| TC4 | Pass | `shows reply progress in the conversation...` |
| TC5 | Pass | IME／Enter keyboard test 的一般 Enter assertion |
| TC6 | Pass | 同一 keyboard test 的 Shift+Enter assertion |
| TC7 | Pass | 同一 keyboard test 的 composition assertion |
| TC8 | Pass | `renders model and composer controls without exposing...` |
| TC9 | Pass | 回覆狀態 Renderer test 的 disabled model selector assertion |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts src/main/chat-ipc.test.ts src/renderer/App.test.tsx
npm run typecheck
npm test
npm run build
npm run test:e2e
```

結果：Server Vitest 3/3、Desktop Vitest 87/87、Electron Playwright 2/2、全專案 typecheck 與 production build 全部通過。另以本機 renderer 實際檢查右側窄欄，確認模型選擇器、placeholder 與按鈕無溢出。

### Hypotheses and Decisions

- 模型選擇採全域暫存設定，不改動既有對話保存格式；每次啟動依模型目錄 server default 初始化。
- 只呈現模型選擇，不增加推理強度 UI；turn 使用所選模型的預設 effort。
- 第一次完整 Renderer 測試出現 3 個閱讀範圍案例未等到 marker／contextmenu effect 的非預期失敗。驗證「狀態污染、effect 依賴改變、產品閱讀邏輯回歸、測試等待不足」後，確認根因為測試只等待章節文字而未等待範圍標籤初始化；改為等待 marker 後全部通過。
- 端到端測試第一次因受限環境不能啟動 Electron 而失敗；使用允許 GUI 的執行環境重跑後 2/2 通過，無產品失敗。

### Deferred Items

- 不提供自訂推理強度。
- 不為個別 AI 對話持久保存模型。

### Notes

- 中斷後由 Codex 的 `turn/completed` notification 收斂 active state；若已收到部分 assistant 內容，既有訊息保存邏輯會保留內容並標示未完整完成。
