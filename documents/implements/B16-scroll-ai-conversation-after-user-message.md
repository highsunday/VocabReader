---
author: Codex
date: 2026-07-29
title: 使用者送出訊息後將 AI 對話捲至最新內容
uuid: 6db07a8e-81f4-452e-a278-602ff96d4068
version: 1.1.0
status: implemented
---

# Bug Fix: 使用者送出訊息後將 AI 對話捲至最新內容

## 1. Bug Overview

右側 **AI 對話面板**的訊息區可以獨立垂直捲動，但使用者在提問框送出訊息後，
Renderer 只更新訊息狀態，沒有同步調整訊息區的捲動位置。當既有對話已超出可視
高度、且使用者停留在較上方內容時，新送出的使用者訊息會出現在可視範圍之外，
使用者必須自行把訊息區拉到最下面才能看到最新內容與回覆中狀態。

## 2. Root Cause

- `App` 沒有保存 AI 對話訊息區的 DOM reference。
- 送出流程沒有記錄「下一筆成功加入的使用者訊息需要帶到最新內容」的 UI 意圖。
- `ChatSnapshot` 更新後沒有把該訊息區的 `scrollTop` 更新為最新
  `scrollHeight`。

## 3. Fix Objective

- 使用者從 AI 對話面板成功送出一筆新訊息、且該訊息已加入訊息流後，自動把右側
  訊息區捲到最下面。
- 捲動只作用於 AI 對話訊息區，不改變中央閱讀內容的捲動位置。
- 完成一次自動捲動後，不因後續 AI 串流內容持續強制捲動，讓使用者仍可在回覆期間
  自行查看先前訊息。

## 4. Acceptance Criteria

- **Scenario 1：送出訊息後自動捲到最下面**
  - **Given** AI 對話訊息已超出可視高度，且訊息區目前停留在較上方
  - **When** 使用者成功送出一筆新訊息，該訊息加入目前 AI 對話
  - **Then** AI 對話訊息區的捲動位置移至最新內容

- **Scenario 2：不持續搶回使用者捲動位置**
  - **Given** 系統已因新送出的使用者訊息完成一次自動捲動
  - **When** AI 回覆繼續串流更新
  - **Then** Renderer 不會只因 assistant 串流內容更新而再次強制捲到最下面

- **Scenario 3：不影響中央閱讀內容**
  - **Given** 中央閱讀內容與右側 AI 對話訊息區各自具有獨立捲動位置
  - **When** 使用者送出 AI 訊息
  - **Then** 只有 AI 對話訊息區移至最新內容，中央閱讀內容的捲動位置維持不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 長對話送出新訊息 | 訊息區可捲動且停留在較上方 | 成功送出訊息並收到包含新 user message 的 snapshot | 訊息區 `scrollTop` 等於最新 `scrollHeight` | Critical |
| TC2 | assistant 串流更新 | TC1 已完成且使用者再把訊息區向上捲 | snapshot 只更新 assistant 串流內容 | 不再次改寫訊息區 `scrollTop` | High |
| TC3 | 中央閱讀捲動隔離 | 閱讀內容停留在非零位置 | 成功送出訊息 | 閱讀內容 `scrollTop` 不變 | High |

## 6. Implementation Notes

- Renderer 為 `.messages` 保存專用 ref；不得重用中央閱讀內容的 `contentRef`。
- 每次合法的 `sendChatMessage()` 開始時先標記一次性捲動意圖；只有訊息陣列更新並
  可取得訊息區元素時才執行。
- 執行後立刻清除一次性意圖；assistant delta 造成的後續 snapshot 更新不得重複
  強制捲動。
- 若送出失敗且沒有新 user message，清除尚未消耗的捲動意圖。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/ai-conversation.md`
- `documents/implements/B16-scroll-ai-conversation-after-user-message.md`

## 8. Assumptions and Non-goals

### Assumptions

- 「捲到最下面」指右側 AI 對話訊息區的最新內容，不是整個 App 視窗或中央閱讀內容。
- 提問框、提問快捷功能與試卷提交最後都經過 `sendChatMessage()`，因此都視為使用者
  主動送出的 AI 對話訊息。

### Non-goals

- 不在 assistant 每個串流 delta 到達時持續跟隨最底部。
- 不新增「回到最新訊息」浮動按鈕或使用者偏好設定。
- 不變更 AI 對話保存、Codex thread／turn 或閱讀區段上下文邏輯。

## 9. Implementation Record

### Status

Implemented on 2026-07-29.

### Implementation Summary

- `App` 為 AI 對話訊息區加入獨立 DOM ref，與中央閱讀內容的 `contentRef` 保持
  分離。
- `sendChatMessage()` 在呼叫 bridge 前保存目前 user message 數量；snapshot 真正
  出現下一筆 user message 後，Renderer 才把訊息區移至最新內容並清除一次性意圖。
- Codex 在訊息加入前先發出的 `starting` snapshot 不會過早消耗捲動意圖；後續
  assistant 串流更新也不會重複強制捲動。
- bridge 拒絕送出且沒有新增 user message 時會清除待處理意圖，避免之後的無關
  snapshot 誤觸發捲動。

### Test Coverage

- TC1：`scrolls the AI conversation to a newly sent user message only once`
  建立可捲動的既有對話並停留在較上方，驗證成功加入新 user message 後訊息區移至
  最新 `scrollHeight`。
- TC2：同一測試在完成自動捲動後，模擬使用者再次向上捲及 assistant streaming
  snapshot，驗證 `scrollTop` 維持使用者選擇的位置。
- TC3：同一測試先保存中央閱讀內容的非零 `scrollTop`，驗證右側自動捲動後該值
  不變。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/modules/ai-conversation.md`
- `documents/implements/B16-scroll-ai-conversation-after-user-message.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 送出訊息後自動捲到最下面 | Pass | TC1 驗證新 user message 出現後，AI 對話訊息區移至最新內容 |
| 不持續搶回使用者捲動位置 | Pass | TC2 驗證 assistant streaming snapshot 不重寫 `scrollTop` |
| 不影響中央閱讀內容 | Pass | TC3 驗證中央 `main` 的 `scrollTop` 維持不變 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `scrolls the AI conversation to a newly sent user message only once` 的送出後捲動 assertion |
| TC2 | Pass | 同一測試的 assistant streaming assertion |
| TC3 | Pass | 同一測試的中央閱讀捲動隔離 assertion |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "scrolls the AI conversation to a newly sent user message only once"
npm test -w @reader/desktop -- --run src/renderer/App.test.tsx
npm run typecheck -w @reader/desktop
npm test -w @reader/desktop -- --run
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 紅燈：新 user message 已出現在 DOM，但 AI 對話訊息區的 `scrollTop` 仍為
  `180`，未移至測試中的最新 `scrollHeight = 1200`。
- 聚焦回歸測試：1/1 通過。
- 完整 `App.test.tsx`：72/72 通過。
- 完整 desktop 測試：28 files、309/309 tests 通過。
- Desktop TypeScript typecheck：通過。
- Desktop production build：通過。
- `git diff --check`：通過。

### Hypotheses and Decisions

- 自動捲動不能只監聽 `chatSnapshot.messages` 的陣列 reference，因為
  `ChatController` 會先發出 `activeTurnId = "starting"` 的 snapshot；該 snapshot
  雖尚未加入 user message，經 IPC 後仍可能帶有新的陣列 reference。
- 因此以送出前後的 user message 數量作為條件，確保只有真正新增的使用者訊息觸發
  捲動。
- 不採用 assistant delta 持續跟隨最底部，以保留使用者在長回答期間查看先前內容的
  控制權。

### Deferred Items

- 未新增「回到最新訊息」按鈕或可切換的自動跟隨模式；不屬於本次缺陷範圍。

### Notes

- 實作未新增 IPC、共享契約或資料保存格式。
- 未發現過度耦合、缺少測試接縫或責任邊界不清等新的架構問題。
