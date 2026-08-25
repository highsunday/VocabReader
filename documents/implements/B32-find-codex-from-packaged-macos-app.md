---
author: Codex
date: 2026-08-25
title: 修正 macOS 安裝版無法啟動 Codex app-server
uuid: 7c0c8ad7-4813-4a26-8de7-c3c77d6c7c4d
version: 1.0.0
status: approved
---

# Bug Fix: 修正 macOS 安裝版無法啟動 Codex app-server

## 1. Bug Overview

`v0.1.1` 從 DMG 安裝後可正常開啟，但左側 Codex 狀態顯示 `Connection failed`，AI 對話
面板顯示 `spawn codex ENOENT`。同一台 Mac 的開發環境可以連線。

Electron 開發環境從終端機啟動，會繼承包含 `/opt/homebrew/bin` 的互動式 PATH；Finder
啟動的正式 App 只有受限的 GUI PATH。現有 `spawnCodexAppServer` 只在 Windows 探測 Codex
Desktop 執行檔，macOS 一律執行裸命令 `codex`，因此無法使用已安裝在
`/Applications/ChatGPT.app/Contents/Resources/codex` 的原生 Codex CLI。

## 2. Fix Objective

- macOS 安裝版優先尋找 ChatGPT／Codex Desktop App 內建的 Codex CLI，使用絕對路徑啟動
  `app-server`，不依賴 Finder 的 PATH。
- 支援系統與使用者 Applications 目錄，並在桌面 App 不存在時探測常見 Homebrew、
  `/usr/local` 與使用者本機 CLI 位置。
- 找不到任何 Codex 執行檔時，回報可操作的安裝提示，而不是直接顯示 `spawn codex ENOENT`。
- 保持既有 Windows Codex Desktop 與 npm shim 行為不變。
- 發布 `v0.1.2` Apple Silicon、Intel 與 Windows x64 安裝包。

## 3. Acceptance Criteria

- **Scenario 1：Finder PATH 下使用 ChatGPT 內建 Codex**
  - **Given** macOS GUI PATH 不包含 Homebrew 或 npm bin
  - **And** `/Applications/ChatGPT.app/Contents/Resources/codex` 可執行
  - **When** VocabReader 建立 Codex transport
  - **Then** 以該絕對路徑和 `app-server` 參數啟動子程序

- **Scenario 2：支援其他正常安裝位置**
  - **Given** Codex 位於使用者 Applications、`Codex.app`、Apple Silicon Homebrew、Intel
    Homebrew 或 `~/.local/bin` 的其中一處
  - **When** macOS resolver 尋找執行檔
  - **Then** 回傳第一個存在且可執行的候選路徑

- **Scenario 3：Codex 未安裝時提供可操作訊息**
  - **Given** 找不到 Codex Desktop 或 CLI
  - **When** spawn 回報 `ENOENT`
  - **Then** 連線錯誤說明使用者需安裝 ChatGPT／Codex Desktop 或 Codex CLI 並重新啟動
    VocabReader

- **Scenario 4：Windows 行為不回歸**
  - **Given** Windows 有或沒有 Codex Desktop native CLI
  - **When** VocabReader 啟動 app-server
  - **Then** 分別沿用 native executable 或 `codex.cmd` shim 路徑

- **Scenario 5：公開發布修正版**
  - **Given** 修正及回歸測試已通過
  - **When** 建立 `v0.1.2` tag
  - **Then** GitHub Release 產生三平台安裝包，macOS DMG 繼續通過 bundle 簽章 gate

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 系統 ChatGPT App 探測 | 暫存 Applications 內有可執行 CLI | resolver 執行 | 回傳 ChatGPT 內建 CLI | Critical |
| TC2 | 使用者 App 與常見 CLI fallback | 不同候選位置各自存在 | resolver 執行 | 依優先序回傳可執行候選 | High |
| TC3 | macOS spawn 使用絕對路徑 | 注入 desktop executable | 呼叫 spawn helper | 以絕對路徑啟動 `app-server` | Critical |
| TC4 | `ENOENT` 訊息 | child process emit ENOENT | client 初始化失敗 | 回傳安裝／重啟提示 | High |
| TC5 | Windows regression | native 與 shim fixtures | 執行既有 tests | 行為保持通過 | High |
| TC6 | 實機 GUI PATH | 只保留 `/usr/bin:/bin:/usr/sbin:/sbin` | 執行探測出的 CLI | `--version` 與 `app-server --help` 成功 | Critical |
| TC7 | v0.1.2 Release | tag workflow | 三平台 jobs 完成 | assets 齊全且公開可下載 | Critical |

## 5. Implementation Notes

- macOS 候選順序優先採用 Desktop App 內建 native CLI，再採用常見 package-manager CLI；
  只接受一般檔案且具執行權限的候選。
- 不透過 login shell 啟動 app-server，避免使用者 shell startup 輸出污染逐行 JSON stdout。
- resolver 保持純檔案探測，可注入 Applications 與 home 目錄，以便不依賴測試機實際安裝。
- `SpawnedCodexAppServerClient` 將 spawn 的 `ENOENT` 正規化為產品可理解的操作提示。

## 6. Affected Files and Boundaries

- `apps/desktop/src/main/codex-app-server-client.ts`
- `apps/desktop/src/main/codex-app-server-client.test.ts`
- `apps/desktop/package.json`
- `package-lock.json`
- `docs/release-notes/v0.1.2.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/B32-find-codex-from-packaged-macos-app.md`

本修正只改變 Codex transport 的執行檔探測與啟動錯誤，不改變 AI 對話、閱讀區段、帳戶
資料、學習項目或其他學習流程。

## 7. Assumptions and Non-goals

- 使用 AI 功能的裝置仍需安裝 ChatGPT／Codex Desktop 或 Codex CLI，並完成有效的 Codex
  登入；VocabReader 不內嵌登入憑證。
- 不把第三方 Codex binary 複製進 VocabReader 安裝包。
- 不連接或接管 ChatGPT App 已啟動的 app-server process；VocabReader 使用相同本機登入狀態
  啟動自己的 stdio app-server。
- 本修正不處理 Apple notarization。

## 8. Implementation Record

### Status

Implementation pending on 2026-08-25.

## Appendix: TDD Fix Workflow

1. 以 macOS Finder 的最小 PATH 與既有 spawn unit seam 重現 `ENOENT`。
2. 先加入 Desktop App／常見 CLI 探測與可操作錯誤的失敗測試。
3. 實作最小 resolver 與 spawn 選擇，執行 target、desktop 全套與 e2e 測試。
4. 從 DMG 啟動實際安裝版並驗證 Codex ready，再發布 `v0.1.2`。
