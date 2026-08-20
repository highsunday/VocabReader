---
author: Codex
date: 2026-08-19
title: 讓下一閱讀區段可靠執行 START 導覽
uuid: 3ce7dc38-cd62-48bd-978a-cf5875e2d638
version: 1.0.0
status: implemented
superseded-by: B27
---

# Bug Fix: 讓下一閱讀區段可靠執行 START 導覽

> B27 已依使用者試用決策撤回 `Next segment` 自動 START 導覽。本文件保留為歷史診斷與
> 實作紀錄，不再描述目前產品行為。

## 1. Bug Overview

B25 嘗試在 `Next segment` 更新**閱讀區段**後排程一次 START **範圍標籤**導覽，但使用者
實際操作仍無法可靠地直接跳到新 START，還需要手動按 `Start` 才能到正確位置。

現有測試把 START boundary 的畫面矩形固定為單一值，沒有重現從舊 START 到新 START 的
DOM 定位變化，因此即使自動導覽讀到舊 boundary 位置也可能通過。

## 2. Diagnosis Objective

- 建立包含舊 START、新 START、marker top 重新量測與 React Strict Mode effect 時序的測試。
- 確認自動導覽執行時，boundary DOM 已呈現新 START 的畫面位置。
- 排除動畫影格被取消及保存回傳覆蓋捲動位置的可能性。

## 3. Fix Objective

- 按下 `Next segment` 後，先計算並保存下一個閱讀區段。
- 只有新 START offset 對應的 marker top 已套用到 DOM 後，才執行與手動 `Start` 完全相同
  的 1/4 導覽函式。
- 自動導覽不得使用舊 START 的 boundary 位置，也不得由一般拖曳、右鍵移動或初始載入觸發。
- START／END 手動導覽、閱讀區段 offset、保存格式及章末停止規則維持不變。

## 4. Acceptance Criteria

- **Scenario 1：下一閱讀區段使用新 START 導覽**
  - **Given** 舊 START 與新 START 位於不同的畫面位置
  - **When** 使用者按下 `Next segment`
  - **Then** 系統保存新的閱讀區段
  - **And** 自動導覽以新 START boundary 的畫面位置計算 1/4 捲動

- **Scenario 2：等同手動按下 Start**
  - **Given** 下一閱讀區段已完成 marker 定位
  - **When** 自動導覽執行
  - **Then** 它呼叫與 `Start` 快捷按鈕相同的導覽函式與比例

- **Scenario 3：不得過早導覽**
  - **Given** reading range 已更新但新 marker top 尚未套用至 DOM
  - **When** renderer 正在重新量測
  - **Then** 不得清除待執行導覽或使用舊 START 座標

- **Scenario 4：其他範圍互動不自動捲動**
  - **Given** 使用者拖曳或透過右鍵移動範圍標籤
  - **When** offset 與 marker top 更新
  - **Then** 不觸發 `Next segment` 專用的 START 自動導覽

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 舊／新位置轉換 | boundary 矩形由 DOM `style.top` 決定 | 點擊 Next segment | 最終 scrollTop 使用新 START top | Critical |
| TC2 | Strict Mode 時序 | App 在 React Strict Mode 渲染 | 點擊 Next segment | effect cleanup／setup 後仍完成一次正確導覽 | Critical |
| TC3 | 手動 Start 共用邏輯 | 新 START 已渲染 | 比較自動與手動導覽 | 兩者使用相同 1/4 計算 | High |
| TC4 | 非 Next 更新 | 拖曳或右鍵調整範圍 | marker top 更新 | 不發生 Next 專用捲動 | High |

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/B25-align-range-navigation-and-next-segment.md`
- `documents/modules/reading-range.md`

## 7. Assumptions and Non-goals

- 使用者所稱「next 片段」對應 UI 的 `Next segment` 與領域詞彙「下一閱讀區段」。
- `Start` 的既定位置仍為閱讀可見高度 1/4；本修正不變更比例。
- 不改變下一閱讀區段的文字範圍演算法、不跨章、不新增動畫設定。

## 8. Implementation Record

### Status

Implemented on 2026-08-19.

### Root Cause

B25 以 `requestAnimationFrame` 假設 `setMarkerTops()` 觸發的 React render 一定會在動畫影格
回呼之前提交。這個時序不是程式本身保證的：若導覽回呼先執行，它會讀取舊 START boundary
矩形、清除 pending，接著新 marker top 才套用到 DOM，最終仍停在舊閱讀位置。

B25 的整合測試把 boundary 矩形固定為新位置，沒有模擬舊／新 `style.top` 轉換，因此無法
辨識導覽使用的是哪一次量測結果。

### Implementation Summary

- marker top state 現在同時記錄 `startOffset`／`endOffset`，明確表示畫面 top 是由哪一組
  閱讀區段 offset 量測而來。
- `Next segment` 的 pending 導覽記錄章節 ID 與預期的新 START offset。
- 獨立 effect 只有在 pending chapter、目前 reading range START 與已量測 START offset 三者
  完全相符時，才清除 pending 並呼叫 `scrollToReadingRangeMarker("start")`。
- 移除 B25 對 `requestAnimationFrame`／effect cleanup 時序的依賴；手動 `Start` 與自動導覽
  繼續共用同一個 1/4 捲動函式。

### Test Coverage

- TC1／TC2／TC3：`navigates Next segment from the newly measured START position in Strict Mode`
  讓 boundary 矩形依 `style.top` 動態變化，並把動畫影格提前執行；舊實作會停在 0，新實作
  等新 START top 700px 套用後捲至 490，且與隨後手動按 Start 的結果相同。
- TC4：`moves a range marker from the current line menu and persists it` 現在固定既有
  `scrollTop`，驗證右鍵移動 START 與量測更新不觸發 Next 專用導覽。
- B25 既有的 START 1/4、END 3/4、下一段推進、範圍資料不變與章末停用測試保持通過。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B26-make-next-segment-use-start-navigation.md`
- `documents/implements/B25-align-range-navigation-and-next-segment.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 下一閱讀區段使用新 START 導覽 | Pass | 動態舊／新 boundary top 回歸測試 |
| 等同手動按下 Start | Pass | 自動與手動皆得到 scrollTop 490 |
| 不得過早導覽 | Pass | 已量測 offset 三方相符條件 |
| 其他範圍互動不自動捲動 | Pass | 右鍵移動後 scrollTop 維持 123 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | style.top 100px → 700px dynamic geometry |
| TC2 | Pass | `<StrictMode><App /></StrictMode>` regression test |
| TC3 | Pass | shared 1/4 result assertion |
| TC4 | Pass | current-line menu preserves scroll position |

### Commands Executed

```bash
# Baseline probe passed under ordinary animation-frame ordering
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "navigates Next segment from the newly measured START position in Strict Mode"

# Correct red after exposing the scheduling race: 1 failed, scrollTop expected 490 but received 0
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "navigates Next segment from the newly measured START position in Strict Mode"

# Target green: 1/1 passed
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "navigates Next segment from the newly measured START position in Strict Mode"

# Related regression: 107/107 passed
npm test -w @reader/desktop -- \
  src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: Server 3/3, Desktop 541/541
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; only the existing chunk-size warning was reported
npm run build -w @reader/desktop

# Debug-marker and whitespace checks passed
rg -n "\\[DEBUG-" apps documents
git diff --check
```

### Hypotheses and Decisions

- **Confirmed:** 自動導覽可能早於新 marker top DOM commit；把動畫影格提前時可穩定重現
  「offset 已更新、START 最後也在新位置，但 scrollTop 仍為 0」。
- **Confirmed test gap:** 固定 boundary 矩形的 B25 測試會掩蓋使用舊位置的錯誤；改為從
  `style.top` 與目前 `scrollTop` 動態計算矩形後，測試可區分新舊位置。
- **Ruled out:** React Strict Mode 本身不會在正常動畫影格排序下取消導覽；第一輪動態測試通過。
- **Ruled out:** 保存回傳不是此回歸的必要條件；紅燈在本機 mock 保存尚未覆蓋捲動時已重現。
- 修正採用資料一致性條件，而不是增加第二個 animation frame 或 timeout；因此不依賴裝置負載
  與瀏覽器排程速度。

### Deferred Items

None.

### Notes

- 找到的架構問題限於 marker top state 原先缺少來源 offset；已在本次以小型狀態擴充補足，
  不需要另開 RXX。
- 未寄送 DDD 完成通知：目前沒有可驗證寄件身分的 email 工具，且本次請求未明確授權
  對外傳送實作摘要；結果記錄於 `documents/ddd-email-notify.md` 的 L041。
- B27 後續撤回本文件建立的 pending offset、marker offset 同步狀態與自動導覽 effect。

## Appendix: TDD Fix Workflow

1. 以動態 marker top 與 Strict Mode 測試重現錯誤時序。
2. 驗證候選根因並記錄排除結果。
3. 最小修正自動導覽的「已量測 offset」同步條件。
4. 執行相關與完整回歸，更新 B25、B26 與 reading-range 模組文件。
