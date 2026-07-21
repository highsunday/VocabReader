---
author: Codex
date: 2026-07-21
title: 精簡側欄書籍導覽與說明內容
uuid: 71103625b93b4fc18b68ed5396e3e79f
version: 1.1.0
status: implemented
---

# Feature Specification - 精簡側欄導覽

## 1. Feature Overview

移除左側主要導覽中的「書籍總覽」按鈕，讓使用者直接從書庫選取書籍進入該書的書籍總覽；同時移除側欄內「章節機制」及其閱讀、解析、生詞、章末練習與 Anki 排程說明，降低重複入口與非必要資訊造成的干擾。

## 2. Requirements (User Story)

- **As a** 從書庫挑選 EPUB 閱讀的使用者
- **I want** 直接選取書籍，不再看到額外的書籍總覽按鈕與章節機制說明
- **So that** 左側欄更精簡，書籍切換方式也更直接

## 3. Acceptance Criteria

- **Scenario 1：直接選取書籍**
  - **Given** 書庫中已有兩本書籍
  - **When** 使用者點選另一本文字書籍
  - **Then** 中央區域顯示該書的書籍總覽

- **Scenario 2：移除重複總覽入口**
  - **Given** 應用程式顯示左側主要導覽
  - **When** 使用者檢視主要導覽
  - **Then** 不顯示「書籍總覽」按鈕，並保留 Anki 複習入口

- **Scenario 3：移除章節機制說明**
  - **Given** 應用程式顯示左側欄
  - **When** 使用者檢視側欄內容
  - **Then** 不顯示「章節機制」、閱讀與劃線、AI 集中解析、加入生詞庫、章末選擇題及 Anki 獨立排程說明區塊

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 書籍直接切換 | 已載入兩本書籍 | 點選第二本書 | 顯示第二本書的書籍總覽 | High |
| TC2 | 導覽入口精簡 | 左側主要導覽已呈現 | 查找導覽按鈕 | 無書籍總覽按鈕，Anki 複習仍存在 | High |
| TC3 | 說明區塊移除 | 左側欄已呈現 | 查找章節機制區塊 | 整個說明區塊不存在 | High |

## 5. Implementation Notes

- 僅調整 renderer 的側欄內容，不改變書籍總覽畫面、閱讀介面中的返回總覽操作或每本書的閱讀狀態恢復。
- 移除不再使用的章節機制樣式，保留 Anki 複習導覽樣式。

## 6. Assumptions and Non-goals

- 「移除書籍總覽按鈕」指左側主要導覽按鈕，不包含章節閱讀介面中的「返回總覽」。
- 不移除中央書籍總覽畫面；選取書籍後仍依既有閱讀狀態顯示書籍總覽或恢復閱讀。
- 不變更 Anki 複習功能與右側 AI 對話面板。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 移除左側主要導覽中的「書籍總覽」按鈕，書庫中的書籍項目成為側欄唯一的書籍總覽入口。
- 保留 Anki 複習按鈕與閱讀介面的「返回總覽」操作。
- 移除整個「章節機制」說明區塊及其不再使用的 CSS。
- 保留既有書籍切換與閱讀狀態恢復行為。

### Test Coverage

- `App.test.tsx` 新增 TC2、TC3 驗收測試，確認側欄沒有書籍總覽按鈕及章節機制內容，且 Anki 複習入口仍存在。
- `App.test.tsx` 既有書籍切換測試涵蓋 TC1，確認點選第二本書後顯示其書籍總覽。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/F03-simplify-sidebar-navigation.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 直接選取書籍 | Pass | `lists persisted books and switches to the selected book overview` |
| 移除重複總覽入口 | Pass | `uses book selection as the only overview entry and omits the learning mechanism copy` |
| 移除章節機制說明 | Pass | `uses book selection as the only overview entry and omits the learning mechanism copy` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `lists persisted books and switches to the selected book overview` |
| TC2 | Pass | `uses book selection as the only overview entry and omits the learning mechanism copy` |
| TC3 | Pass | `uses book selection as the only overview entry and omits the learning mechanism copy` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- App.test.tsx
npm test
npm run typecheck
npm run build
```

結果：目標測試紅燈時 1/8 失敗，原因為舊側欄仍顯示「章節機制」；實作後目標測試 8/8、server 3/3、desktop 17/17 通過，型別檢查與正式建置通過。

### Hypotheses and Decisions

- 保留閱讀介面的「返回總覽」，因其不是使用者要求移除的左側欄按鈕。
- 保留書籍各自的 `readingState` 恢復行為；點選曾停在閱讀介面的書籍時仍可恢復閱讀，而不是強制回到總覽。
- 工作區原有的「上一章／下一章」未提交變更與本需求無關，實作時予以保留。

### Deferred Items

未執行 Electron E2E；變更僅涉及已由 React renderer 測試涵蓋的側欄標記與 CSS，完整單元測試、型別檢查及正式建置均已通過。

### Notes

未發現新的架構問題；本次沒有改變模組邊界、資料格式或 IPC。

## Appendix: TDD Implementation Checklist

1. 新增側欄精簡行為的失敗測試。
2. 移除側欄按鈕、說明內容與無用樣式。
3. 執行 renderer 測試、型別檢查與正式建置。
4. 同步本文件與書庫模組文件。
