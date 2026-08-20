---
author: Codex
date: 2026-08-20
title: 左側欄顯示逐句跟讀每日剩餘數量
uuid: 8ffccf14-9a4f-4c5a-af64-5582ca87f6e5
version: 1.1.0
status: implemented
---

# Bug Fix: 左側欄顯示逐句跟讀每日剩餘數量

## 1. Bug Overview

左側欄的 Review 與 Sentence Practice 入口已有數量徽章，但 Listen & Repeat 沒有顯示
**每日逐句跟讀目標**尚未完成的數量。使用者必須進入練習頁才能知道今日進度，三種練習
入口的進度語意不一致。

## 2. Fix Objective

- Listen & Repeat 左側欄徽章顯示 `max(每日逐句跟讀目標 - 今日跟讀完成活動量, 0)`。
- App 啟動取得跟讀 snapshot 後即更新徽章；首次完成長跟讀片段後立即遞減。
- 每日目標為 0 時不渲染徽章，但入口與活動記錄維持可用。
- 不改變 Review、Sentence Practice 或 Library 的既有徽章語意。

## 3. Acceptance Criteria

- **Scenario 1：顯示剩餘數量**
  - **Given** 每日目標為 10，今日完成活動量為 4
  - **When** App 取得 Listen & Repeat snapshot
  - **Then** 左側欄顯示 `Listen & Repeat 6`
- **Scenario 2：完成後即時遞減**
  - **Given** 左側欄已顯示剩餘數量
  - **When** 首次保存一個長跟讀片段並取得新 snapshot
  - **Then** App 立即收到新的今日完成活動量並重算剩餘數量
- **Scenario 3：不顯示負數**
  - **Given** 今日完成活動量大於或等於每日目標
  - **When** 左側欄呈現 Listen & Repeat
  - **Then** 徽章顯示 0
- **Scenario 4：停用目標時隱藏徽章**
  - **Given** 每日目標設定為 0
  - **When** 左側欄呈現 Listen & Repeat
  - **Then** 不顯示數量徽章，練習入口仍可使用

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 初始剩餘量 | goal 10、today 4 | snapshot 載入 | sidebar badge 為 6 | Critical |
| TC2 | 即時回報 | 新 snapshot 的 today 增加 1 | snapshot 更新 | callback 收到新 today | Critical |
| TC3 | 超額歸零 | today 13、goal 10 | sidebar render | badge 為 0 | High |
| TC4 | 零目標隱藏 | goal 0 | sidebar render | 無 badge、入口仍存在 | High |

## 5. Implementation Notes

- `ListenRepeatWorkspace` 新增今日完成活動量 callback，行為對齊
  `SentencePracticeWorkspace` 的 snapshot 回報模式。
- `App` 保存今日已完成長片段數，以 `Math.max(goal - completed, 0)` 產生可見文字與
  accessible name。
- 沿用 Main 提供的可信任 `statistics.todayCompletedLongChunkCount`，Renderer 不自行推算
  錄音是否為首次長片段完成。

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `documents/modules/listen-and-repeat-practice.md`

## 7. Assumptions and Non-goals

- Review 的可用項目數與 Sentence Practice 的每日剩餘數量已符合需求，不在本次改寫。
- 不新增 badge tooltip、動畫、通知或跨日計時器；snapshot 的既有載入／刷新時機維持不變。
- 不改變每日逐句跟讀目標、活動量或 Data Backup 的持久化格式。

## 8. Implementation Record

### Status

Implemented on 2026-08-20.

### Implementation Summary

- `App` 啟動時讀取 Listen & Repeat snapshot，保存今日已完成長片段活動量。
- `ListenRepeatWorkspace` 在已載入 snapshot 更新時回報今日完成量；首次保存長片段取得新
  snapshot 後，側欄因此立即重算。
- Listen & Repeat 入口的可見徽章與 accessible name 均顯示
  `max(dailyGoal - todayCompleted, 0)`；目標為 0 時不渲染徽章。
- Review、Sentence Practice、Library 的計算與顯示未變更。

### Test Coverage

- TC1／TC4：`configures the daily Listen & Repeat goal and refreshes its progress` 驗證初始
  `10 - 4 = 6`、設定調整後即時重算，以及目標 0 隱藏徽章。
- TC2：`reports today's completed long chunks whenever the snapshot changes` 驗證 workspace
  把 snapshot 的可信任今日完成量回報 App；既有 controller／workspace 測試持續驗證保存後
  回傳並套用新 snapshot。
- TC3：`clamps an exceeded Listen & Repeat goal to zero` 驗證完成 13、目標 10 時顯示 0。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`

#### Documentation

- `documents/implements/B28-show-listen-repeat-remaining-count-in-sidebar.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 顯示每日剩餘數量 | Pass | App initial snapshot + `10 - 4 = 6` assertion |
| 完成後即時遞減 | Pass | snapshot completion callback + existing save snapshot flow |
| 不顯示負數 | Pass | exceeded-goal assertion returns 0 |
| 零目標隱藏徽章 | Pass | goal 0 accessible-name and visible-text assertion |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Listen & Repeat 6 sidebar assertion |
| TC2 | Pass | today-completed callback assertion |
| TC3 | Pass | Listen & Repeat 0 sidebar assertion |
| TC4 | Pass | goal 0 hides numeric badge |

### Commands Executed

```bash
# Expected red: 3/3 failed because the sidebar had no Listen & Repeat badge or callback
npm test -w @reader/desktop -- src/renderer/App.test.tsx \
  src/renderer/ListenRepeatWorkspace.test.tsx -t \
  "Listen & Repeat goal|reports today's completed|clamps an exceeded Listen"

# Target green: 3/3 passed
npm test -w @reader/desktop -- src/renderer/App.test.tsx \
  src/renderer/ListenRepeatWorkspace.test.tsx -t \
  "Listen & Repeat goal|reports today's completed|clamps an exceeded Listen"

# Related renderer regression: 109/109 passed
npm test -w @reader/desktop -- \
  src/renderer/App.test.tsx src/renderer/ListenRepeatWorkspace.test.tsx

# Full regression: Server 3/3、Desktop 550/550
npm test

# Server and Desktop type checks passed
npm run typecheck

# Server and Desktop production builds passed; existing Vite chunk-size advisory only
npm run build

# Whitespace validation passed
git diff --check
```

### Hypotheses and Decisions

- 根因是 F66 已提供今日活動量，但 App 沒有取得或保存它，Listen & Repeat workspace 也缺少
  對應 Sentence Practice 的進度 callback；不需要修改 Main、IPC 或持久化。
- 剩餘量使用 Main snapshot 的可信任活動統計，避免 Renderer 誤把短片段或重錄算入。

### Deferred Items

None.

### Notes

- 修正只增加既有 snapshot 的 Renderer 資料流，未發現需要另開 RXX 的架構問題。
- 未寄送 DDD 完成通知：目前沒有可用且可驗證寄件身分的 email 工具；結果記錄於
  `documents/ddd-email-notify.md` 的 L045。

## Appendix: TDD Fix Workflow

1. 先新增側欄剩餘量與 snapshot callback 的失敗測試。
2. 增加最小 callback 與 sidebar 計算。
3. 驗證 0、超額與完成後更新邊界。
4. 執行相關與完整回歸，更新本文件與模組文件。
