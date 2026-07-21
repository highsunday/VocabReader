---
author: Codex
date: 2026-07-21
title: 閱讀 EPUB 章節並按書籍恢復上次閱讀狀態
uuid: 84dc29e0842a4cc8aa39a267d6425fed
version: 1.0.0
status: implemented
---

# Feature Specification - 章節閱讀與狀態恢復

## 1. Feature Overview

讓使用者從書籍總覽選取章節後，實際讀取並顯示該章節的 EPUB 內容。閱讀介面提供返回書籍總覽與切換上一章的操作；每本書分別保存最後所在畫面、章節及章節內閱讀位置，使使用者切換到其他書籍再切回時，可以從該書上次狀態繼續。

EPUB 採可重排內容，沒有跨視窗尺寸穩定不變的「頁碼」。因此本功能把使用者所稱的「上一頁」落實為「上一章」，章節內則採連續捲動，並以相對閱讀位置恢復至上次所在段落附近。

## 2. Requirements (User Story)

- **As a** 使用英文電子書學習的使用者
- **I want** 開啟指定章節、閱讀原文，並讓每本書記住各自的閱讀畫面與位置
- **So that** 我可以在書籍之間快速切換，又不必反覆尋找上次讀到的位置

## 3. Acceptance Criteria

- **Scenario 1：顯示指定章節內容**
  - **Given** 使用者位於一本含可讀章節的書籍總覽
  - **When** 使用者點選指定章節
  - **Then** 閱讀介面顯示該章節標題與 EPUB 章節本文，並提供載入中與失敗狀態

- **Scenario 2：返回書籍總覽**
  - **Given** 使用者正在閱讀某本書的章節
  - **When** 使用者點選「返回總覽」
  - **Then** 中央區域顯示該書的書籍總覽，且該書的最後畫面保存為書籍總覽

- **Scenario 3：切換上一章**
  - **Given** 使用者正在閱讀一本書的第二章或更後面的章節
  - **When** 使用者點選「上一章」
  - **Then** 閱讀介面顯示前一個 EPUB 順序的章節，並從該章開頭開始
  - **And** 使用者位於第一章時，「上一章」不可操作

- **Scenario 4：切換書籍後恢復總覽**
  - **Given** 書籍 A 上次停在書籍總覽，書籍 B 為目前書籍
  - **When** 使用者從側欄切回書籍 A
  - **Then** 中央區域回到書籍 A 的書籍總覽

- **Scenario 5：切換書籍後恢復章節與閱讀位置**
  - **Given** 書籍 A 上次停在某章中間，且狀態已保存，書籍 B 為目前書籍
  - **When** 使用者從側欄切回書籍 A
  - **Then** 系統載入書籍 A 的同一章，並在內容完成呈現後恢復至上次相對閱讀位置

- **Scenario 6：跨次開啟保留閱讀狀態**
  - **Given** 某本書的最後畫面、章節與閱讀位置已寫入本機書庫
  - **When** 使用者關閉並重新開啟應用程式後選取該書
  - **Then** 系統依該書保存的狀態顯示書籍總覽，或恢復同一章與相對閱讀位置

- **Scenario 7：章節內容安全邊界**
  - **Given** EPUB 章節包含腳本、事件處理器、表單或外部資源引用
  - **When** 系統載入章節內容
  - **Then** 可閱讀文字與安全排版可顯示，但 EPUB 腳本、可執行事件、表單及外部網路資源不可在應用程式權限中執行

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 指定章節本文 | 已導入含兩章 EPUB | 讀取第二章 | 回傳第二章標題與本文 | High |
| TC2 | 返回總覽 | 正在閱讀章節 | 點選返回總覽 | 顯示總覽並保存 overview | High |
| TC3 | 上一章 | 正在閱讀第二章 | 點選上一章 | 顯示第一章且位置為開頭 | High |
| TC4 | 第一章邊界 | 正在閱讀第一章 | 檢視上一章操作 | 按鈕停用 | Medium |
| TC5 | 書籍各自恢復畫面 | A 在 reader、B 在 overview | 交替選取 A、B | 各自恢復 reader／overview | High |
| TC6 | 恢復章節中間 | A 的章節位置為 0.5 | 切回 A 且內容載入 | 中央閱讀區恢復至約 50% | High |
| TC7 | 狀態持久化 | 保存閱讀狀態後重建書庫服務 | 重新列出書籍 | 狀態值保持不變 | High |
| TC8 | 不安全章節 | XHTML 含 script、onclick、form、https 圖片 | 載入章節 | 回傳內容不含可執行／外部資源 | High |
| TC9 | 章節不存在 | bookId 或 chapterId 不存在 | 請求章節 | 顯示明確錯誤，不改寫既有狀態 | Medium |

## 5. Implementation Notes

- Electron main process 從本機保存的 EPUB 讀取指定 chapter href；renderer 不取得 EPUB 路徑或任意檔案系統能力。
- preload 增加明確的章節讀取與閱讀狀態保存 API，不暴露通用 IPC。
- 每本 `LibraryBook` 保存 `readingState`：最後畫面（overview／reader）、章節識別碼及 0–1 的相對捲動位置。載入舊索引時需提供相容預設值。
- 章節相對位置比絕對像素更能容忍視窗大小及字型造成的重排差異；恢復位置允許小幅排版誤差。
- 章節內容在 main process 轉成受限、安全的閱讀 HTML：移除可執行與互動元素、事件屬性及外部 URL；書內圖片可轉為 Data URL。
- 捲動狀態採節流／防抖寫入，切換書籍、章節或返回總覽前則立即保存目前狀態。

## 6. Assumptions and Non-goals

- 「第二張中間」依語意解讀為「第二章中間」。
- 「上一頁」依 EPUB 可重排內容與專案詞彙落實為「上一章」，本功能不建立固定分頁或頁碼。
- 第一版保留常見文字階層、段落、清單、表格、引文與書內圖片；不保證 EPUB 自訂字型、複雜 CSS、SVG、影音或互動內容完整呈現。
- 本功能不包含文字劃線標記、AI 解析、章末練習或完成章節流程。

## 7. Affected Modules and Files

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應的 main、IPC、renderer 與 E2E 測試
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- Electron main process 可依書籍與章節識別碼從本機 EPUB 讀取章節 XHTML，保留常見閱讀結構，將書內點陣圖片轉為 Data URL，並移除腳本、事件屬性、表單、嵌入內容及外部資源。
- preload 新增受限的 `getChapterContent` 與 `saveReadingState` 方法；renderer 不取得 EPUB 檔案路徑或通用 IPC。
- 閱讀介面顯示章節標題、本文、載入／失敗狀態，以及「上一章」與「返回總覽」操作；第一章會停用上一章。
- 每本書分別保存最後畫面、章節與 0–1 相對捲動位置。選取書籍與重開應用程式時會恢復該書的總覽或閱讀狀態。
- 閱讀位置以 300ms 防抖保存，切換書籍或畫面前立即保存；main process 串行化狀態寫入，避免快速切換造成舊資料覆蓋新位置。
- 舊版書庫索引沒有 `readingState` 時會在載入時補為相容預設，不要求重新導入 EPUB。

### Test Coverage

- `library-service.test.ts`：TC1、TC7、TC8、TC9，涵蓋章節本文、書內圖片、安全過濾、狀態持久化與不存在章節。
- `library-ipc.test.ts`：涵蓋章節讀取與閱讀狀態保存 IPC 的窄介面轉送。
- `App.test.tsx`：TC2–TC6，涵蓋閱讀內容、上一章與第一章邊界、返回總覽、各書籍畫面與 50% 閱讀位置恢復。
- `desktop.spec.ts`：確認 Electron preload 安全橋接包含新增的兩個明確方法，且 renderer 仍無 Node `require`。

### Changed Files

#### Production Code

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/env.d.ts`

#### Test Code

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/F02-chapter-reading-resume.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 顯示指定章節內容 | Pass | service 章節讀取測試 + renderer 本文顯示測試 |
| 返回書籍總覽 | Pass | renderer 返回總覽與保存 overview 測試 |
| 切換上一章 | Pass | renderer 第二章切至第一章及第一章停用測試 |
| 切換書籍後恢復總覽 | Pass | renderer 交替切換書籍測試 |
| 切換書籍後恢復章節與閱讀位置 | Pass | renderer 同章與 50% 相對位置恢復測試 |
| 跨次開啟保留閱讀狀態 | Pass | service 重建後讀取狀態測試 |
| 章節內容安全邊界 | Pass | service script／onclick／form／外部圖片移除測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `loads safe chapter content and embeds book-local images` |
| TC2 | Pass | `returns to overview and persists that view for the selected book` |
| TC3 | Pass | `shows chapter content and moves to the previous chapter` |
| TC4 | Pass | 同一 renderer 測試驗證第一章上一章按鈕停用 |
| TC5 | Pass | `restores each book to its own last view, chapter and reading position` |
| TC6 | Pass | 同一 renderer 測試驗證 0.5 恢復為 400／800 可捲動像素 |
| TC7 | Pass | `persists each book reading view, chapter and relative position` |
| TC8 | Pass | 安全章節內容 service 測試 |
| TC9 | Pass | `rejects unknown chapter requests without changing reading state` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- ../main/library-service.test.ts ../main/library-ipc.test.ts App.test.tsx
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm test
npm run test:e2e
```

結果：紅燈階段 7 個新增測試因功能尚未存在而失敗；綠燈後 desktop 16/16、server 3/3 通過，型別檢查與正式建置通過，Electron E2E 2/2 通過。

### Hypotheses and Decisions

- 依 `CONTEXT.md` 的 EPUB 可重排內容與「章節」詞彙，把「上一頁」實作為上一章，章內採連續捲動。
- 使用相對捲動位置而非像素，讓不同視窗高度或排版重排後仍能回到接近原段落。
- 章節內容採 allowlist 輸出，不直接把原始 EPUB XHTML 交給 renderer；書內點陣圖片嵌入 Data URL，外部網址與互動元素一律移除。
- Electron E2E 首次在受限環境因 GUI 無法啟動；以桌面啟動權限重跑相同測試後 2/2 通過，屬執行環境限制而非產品失敗。

### Deferred Items

- EPUB 自訂 CSS、字型、SVG、影音、MathML、註腳跳轉與複雜互動內容尚未完整呈現。
- 文字標記、AI 解析、完成章節與章末練習仍屬後續功能。

### Notes

- 閱讀進度百分比會依目前章節順序與章內相對位置單調增加，不因回讀前面章節而倒退。
- 狀態保存失敗時 renderer 顯示警告，但保留本次 session 的樂觀狀態，避免打斷閱讀。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC9 建立失敗測試。
2. 實作最小章節讀取、安全內容處理、狀態保存與 renderer 導覽。
3. 執行單元、整合、端對端測試、型別檢查與建置。
4. 同步本文件與 `documents/modules/book-library.md`。
