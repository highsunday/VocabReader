---
author: Codex
date: 2026-08-25
title: 以 MIT 授權公開 repository 並發布桌面安裝包
uuid: 9f303321-5824-489f-8768-1fb0b5abdcad
version: 1.0.0
status: approved
---

# Feature Specification - 公開發布與桌面安裝包

## 1. Feature Overview

VocabReader 已有產品首頁與完整 Electron 桌面功能，但 GitHub repository 仍為 private，
沒有 LICENSE、tag、Release 或可直接安裝的桌面產物。初次訪客即使被 README 吸引，也只能
從原始碼啟動，無法直接下載 App。

本功能以 `highsunday` 為著作權人加入 MIT License，將 repository 改為 public，並建立
可重複執行的 GitHub Actions release workflow。推送語意化版本 tag 後，workflow 應在原生
runner 上分別產生 macOS Apple Silicon DMG、macOS Intel DMG 與 Windows x64 NSIS installer，
再附加到同版本的 GitHub Release。

第一版安裝包沒有 Apple Developer ID、notarization 或 Windows code-signing certificate，
因此必須明確標示為 unsigned Early Preview，不得讓使用者誤以為作業系統已驗證發布者。

## 2. Requirements (User Story)

- **As a** 從 GitHub 首頁認識 VocabReader 的語言學習者
- **I want** 直接下載適合自己電腦的安裝包
- **So that** 我不需要先安裝開發工具或從原始碼啟動 App

## 3. Confirmed Publication Rules

### 3.1 授權與公開範圍

- Repository 根目錄加入標準 MIT License，copyright holder 使用 GitHub owner
  `highsunday`，年份為 2026。
- README 顯示 MIT badge 與 License 連結。
- 只有 tracked Git 內容會公開；使用者目前未追蹤的簡報、檢查輸出與 `.codex-tmp/`
  不得加入 commit。
- 改為 public 前必須掃描目前 tracked working tree 與所有可達 Git 歷史的高可信度
  secrets 形狀，並確認沒有實際憑證。

### 3.2 安裝包矩陣

- macOS Apple Silicon：DMG，`arm64`。
- macOS Intel：DMG，`x64`。
- Windows：NSIS installer，`x64`。
- 每個產物檔名必須包含 product name、版本、平台及架構，讓 Release 頁面可直接辨識。
- 各平台在對應的 GitHub-hosted native runner 建置，不以跨平台模擬產生正式 Release。

### 3.3 發布觸發與權限

- 推送符合 `v*` 的 tag 時觸發 workflow；第一個版本使用現有 package version `v0.1.0`。
- build job 只需讀取 repository；publish job 只取得建立／更新同 repository Release 所需的
  `contents: write`。
- workflow 使用 GitHub runner 內建的 `GITHUB_TOKEN`，不新增 personal access token secret。
- Release job 等三種 installer 都成功後才建立或更新 Release；不得發布只有部分平台的
  正常 release。

### 3.4 Runtime 與發布邊界

- 安裝包只包含 `@reader/desktop` 的 Electron runtime、production dependencies、renderer
  與已 bundle 的 App skills；舊 Reader Server 不屬於目前正式桌面 runtime，不需隨附。
- 使用目前 1024×1024 VocabReader PNG 作為跨平台 icon source。
- native dependency 必須依 Electron ABI rebuild；package 保持 ASAR，並讓 native binaries
  可由 packager 正確處理。
- 本功能不改變使用者資料路徑、書庫、Codex App Server 或 OpenAI API key 的 runtime 行為。

### 3.5 未簽章 Early Preview

- 沒有憑證時 workflow 明確停用自動 code-sign identity discovery。
- README 與 Release notes 必須告知安裝包尚未簽章／notarize，macOS Gatekeeper 或 Windows
  SmartScreen 可能要求額外確認。
- 日後加入 signing secrets 時可延伸 workflow，但本次不得建立或要求使用者貼出私鑰。

## 4. Acceptance Criteria

- **Scenario 1：MIT 授權可見**
  - **Given** 訪客開啟 public repository
  - **When** 查看根目錄與 README
  - **Then** 可看到 2026 highsunday 的標準 MIT License 與 MIT badge

- **Scenario 2：本機可建置目前平台安裝包**
  - **Given** 已完成 `npm ci` 且目前平台為 macOS
  - **When** 執行 Apple Silicon installer script
  - **Then** 先完成 desktop build，再產生有版本、平台與架構的 `.dmg`

- **Scenario 3：tag 產生三平台 Release**
  - **Given** main 已包含 release workflow
  - **When** 推送 `v0.1.0` tag
  - **Then** 三個 native runner 分別產生 arm64 DMG、x64 DMG 與 x64 EXE
  - **And** 全部成功後才由 publish job 建立或更新 `v0.1.0` Release

- **Scenario 4：發布權限最小化**
  - **Given** workflow 執行
  - **When** build 與 publish jobs 取得 token
  - **Then** build 只有 `contents: read`，只有 publish 具有 `contents: write`
  - **And** 不需要 repository personal access token

- **Scenario 5：公開不包含本機素材或 secrets**
  - **Given** 工作區含未追蹤簡報與暫存檔
  - **When** 建立並推送 release commit
  - **Then** commit 只包含已明確列出的 README、LICENSE、release config、測試、文件及圖片
  - **And** secret audit 無真實高可信度命中

- **Scenario 6：unsigned 狀態不誤導**
  - **Given** 第一版沒有簽章憑證
  - **When** 訪客閱讀 README 或 Release notes
  - **Then** 可預先知道 Gatekeeper／SmartScreen 警告與發布者未驗證狀態

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | MIT 內容契約 | 根目錄文件 | 執行 release config test | LICENSE 含 MIT 核心條款、年份與 owner | Critical |
| TC2 | Installer scripts | desktop package | 執行 release config test | 三個 scripts 對應 mac arm64、mac x64、win x64 | Critical |
| TC3 | Packager config | desktop package | 執行 release config test | app id、icon、artifact names、DMG／NSIS 與 GitHub provider 正確 | Critical |
| TC4 | Workflow matrix | tag workflow | 執行 release config test | 三個 native runner、三種產物及 publish dependency 存在 | Critical |
| TC5 | 最小權限 | tag workflow | 執行 release config test | build read-only、publish contents write、使用 github token | Critical |
| TC6 | Unsigned disclosure | README 與 release notes | 執行 release config test | 明確揭露未簽章與 OS 警告 | High |
| TC7 | 真實 macOS 產物 | macOS arm64 環境 | 執行 dist script | DMG 存在且可掛載、App bundle 含 main／preload／renderer | Critical |
| TC8 | 公開可下載 | GitHub release 完成 | 未登入開啟 repository／release | public 首頁與三個 installer URL 可讀取 | Critical |

## 6. Implementation Notes

- 使用 `electron-builder`，因目前專案已有明確的 build output、Electron entry point 與 npm
  workspace，無需引入第二套 application scaffold。
- electron-builder 的單一大型 PNG 可轉換為 macOS／Windows icon；目前 icon 為
  1024×1024，符合兩平台建議尺寸。
- GitHub Actions 使用 `macos-15`（arm64）、`macos-15-intel`（x64）與
  `windows-latest`（x64）；避免在不同架構 runner 交叉產生正式產物。
- Release publish job 下載三個 workflow artifacts 後使用 runner 內建 GitHub CLI 建立或
  `--clobber` 更新 assets。

## 7. Assumptions and Non-goals

### Assumptions

- `highsunday` 是目前可接受的 MIT copyright holder 顯示名稱。
- 第一版號沿用 package version `0.1.0`，tag 為 `v0.1.0`。
- macOS 與 Windows 使用者可接受 Early Preview 的未簽章提示。

### Non-goals

- 不建立 Linux AppImage、Microsoft Store 或 Mac App Store 版本。
- 不加入自動更新 runtime。
- 不設定 Apple Developer、notarization、Windows EV／OV signing certificate 或付費 secrets。
- 不把目前未追蹤的產品簡報、檢查輸出或 `.codex-tmp/` 公開。
- 不重寫 Git 歷史；安全稽核通過後直接切換 visibility。

## 8. Module Documentation Impact

不需更新產品領域模組文件。建議維持本 F72 作為 repository publishing 與 installer
architecture 的工程紀錄；它不改變 `CONTEXT.md` 定義的學習機制或 App runtime 邊界。

## 9. Implementation Record

### Status

Implementation in progress on 2026-08-25.
