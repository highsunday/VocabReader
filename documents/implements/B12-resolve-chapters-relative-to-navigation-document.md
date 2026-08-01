---
author: Codex
date: 2026-07-27
title: 依 EPUB navigation 文件位置解析章節路徑
uuid: c3c92aa7-b42a-46a2-aabf-e2399cdf41ad
version: 1.0.0
status: implemented
---

# Bug Fix - 依 EPUB navigation 文件位置解析章節路徑

## 1. Bug Overview

EPUB 3 navigation document 或 EPUB 2 NCX 位於 package document 的子目錄時，
章節連結應相對於 navigation／NCX 文件本身解析。既有實作一律使用 package
document 所在目錄作為基準，導致索引保存不存在的 archive href；使用者點擊章節後，
`LocalBookLibrary.getChapterContent()` 因 ZIP 內找不到該路徑而拋出「章節內容遺失」。

實際受影響書籍 *Rewire* 的 navigation 文件位於 `OEBPS/text/nav.xhtml`，但索引把
42 個章節全部保存於錯誤的 `OEBPS/*.xhtml` 路徑；實際檔案位於
`OEBPS/text/*.xhtml`。

## 2. Fix Objective

- EPUB 3 章節連結相對於 navigation document 所在目錄解析。
- EPUB 2 章節連結相對於 NCX 所在目錄解析。
- spine fallback 仍相對於 package document 所在目錄解析。
- 已導入的錯誤索引自動重新解析，不要求刪除或重新導入書籍。
- 遷移時保留原章節識別碼及所有以 chapterId 為鍵的閱讀資料。

## 3. Acceptance Criteria

- **Scenario 1：EPUB 3 navigation 位於子目錄**
  - **Given** navigation document 位於 package document 的子目錄，且章節連結為相對路徑
  - **When** 使用者導入並開啟章節
  - **Then** 系統從 navigation document 所在目錄解析 href，章節可正常讀取

- **Scenario 2：EPUB 2 NCX 位於子目錄**
  - **Given** NCX 位於 package document 的子目錄，且章節連結為相對路徑
  - **When** 使用者導入並開啟章節
  - **Then** 系統從 NCX 所在目錄解析 href，章節可正常讀取

- **Scenario 3：既有錯誤索引自動修復**
  - **Given** 已導入書籍使用舊版錯誤章節 href
  - **When** 修正版應用程式載入書庫
  - **Then** 系統從保存的 EPUB 重建章節路徑並持久化新版索引

- **Scenario 4：遷移保留閱讀資料**
  - **Given** 舊章節已有閱讀狀態、範圍標籤或標記
  - **When** 章節索引遷移
  - **Then** 原章節 ID、閱讀狀態、範圍標籤與標記均保持有效

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 巢狀 EPUB 3 navigation | `text/nav.xhtml` 連到同目錄章節 | 導入並讀取 | href 為 `OEBPS/text/*.xhtml` 且內容可讀 | Critical |
| TC2 | 巢狀 EPUB 2 NCX | `text/toc.ncx` 連到同目錄章節 | 導入並讀取 | href 為 `OPS/text/*.xhtml` 且內容可讀 | High |
| TC3 | 舊章節索引遷移 | 索引 href 缺少 navigation 子目錄 | `listBooks()` | href 修正且索引版本更新 | Critical |
| TC4 | chapterId 狀態相容 | 舊章節已有 readingState、range、annotation | 執行遷移 | chapterId 與所有章節資料不變 | Critical |
| TC5 | 實際 EPUB 驗證 | *Rewire* 保存的 EPUB 與舊索引 | 在隔離書庫遷移並逐章讀取 | 42/42 章可讀且狀態不變 | Critical |

## 5. Implementation Notes

- `parseEpub()` 分別記錄 navigation document、NCX 或 package document 的目錄，
  再以對應目錄呼叫既有的安全 archive path resolver。
- `LibraryBook.chapterIndexVersion` 用於一次性辨識舊章節索引；新導入與成功遷移的
  書籍寫入版本 2。
- 遷移先以既有 chapterId 精確配對，再以 order、title、depth 與 fragment
  配對舊章節，並沿用配對成功的 ID。無法配對的新章節才使用新解析出的 ID。
- 個別 EPUB 無法重新解析時保留舊索引且不寫入新版本，讓後續載入仍可重試，
  並避免單本損壞書籍阻塞整個書庫。

## 6. Additional Notes

### Implementation Record

- 紅燈：新增三個服務層情境後，3 failed、16 passed。
- 綠燈：`library-service.test.ts` 19/19 passed。
- 全專案 Vitest：server 3/3、desktop 255/255 passed。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。
- 實際 *Rewire* EPUB 在隔離暫存書庫新導入及舊索引遷移後皆為 42/42 章可讀；
  既有章節 ID 與章節相關狀態完整保留。

### Changed Files

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `documents/implements/B12-resolve-chapters-relative-to-navigation-document.md`
- `documents/modules/book-library.md`

### Root Cause

正確假說為：navigation／NCX 章節連結使用了錯誤的 package document 基準目錄。
URL 編碼、大小寫差異、EPUB 缺檔及單純舊索引殘留均已由實際 EPUB 結構排除。
