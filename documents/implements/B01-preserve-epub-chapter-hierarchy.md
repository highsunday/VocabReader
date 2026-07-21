---
author: Codex
date: 2026-07-21
title: 保留並呈現 EPUB 章節與子章節層級
uuid: 6f1271b4f7564e1abfcfbf50c86d1eb5
version: 1.1.0
status: implemented
---

# Bug Fix - 保留並呈現 EPUB 章節與子章節層級

## 1. Bug Overview

書籍總覽目前把 EPUB 3 navigation document 的巢狀清單與 EPUB 2 NCX 的巢狀 `navPoint` 攤平成單一層級，`BookChapter` 也沒有保存目錄深度。更嚴重的是，同一份 XHTML 中以不同 fragment 指向的子章節會因共用檔案路徑而被當成重複章節移除。

在已導入的 *American Accent Training* 中，原始 NCX 例如包含 `Chapter 1 The American Sound` 下的 `Pure Sound`、`Voice Quality` 等子章節，但本機索引只剩 27 個頂層項目，書籍總覽無法呈現原書目錄結構。

## 2. Fix Objective

保留 EPUB 目錄中的章節層級及 fragment，讓頂層章節與子章節都出現在書籍總覽，並以縮排、字級、標記與操作文字清楚區分。點擊子章節時應載入所屬 XHTML 並定位到該子章節錨點。既有已導入書籍應從保存的 EPUB 自動補回目錄層級，不要求使用者刪除後重新導入。

## 3. Acceptance Criteria

- **Scenario 1：保留 EPUB 3 巢狀目錄**
  - **Given** EPUB 3 navigation document 含頂層章節與巢狀子章節
  - **When** 系統導入書籍
  - **Then** 所有目錄項目依原順序保存，並帶有正確深度與 fragment

- **Scenario 2：保留 EPUB 2 NCX 巢狀目錄**
  - **Given** EPUB 2 NCX 的頂層 `navPoint` 內含子 `navPoint`
  - **When** 系統導入書籍
  - **Then** 同一 XHTML、不同 fragment 的父子項目不被去重，且層級正確

- **Scenario 3：書籍總覽區分子章節**
  - **Given** 已選書籍同時含頂層章節與子章節
  - **When** 書籍總覽顯示目錄
  - **Then** 子章節以縮排、較小標題、層級標記及「閱讀此節」呈現，頂層章節維持主要章節樣式

- **Scenario 4：子章節閱讀定位**
  - **Given** 子章節指向 XHTML 中的 fragment
  - **When** 使用者點擊該子章節
  - **Then** 閱讀介面載入所屬 XHTML、保留安全的元素 id，並定位至對應 fragment

- **Scenario 5：既有書籍自動補回層級**
  - **Given** 本機索引中的既有書籍章節尚無層級資料，但保存的 EPUB 仍存在
  - **When** 系統載入書庫
  - **Then** 系統從 EPUB 重新解析目錄、保留既有閱讀狀態，並持久化補回後的章節資料

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | EPUB 3 巢狀目錄 | navigation document 含父子 `<ol>` | 導入 EPUB | 父子項目順序、depth、fragment 正確 | High |
| TC2 | EPUB 2 同檔案子章節 | NCX 父子 navPoint 指向同檔案不同 fragment | 導入 EPUB | 父子項目皆保留且 id 不同 | High |
| TC3 | 總覽階層樣式 | 書籍含 depth 0 與 depth 1 項目 | 顯示書籍總覽 | 子章節具可辨識的階層 class／標記與「閱讀此節」 | High |
| TC4 | fragment 載入 | 子章節指向 `chapter.xhtml#section` | 讀取子章節 | 回傳 fragment，安全 HTML 保留目標 id | High |
| TC5 | 舊索引遷移 | 索引章節沒有 depth／fragment | `listBooks()` | 重新解析保存的 EPUB 並保留 readingState | High |
| TC6 | 無巢狀目錄相容 | EPUB 只有頂層章節 | 導入及顯示 | 所有項目 depth 為 0，既有主要樣式與閱讀行為不變 | Medium |

## 5. Implementation Notes

- `BookChapter` 增加目錄深度與 fragment；`href` 仍只保存 EPUB archive 內的 XHTML 路徑。
- EPUB 3 `<ol>` 與 EPUB 2 `navPoint` 遞迴解析時攜帶 depth。
- 頂層章節識別碼維持以 XHTML 路徑產生，以相容既有閱讀狀態；子章節以路徑及 fragment 產生不同識別碼。
- 章節安全 HTML 只保留合法元素上的安全 `id`，不得因此放寬腳本、事件或外部資源限制。
- 載入舊索引時只針對缺少新目錄欄位的書籍重新解析本機 EPUB；解析成功後更新索引。
- 書籍總覽仍依 EPUB 目錄順序呈現，不新增展開／收合狀態。

## 6. Assumptions and Non-goals

- 本次「不同呈現」定義為子章節縮排、較小字級、階層標記與不同操作文字，不加入展開／收合互動。
- 支援任意 depth 的資料，但視覺縮排會限制最大值，避免惡意或異常 EPUB 撐破版面。
- 不重新分類封面、版權頁或附錄；層級完全以 EPUB navigation／NCX 提供的結構為準。
- 不修正 EPUB 標題中的 HTML entity 顯示問題；該問題可另案處理。

## 7. Affected Modules and Files

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- EPUB 3 navigation document 與 EPUB 2 NCX 解析現在會保存每個目錄項目的 `depth` 與 fragment。
- 同一 XHTML 的頂層章節與子章節使用不同識別碼，不再因檔案路徑相同而刪除子章節；頂層識別碼維持相容舊閱讀狀態。
- 書籍總覽把子章節呈現為縮排、較小字級、`↳ 子章節` 標記及「閱讀此節 →」，並限制最大視覺縮排。
- 子章節載入時回傳 fragment；安全章節 HTML 保留合法閱讀元素的 `id`，renderer 會定位到對應段落。
- `listBooks()` 會偵測缺少新欄位的舊索引，從本機保存的 EPUB 重新解析並持久化章節層級，不需重新導入書籍。

### Test Coverage

- TC1、TC2、TC6：`library-service.test.ts` 驗證 EPUB 3／EPUB 2 父子目錄、同檔案不同 fragment、頂層相容。
- TC3：`App.test.tsx` 驗證子章節 class、depth、層級標記與操作文字。
- TC4：`library-service.test.ts` 驗證子章節 fragment 回傳及安全目標 `id` 保留。
- TC5：`library-service.test.ts` 驗證舊索引從保存 EPUB 自動補回層級，且閱讀狀態不變。

### Changed Files

#### Production Code

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B01-preserve-epub-chapter-hierarchy.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 保留 EPUB 3 巢狀目錄 | Pass | `preserves nested EPUB 3 entries that point to a fragment in the same chapter file` |
| 保留 EPUB 2 NCX 巢狀目錄 | Pass | `imports EPUB 2 metadata, legacy cover and NCX navigation` |
| 書籍總覽區分子章節 | Pass | `visually distinguishes subchapters in the book overview` |
| 子章節閱讀定位 | Pass | `returns a subchapter fragment and preserves its safe target id` + renderer fragment 定位邏輯 |
| 既有書籍自動補回層級 | Pass | `rebuilds missing hierarchy metadata for books imported with an old index` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | EPUB 3 nested navigation service test |
| TC2 | Pass | EPUB 2 nested NCX service test |
| TC3 | Pass | renderer hierarchy presentation test |
| TC4 | Pass | fragment and safe target id service test |
| TC5 | Pass | legacy index migration service test |
| TC6 | Pass | existing flat EPUB import and renderer tests |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/library-service.test.ts src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：紅燈階段 6 個新情境失敗、21 個既有情境通過；實作後 server 3/3、desktop 30/30、Electron E2E 2/2 通過，型別檢查與正式建置通過。E2E 首次在受限環境無法啟動 Electron，允許桌面程序啟動後重跑通過。

### Hypotheses and Decisions

- 已直接檢查使用者本機保存的 *American Accent Training* EPUB 與索引，確認 NCX 的巢狀子章節存在，但被路徑去重移除。
- 頂層章節 id 繼續只以 archive href 計算，子章節 id 才加入 fragment，避免舊的 `lastChapterId` 與 `readingState.chapterId` 失效。
- 舊索引遷移只有在保存的 EPUB 可成功解析時才持久化；若個別檔案遺失或損壞，該書仍以既有平面目錄載入並於下次重試，不阻塞整個書庫。
- `section` 與 `article` 加入既有安全元素 allowlist，`id` 經控制字元檢查及 HTML attribute escaping 後才保留；腳本、事件與外部資源限制不變。

### Deferred Items

- EPUB 標題 HTML entity 解碼不在本修正範圍。

### Notes

- 通知設定缺少 `notify_email_from` 與 `notify_email_to`，依規則未寄送 standalone ddd-tdd 完成通知。
