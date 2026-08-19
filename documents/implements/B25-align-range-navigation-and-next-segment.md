---
author: Codex
date: 2026-08-19
title: 修正閱讀區段快捷導覽與下一段定位
uuid: 6a386156-6f88-4e57-bdaf-5ff0a5fd6b50
version: 1.0.0
status: implemented
---

# Bug Fix: 修正閱讀區段快捷導覽與下一段定位

## 1. Bug Overview

目前使用者按下 `Next segment` 後，系統只更新並保存下一個**閱讀區段**，不會把新的
START **範圍標籤**移入視野；使用者還必須再按一次 `Start` 才會移到正確閱讀位置。

此外，`Start` 與 `End` 快捷導覽都使用瀏覽器的置中捲動，因此兩個範圍標籤都落在可見
捲動區中央，無法讓起點下方與終點上方保留符合閱讀方向的上下文。

## 2. Root Cause

- `advanceToNextReadingRange()` 只呼叫 `persistReadingRange()`，沒有在新的範圍標籤完成
  渲染與定位後接續 START 導覽。
- `scrollToReadingRangeMarker()` 對 START／END 一律呼叫
  `scrollIntoView({ block: "center" })`，沒有依標籤種類計算不同的可見區位置。

## 3. Fix Objective

- 按下 `Next segment` 後，在下一閱讀區段完成更新與範圍標籤重新定位後，自動執行與
  `Start` 快捷鍵相同的導覽。
- `Start` 導覽把 START 範圍標籤對齊可見捲動區高度的 1/4。
- `End` 導覽把 END 範圍標籤對齊可見捲動區高度的 3/4。
- 快捷導覽與自動導覽只改變捲動位置，不再次更改或保存閱讀區段。

## 4. Acceptance Criteria

- **Scenario 1：START 導覽對齊 1/4**
  - **Given** START 範圍標籤已渲染於目前章節
  - **When** 使用者按下 `Start`
  - **Then** START 範圍標籤中心位於閱讀捲動區可見高度的 1/4

- **Scenario 2：END 導覽對齊 3/4**
  - **Given** END 範圍標籤已渲染於目前章節
  - **When** 使用者按下 `End`
  - **Then** END 範圍標籤中心位於閱讀捲動區可見高度的 3/4

- **Scenario 3：前往下一閱讀區段後自動導覽至 START**
  - **Given** 目前閱讀區段尚未到達章末
  - **When** 使用者按下 `Next segment`
  - **Then** 系統計算並保存下一個連續閱讀區段
  - **And** 新 START 完成渲染與定位後，自動執行 START 的 1/4 導覽

- **Scenario 4：導覽不改動閱讀區段資料**
  - **Given** START／END 已有保存的章內文字 offset
  - **When** 使用者按下 `Start` 或 `End`
  - **Then** offset 維持不變，且不呼叫範圍保存

- **Scenario 5：章末維持停止狀態**
  - **Given** 目前閱讀區段 END 已在章末
  - **When** 使用者查看 `Next segment`
  - **Then** 按鈕維持停用，不產生額外範圍保存或自動導覽

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | START 位置 | 已知捲動區與 START 畫面座標 | 點擊 Start | 捲動量使 START 中心對齊高度 1/4 | Critical |
| TC2 | END 位置 | 已知捲動區與 END 畫面座標 | 點擊 End | 捲動量使 END 中心對齊高度 3/4 | Critical |
| TC3 | 下一段自動定位 | 目前區段後仍有文字 | 點擊 Next segment | 保存新範圍，重新定位後執行 START 1/4 導覽 | Critical |
| TC4 | 導覽資料不變 | offset 為 4／10 | 依序點擊 Start／End | offset 不變且未保存範圍 | High |
| TC5 | 章末停止 | END 等於章節長度 | 檢視或嘗試操作 Next segment | 按鈕停用，無保存與導覽 | High |

## 6. Implementation Notes

- 導覽以 `.content.reader-content` 實際可見高度為基準，透過範圍標籤與捲動容器的
  `getBoundingClientRect()` 差值計算新的 `scrollTop`。
- 對齊使用範圍標籤中心，而不是元素上緣，避免標籤本身高度造成視覺偏差。
- `Next segment` 必須等 React 套用新閱讀區段、重新量測 marker top 後才導覽，不可捲到
  舊 START。
- 捲動目標需限制在合法的 `0...scrollHeight-clientHeight` 範圍內；章首或章末無法精確
  對齊時，以可達到的最近位置為準。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`

## 8. Assumptions and Non-goals

- 使用者所稱 `next section` 對應目前 UI 的 `Next segment`，領域上仍稱為「前往下一閱讀區段」。
- 1/4 與 3/4 以閱讀主內容的可見捲動區高度計算，不以整個作業系統螢幕高度計算。
- 不變更下一閱讀區段的約略字數、連續範圍演算法、章末停止規則或持久化格式。
- 不新增平滑捲動動畫、跨章推進或鍵盤快捷鍵。

## 9. Implementation Record

### Status

Implemented on 2026-08-19.

### Implementation Summary

- START 與 END 快捷導覽不再共同使用 `scrollIntoView({ block: "center" })`；renderer 改以
  範圍標籤中心、閱讀捲動區上緣與可見高度計算新 `scrollTop`，分別對齊 1/4 與 3/4。
- 計算後的 `scrollTop` 限制在 `0...scrollHeight-clientHeight`，章首或章末使用最近可達位置。
- `Next segment` 保存下一個閱讀區段前記錄待執行的 START 導覽；新 START 完成渲染與
  marker top 量測後，於下一動畫影格執行相同的 1/4 導覽，避免捲到舊 START。
- 快捷導覽仍不改動 offset 或呼叫 `saveReadingRange()`；章末按鈕維持停用。

### Test Coverage

- TC1／TC2／TC4：`keeps START and END range navigation beside the sticky annotation tool`
  以固定容器與 boundary 座標驗證 START 1/4、END 3/4，以及 offset／保存不變。
- TC3：`advances only from the explicit completion action and stops inside the chapter` 驗證
  新範圍保存後自動執行 START 1/4 導覽。
- TC5：`defaults and persists an unsaved chapter range across the full chapter` 驗證章末
  `Next segment` 停用，點擊不增加保存呼叫。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B25-align-range-navigation-and-next-segment.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| START 導覽對齊 1/4 | Pass | App 固定幾何座標測試 |
| END 導覽對齊 3/4 | Pass | App 固定幾何座標測試 |
| 前往下一閱讀區段後自動導覽至 START | Pass | 下一段保存與延後導覽整合測試 |
| 導覽不改動閱讀區段資料 | Pass | offset 與 `saveReadingRange` assertion |
| 章末維持停止狀態 | Pass | 全章初始範圍的 disabled／無額外保存測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | START target center → 1/4 scrollTop |
| TC2 | Pass | END target center → 3/4 scrollTop |
| TC3 | Pass | Next segment → persisted range → scheduled START navigation |
| TC4 | Pass | saved offset and call-count assertions |
| TC5 | Pass | chapter-end disabled action assertion |

### Commands Executed

```bash
# Expected red: 2 failed
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "advances only from the explicit completion action|keeps START and END range navigation"

# Target green: 2/2 passed
npm test -w @reader/desktop -- src/renderer/App.test.tsx -t \
  "advances only from the explicit completion action|keeps START and END range navigation"

# Related regression: 106/106 passed
npm test -w @reader/desktop -- \
  src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: Server 3/3, Desktop 540/540
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; only the existing chunk-size warning was reported
npm run build -w @reader/desktop

# Whitespace/error-marker check passed
git diff --check
```

### Hypotheses and Decisions

- 根因由既有 handler 直接確認，不需要進入 `diagnose`：下一段 handler 缺少導覽，而快捷
  handler 明確把兩個標籤都置中。
- 比例以閱讀主內容的捲動容器為準；這與使用者實際可閱讀區一致，也不受作業系統視窗外框影響。
- 使用 boundary 中心對齊，避免 28px 標籤高度造成肉眼可見的固定偏移。
- 下一段導覽必須在新 marker top 完成量測後執行，因此使用一次性 pending ref 與
  `requestAnimationFrame`，不讓一般拖曳、右鍵移動或章節初始化觸發自動捲動。

### Deferred Items

None.

### Notes

- 未發現新的模組耦合、缺少測試切入點或責任邊界問題，不需要另開 RXX。
- 未寄送 DDD 完成通知：本次請求只授權本機實作，未明確授權把實作與測試摘要傳送到
  外部收件匣；詳見 `documents/ddd-email-notify.md` 的 L040。

## Appendix: TDD Fix Workflow

1. 以 UI 測試重現 START／END 仍置中與 Next segment 未導覽。
2. 最小修改 renderer 的範圍標籤捲動計算與下一段完成後的導覽時序。
3. 驗證快捷導覽不保存範圍、章末停止及既有閱讀區段推進行為。
4. 執行相關測試、完整回歸、型別檢查與文件同步。
