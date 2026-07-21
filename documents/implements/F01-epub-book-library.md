---
author: Codex
date: 2026-07-21
title: 導入 EPUB 並從側欄切換書籍總覽
uuid: d704f399e2d0445cbd65752e14bcbe44
version: 1.0.0
status: implemented
---

# Feature Specification - EPUB 書庫與書籍總覽

## 1. Feature Overview

讓使用者將標準、無 DRM 的 EPUB 2／EPUB 3 導入本機書庫。已導入書籍在重新開啟應用程式後仍會保留，並列於左側欄供快速切換；選取書籍後，中央區域顯示該書的書籍總覽，作為開始或繼續閱讀的入口。

## 2. Requirements (User Story)

- **As a** 使用英文電子書學習的使用者
- **I want** 導入多本 EPUB，並從側欄切換書籍
- **So that** 我可以在同一個持久書庫中選擇書籍，從總覽查看進度與章節並開始閱讀

## 3. Acceptance Criteria

- **Scenario 1：成功導入 EPUB**
  - **Given** 使用者選擇一個可解析、無 DRM 的 EPUB 2 或 EPUB 3
  - **When** 應用程式完成導入
  - **Then** EPUB 被複製到本機書庫，書名、作者、封面與有順序的章節資訊被保存，該書出現在左側欄並成為目前書籍

- **Scenario 2：跨次開啟保留書庫**
  - **Given** 本機書庫已有導入書籍
  - **When** 使用者重新開啟應用程式
  - **Then** 左側欄列出既有書籍，不要求重新選擇原始 EPUB

- **Scenario 3：快速切換書籍**
  - **Given** 書庫有兩本以上書籍
  - **When** 使用者在左側欄選取另一本書
  - **Then** 該書成為目前書籍，中央區域顯示其書籍總覽

- **Scenario 4：書籍總覽內容與閱讀入口**
  - **Given** 使用者已選取一本書
  - **When** 書籍總覽顯示
  - **Then** 顯示封面、書名、作者、章節總數、閱讀進度、開始／繼續閱讀按鈕與依 EPUB 順序排列的章節清單
  - **And** 使用者可由開始／繼續閱讀或章節清單進入章節閱讀介面

- **Scenario 5：相同內容不重複導入**
  - **Given** 書庫已包含某 EPUB 的完整內容
  - **When** 使用者再次導入內容完全相同的 EPUB
  - **Then** 不建立第二筆書籍，直接選取既有書籍，且既有閱讀進度不被重設

- **Scenario 6：同名不同內容可並存**
  - **Given** 書庫已有一本與待導入 EPUB 書名相同、內容不同的書
  - **When** 使用者導入待導入 EPUB
  - **Then** 書庫新增一本獨立書籍，並保留可用的作者或版本資訊協助辨識

- **Scenario 7：不支援或損壞的 EPUB**
  - **Given** 使用者選擇 DRM、損壞、非 EPUB 或缺少必要套件文件的檔案
  - **When** 應用程式嘗試導入
  - **Then** 不新增不完整書籍，並在介面顯示明確的失敗訊息

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | EPUB 3 導入 | EPUB 3 含 metadata、nav、封面 | 導入檔案 | 書籍與順序正確的章節保存並顯示 | High |
| TC2 | EPUB 2 導入 | EPUB 2 含 OPF、NCX、封面 | 導入檔案 | 書籍 metadata 與 NCX 章節保存並顯示 | High |
| TC3 | 重開程式 | 書庫索引已保存 | 再次載入書庫 | 回傳既有書籍 | High |
| TC4 | 書籍切換 | 書庫含兩本書 | 點擊第二本 | 顯示第二本總覽 | High |
| TC5 | 總覽入口 | 已選取含章節的書 | 點擊開始閱讀或章節 | 顯示對應章節閱讀介面 | High |
| TC6 | 重複內容 | 同一 EPUB 已導入 | 再次導入 | 書庫筆數不變並選取既有書籍 | High |
| TC7 | 同名不同內容 | 兩個 EPUB 書名相同但內容不同 | 依序導入 | 書庫存在兩個不同識別碼 | Medium |
| TC8 | 無效 EPUB | ZIP／EPUB 結構損壞或缺少 OPF | 導入檔案 | 顯示錯誤且書庫沒有殘留資料 | High |

## 5. Implementation Notes

- 書籍原始檔與解析後的書庫索引存放於 Electron 應用程式的本機資料目錄，不依賴原始檔案路徑。
- 以 EPUB 完整檔案內容雜湊作為穩定書籍識別與重複判斷依據；同名不作為去重條件。
- Electron main process 負責檔案選擇、解析與持久化；renderer 只透過受限的 preload API 操作書庫，不取得任意檔案系統能力。
- EPUB 解析需遵循 `META-INF/container.xml` 指向的 package document，並支援 EPUB 3 navigation document 與 EPUB 2 NCX 的章節順序。
- 第一版不保證 DRM、直排、固定版面與複雜互動內容完整呈現。
- 本功能只建立章節閱讀入口；完整章節排版、標記與閱讀進度更新可由後續功能延伸。

## 6. Additional Notes

- 已確認書籍需跨重啟持久保存。
- 已確認完全相同的 EPUB 不重複建立書籍；同名但內容不同的版本允許並存。
- 已確認總覽需包含封面、書名、作者、章節總數、進度、閱讀入口與章節清單。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- Electron main process 以本機應用程式資料目錄建立持久書庫，保存 EPUB 原始檔與 JSON 書庫索引。
- 支援從 EPUB 2／3 的 container、package document、EPUB 3 navigation document 或 EPUB 2 NCX 取得書名、作者、封面與章節順序。
- 以完整 EPUB 內容 SHA-256 去重；命中既有書籍時直接回傳既有資料，因此閱讀進度不會重設；同名不同內容可並存。
- preload 僅暴露 `listBooks` 與 `importBook`，renderer 不取得任意檔案系統能力。
- 左側欄顯示已導入書籍；選取與導入完成後顯示書籍總覽，包含封面、作者、章節數、進度、開始／繼續閱讀與章節清單。
- 損壞、非標準或偵測到 DRM 設定的 EPUB 會中止導入並顯示錯誤，不寫入不完整書籍索引。

### Test Coverage

- `App.test.tsx`：TC4、TC5，涵蓋持久書籍載入、側欄切換、總覽、匯入後選取與章節入口 UI。
- `library-service.test.ts`：TC1、TC2、TC3、TC6、TC7、TC8，涵蓋 EPUB 2／3 解析、磁碟重載、封面、章節、內容去重、進度保留、同名版本與錯誤原子性。
- `library-ipc.test.ts`：TC1、TC3，涵蓋安全 IPC 列表、原生檔案選擇、導入與取消。
- `desktop.spec.ts`：確認 Electron 能啟動、書庫 preload API 存在且 renderer 沒有 Node `require`。

### Changed Files

#### Production Code

- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/package.json`
- `apps/desktop/vite.config.ts`

#### Test Code

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 成功導入 EPUB | Pass | EPUB 2／3 service tests + IPC test |
| 跨次開啟保留書庫 | Pass | 重新建立 `LocalBookLibrary` 後由磁碟載入測試 |
| 快速切換書籍 | Pass | renderer 側欄切換測試 |
| 總覽內容與閱讀入口 | Pass | renderer 總覽與章節入口測試 |
| 相同內容不重複導入 | Pass | SHA-256 duplicate test，含既有進度保留 |
| 同名不同內容可並存 | Pass | same-title revision test |
| 不支援或損壞 EPUB | Pass | invalid EPUB atomic failure test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `imports EPUB 3 metadata, cover and navigation...` |
| TC2 | Pass | `imports EPUB 2 metadata, legacy cover and NCX navigation` |
| TC3 | Pass | service 磁碟重載 + renderer persisted books |
| TC4 | Pass | `lists persisted books and switches...` |
| TC5 | Pass | overview start/chapter buttons + renderer navigation |
| TC6 | Pass | identical content returns `existing` and preserves 45% progress |
| TC7 | Pass | same title with changed EPUB bytes receives a distinct id |
| TC8 | Pass | invalid input rejects and index remains empty |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx
npm run test -w @reader/desktop -- ../main/library-service.test.ts
npm run test -w @reader/desktop -- ../main/library-ipc.test.ts
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Final results: server 3/3 tests passed; desktop 10/10 tests passed; Electron E2E 1/1 passed; typecheck and production build passed.

### Hypotheses and Decisions

- 初次指定測試路徑時，Vitest 以 renderer 為 root，根目錄格式路徑無法匹配。改用 renderer-relative path 後確認為執行路徑問題。
- main-process tests 起初未被收集，確認 `vite.config.ts` 的 test include 只涵蓋 renderer；加入 `../main/**/*.test.{ts,tsx}` 作為 main test seam。
- TypeScript 7 未合併 renderer ambient `Window` 宣告；產品碼改由共享合約做顯式且受限的 `window` bridge narrowing，避免依賴脆弱的隱式全域型別。
- Electron E2E 首次在沙箱內因 GUI 權限無法啟動；取得桌面啟動權限後相同測試通過。

### Deferred Items

- 完整章節 XHTML/CSS 呈現、圖片資產載入、標記與閱讀進度更新不屬於 F01；F01 已保存章節 archive href 並提供閱讀入口，供後續功能使用。
- 直排、固定版面與複雜互動 EPUB 不在第一版保證範圍。

### Notes

- 新增 `jszip` 與 `fast-xml-parser` 作為 EPUB ZIP/XML 解析依賴。
- 建議後續建立 `documents/modules/book-library.md`，記錄本機書庫、IPC 與 renderer 的責任邊界。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC8 先建立失敗測試。
2. 實作最小 EPUB 解析、本機保存、安全橋接與書籍總覽。
3. 執行單元、整合、端對端測試、型別檢查與建置。
4. 將最終行為、測試結果與限制同步回本文件。
