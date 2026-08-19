---
author: Codex
date: 2026-07-29
title: 在閱讀介面快速移到 START／END 範圍標籤
uuid: 4d1d73ca-205e-4a57-8c39-8d92a3b4894d
version: 3.0.0
status: implemented
corrected-by: B14, B25
---

# Feature Specification - START／END 範圍標籤快速移動

## 1. Feature Overview

在章節閱讀介面的浮動標記工具旁提供 `START` 與 `END` 快捷按鈕，讓使用者閱讀長章節時可以快速回到目前閱讀區段的任一**範圍標籤**。快捷操作只把既有標籤捲入視野，不改變範圍位置、章節或 EPUB 原文。

本文件初版曾把「起點／終點」誤解為章節頂端／底端；B14 已修正需求、實作與測試，本版只描述修正後的有效行為。

## 2. Requirements (User Story)

- **As a** 使用 START／END 選取閱讀區段的使用者
- **I want** 從浮動標記工具旁快速移到任一範圍標籤
- **So that** 我可以在長章節中快速找到目前閱讀區段，不必拖曳捲軸搜尋標籤

## 3. Acceptance Criteria

- **Scenario 1：操作位於標記工具旁**
  - **Given** 章節與範圍標籤已載入
  - **When** 使用者查看浮動標記工具
  - **Then** 同一工具 dock 顯示 `START` 與 `END` 快捷按鈕
  - **And** 頂端章節工具列不顯示這組操作

- **Scenario 2：移到 START 範圍標籤**
  - **Given** START 位於目前視野之外
  - **When** 使用者按下 `START`
  - **Then** START boundary 中心被捲到閱讀區可見高度的 1/4

- **Scenario 3：移到 END 範圍標籤**
  - **Given** END 位於目前視野之外
  - **When** 使用者按下 `END`
  - **Then** END boundary 中心被捲到閱讀區可見高度的 3/4

- **Scenario 4：只導覽、不改動範圍**
  - **Given** START／END 已有保存的章內文字 offset
  - **When** 使用者執行任一快捷導覽
  - **Then** offset 維持不變、不呼叫範圍保存，也不切換章節

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 工具位置 | 範圍與標記工具已渲染 | 檢視工具 | START／END 與標記工具同屬浮動 dock，頂端工具列沒有舊操作 | High |
| TC2 | 導覽至 START | START boundary 已渲染 | 點擊 START | START boundary 中心對齊可見高度 1/4 | High |
| TC3 | 導覽至 END | END boundary 已渲染 | 點擊 END | END boundary 中心對齊可見高度 3/4 | High |
| TC4 | 範圍資料不變 | offset 為 4／10 | 依序點擊 START／END | offset 仍為 4／10，未保存範圍 | High |

## 5. Implementation Notes

- 快捷操作放在既有 `.annotation-tool-dock`，與標記模式工具並列。
- 導覽目標是目前章節的 `[data-range-boundary="start"]` 或 `[data-range-boundary="end"]`。
- 依範圍標籤與閱讀捲動區的畫面座標計算 `scrollTop`：START 對齊可見高度 1/4，
  END 對齊 3/4，並限制在合法捲動範圍內。
- 不以章節捲動高度推算標籤位置，也不建立第二套定位資料。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「start／end 標示」對應 `CONTEXT.md` 定義的 START／END 範圍標籤。

### Open Questions

- 無。

### Non-goals

- 不移動、重設、交換或保存範圍標籤。
- 不導覽到章節開頭／結尾、第一章／最後一章。
- 不新增鍵盤快捷鍵或平滑捲動設定。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/implements/B14-jump-to-reading-range-markers.md`
- `documents/modules/reading-range.md`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented via B14 and refined via B25.

### Implementation Summary

- 在浮動標記工具左側加入具可見 `START`／`END` 文字的分段快捷控制。
- 快捷按鈕各自查找目前章節對應 boundary，START 對齊可見高度 1/4，END 對齊 3/4。
- 移除初版放在頂端章節工具列、導覽到章節頂端／底端的錯誤控制與高度計算。
- 導覽不改變 START／END offset，也不呼叫 `saveReadingRange`。
- B25 讓 `Next segment` 更新範圍後自動執行 START 導覽。

### Test Coverage

- TC1–TC4：`keeps START and END range navigation beside the sticky annotation tool`

### Verification

初始修正紀錄見 `B14-jump-to-reading-range-markers.md`；比例定位與下一段自動導覽見
`B25-align-range-navigation-and-next-segment.md`。

## Appendix: TDD Implementation Checklist

1. 以 B14 重現錯誤位置與導覽目標。
2. 將 START／END 快捷操作移入浮動標記工具列。
3. 驗證 START／END 的 1/4／3/4 捲動與範圍資料不變。
4. 同步 F40、B14 與相關模組文件。
