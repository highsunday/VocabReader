---
author: Codex
date: 2026-08-25
title: 隔離開發版與安裝版的使用者資料
uuid: 6c5e2b74-1b2b-4b97-8ead-3927c56053fc
version: 1.0.0
status: implemented
---

# Bug Fix: 隔離開發版與安裝版的使用者資料

## 1. Bug Overview

Electron Main 目前在非自動化測試環境一律使用 `app.getPath("userData")`
作為書庫、生詞庫、設定、練習狀態、AI 對話與 Codex runtime 的資料根目錄。
`npm run dev` 與已安裝的 VocabReader 使用相同執行期 package name，因此 Electron
將兩者解析到相同的 `userData` 目錄。在其中一個環境導入書籍、修改設定或
更新學習進度時，另一個環境會立即看到並繼續修改同一份資料。

## 2. Fix Objective

- 已打包的安裝版繼續使用 Electron 原本的 `userData` 目錄，保留現有使用者資料。
- 未打包的開發版在 Electron ready 之前將 `userData` 切換為原路徑加上
  `-dev` 後綴的獨立目錄。
- 不刪除、搬移、複製或清空現有的開發版或安裝版資料。
- 書庫、生詞庫、設定、練習狀態、AI 對話與 Codex runtime 全部繼續從
  當前 Electron `userData` 之下取得路徑。

## 3. Acceptance Criteria

- **Scenario 1：開發版使用獨立資料目錄**
  - **Given** Electron app 尚未打包，且目前 `userData` 為任意正常路徑
  - **When** App 進行啟動資料路徑設定
  - **Then** `userData` 被設為原路徑加上 `-dev`

- **Scenario 2：安裝版繼續使用原資料**
  - **Given** Electron app 已打包
  - **When** App 進行啟動資料路徑設定
  - **Then** 不變更 `userData`，也不觸碰現有資料

- **Scenario 3：完整環境隔離**
  - **Given** 開發版啟動
  - **When** Main Process 建立書庫、生詞庫、設定、練習狀態與 Codex runtime
  - **Then** 所有依賴 `app.getPath("userData")` 的持久化與 runtime 資料都使用開發版目錄

- **Scenario 4：不清空任何資料**
  - **Given** 原本共用的 `userData` 目錄內已有使用者資料
  - **When** 本修正套用並啟動任一環境
  - **Then** 啟動路徑選擇不執行任何檔案刪除、搬移、複製或清空操作

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 開發 profile | `isPackaged=false` 與原 `userData` | 執行路徑設定 | `setPath("userData", original + "-dev")` 只呼叫一次 | Critical |
| TC2 | 安裝 profile | `isPackaged=true` | 執行路徑設定 | 不讀取或設定新的 `userData` | Critical |
| TC3 | Main 啟動整合 | Main Process 尚未 ready | 載入 main entry | 路徑設定發生在 `app.whenReady()` 之前 | Critical |
| TC4 | 非破壞性邊界 | 任意現有資料目錄 | 執行路徑設定 | helper 只使用 Electron path API，無檔案系統寫入 | High |

## 5. Implementation Notes

- 使用 `app.isPackaged` 區分已打包安裝版與 `electron .` 開發版，不以
  `VITE_DEV_SERVER_URL` 代替 Electron 自身的打包狀態。
- 路徑切換必須發生在 `app.whenReady()` 與建立 BrowserWindow 之前，讓 Chromium
  profile、應用資料與 Codex runtime 使用同一個環境邊界。
- 將路徑決策放在無檔案系統副作用的小型 helper，以單元測試驗證開發與安裝邊界。

## 6. Affected Files and Boundaries

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/user-data-path.ts`
- `apps/desktop/src/main/user-data-path.test.ts`
- `documents/implements/B33-isolate-development-user-data.md`

本修正不改變任何學習領域邏輯或 `userData` 之下的相對資料結構，因此不需更新
`documents/modules/`。

## 7. Assumptions and Non-goals

- 原本共用目錄視為安裝版的現有資料，開發版第一次使用新目錄時可以是空白狀態。
- 不自動複製原資料到開發版；如需測試現有資料，使用現有資料備份與資料還原功能。
- 不變更安裝版 app id、product name、installer 或對外發布流程。
- 不刪除原共用目錄或任何既有的開發目錄。

## 8. Implementation Record

### Status

Implemented on 2026-08-25.

### Implementation Summary

- 新增 `configureDevelopmentUserDataPath`；未打包 Electron app 會把原本的
  `userData` 設為帶 `-dev` 後綴的獨立 profile。
- 已打包 app 會在讀取或設定路徑之前直接返回，安裝版保留原本的
  `userData` 與現有資料。
- Main entry 在 `app.whenReady()` 之前執行路徑設定，因此書庫、生詞庫、
  設定、練習狀態、AI 對話、Codex runtime 與 Chromium profile 共用同一個
  開發環境邊界。
- helper 只使用 Electron `getPath` / `setPath`，沒有檔案系統匯入或資料搬移、
  複製、刪除與清空邏輯。

### Test Coverage

| Test scenario | Automated basis | Result |
|---|---|---|
| TC1 | `user-data-path.test.ts` unpackaged app test | passed |
| TC2 | `user-data-path.test.ts` packaged app test | passed |
| TC3 | Main source ordering test and Electron e2e `userData` assertion | passed |
| TC4 | helper source non-destructive boundary test | passed |

### Changed Files

#### Production Code

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/user-data-path.ts`

#### Test Code

- `apps/desktop/src/main/user-data-path.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/B33-isolate-development-user-data.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 開發版使用獨立資料目錄 | Pass | helper unit test and Electron e2e path assertion |
| 安裝版繼續使用原資料 | Pass | packaged app unit test verifies no path API calls |
| 完整環境隔離 | Pass | configuration call precedes `app.whenReady()` and existing consumers resolve `userData` afterward |
| 不清空任何資料 | Pass | helper has no file-system operations; implementation only changes Electron path selection |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `uses a dedicated profile for an unpackaged development app` |
| TC2 | Pass | `leaves the installed app profile unchanged` |
| TC3 | Pass | `configures the development profile before Electron becomes ready`; secure shell e2e |
| TC4 | Pass | `does not perform file-system migration or cleanup` |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run ../main/user-data-path.test.ts
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm test -w @reader/desktop
npm test -w @reader/desktop -- --run learning-library-workspace.test.tsx -t "keeps loaded cards visible and retries a failed automatic page"
npm test -w @reader/desktop
npm run test:e2e -w @reader/desktop
```

Results:

- target red: 1 expected assertion failure because the Main entry had no ready-before path setup.
- target green: 4/4 passed.
- desktop typecheck: passed.
- desktop production build: passed.
- desktop full suite: 59 files, 569 tests passed.
- Electron e2e: 4/4 passed.

### Hypotheses and Decisions

已確認根因是 `npm run dev` 並非 `NODE_ENV=test`，與安裝版都進入
`app.getPath("userData")` 分支；兩者的執行期 package name 相同，因此命中同一目錄。
修正使用 `app.isPackaged` 作為環境邊界，因為這是 Electron 對已打包應用的直接
狀態，不需把 renderer 的開發伺服器設定當成資料路徑判斷。

首次 red 測試曾因 Vitest 轉換後的 `import.meta.url` 不是 `file:` URL 而失敗；
改用 workspace `process.cwd()` 定位 Main source 後，成功取得預期的未實作斷言
失敗。桌面完整測試首輪有一個既有自動分頁測試在一秒內未出現 alert；
該案例單獨重跑通過，完整套件再跑也 569/569 通過，確認為不相關的
負載時序 flake，未修改該功能或測試。

### Deferred Items

- 現有 `/Applications/VocabReader.app` 不會因原始碼變更自動更新；下一次建置與安裝
  新版後才會帶入本修正。
- 不自動複製原共用資料到新開發目錄，符合本次不搬移與不同步邊界。

### Architectural Observation

未發現需要後續 RXX 的架構問題。資料 profile 選擇集中在 Main entry 的啟動邊界，
現有書庫、生詞庫、設定與 runtime 繼續只依賴 Electron `userData` 抽象。
