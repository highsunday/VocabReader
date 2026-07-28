---
author: Codex
date: 2026-07-28
title: 修正巢狀 EPUB 目錄章節載入與 Windows 閱讀位置保存
uuid: 25a9ad0a-8aa4-402d-8b3e-e1a2a5ea03f1
version: 1.0.0
status: implemented
related-bug: BUG-002
---

# Bug Fix: 修正巢狀 EPUB 目錄章節載入與 Windows 閱讀位置保存

## 1. Bug Overview

Windows 版導入 Rewire EPUB 後，42 個章節全部顯示「無法載入這個章節」，且首次進入閱讀介面時顯示「無法保存閱讀位置」。同一本書在其他既有環境可繼續閱讀，使問題看似與平台相關。

現場 EPUB 的 navigation document 位於 `OEBPS/text/`。目錄中的相對章節連結應以該 navigation document 的目錄為基準，但舊 parser 錯用 package document 的 `OEBPS/` 目錄，將實際 `OEBPS/text/*.xhtml` 持久化成不存在的 `OEBPS/*.xhtml`。

Windows 現場的閱讀位置保存另留下 `index.json.next`，顯示索引內容已寫完，但取代正式索引時遇到暫時性檔案占用。隔離環境無法穩定重現該占用。

## 2. Root Cause

- EPUB 3 navigation link 與 EPUB 2 NCX link 沒有相對各自 TOC 文件所在目錄解析。
- 錯誤 href 已寫入既有書庫索引；只修正新導入 parser 無法修好已導入書籍。
- 索引寫入固定使用同一個 `index.json.next`，且 Windows `rename` 遇到 `EACCES`、`EBUSY` 或 `EPERM` 時立即失敗，沒有處理短暫的掃描器或檔案占用。

## 3. Fix Objective

- navigation／NCX 的相對連結必須以 TOC 文件目錄為基準解析。
- 已由舊 parser 導入的書籍必須在列出書庫時自動重建章節索引，不要求刪除或重新導入。
- Windows 暫時性索引取代失敗應以有限退避重試恢復；不同寫入不可共用同一個 temp 名稱。

## 4. Acceptance Criteria

- **Scenario 1：巢狀 EPUB 3 navigation**
  - **Given** package document 位於 `OEBPS/`，navigation 與章節位於 `OEBPS/text/`
  - **When** 導入書籍並開啟 navigation 中的相對章節連結
  - **Then** 章節 href 為 `OEBPS/text/...`，且可顯示安全章節內容

- **Scenario 2：舊索引自動修復**
  - **Given** 書庫索引由舊 parser 建立並保存錯誤章節 href
  - **When** 應用程式重新載入書庫
  - **Then** 系統從已保存 EPUB 重建新版章節索引並持久化

- **Scenario 3：Rewire 現場 EPUB**
  - **Given** Windows 現場已導入、共有 42 個入口的 Rewire EPUB
  - **When** 在隔離複本執行 production `LocalBookLibrary` 載入全部章節
  - **Then** 42/42 章皆成功載入

- **Scenario 4：Windows 暫時性索引占用**
  - **Given** 索引取代短暫回報 `EACCES`、`EBUSY` 或 `EPERM`
  - **When** 保存閱讀位置
  - **Then** 系統以有限退避重試，不因第一次暫時失敗立即放棄

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 巢狀 navigation 新導入 | navigation 與章節同在 `OEBPS/text/` | 導入並載入章節 | href 與內容正確 | Critical |
| TC2 | 舊索引 migration | 缺少 parse version 且 href 錯誤 | `listBooks()` | 自動重建並可載入 | Critical |
| TC3 | Rewire 全章回饋迴圈 | 現場書庫的臨時複本 | 逐章 `getChapterContent()` | 42/42 通過 | Critical |
| TC4 | 保存不退步 | 同一 library instance | 並行保存 20 次 | 20/20 通過 | High |

## 6. Implementation Notes

- parser 保存 `linksDirectory`；EPUB 3 使用 navigation document 目錄，EPUB 2 使用 NCX document 目錄，spine fallback 維持 package document 目錄。
- `LibraryBook.epubParseVersion` 用於辨識需要重建 EPUB 章節 metadata 的舊索引；本次版本為 2。
- 索引 temp 名稱包含 process id 與 UUID。取代正式索引時只針對 Windows 常見的暫時性錯誤碼重試，最多五次；最終仍失敗時刪除該次 temp 並回報錯誤。

## 7. Affected Modules and Files

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `documents/modules/book-library.md`
- `documents/bugs/BUG-002-windows-rewire-reading-state-and-chapter-load.md`

## 8. Assumptions and Non-goals

### Assumptions

- 書庫由單一 Electron main process 操作；跨 process 寫入鎖仍不是本次範圍。
- 舊索引所指向的原始 `book.epub` 仍存在且可重新解析。

### Non-goals

- 不完整重現 EPUB 自訂 CSS、字型、SVG、影音或互動內容。
- 不新增跨裝置同步或跨 process transaction。
- 不變更 renderer 的章節錯誤文案。

## 9. Implementation Record

### Status

Implemented on 2026-07-28.

### Implementation Summary

- 修正 EPUB 3 navigation 與 EPUB 2 NCX 的相對路徑基準。
- 新增 parse version migration，修復已導入書籍的舊章節 href。
- 索引 temp 改為唯一名稱，並對暫時性 Windows rename 錯誤做退避重試。
- 將真實 Rewire 回饋迴圈轉成兩個不含版權內容的最小合成 EPUB 回歸測試。

### Test Coverage and Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 巢狀 EPUB navigation 可載入 | Pass | TC1 永久回歸測試 |
| 舊索引自動修復 | Pass | TC2 永久 migration 測試 |
| Rewire 42 個入口可載入 | Pass | 現場 EPUB 臨時複本 42/42 |
| 保存操作沒有退步 | Pass | 單次與 20 次並行保存；library-service 18/18 |

### Commands Executed

```bash
npx vitest run ../main/library-service.test.ts -t "nested navigation"
npx vitest run ../main/rewrite-debug.test.ts
npx vitest run ../main/library-service.test.ts
npm run test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

### Test Results

- Rewire 現場 EPUB 臨時複本：42/42 章載入、4/4 診斷測試通過；一次性測試已刪除。
- `library-service.test.ts`：18/18 通過。
- Desktop suite：246 tests passed；`learning-library-service.test.ts` 因既有 Vite jsdom 配置無法 bundle `node:sqlite` 而未收集。
- Desktop typecheck：通過。
- Desktop production build：通過。
- Commit：修正與文件同一提交。

### Hypotheses and Decisions

1. 42 章都在 `zip.file(chapter.href)` 失敗，排除 sanitizer 與 fragment 定位。
2. 索引 href 與 ZIP entry 比對確認共同少了 `text/`，證實 TOC 相對路徑基準錯誤。
3. 單一 instance 的 20 次並行保存全部通過，排除既有 `#stateWriteQueue`。
4. 現場只有一個 Electron main process，且 dist/source 邏輯一致；閱讀位置錯誤採有限 Windows transient retry 修復，不宣稱已重現外部占用來源。

### Known Limitations

- Windows 現場檔案占用的外部來源沒有確定重現；修正涵蓋可觀測的暫時錯誤碼，最終仍失敗時會正常回報。
- 完整 Desktop suite 的既有 `node:sqlite` 收集問題不在本修正範圍。
