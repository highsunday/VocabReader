---
author: Codex
date: 2026-07-21
title: 從本機書庫永久刪除書籍
uuid: 3ea9387f3c1443a0b9e0ed13f93d7d86
version: 1.1.0
status: implemented
---

# Feature Specification - 刪除書庫中的書籍

## 1. Feature Overview

讓使用者能從書籍總覽永久刪除已導入的書籍。刪除時必須先顯示明確的確認對話框，成功後移除書庫索引、本機 EPUB 與該書閱讀進度，並把介面切換到相鄰書籍或空書庫狀態，補足目前只能導入、無法管理書庫內容的缺口。

## 2. Requirements (User Story)

- **As a** 管理本機書庫的使用者
- **I want** 在書籍總覽中刪除不再需要的書籍
- **So that** 我能移除 EPUB 與該書的閱讀狀態，保持書庫整潔

## 3. Acceptance Criteria

- **Scenario 1：刪除入口與防誤觸確認**
  - **Given** 使用者正在查看一本已導入書籍的書籍總覽
  - **When** 使用者點擊「刪除書籍」
  - **Then** 系統顯示包含書名及「無法復原」警告的確認對話框，且尚未刪除任何資料

- **Scenario 2：取消刪除**
  - **Given** 刪除確認對話框已顯示
  - **When** 使用者選擇取消
  - **Then** 對話框關閉，書籍、本機 EPUB 與閱讀進度維持不變

- **Scenario 3：永久刪除書籍**
  - **Given** 書庫中存在目標書籍
  - **When** 使用者在確認對話框確認永久刪除
  - **Then** 系統從書庫索引移除該書，刪除其本機 EPUB 目錄及隨書保存的閱讀進度，重新啟動後也不再顯示該書

- **Scenario 4：刪除後選取下一本書**
  - **Given** 目標書籍後方仍有一本書
  - **When** 目標書籍刪除成功
  - **Then** 系統自動選取原位置的下一本書，並依該書既有閱讀狀態顯示總覽或恢復閱讀

- **Scenario 5：刪除最後一本或唯一一本書**
  - **Given** 目標書籍後方沒有其他書籍
  - **When** 目標書籍刪除成功
  - **Then** 若前方仍有書則選取前一本；若書庫已空則顯示「導入 EPUB 開始閱讀」空狀態

- **Scenario 6：刪除失敗**
  - **Given** 書籍仍存在於書庫
  - **When** 本機資料刪除或索引更新失敗
  - **Then** 介面顯示錯誤訊息，不從畫面移除目標書籍，且後端盡可能維持書籍索引與本機檔案一致

- **Scenario 7：拒絕無效刪除請求**
  - **Given** renderer 傳送缺少有效書籍識別碼的刪除請求
  - **When** main process 收到請求
  - **Then** 系統拒絕請求且不變更書庫

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 開啟刪除確認 | 正在顯示書籍總覽 | 點擊「刪除書籍」 | 對話框顯示目標書名與不可復原警告，未呼叫刪除 API | High |
| TC2 | 取消刪除 | 確認對話框已開啟 | 點擊「取消」 | 對話框關閉且書籍仍存在 | High |
| TC3 | 永久刪除持久化資料 | 書庫已導入目標 EPUB 並保存閱讀進度 | 呼叫刪除操作 | 索引不再包含該書，書籍目錄不存在，重新載入仍不出現 | High |
| TC4 | 選取下一本 | 刪除第一本且後方有書 | 確認刪除 | 顯示原位置的下一本書 | High |
| TC5 | 回退前一本 | 刪除最後一本且前方有書 | 確認刪除 | 顯示前一本書 | High |
| TC6 | 空書庫 | 刪除唯一一本書 | 確認刪除 | 顯示空書庫狀態 | High |
| TC7 | 刪除失敗 | 刪除 API 回傳錯誤 | 確認刪除 | 顯示錯誤且書籍仍在清單中 | High |
| TC8 | IPC 輸入驗證 | 書籍識別碼不是非空字串 | 發出刪除請求 | 請求被拒絕，library service 未被呼叫 | High |
| TC9 | 不存在的書籍 | 書庫沒有該識別碼 | 呼叫刪除操作 | 回傳「找不到書籍」且書庫不變 | Medium |

## 5. Implementation Notes

- 刪除能力沿用既有安全 preload bridge，新增限定用途的書庫刪除 API；renderer 不得直接操作檔案系統或通用 IPC。
- main process 必須驗證書籍識別碼，`LocalBookLibrary` 才能執行索引與書籍目錄清理。
- 刪除與閱讀狀態保存必須序列化，避免尚未完成的閱讀狀態寫入在刪除後把書籍重新寫回索引。
- 確認對話框由 renderer 顯示，必須具備可辨識的 dialog 語意、書名、取消及永久刪除操作。
- 刪除操作進行中不得重複送出，也不得同時導入書籍。

## 6. Assumptions and Non-goals

- 「永久刪除」包含目前已實作的本機 EPUB、封面／章節索引與閱讀進度；這些資料不提供垃圾桶或復原功能。
- 未來由該書產生的學習項目與複習紀錄應保留並標示來源書籍已刪除；該領域目前尚未實作，不在本功能的程式變更範圍。
- 不支援一次刪除多本書籍。
- 刪除入口只出現在書籍總覽，不放在左側書籍切換清單，也不出現在章節閱讀介面。
- 不新增雲端同步、帳號同步或作業系統垃圾桶整合。

## 7. Affected Modules and Files

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 在安全 preload bridge 與 main process IPC 新增限定用途的 `deleteBook(bookId)` 操作，拒絕空值或非字串識別碼。
- `LocalBookLibrary` 永久移除索引中的書籍及其 SHA-256 目錄；刪除與閱讀狀態保存共用序列佇列，目錄清理失敗時嘗試恢復索引。
- 書籍總覽新增紅色「刪除書籍」按鈕及具 dialog 語意的不可復原確認視窗。
- 刪除成功後優先選取原位置的下一本書，否則前一本；刪除唯一書籍後顯示空書庫。
- 刪除失敗時保留書籍並顯示錯誤，操作期間停用重複刪除與導入。

### Test Coverage

- TC1–TC2：renderer 測試確認對話框包含書名與不可復原警告，取消時不呼叫 API。
- TC3、TC9：library service 測試確認刪除會等待進行中的閱讀狀態保存，之後永久移除索引、EPUB 目錄與閱讀狀態，並拒絕不存在書籍。
- TC4–TC7：renderer 測試確認下一本、前一本、空書庫及失敗保留行為。
- TC8：IPC 測試確認刪除 channel 與非空字串輸入驗證。
- Electron E2E 確認安全 bridge 暴露明確的刪除方法且未暴露 Node.js。

### Changed Files

#### Production Code

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/F04-delete-library-book.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 刪除入口與防誤觸確認 | Pass | `asks for confirmation and cancels without deleting the book` |
| 取消刪除 | Pass | `asks for confirmation and cancels without deleting the book` |
| 永久刪除書籍 | Pass | `permanently deletes a book, its EPUB and saved reading state` |
| 刪除後選取下一本書 | Pass | `deletes the selected book and selects the next book` |
| 刪除最後一本或唯一一本書 | Pass | `selects the previous book when deleting the last book`; `shows the empty library after deleting its only book` |
| 刪除失敗 | Pass | `keeps the book visible and reports an error when deletion fails`；service 失敗時嘗試還原索引 |
| 拒絕無效刪除請求 | Pass | `rejects an invalid delete request without touching the library` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `asks for confirmation and cancels without deleting the book` |
| TC2 | Pass | `asks for confirmation and cancels without deleting the book` |
| TC3 | Pass | `permanently deletes a book, its EPUB and saved reading state` |
| TC4 | Pass | `deletes the selected book and selects the next book` |
| TC5 | Pass | `selects the previous book when deleting the last book` |
| TC6 | Pass | `shows the empty library after deleting its only book` |
| TC7 | Pass | `keeps the book visible and reports an error when deletion fails` |
| TC8 | Pass | `rejects an invalid delete request without touching the library` |
| TC9 | Pass | `rejects deleting an unknown book without changing the library` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/library-service.test.ts src/main/library-ipc.test.ts src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：紅燈階段目標測試 9 失敗、18 通過，失敗原因皆為刪除功能尚未存在；實作後目標測試 27/27、server 3/3、desktop 27/27、Electron E2E 2/2 通過，型別檢查與正式建置通過。

### Hypotheses and Decisions

- 使用者已確認永久刪除範圍、總覽頁入口、二次確認及相鄰書籍選取規則。
- 這項功能沿用既有「書籍／書庫」領域語言，不新增 CONTEXT.md 詞彙。
- 綠燈階段曾出現 IPC 無效輸入測試誤用非同步 `rejects` 的意外失敗。假說驗證確認 handler 在輸入驗證時同步拋錯，因此只把測試改為同步 `toThrow`，沒有改變產品行為。
- 第一次 Electron E2E 因受限環境無法啟動桌面程序；允許啟動 Electron 後重新執行為 2/2 通過。

### Deferred Items

- 學習項目與複習紀錄的來源失效呈現，待相關領域實作時處理。

### Notes

- 本次沒有新增資料格式或領域邊界；主要改動是既有書庫寫入流程增加明確的刪除操作。
- 書籍目錄刪除失敗時會嘗試恢復索引；若底層檔案系統同時發生部分刪除與索引還原失敗，仍可能需要後續的書庫修復機制處理。現有 index.json 尚無 schema 驗證或損壞修復，已保留在模組技術債清單。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC9 新增失敗測試。
2. 實作 LocalBookLibrary 刪除與 IPC/preload 合約。
3. 實作確認對話框、刪除狀態與相鄰書籍切換。
4. 執行目標測試、完整測試、型別檢查與正式建置。
5. 同步本文件與書庫模組文件。
