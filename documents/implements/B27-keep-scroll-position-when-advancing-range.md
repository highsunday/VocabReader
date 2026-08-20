---
author: Codex
date: 2026-08-19
title: 前往下一閱讀區段時保持目前捲動位置
uuid: 78552a69-caa9-4701-a98b-b25ad2b62608
version: 1.0.0
status: implemented
---

# Bug Fix: 前往下一閱讀區段時保持目前捲動位置

## 1. Change Overview

使用者實際試用後決定撤回 B25/B26 的 `Next segment` 自動 START 導覽。按下
`Next segment` 時，系統仍應更新並保存下一個**閱讀區段**，但閱讀容器應保持目前捲動
位置，不自動跳到新的 START **範圍標籤**。

手動 `Start`／`End` 快捷導覽仍有價值，繼續分別把標籤對齊閱讀可見高度的 1/4／3/4。

## 2. Fix Objective

- `Next segment` 只計算並保存下一個連續閱讀區段。
- 推進後不設定 pending START 導覽、不呼叫 START 導覽函式，也不改變 `scrollTop`。
- 移除只為自動導覽而存在的 marker offset 同步狀態。
- 保留手動 START／END 導覽、範圍演算法、章末停止與持久化行為。

## 3. Acceptance Criteria

- **Scenario 1：推進後保持捲動位置**
  - **Given** 目前閱讀區段尚未到達章末，閱讀容器已有捲動位置
  - **When** 使用者按下 `Next segment`
  - **Then** 系統保存下一個連續閱讀區段
  - **And** 閱讀容器 `scrollTop` 維持不變

- **Scenario 2：不執行 START 導覽**
  - **Given** 新 START 與舊 START 位於不同位置
  - **When** 下一閱讀區段完成渲染與 marker top 量測
  - **Then** 不自動呼叫 START 的 1/4 導覽

- **Scenario 3：手動快捷導覽維持**
  - **Given** START／END 範圍標籤已渲染
  - **When** 使用者明確按下 `Start` 或 `End`
  - **Then** START 對齊可見高度 1/4，END 對齊 3/4

- **Scenario 4：章末規則維持**
  - **Given** END 已位於章末
  - **When** 使用者查看 `Next segment`
  - **Then** 按鈕維持停用，不保存範圍或改變捲動位置

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 保持位置 | scrollTop 為非零且後方仍有文字 | 點擊 Next segment | 保存新範圍，scrollTop 不變 | Critical |
| TC2 | 無 pending 導覽 | 新 marker top 完成量測 | 等待 renderer 穩定 | scrollTop 仍不變 | Critical |
| TC3 | 手動導覽回歸 | 已知容器與 boundary 座標 | 點擊 Start／End | 仍對齊 1/4／3/4 | High |
| TC4 | 章末停止 | END 等於章節長度 | 檢視 Next segment | disabled、無額外保存或捲動 | High |

## 5. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/B25-align-range-navigation-and-next-segment.md`
- `documents/implements/B26-make-next-segment-use-start-navigation.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`

## 6. Assumptions and Non-goals

- 「取消 next 片段會移動到 start」只撤回自動導覽，不撤回 Next segment 本身。
- 手動 Start／End 的 1/4／3/4 比例不變。
- 不改變範圍推進字數、跨章規則或本機保存格式。

## 7. Implementation Record

### Status

Implemented on 2026-08-19.

### Implementation Summary

- `advanceToNextReadingRange()` 恢復為只計算並保存 `advanceReadingRange()` 結果，不建立
  pending START 導覽，也不呼叫 `scrollToReadingRangeMarker()`。
- 移除 B26 為自動導覽建立的 pending ref、marker offset metadata 與同步 effect；marker top
  state 恢復只保存 START／END 畫面座標。
- 手動 `Start`／`End` 仍共用既有快捷導覽函式，維持 1/4／3/4 對齊。
- B25／B26 已標記由 B27 取代，reading-range 模組文件改為目前有效行為。

### Test Coverage

- TC1／TC2：`advances only from the explicit completion action and preserves the scroll position`
  將 `scrollTop` 設為 375，驗證下一範圍保存完成後仍為 375。
- TC3：`keeps START and END range navigation beside the sticky annotation tool` 持續驗證手動
  START 1/4、END 3/4 與 offset／保存不變。
- TC4：`defaults and persists an unsaved chapter range across the full chapter` 持續驗證章末
  Next segment disabled 且不增加保存呼叫。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B27-keep-scroll-position-when-advancing-range.md`
- `documents/implements/B26-make-next-segment-use-start-navigation.md`
- `documents/implements/B25-align-range-navigation-and-next-segment.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 推進後保持捲動位置 | Pass | scrollTop 375 before／after assertion |
| 不執行 START 導覽 | Pass | pending ref／effect removed and position regression test |
| 手動快捷導覽維持 | Pass | START 1/4／END 3/4 fixed geometry test |
| 章末規則維持 | Pass | disabled／no extra save test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | explicit advance saves range and preserves scrollTop |
| TC2 | Pass | renderer stability wait retains scrollTop |
| TC3 | Pass | manual quick-navigation test |
| TC4 | Pass | full-chapter range test |

### Commands Executed

```bash
# Expected red: new range saved, scrollTop expected 375 but received 0
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "advances only from the explicit completion action and preserves the scroll position"

# Target green: 1/1 passed
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "advances only from the explicit completion action and preserves the scroll position"

# Related regression: 106/106 passed
npm test -w @reader/desktop -- \
  src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: Server 3/3, Desktop 540/540
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; only the existing chunk-size warning was reported
npm run build -w @reader/desktop

# Whitespace and removed-auto-navigation checks passed
git diff --check
rg -n "pendingRangeNavigationRef|markerTops\\.startOffset|navigates Next segment from" \
  apps/desktop/src/renderer
```

### Hypotheses and Decisions

- 這是使用者試用後的產品決策撤回，不是 B26 同步邏輯失效；因此不保留隱藏設定或替代觸發。
- 刪除自動導覽專用狀態比停用 effect 更清楚，可避免未來誤觸與無效複雜度。
- B25 的手動 1/4／3/4 導覽仍符合最新需求，故只撤回 Next segment 與 START 的自動連結。

### Deferred Items

None.

### Notes

- 本次移除 renderer 內的短期同步狀態，未發現需要另開 RXX 的架構問題。
- 未寄送 DDD 完成通知：目前沒有可驗證寄件身分的 email 工具，且本次請求未明確授權
  對外傳送實作摘要；結果記錄於 `documents/ddd-email-notify.md` 的 L042。

## Appendix: TDD Fix Workflow

1. 將下一段測試改為要求保存新範圍且 `scrollTop` 不變，確認目前自動導覽實作紅燈。
2. 移除 Next 專用 pending 導覽與 marker offset 同步狀態。
3. 驗證手動 1/4／3/4 導覽及章末行為不回歸。
4. 執行相關與完整回歸，更新 B25/B26/B27 與 reading-range 模組文件。
