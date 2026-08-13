---
author: Codex
date: 2026-08-13
title: 將新章節的閱讀區段預設為完整章節
uuid: 5d928167-010c-4898-ae2d-bdaf8ee35708
version: 1.1.0
status: implemented
---

# Bug Fix: 將新章節的閱讀區段預設為完整章節

## 1. Bug Overview

目前首次開啟尚未保存範圍的章節時，START 與 END 範圍標籤都初始化在章首，形成空的
閱讀區段。使用者若要針對整個章節進行閱讀、標記或區段練習，每次都必須先手動把 END
移到章末。

## 2. Root Cause

Renderer 的 `initialReadingRange()` 不論章節文字長度為何，都固定回傳
`{ start: 0, end: 0 }`；章節首次載入時又會立即保存這個空範圍，因此後續開啟仍會恢復
相同位置。

## 3. Fix Objective

尚未保存範圍的章節首次載入時，START 預設位於第一句開頭，END 預設位於最後一句結尾，
使閱讀區段涵蓋當下完整章節文字。既有已保存範圍不得被覆寫或重設。

## 4. Acceptance Criteria

- **Scenario 1：新章節預設選取完整章節**
  - **Given** 目前章節具有可閱讀文字且尚未保存閱讀區段
  - **When** 使用者首次進入該章節
  - **Then** START 位於章節文字 offset `0`
  - **And** END 位於章節文字最後一個 offset
  - **And** 擷取出的閱讀區段等於完整章節文字

- **Scenario 2：保存完整預設範圍**
  - **Given** 目前章節尚未保存閱讀區段
  - **When** Renderer 完成章節初始化
  - **Then** 系統保存 `{ start: 0, end: chapterText.length }`

- **Scenario 3：保留既有使用者範圍**
  - **Given** 目前章節已有合法的 START／END 保存位置
  - **When** 使用者再次進入該章節
  - **Then** 系統恢復原位置，不套用完整章節預設值，也不重新保存

- **Scenario 4：空章節維持合法空範圍**
  - **Given** 章節沒有可閱讀文字
  - **When** 系統建立初始閱讀區段
  - **Then** 範圍為 `{ start: 0, end: 0 }`

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 完整章節初始範圍 | 非空章節且無保存範圍 | 呼叫 `initialReadingRange()` | 回傳 `{ start: 0, end: text.length }`，裁切結果等於原文 | Critical |
| TC2 | Renderer 保存完整預設值 | 無 `chapterRanges` 的章節 | 開啟章節閱讀頁 | `saveReadingRange` 收到完整章節範圍 | Critical |
| TC3 | 恢復既有範圍 | 章節已有合法範圍 | 再次開啟章節 | 使用原範圍且不重新保存 | Critical |
| TC4 | 空章節 | 空字串 | 建立初始範圍 | 回傳 `{ start: 0, end: 0 }` | Medium |

## 6. Implementation Notes

- 修改共用 `initialReadingRange(text)`，以 `text.length` 作為 END。
- 保持 App 現有「有合法保存值優先，否則才建立初始值」的分支，不遷移、不覆寫既有範圍。
- 不變更範圍拖曳、右鍵定位、自動推進、閱讀區段裁切或 Main process 保存合約。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `CONTEXT.md`
- `documents/modules/reading-range.md`

## 8. Assumptions and Non-goals

- 使用者所稱「頁面」依領域詞彙解讀為目前 EPUB **章節**；EPUB 沒有穩定固定頁碼。
- 「第一句到最後一句」以 Renderer 當下產生的完整章節純文字邊界表示。
- 不重設任何已保存的閱讀區段，也不新增「一鍵選取整章」操作。
- 不改變「完成這段，前往下一段」的行為。

## 9. Implementation Record

### Status

Implemented on 2026-08-13.

### Implementation Summary

- `initialReadingRange(text)` 現在回傳 `{ start: 0, end: text.length }`，因此非空新章節的
  START 位於章首、END 位於章末，閱讀區段涵蓋完整章節。
- 空章節自然維持 `{ start: 0, end: 0 }`。
- App 原有的保存值優先分支保持不變；合法的既有範圍會直接恢復且不重新保存。
- 原本依賴新章節空範圍的「前往下一段」測試改用明確的既有未完成範圍，繼續驗證推進功能。

### Test Coverage

- TC1／TC4：`reading-range.test.ts` 的
  `initializes a new chapter range across the full chapter` 覆蓋非空完整章節、裁切結果與空章節。
- TC2：`App.test.tsx` 的
  `defaults and persists an unsaved chapter range across the full chapter` 覆蓋 UI offset 與保存 payload。
- TC3：`App.test.tsx` 的
  `restores saved offsets and keeps them through layout changes` 覆蓋既有 START／END 恢復且不重新保存。
- 相鄰回歸：`advances only from the explicit completion action and stops inside the chapter` 以既有未完成
  範圍驗證手動推進仍正常。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/reading-range.ts`

#### Test Code

- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/B22-default-reading-range-to-whole-chapter.md`
- `documents/modules/reading-range.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 新章節預設選取完整章節 | Pass | `initialReadingRange` 單元測試與 UI START／END offset 測試 |
| 保存完整預設範圍 | Pass | `saveReadingRange` 收到 `{ start: 0, end: chapterText.length }` |
| 保留既有使用者範圍 | Pass | 既有 `3..14` offset 恢復且 `saveReadingRange` 未呼叫 |
| 空章節維持合法空範圍 | Pass | 空字串單元測試回傳 `{ start: 0, end: 0 }` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `reading-range.test.ts` 完整章節初始化與裁切 assertion |
| TC2 | Pass | `App.test.tsx` 新章節 UI 與保存 payload assertion |
| TC3 | Pass | `App.test.tsx` 保存 offset 恢復與 no-save assertion |
| TC4 | Pass | `reading-range.test.ts` 空字串 assertion |

### Commands Executed

```bash
# Expected red: 2 failed, 99 passed；收到舊的 END = 0
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Target green after test-data alignment: 2 files, 101/101 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: server 3/3, Desktop 52 files／512 tests
npm test

# Server and Desktop type checks passed
npm run typecheck

# Whitespace/error-marker check passed
git diff --check
```

### Hypotheses and Decisions

- 根因由紅燈直接確認為 `initialReadingRange()` 固定回傳 END `0`，不需要修改 App 初始化流程、
  Main process 或保存合約。
- 使用者所稱「新頁面」依 `CONTEXT.md` 的領域詞彙解讀為尚未保存範圍的 EPUB 章節；既有範圍
  若也重設為整章，會再次破壞使用者已完成的手動調整，因此明確保留。
- Renderer 的章節純文字可包含 EPUB HTML 產生的邊界空白；END 使用完整 `textContent.length`，
  而 `extractReadingSegment()` 既有的 trim 行為確保交給 AI 的文字內容仍是完整可閱讀原文。

### Deferred Items

None.

### Notes

- 未發現新的模組耦合、缺少測試切入點或責任邊界問題，不需要另開 RXX。
- DDD 完成通知未寄送：本次請求未明確授權把本機實作與測試摘要傳送到外部信箱。

## Appendix: TDD Fix Workflow

1. 更新初始範圍單元測試與 Renderer 初始化測試，先確認舊實作失敗。
2. 最小修改 `initialReadingRange()` 使新章節涵蓋完整章節文字。
3. 執行閱讀區段相關測試、Desktop 完整測試、型別檢查與 diff 檢查。
4. 同步本文件、領域關係與閱讀區段模組文件。
