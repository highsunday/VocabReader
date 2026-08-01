---
author: Codex
date: 2026-07-29
title: 修正學習中項目占用每日完成額度並阻擋後續練習
uuid: 65f24583-9b0b-4193-bf4e-913f7c7e6819
version: 1.1.0
status: implemented
---

# Bug Fix: 修正學習中項目占用每日完成額度並阻擋後續練習

## 1. Bug Overview

間隔複習的今日進度顯示「已完成／每日上限」，但 queue 實際把仍在同日學習步驟、
尚未把下一次到期日期推進到隔天或更晚的學習中項目，也預先扣除完成額度。

實際案例中，每日新項目完成上限為 20，畫面顯示已完成 14 個，另有 6 個新項目正在
等待同日稍後再次到期。系統以 `14 + 6 = 20` 判定沒有剩餘額度，阻止其他未複習新
項目進入下一個複習回合，因此使用者無法繼續練習並讓完成數從 14 增加。

空狀態同時把這種「有學習中項目等待到期」的情況誤寫成「今天的複習已完成」，且
到期時間抵達後不會自動重新查詢摘要，可能繼續顯示過期的不可練習狀態。

## 2. Root Cause

- `LocalLearningLibrary.getReviewSummary()` 以「今日完成數 + 目前學習中數」計算兩類
  剩餘完成額度，讓尚未完成的項目預先占用每日完成名額。
- Renderer 只顯示今日完成數／上限，沒有呈現後端額外扣除的學習中數，因此使用者
  看到的進度與 queue 的可用性判定互相矛盾。
- 空狀態優先以 `backlogTotal > 0` 判定今日額度已用完，沒有區分「等待學習中項目
  再次到期」。
- `SpacedReviewWorkspace` 只在初次掛載、設定更新及明確操作後載入摘要，沒有在
  `nextDueAt` 抵達時自動刷新。

## 3. Fix Objective

- 每日新項目與到期複習的剩餘額度只扣除該本地日已完成的對應數量，不預留或扣除
  尚在學習步驟中的項目。
- 已再次到期的學習中項目維持原類別並優先出題；尚未再次到期的學習中項目不阻擋
  其他新項目或到期項目進入複習回合。
- 上限為零仍代表暫停引入該類別；已生成試卷不受設定變更影響。
- 沒有目前可練習項目但存在下一到期時間時，顯示下一到期時間，並在該時間抵達後
  自動重新載入摘要與側欄可複習數量。

## 4. Acceptance Criteria

- **Scenario 1：學習中新項目不占用新項目完成額度**
  - **Given** 每日新項目完成上限為 20、今天已完成 14 個、另有 6 個新項目仍在
    學習中且尚未再次到期，並有未複習新項目 backlog
  - **When** 系統建立複習摘要
  - **Then** 新項目剩餘額度為 6，而不是 0
  - **And** 下一回合可以依每份試卷題數選入最多 6 個未複習新項目

- **Scenario 2：到期複習的學習中項目不占用其他到期完成額度**
  - **Given** 今天已完成的到期複習數尚未達上限，另有到期複習項目處於同日學習
    步驟
  - **When** 學習中項目正在等待再次到期
  - **Then** 其他已到期項目仍可使用「上限 − 今日已完成數」的剩餘額度進入回合

- **Scenario 3：再次到期的學習中項目維持優先**
  - **Given** 學習中項目已抵達精確 `due_at`，且同時有其他到期或未複習新項目
  - **When** 系統排列下一個複習回合
  - **Then** 已再次到期的學習中項目排在其他項目之前
  - **And** 不因今日完成數已達上限而遺失既有學習路徑

- **Scenario 4：等待到期時顯示正確狀態**
  - **Given** 目前沒有可練習項目，但至少一個學習中項目將在同日稍後到期
  - **When** 間隔複習首頁顯示空狀態
  - **Then** 畫面顯示最近下一到期時間
  - **And** 不顯示「今天的複習已完成」

- **Scenario 5：抵達到期時間後自動刷新**
  - **Given** 空狀態摘要具有未來的 `nextDueAt`
  - **When** 裝置時間抵達該到期時間
  - **Then** Renderer 自動重新呼叫 `getSummary()`
  - **And** 更新中央內容與側欄可複習數量，不要求重新啟動 App 或修改設定

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 14／20 且 6 個等待中的新項目 | 14 個今日完成、6 個新項目學習中、另有新項目 backlog | 查詢摘要 | `newRemainingCapacity = 6`，可選入最多 6 個未複習新項目 | Critical |
| TC2 | 到期學習路徑不預占額度 | 到期完成數未滿、另有到期類學習中項目 | 查詢摘要 | `dueRemainingCapacity` 只扣今日已完成數，其他到期項目仍可選 | High |
| TC3 | 學習中項目再次到期 | 學習中與其他項目同時可用 | 查詢摘要 | 學習中項目優先且維持原 `reviewKind` | Critical |
| TC4 | 等待中的空狀態 | `totalAvailable = 0`、`backlogTotal > 0`、`nextDueAt` 在未來 | 渲染首頁 | 顯示下一到期時間，不顯示今日已完成 | High |
| TC5 | 到期自動刷新 | 首次摘要不可用，第二次摘要已有可用項目 | 推進時間至 `nextDueAt` | `getSummary()` 再次呼叫並更新可用數 | Critical |
| TC6 | 零值暫停不退步 | 任一類完成上限為 0 | 查詢摘要 | 該類未複習項目不被引入，既有已生成試卷不變 | High |

## 6. Implementation Notes

- `reviewProgress()` 繼續追蹤 `newLearningCount`／`dueLearningCount`，供進度說明與學習
  路徑排序使用；這兩個數值不再參與剩餘完成額度計算。
- `newRemainingCapacity` 與 `dueRemainingCapacity` 分別只由設定上限減去今日已完成數。
- 已再次到期的學習中項目仍由 `eligibleLearningRows` 優先選入；上限為零時維持暫停
  該類別的既有行為。
- 空狀態應優先說明 `nextDueAt`；只有確實沒有等待到期項目、且 backlog 因完成額度
  不可引入時，才顯示今日額度相關說明。
- Renderer 的到期刷新使用單次 timer；摘要、phase 或 `nextDueAt` 改變時清除舊 timer。
  遠於瀏覽器單次 timer 安全範圍的到期時間應以安全上限分段等待。

## 7. Affected Modules and Files

- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `CONTEXT.md`
- `documents/modules/spaced-review.md`
- `documents/implements/B15-do-not-reserve-completion-capacity-for-learning-items.md`

## 8. Assumptions and Non-goals

### Assumptions

- 「每日完成上限」限制的是本地日曆日內已完成的對應項目數，不是同時處於學習步驟
  的項目數。
- 一旦項目已進入學習路徑，即使今日完成數之後抵達設定值，該項目再次到期時仍可
  繼續練習，避免形成無法完成的孤立學習路徑。
- 因學習結果決定下一次到期日期，系統無法在引入時保證最終完成數絕不超過設定值；
  設定值控制是否繼續引入尚未開始的新項目或其他到期項目。

### Non-goals

- 不更改 FSRS 評級映射、間隔計算或精確到期時間。
- 不改變每份試卷題數、CEFR 新項目排序或學習中項目優先順序。
- 不持久保存未完成試卷，也不新增手動選題。

## 9. Implementation Record

### Status

Implemented on 2026-07-29.

### Implementation Summary

- `LocalLearningLibrary.getReviewSummary()` 的兩類剩餘額度改為只扣除今日已完成數，
  不再扣除 `newLearningCount`／`dueLearningCount`。
- 學習中狀態與原類別仍由完整事件序列推導；再次到期的學習中項目仍排在其他到期
  與未複習新項目之前。
- 空狀態偵測到學習中項目與 `nextDueAt` 時，改為顯示最近到期時間，不再誤稱今日
  複習已完成。
- ready 空狀態新增單次到期 timer；抵達 `nextDueAt` 後重新查詢摘要並同步側欄
  可複習數。超過瀏覽器 timer 安全範圍時使用安全上限分段等待。

### Test Coverage

- TC1：`does not reserve new-item completion capacity for same-day learning items`
  - 精確建立 14 個今日完成、6 個新項目學習中與 6 個未複習新項目。
  - 驗證剩餘額度、可選新項目與 `totalAvailable` 都是 6。
- TC2：`does not reserve due-review completion capacity for same-day relearning items`
  - 驗證一個到期複習完成、一個重新學習中時，另一個成熟到期項目仍可使用剩餘額度。
- TC3：`keeps an already-started learning path available after the completion limit is reached`
  明確驗證完成數達上限後，已再次到期的學習路徑仍可用；既有
  `prioritizes learning paths, then mature due items, then untouched new items` 持續驗證
  三層排序。
- TC4：`shows the next due time instead of claiming a waiting backlog is completed`
  驗證等待中的學習路徑不顯示錯誤完成文案。
- TC5：`refreshes the review summary when the next learning item becomes due`
  以 fake clock 驗證精確到期後重新載入摘要及更新側欄數。
- TC6：既有 `treats zero as a pause for each independent review category`
  持續驗證零值暫停。

### Changed Files

#### Production Code

- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`

#### Test Code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/modules/spaced-review.md`
- `documents/implements/B15-do-not-reserve-completion-capacity-for-learning-items.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 學習中新項目不占用新項目完成額度 | Pass | TC1 精確重現 14／20 + 6 個學習中，剩餘與可選數皆為 6 |
| 到期複習的學習中項目不占用其他到期完成額度 | Pass | TC2 驗證重新學習中數不扣 `dueRemainingCapacity` |
| 再次到期的學習中項目維持優先 | Pass | TC3 明確驗證達限後仍可用，並由既有排序測試驗證優先順序 |
| 等待到期時顯示正確狀態 | Pass | TC4 驗證下一到期時間與錯誤文案不存在 |
| 抵達到期時間後自動刷新 | Pass | TC5 驗證第二次 `getSummary()`、側欄數與開始按鈕 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `does not reserve new-item completion capacity for same-day learning items` |
| TC2 | Pass | `does not reserve due-review completion capacity for same-day relearning items` |
| TC3 | Pass | `keeps an already-started learning path available after the completion limit is reached` 與既有三層排序測試 |
| TC4 | Pass | `shows the next due time instead of claiming a waiting backlog is completed` |
| TC5 | Pass | `refreshes the review summary when the next learning item becomes due` |
| TC6 | Pass | `treats zero as a pause for each independent review category` |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/learning-library-service.test.ts -t "does not reserve new-item completion capacity for same-day learning items"
npm test -w @reader/desktop -- --run src/main/learning-library-service.test.ts
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "shows the next due time|refreshes the review summary"
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx src/main/learning-library-service.test.ts src/main/spaced-review-controller.test.ts src/main/spaced-review-ipc.test.ts
npm test -w @reader/desktop -- --run
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 服務紅燈：現行程式在 14 個完成 + 6 個學習中時回傳
  `newRemainingCapacity = 0`、`availableNewCount = 0`、`totalAvailable = 0`；
  B15 預期值均為 6。
- Renderer 紅燈：等待 backlog 顯示錯誤完成文案，且推進到 `nextDueAt` 後
  `getSummary()` 仍只呼叫一次。
- 聚焦服務測試：24/24 通過。
- 間隔複習相關測試：54/54 通過。
- 完整 desktop 測試：28 files、308/308 tests 通過。
- Desktop TypeScript typecheck：通過。
- Desktop production build：通過。
- `git diff --check`：通過。

### Hypotheses and Decisions

- 現場 SQLite 與截圖時間證實不是資料遺失：14 個今日完成之外，6 個同日學習中
  項目被舊公式預先扣除，正好把 20 個額度占滿。
- 「每日完成上限」改以已完成數控制是否引入同類其他項目；學習中的在途項目不預占
  名額，再次到期後仍可繼續。因此在途項目之後集中完成時，當日統計可能超過設定值，
  這是避免既有學習路徑被孤立的明確產品決策。
- 不新增資料欄位或 IPC。現有 `newLearningCount`、`dueLearningCount` 與 `nextDueAt`
  已足以支援正確 queue、空狀態及自動刷新。

### Deferred Items

- 未新增手動刷新按鈕、背景 OS 通知或自訂學習步驟；不屬於 B15 範圍。

### Notes

- 未發現新的架構耦合、責任邊界不清或缺少測試接縫；現有 service summary 與
  Renderer fake clock 測試足以鎖住本次行為。

## Appendix: TDD Fix Workflow

1. 先以服務測試重現 14／20 加 6 個學習中項目卻無法引入新項目的錯誤。
2. 以 Renderer 測試重現錯誤空狀態與到期後不刷新。
3. 最小修改額度計算、空狀態分支及到期 timer。
4. 執行聚焦測試、完整 desktop 測試、型別檢查與 production build。
5. 同步 `CONTEXT.md`、間隔複習模組文件與本文件實作紀錄。
