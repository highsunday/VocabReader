---
author: Codex
date: 2026-07-28
title: 在間隔複習頁顯示可用與今日已學習狀態
uuid: 6170fcb9-622c-4ce7-a46a-f0711bd072f8
version: 1.1.0
status: implemented
---

# Feature Specification - 在間隔複習頁顯示可用與今日已學習狀態

## 1. Feature Overview

目前**間隔複習**首頁只顯示本回合最多 10 題的組成，使用者無法直接掌握所有尚未
複習的新學習項目、所有目前到期項目，以及今天已完成多少新項目與到期項目。

本功能在間隔複習頁提供四個持續可見的狀態：

- 新項目：目前 active 且從未建立複習排程的學習項目數。
- 到期項目：目前 active、已有複習排程且精確到期時間不晚於現在的學習項目數。
- 今日已學習新項目：裝置本地日曆日內確認的首次複習事件數。
- 今日已學習到期項目：裝置本地日曆日內確認、且確認前已有複習排程的複習事件數。

頁面仍保留既有的本回合摘要；四個狀態描述的是整體佇列與今日成果，不受每回合
10 題上限影響。

## 2. Requirements (User Story)

- **As a** 使用間隔複習的語言學習者
- **I want** 在複習頁同時看到尚待學習與今天已完成的新項目／到期項目數
- **So that** 我能快速判斷目前負擔與當日進度

## 3. Confirmed Product Rules

### 3.1 狀態分類

- 「新項目」沿用既有 `newCount` 定義，不把已有排程但尚未到期的項目算入。
- 「到期項目」沿用既有 `dueReviewedCount` 定義，只包含目前已到期的既有項目。
- 首次確認複習時，事件的複習前排程為空，計入「今日已學習新項目」。
- 確認前已有排程時，事件計入「今日已學習到期項目」。
- 同一項目若在同一天再次到期並再次完成，第二次是另一筆到期複習事件，應再次計入。
- 垃圾桶中的學習項目不計入目前新項目或到期項目；已被永久刪除的事件會依既有
  cascade 行為消失，不再計入今日數字。

### 3.2 「今日」邊界

- 「今日」依 Main process 所在裝置的目前時區，以本地 00:00（含）至次日 00:00
  （不含）為界。
- 儲存的 UTC ISO timestamp 只用於精確比較；Renderer 不傳入或覆寫日界線。
- 夏令時間或時區位移時，以裝置建立的兩個本地午夜時間各自轉換為 UTC，不能假設
  一天固定為 24 小時。

### 3.3 顯示與更新

- 四個狀態在間隔複習頁載入成功後顯示，即使目前沒有可複習項目也顯示。
- 數字為零時明確顯示 `0`。
- 使用者確認整份複習試卷後，頁面立即以最新摘要更新四個狀態。
- 既有本回合 10 題摘要、側欄可複習總數與下一個到期時間行為不變。

## 4. Acceptance Criteria

- **Scenario 1：顯示目前新項目與到期項目**
  - **Given** 生詞庫有 7 個新項目、3 個目前到期項目及其他尚未到期項目
  - **When** 使用者開啟間隔複習頁
  - **Then** 狀態區顯示「新項目 7」與「到期項目 3」
  - **And** 數字不受本回合最多 10 題限制影響

- **Scenario 2：依本地日界線分類今日複習**
  - **Given** 本地今日內有 2 筆首次複習事件及 4 筆既有排程複習事件
  - **And** 本地今日開始前另有複習事件
  - **When** 系統建立複習摘要
  - **Then** 顯示「今日已學習新項目 2」與「今日已學習到期項目 4」
  - **And** 今日開始前的事件不計入

- **Scenario 3：確認試卷後立即更新**
  - **Given** 頁面初始顯示今日已學習新項目 0
  - **When** 使用者確認含 1 個新項目的複習試卷
  - **Then** 完成頁仍可見四個狀態
  - **And** 今日已學習新項目更新為 1
  - **And** 新項目與總可複習數同步減少

- **Scenario 4：沒有可複習項目時仍顯示狀態**
  - **Given** 目前新項目與到期項目皆為 0，但今日已有完成紀錄
  - **When** 使用者開啟間隔複習頁
  - **Then** 四個狀態仍顯示
  - **And** 既有的下一個到期時間空狀態仍正常顯示

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 整體可用數 | 新項目、到期項目與未到期項目並存 | 查詢摘要 | 回傳完整 new／due 數，不受 selectedItems 上限影響 | Critical |
| TC2 | 今日事件分類 | 今日首次與既有排程事件並存 | 查詢摘要 | 依 previous schedule 分別計數 | Critical |
| TC3 | 本地午夜邊界 | 日界線前後皆有事件 | 查詢摘要 | 僅 `[今日 00:00, 次日 00:00)` 事件納入 | Critical |
| TC4 | 狀態 UI | 摘要包含四個數字 | 開啟頁面 | 四個有標籤的狀態與數字可見 | Critical |
| TC5 | 確認後刷新 | 確認 1 個新項目 | 進入完成頁 | 四個狀態採用重新查詢的最新摘要 | Critical |
| TC6 | 空佇列 | 可用數皆為 0、今日完成數非 0 | 開啟頁面 | 狀態區與既有 empty state 同時顯示 | High |

## 6. Implementation Notes

- 擴充 `ReviewSummary`，加入 `reviewedNewTodayCount` 與
  `reviewedDueTodayCount`。
- `LocalLearningLibrary.getReviewSummary()` 在 Main process 從 `nowInput` 建立本地
  今日起訖，再以 `learning_review_events.reviewed_at` 篩選。
- 事件既有 `previous_card_json` 可可靠區分首次複習與已有排程的複習，不新增資料表。
- `SpacedReviewWorkspace` 在標題下顯示四格狀態；確認成功後重新呼叫 `getSummary()`，
  只更新摘要，不清除完成頁或試卷狀態。

## 7. Affected Modules and Files

- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/spaced-review.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者所稱「卡片」對應既有**學習項目**。
- 「今日已學習數」指已確認並寫入複習歷史的題數；尚未提交、尚未確認或已放棄的
  複習試卷不計入。
- 每筆成功確認的複習事件算一次學習；同一學習項目同日再次到期並完成會再次計數。

### Non-goals

- 不新增每日新項目上限、每日目標、連續天數或圖表。
- 不改變 FSRS、到期判定、回合選題順序或每回合 10 題上限。
- 不改變側欄 badge 的含義；它仍顯示總可複習數。
- 不持久保存裝置時區，也不提供自訂「一天開始時間」設定。

## 9. Implementation Record

### Status

Implemented on 2026-07-28.

### Implementation Summary

- `ReviewSummary` 新增 `reviewedNewTodayCount` 與 `reviewedDueTodayCount`，既有
  `newCount`／`dueReviewedCount` 繼續代表完整可用佇列，不受回合 10 題限制。
- Main process 依查詢時間建立本地今日與次日午夜，轉為 UTC ISO 後以半開區間查詢
  `learning_review_events`；`previous_card_json` 是否為空負責分類首次與既有排程
  複習事件。
- 間隔複習標題下方新增四格狀態，在空佇列、生成、作答、批改與完成狀態皆持續顯示；
  760px 以下改為兩欄。
- 確認成功後保留完成頁，另重新查詢最新摘要。刷新失敗不會把已成功確認的回合降回
  reviewing，並保留交易回傳的最佳已知剩餘總數。

### Test Coverage

- TC1／TC2／TC3：repository test 建立昨日首次事件、今日新事件與今日既有排程事件，
  驗證本地午夜前一毫秒排除，今日兩類各計 1。
- TC4／TC6：Renderer test 驗證空佇列仍有具名狀態區、四個標籤、`0／0／2／4`
  數字及既有 empty state。
- TC5：完整生成、提交、確認流程以連續摘要回應驗證 `getSummary()` 查詢兩次，完成頁
  保留且今日新項目由 0 更新為 1。
- 更新 controller、App 與共用 Renderer fixture，覆蓋擴充後的 typed boundary。

### Changed Files

#### Production Code

- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `documents/implements/F36-show-spaced-review-daily-status.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 顯示完整目前新項目與到期項目 | Pass | typed summary 沿用 repository 全量計數；四格 UI test |
| 依本地日界線分類今日複習 | Pass | repository regression test 與直接 SQLite repository harness |
| 確認試卷後立即更新 | Pass | Renderer 完整確認流程與第二次摘要查詢 assertion |
| 空佇列仍顯示四個狀態 | Pass | `shows available and learned-today status even when the queue is empty` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 既有 queue total tests、typed summary 與狀態 UI |
| TC2 | Pass | `counts today's new and due review events using local calendar boundaries` |
| TC3 | Pass | 同上：本地今日開始前 1ms 的事件排除 |
| TC4 | Pass | `shows available and learned-today status even when the queue is empty` |
| TC5 | Pass | `refreshes all status counts after confirming a review paper` |
| TC6 | Pass | 空佇列狀態 UI test |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop -- --run App.test.tsx ../main/spaced-review-controller.test.ts
# PowerShell 組出除 learning-library-service.test.ts 外的 24 個 test files
npm run test -w @reader/desktop -- --run <24 test files>
npm run typecheck
npm run build -w @reader/desktop
git diff --check
# npx tsx stdin harness 直接執行 LocalLearningLibrary 的本地日界線情境
```

### Hypotheses and Decisions

1. 首次聚焦紅燈確認狀態區不存在，且確認成功後 `getSummary()` 只呼叫一次。
2. repository test 在共用 Vitest jsdom 設定下無法 bundle `node:sqlite`。假說依序為
   Main 測試被套入 renderer/jsdom、跨 root 路徑選錯 project、Node 不支援 sqlite；
   `vite.config.ts`、既有 B12／B13 記錄及直接 `import("node:sqlite")` 驗證確認第一項
   為根因。這是既有測試配置限制，本功能未擴張範圍修改它。
3. 以 `npx tsx` 直接載入實際 `LocalLearningLibrary` 和暫存 SQLite 執行同一情境，
   得到 `reviewedNewTodayCount: 1`、`reviewedDueTodayCount: 1`，補足 repository
   Vitest 無法收集時的實際資料層回饋迴圈。
4. 「今日」不以 `now - 24h` 計算，而是建立兩個本地午夜後各自轉 UTC，避免夏令時間
   日期不是固定 24 小時。
5. 確認後摘要刷新屬非關鍵 read；交易確認成功後即使刷新失敗，也不能誤導使用者重做
   同一回合。

### Deferred Items

- `learning-library-service.test.ts` 仍因專案既有 Vitest jsdom 設定無法收集
  `node:sqlite`；測試已新增但本次以實際 repository harness 取代該檔的執行證據。
- 未新增自訂一天開始時間、每日目標、連續天數或圖表。

### Architectural Observations

- 現有 review event 已保存 `previous_card_json`，足以辨認每次確認前是否已有排程，
  不需 schema migration 或重複持久化分類欄位。
- 確認交易只回傳剩餘總數，不足以更新四個摘要數字；在 Renderer 做一次非關鍵摘要
  read 可保持交易結果契約精簡，也沒有發現需要另開 RXX 的責任邊界問題。

## Appendix: TDD Implementation Checklist

1. 先新增摘要分類、本地日界線、狀態 UI 與確認後刷新測試，確認因欄位／顯示缺失而失敗。
2. 擴充 typed summary 與 repository 查詢。
3. 加入四格狀態 UI，並在確認後以最新摘要更新。
4. 執行聚焦測試、desktop 完整測試、typecheck、build 與 diff 檢查。
5. 同步本文件與 `documents/modules/spaced-review.md`。
