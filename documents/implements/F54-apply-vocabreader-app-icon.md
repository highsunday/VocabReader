---
author: Codex
date: 2026-08-08
title: 套用 VocabReader 正式 App icon
uuid: 0d72425c-2fbc-4bb8-9ef4-763ef86a2ffc
version: 1.1.0
status: implemented
---

# Feature Specification - 套用 VocabReader 正式 App icon

## 1. Feature Overview

VocabReader 目前仍使用 Electron 預設執行圖標，頁首左上角也只顯示文字 `V`。
本功能把已確認的小尺寸優化 icon 設為單一正式品牌資產，同時套用到 Electron
原生視窗／macOS Dock 與頁首品牌區，讓使用者從啟動 App 到進入閱讀介面都看到
一致的 VocabReader 識別。

## 2. Requirements (User Story)

- **As a** VocabReader 使用者
- **I want** Electron App 與頁首顯示同一個正式 icon
- **So that** 我可以在 Dock、視窗及 App 介面快速辨識 VocabReader

## 3. Confirmed Product Rules

- 正式品牌資產使用 `vocabreader-language-learning-v6.png`。
- Electron `BrowserWindow` 使用正式資產作為原生視窗 icon。
- macOS 開發執行時使用同一資產取代 Electron 預設 Dock icon。
- 頁首左上角以正式圖像取代文字 `V`，相鄰 `VocabReader` 名稱與標語維持不變。
- main process 與 renderer 從同一份來源檔匯入資產；建置流程必須把資產輸出到各自 bundle。
- 圖像在頁首屬於相鄰品牌文字的裝飾性識別，不重複朗讀替代文字。

## 4. Acceptance Criteria

- **Scenario 1：Electron 使用正式 icon**
  - **Given** desktop main process 已完成建置
  - **When** Electron 建立主視窗
  - **Then** `BrowserWindow` 使用已建置的 VocabReader icon
  - **And** macOS Dock 在 App ready 後使用同一張 icon

- **Scenario 2：頁首顯示正式 icon**
  - **Given** VocabReader renderer 已載入
  - **When** 使用者查看頁首左上角品牌區
  - **Then** 顯示正式 VocabReader 圖像而不是文字 `V`
  - **And** `VocabReader` 名稱與 `Read first. Learn deeply.` 標語維持可見

- **Scenario 3：production build 包含 icon**
  - **Given** desktop production build 從乾淨輸出目錄開始
  - **When** main 與 renderer 完成建置
  - **Then** 兩邊引用的 icon 都能解析為已輸出的圖像資產
  - **And** main bundle 不依賴工作目錄中的未建置相對路徑

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 頁首品牌圖像 | renderer 已掛載 | 查詢 `.brand-mark` | 元素為使用正式資產的裝飾性 `img`，不再含文字 `V` | Critical |
| TC2 | Electron 視窗 icon wiring | main process 建置 | 檢查主視窗建立設定與建置產物 | `BrowserWindow` 收到 bundle 內 icon 路徑 | Critical |
| TC3 | macOS Dock icon wiring | platform 為 macOS 且 App ready | 執行 ready 初始化 | Dock 設為同一份正式 icon | High |
| TC4 | production asset build | 執行 desktop build | 檢查輸出 | main 與 renderer build 成功且輸出 PNG 資產 | Critical |

## 6. Affected Modules and Files

### Production code

- `apps/desktop/assets/icon/vocabreader-language-learning-v6.png`
- `apps/desktop/package.json`
- `apps/desktop/src/main/assets.d.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documentation

- `documents/implements/F54-apply-vocabreader-app-icon.md`

## 7. Assumptions and Non-goals

### Assumptions

- 使用者所稱「預設 Electron icon」指目前執行 App 時的原生視窗與 Dock icon。
- 現有 PNG 已包含透明圓角並通過 16、24、32px 視覺檢查。

### Non-goals

- 不新增 Electron Builder、Electron Forge 或安裝包發布流程。
- 不在沒有 packager 的情況下新增未被使用的 `.icns`／`.ico`。
- 不更改 icon 內的書本、`Aa`、藍色對話框或黃色標記線設計。
- 不更改產品名稱、標語、頁首高度或其他導覽功能。

### Open Questions

- 無阻擋實作的未決問題。

## 8. Implementation Record

### Status

Implemented and verified on 2026-08-08.

### Implementation Summary

- renderer 從正式 v6 PNG 資產匯入品牌圖像，頁首 `.brand-mark` 由文字 `V`
  改為裝飾性 `<img>`；產品名稱與標語維持不變。
- Electron main process 從同一份來源資產匯入 icon，並把 bundle 內的絕對路徑
  傳入 `BrowserWindow`。
- macOS 在 `app.whenReady()` 後、Dock API 存在時，使用同一 bundle 資產設定 Dock icon。
- main build 加入 PNG file loader 與穩定 asset 輸出目錄；Vite renderer build 亦從
  相同來源產生 hashed PNG。
- icon 保持 1024×1024 與透明外角，頁首以 38×38px 顯示並禁止拖曳。

### Test Coverage

| Test | Covered scenarios |
|---|---|
| `shows the official VocabReader icon in the top-bar brand` | TC1：正式圖像、裝飾性語意、移除文字 V、保留名稱與標語 |
| `launches the secure Electron reading shell` | TC1、TC2、TC3：production bundle 啟動、main icon 路徑可用、頁首圖像可見 |
| desktop production build asset inspection | TC2、TC4：main／renderer 均輸出 1024×1024 PNG |

### Changed Files

#### Production Code

- `apps/desktop/assets/icon/vocabreader-language-learning-v6.png`
- `apps/desktop/package.json`
- `apps/desktop/src/main/assets.d.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/F54-apply-vocabreader-app-icon.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Electron 使用正式 icon | Pass | main build 輸出 hashed PNG；Electron E2E 在 macOS 成功執行 Dock 設定並建立視窗 |
| 頁首顯示正式 icon | Pass | renderer unit test 與 Electron E2E 驗證 `img.brand-mark`、正式資產 URL、名稱及標語 |
| production build 包含 icon | Pass | main 與 renderer build 均輸出可解析的 1024×1024 PNG |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `shows the official VocabReader icon in the top-bar brand` 與 Electron E2E |
| TC2 | Pass | main production build asset inspection；Electron E2E 成功建立主視窗 |
| TC3 | Pass | macOS Electron E2E 在 Dock 設定之後成功完成 ready 初始化與主視窗載入 |
| TC4 | Pass | desktop production build；main／renderer 兩份 hashed PNG 尺寸檢查 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "shows the official VocabReader icon"
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
find apps/desktop/dist-electron apps/desktop/dist/renderer -type f -name '*vocabreader-language-learning-v6*.png' -print -exec sips -g pixelWidth -g pixelHeight {} \;
npm run test:e2e -w @reader/desktop -- --grep "launches the secure Electron reading shell"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx
npm run test -w @reader/desktop
git diff --check
```

### Test Results

- 初始 red：`.brand-mark` 的元素類型為 `SPAN`，測試預期正式圖像 `IMG`。
- 聚焦品牌測試：1/1 passed。
- App renderer tests：76/76 passed。
- Desktop Vitest：39 files、400/400 passed。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed；main 與 renderer 分別輸出 1024×1024 PNG。
- Electron E2E 聚焦案例：1/1 passed。

### Hypotheses and Decisions

1. 專案目前沒有 Electron Builder／Forge，因此本功能設定執行時原生視窗 icon 與
   macOS Dock icon，不假裝提供尚未存在的 installer executable icon 流程。
2. main 與 renderer 直接匯入同一份來源 PNG，由 esbuild／Vite 各自輸出 hashed
   資產，避免 renderer 與 Electron icon 使用兩份手動複製的來源檔。
3. Electron 型別將 `app.dock` 標記為可選；即使已檢查 macOS，仍保留 Dock API
   存在性檢查，兼容測試替身與非標準執行環境。

### Architectural Observations

- icon 是靜態品牌資產，既有 main／renderer 建置邊界可直接承載；沒有新增模組、
  領域責任或需要另開 RXX 的耦合。

### Deferred Items

- 未新增 `.icns`／`.ico` 與安裝包 metadata；待專案採用 Electron Builder／Forge
  時，再將同一正式來源資產接入對應發布流程。
