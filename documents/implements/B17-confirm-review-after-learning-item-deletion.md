---
author: Codex
date: 2026-07-31
title: 刪除試卷中的學習項目後仍可確認複習
uuid: 437f0386-3c81-4835-a1d1-fa59da024915
version: 1.1.0
status: implemented
---

# Bug Fix: 刪除試卷中的學習項目後仍可確認複習

## 1. Bug Overview

使用者開始一份複習試卷後，可能在作答期間前往生詞庫，將其中一個不再需要的學習
項目移入垃圾桶。試卷仍保留生成當下的題目，但確認整份試卷時，
`confirmReviewSession()` 要求每道題對應的學習項目仍為 active；只要其中一筆已移入
垃圾桶或已被永久刪除，整份確認便以
`The review item is no longer available` 失敗，其他仍有效的複習作答也無法寫入。

## 2. Root Cause

- 複習試卷是同一次產品開啟期間的暫態快照，不會隨生詞庫 mutation 即時移除題目。
- 確認層把「題目對應項目已不存在或不再 active」視為整份交易的致命錯誤。
- 確認層沒有區分應略過的失效項目與仍應寫入的 active 項目。

## 3. Fix Objective

- 確認複習試卷時，略過已移入垃圾桶或已永久刪除的學習項目。
- 仍為 active 且符合確認條件的學習項目，照常保存複習作答、最終評級與新排程。
- 若試卷中的學習項目全數失效，確認仍成功結束，但不建立任何複習歷史或排程。
- 不還原、重新建立或更新已刪除學習項目的複習資料。

## 4. Acceptance Criteria

- **Scenario 1：部分學習項目移入垃圾桶**
  - **Given** 一份複習試卷包含兩個 active 學習項目
  - **And** 使用者在確認前將其中一項移入垃圾桶
  - **When** 使用者確認整份複習試卷
  - **Then** 確認成功，只有仍為 active 的學習項目新增複習歷史與排程
  - **And** 垃圾桶中的學習項目維持原狀且沒有新增複習歷史

- **Scenario 2：部分學習項目已永久刪除**
  - **Given** 一份複習試卷包含兩個 active 學習項目
  - **And** 使用者在確認前將其中一項移入垃圾桶並清空垃圾桶
  - **When** 使用者確認整份複習試卷
  - **Then** 確認成功，只有仍存在且為 active 的學習項目新增複習歷史與排程

- **Scenario 3：試卷中的學習項目全數失效**
  - **Given** 一份複習試卷中的所有學習項目都已移入垃圾桶或永久刪除
  - **When** 使用者確認整份複習試卷
  - **Then** 確認成功並回傳零筆複習歷史
  - **And** 系統不建立孤兒排程或孤兒複習歷史

- **Scenario 4：所有學習項目仍有效**
  - **Given** 試卷中的所有學習項目仍為 active 且符合確認條件
  - **When** 使用者確認整份複習試卷
  - **Then** 既有的全數確認、FSRS 排程與原子交易行為維持不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 略過垃圾桶項目 | 兩個試卷項目，其中一項已移入垃圾桶 | 確認兩項評級與作答 | 只寫入 active 項目，確認不拋錯 | Critical |
| TC2 | 略過永久刪除項目 | 兩個試卷項目，其中一項已清空刪除 | 確認兩項評級與作答 | 只寫入仍存在的 active 項目 | High |
| TC3 | 全數失效 | 所有試卷項目均不再 active | 確認整份試卷 | 成功回傳空 entries，沒有孤兒資料 | High |
| TC4 | 正常確認回歸 | 所有試卷項目仍為 active | 確認整份試卷 | 所有項目照常寫入 | High |

## 6. Implementation Notes

- `LocalLearningLibrary.confirmReviewSession()` 仍須先完成輸入形狀、評級值與重複項目
  驗證；失效項目不是無效 payload，而是試卷建立後發生的合法領域狀態變化。
- 建立 FSRS pending entries 時，只納入目前仍存在且 `status = 'active'` 的項目。
- 「尚未到期」等 active 項目的排程衝突仍維持既有錯誤，不得被當成刪除情境略過。
- 交易只寫入過濾後的 pending entries；零筆 pending entries 也須安全完成並回傳最新
  複習摘要。

## 7. Affected Modules and Files

- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`
- `documents/implements/B17-confirm-review-after-learning-item-deletion.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者在作答期間刪除學習項目，代表該項目不應再留下本次複習作答、評級或排程。
- 仍有效項目的確認結果不應受同份試卷中失效項目影響。

### Non-goals

- 不讓複習試卷跨產品重啟保存。
- 不在生詞庫刪除時即時重寫已生成的題目或 AI 批改結果。
- 不自動還原垃圾桶項目，也不保留永久刪除項目的歷史。
- 不改變 active 項目的 FSRS 排程演算法、每日額度或題目選取順序。

## 9. Implementation Record

### Status

Implemented on 2026-07-31.

### Implementation Summary

- `LocalLearningLibrary.confirmReviewSession()` 保留所有 payload、重複項目、評級與
  active 排程衝突驗證，但在建立 FSRS pending entries 時略過不存在或不再 active
  的項目。
- 仍有效項目維持既有 FSRS 計算與單一交易寫入；失效項目不建立複習事件或排程。
- 全數項目失效時安全完成空交易，回傳零筆 entries 與重新計算的可用項目數。

### Test Coverage

- TC1：`confirms active review items after another paper item is trashed`
  驗證垃圾桶項目不阻擋 active 項目，且垃圾桶項目沒有新增複習歷史。
- TC2：`confirms active review items after another paper item is permanently deleted`
  驗證清空垃圾桶後，已不存在的題目不阻擋仍存在的 active 項目。
- TC3：`confirms with no history when every paper item is trashed`
  驗證全數失效時成功回傳空 entries，且沒有建立複習歷史。
- TC4：既有 `learning-library-service.test.ts` 正常確認與原子 rollback 測試持續通過。

### Changed Files

#### Production Code

- `apps/desktop/src/main/learning-library-service.ts`

#### Test Code

- `apps/desktop/src/main/learning-library-service.test.ts`

#### Documentation

- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`
- `documents/implements/B17-confirm-review-after-learning-item-deletion.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 部分項目移入垃圾桶後仍可確認 | Pass | TC1 只寫入 active 項目，垃圾桶項目維持零歷史 |
| 部分項目永久刪除後仍可確認 | Pass | TC2 清空垃圾桶後只寫入仍存在的 active 項目 |
| 全數失效時確認成功且不建立資料 | Pass | TC3 回傳空 entries，兩項均維持零歷史 |
| 正常確認與原子行為不變 | Pass | 完整 desktop 測試 326/326 通過 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `confirms active review items after another paper item is trashed` |
| TC2 | Pass | `confirms active review items after another paper item is permanently deleted` |
| TC3 | Pass | `confirms with no history when every paper item is trashed` |
| TC4 | Pass | 既有正常確認、FSRS 與交易 rollback 測試 |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/learning-library-service.test.ts -t "confirms active review items after another paper item is trashed"
npm test -w @reader/desktop -- --run src/main/learning-library-service.test.ts
npm test -w @reader/desktop -- --run
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 紅燈：回歸測試在 `learning-library-service.ts:1092` 重現
  `The review item is no longer available`。
- 聚焦回歸測試：1/1 通過。
- 完整 learning-library service：29/29 通過。
- 完整 desktop：29 files、326/326 tests 通過。
- Desktop TypeScript typecheck：通過。
- Desktop production build：通過。
- `git diff --check`：通過。

### Hypotheses and Decisions

- 已確認直接原因是 `confirmReviewSession()` 在建立 pending entries 時，對不存在或
  非 active 的任一項目拋錯，導致其餘有效項目完全不進入交易。
- Renderer 完成畫面以實際回傳的 entries 呈現，不要求結果筆數等於原題數，因此不需
  修改 UI 或共享契約。
- 只略過不存在或非 active 的項目；active 項目的「尚未到期」衝突繼續拋錯，避免
  掩蓋真正的排程一致性問題。
- 保留 repository 層輸入 ratings 不得為空的驗證；「原輸入有題目但過濾後為空」才是
  本缺陷所需的合法空確認。

### Deferred Items

無。

### Notes

- 未發現過度耦合、缺少測試接縫或責任邊界不清等新的架構問題。
- 不需 migration、IPC、Renderer 或共享型別變更。
