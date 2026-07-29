---
author: Codex
date: 2026-07-29
title: 修正快速移動按鈕以導覽至 START／END 範圍標籤
uuid: 5d2a38ca-5219-46d2-8381-1effad1217ca
version: 1.1.0
status: implemented
related-feature: F40
---

# Bug Fix: 修正快速移動按鈕以導覽至 START／END 範圍標籤

## 1. Bug Overview

F40 將使用者所稱的「起點／終點」誤解為目前章節可捲動內容的頂端／底端，因此把快捷按鈕放在最上方章節工具列，並直接修改閱讀容器的 `scrollTop`。

正確需求是快速移動到目前閱讀區段的 `START`／`END` **範圍標籤**，而且按鈕應位於浮動標記工具旁邊，讓閱讀與標記操作集中在同一工具列。

## 2. Root Cause

- F40 的需求文件錯把「起點／終點」解讀為章節邊界，沒有沿用 `CONTEXT.md` 已定義的 START／END 範圍標籤語意。
- Renderer 因此以章節 `scrollHeight` 為導覽目標，並把操作放進頂端 `reader-toolbar`，兩者都與使用者預期不符。

## 3. Fix Objective

- 移除頂端章節工具列中的錯誤章節頂端／底端按鈕。
- 在既有浮動 `.annotation-tool-dock` 中、標記工具旁加入 `START` 與 `END` 快捷按鈕。
- 點擊後把目前章節對應的範圍標籤捲入可見區域，並避免被頂端固定工具列遮住。
- 導覽不得改動、保存或重設閱讀區段，也不得切換章節。

## 4. Acceptance Criteria

- **Scenario 1：工具位置與語意**
  - **Given** 使用者正在閱讀已載入且具有範圍標籤的章節
  - **When** 閱讀介面顯示浮動標記工具
  - **Then** 同一 `.annotation-tool-dock` 顯示 `START` 與 `END` 快捷按鈕
  - **And** 頂端 `reader-toolbar` 不再顯示這組快捷按鈕

- **Scenario 2：導覽至 START 範圍標籤**
  - **Given** START 範圍標籤位於目前視野之外
  - **When** 使用者按下 `START` 快捷按鈕
  - **Then** 系統把目前章節的 START 範圍標籤捲入閱讀區中央附近

- **Scenario 3：導覽至 END 範圍標籤**
  - **Given** END 範圍標籤位於目前視野之外
  - **When** 使用者按下 `END` 快捷按鈕
  - **Then** 系統把目前章節的 END 範圍標籤捲入閱讀區中央附近

- **Scenario 4：導覽不改動閱讀區段**
  - **Given** START／END 已有保存的章內文字 offset
  - **When** 使用者執行任一快捷導覽
  - **Then** START／END offset 維持不變
  - **And** 不呼叫範圍保存、不切換章節

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 快捷按鈕位於浮動工具列 | 章節與範圍已載入 | 檢視工具 | START／END 與標記工具同屬 `.annotation-tool-dock`，頂端工具列沒有這組按鈕 | High |
| TC2 | 移到 START | START boundary 已渲染 | 點擊 START | 對 START boundary 執行置中捲動 | High |
| TC3 | 移到 END | END boundary 已渲染 | 點擊 END | 對 END boundary 執行置中捲動 | High |
| TC4 | 保持範圍資料 | 範圍為有效 offset | 點擊 START／END | offset 不變且 `saveReadingRange` 未呼叫 | High |

## 6. Implementation Notes

- 使用目前章節內的 `[data-range-boundary="start"]` 與 `[data-range-boundary="end"]` 作為導覽目標。
- 以 `scrollIntoView({ block: "center" })` 讓目標避開頂端固定章節工具列；不以章節 `scrollHeight` 推算位置。
- START／END 快捷按鈕使用明確的可存取名稱，並以可見文字區分目標。
- 保留範圍標籤的拖曳、右鍵移動、重疊避讓與持久化流程，不新增第二套定位狀態。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/implements/B14-jump-to-reading-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/modules/book-library.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者所稱的 start／end 對應 `CONTEXT.md` 定義的 START／END 範圍標籤。
- 快捷導覽的完成條件是讓標籤清楚可見；不要求改變標籤位置。

### Non-goals

- 不移動、交換、重設或保存範圍標籤。
- 不導覽到章節開頭、章節結尾、第一章或最後一章。
- 不新增鍵盤快捷鍵或範圍歷史。

## 9. Implementation Record

### Status

Implemented on 2026-07-29.

### Implementation Summary

- 移除頂端章節工具列中導覽至章節頂端／底端的錯誤按鈕與 `scrollHeight` 計算。
- 在 `.annotation-tool-dock` 中加入可見文字為 `START`／`END` 的分段快捷控制，與標記工具並列。
- 點擊快捷按鈕會查找目前章節對應的 `[data-range-boundary]`，並執行 `scrollIntoView({ block: "center" })`。
- 導覽後 START／END offset 維持不變，且不呼叫 `saveReadingRange`。
- 把 F40 更名並改寫成正確的範圍標籤導覽需求，並同步 reading-range 與 book-library 模組文件。

### Test Coverage

- TC1–TC4：`keeps START and END range navigation beside the sticky annotation tool`
  - 驗證 START／END 與標記工具同屬 `.annotation-tool-dock`。
  - 驗證頂端 `reader-toolbar` 不含舊控制組。
  - 驗證兩個 boundary 分別以 `block: "center"` 捲入視野。
  - 驗證 offset 保持 4／10 且 `saveReadingRange` 未呼叫。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B14-jump-to-reading-range-markers.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 工具位置與語意 | Pass | Renderer 測試驗證 START／END 與標記工具同屬浮動 dock，頂端沒有舊控制組 |
| 導覽至 START 範圍標籤 | Pass | 同一測試驗證 START boundary 收到置中捲動 |
| 導覽至 END 範圍標籤 | Pass | 同一測試驗證 END boundary 收到置中捲動 |
| 導覽不改動閱讀區段 | Pass | 同一測試驗證 offset 4／10 不變且未保存範圍 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `keeps START and END range navigation beside the sticky annotation tool` |
| TC2 | Pass | 同上 |
| TC3 | Pass | 同上 |
| TC4 | Pass | 同上 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "keeps START and END range navigation"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx
npm run test -w @reader/desktop -- --run
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 紅燈：B14 重現測試 1/1 因找不到浮動 dock 中的 START／END 導覽而失敗；畫面只存在頂端錯誤按鈕。
- 綠燈：B14 目標測試 1/1 通過。
- App renderer：70/70 通過。
- Desktop suite：302/302 通過。
- Desktop TypeScript typecheck：通過。
- Desktop production build：通過。
- `git diff --check`：通過。

### Hypotheses and Decisions

- 根因不是捲動演算法故障，而是 F40 初版把已有明確領域定義的 START／END 範圍標籤誤解為章節邊界。
- 直接導覽到 boundary DOM 比從文字 offset 或 `scrollHeight` 重新推算像素更可靠，並能沿用既有重疊避讓後的實際畫面位置。
- 使用 `block: "center"`，避免範圍標籤捲到頂端後被 sticky 章節工具列或浮動工具遮擋。

### Deferred Items

- 未新增鍵盤快捷鍵、平滑捲動設定或範圍歷史，符合 B14 non-goals。

### Notes

- 未發現新的架構耦合、責任邊界不清或缺少測試接縫；現有 boundary DOM 與 `.annotation-tool-dock` 已足以承載此導覽行為。

## Appendix: TDD Fix Workflow

1. 先以 renderer 測試重現錯誤位置與錯誤捲動目標。
2. 移除頂端錯誤操作，在浮動標記工具旁加入 START／END 導覽。
3. 驗證兩個 boundary 被置中捲入視野，範圍 offset 與保存呼叫保持不變。
4. 跑完整 renderer 回歸、型別檢查與 production build。
5. 同步 B14、F40 與相關模組文件。
