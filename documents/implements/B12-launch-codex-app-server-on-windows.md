---
author: Codex
date: 2026-07-28
title: 修正 Windows 無法啟動 Codex App Server
uuid: 62a7bf44-95a9-4c76-9c2b-a5f247bfaf96
version: 1.2.0
status: implemented
---

# Bug Fix: 修正 Windows 無法啟動 Codex App Server

## 1. Bug Overview

LingoShelf 的 `SpawnedCodexAppServerClient` 以 Node.js
`spawn("codex", ["app-server"])` 啟動 **Codex AI 執行層**。Windows 透過 npm
安裝 Codex CLI 時，PATH 上提供的是 `codex.cmd`／`codex.ps1` shim；Node.js 不經
shell 直接啟動裸命令會回報 `spawn codex ENOENT`。即使使用者已安裝並登入 Codex，
AI 對話面板仍顯示連線失敗。

## 2. Root Cause

- Codex App Server 的預設子程序啟動方式沒有區分作業系統。
- Windows 沒有可供 `spawn("codex")` 直接執行的原生 `codex.exe`，npm shim 必須由
  Windows 命令處理器解析。
- 既有測試全部注入 fake child process，未覆蓋預設啟動命令的作業系統分支。

## 3. Fix Objective

- Windows 優先直接啟動 Codex Desktop 自帶的 native `codex.exe`；未安裝 Desktop
  時才使用系統命令處理器啟動 PATH 上的 `codex.cmd app-server`。
- macOS、Linux 與其他非 Windows 平台繼續直接啟動 `codex app-server`。
- 保留既有 stdin／stdout JSONL transport、request timeout、登入及錯誤投影行為。

## 4. Acceptance Criteria

- **Scenario 1：Windows 可啟動 Codex App Server**
  - **Given** Windows 已安裝 Codex Desktop
  - **When** LingoShelf 建立 `SpawnedCodexAppServerClient`
  - **Then** 直接啟動 Codex Desktop 最新的 native `codex.exe app-server`
  - **And** 可完成 initialize 與 account/read 握手

- **Scenario 2：npm shim fallback**
  - **Given** Windows 未安裝 Codex Desktop
  - **When** LingoShelf 建立 `SpawnedCodexAppServerClient`
  - **Then** 透過 Windows 命令處理器啟動 `codex.cmd app-server`

- **Scenario 3：非 Windows 行為不變**
  - **Given** 執行平台不是 Windows
  - **When** LingoShelf 建立 `SpawnedCodexAppServerClient`
  - **Then** 直接啟動 `codex app-server`

- **Scenario 4：既有 fake transport 測試保持可注入**
  - **Given** 測試提供 `spawnProcess`
  - **When** 建立 client
  - **Then** 使用注入的 child process，不啟動真實 Codex

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Desktop native 啟動 | platform=win32、Desktop binary 存在 | 建立 child process | 直接 spawn native `codex.exe app-server` | Critical |
| TC2 | npm shim fallback | platform=win32、Desktop binary 缺席 | 建立 child process | 命令處理器收到 `codex.cmd app-server` | Critical |
| TC3 | 非 Windows 啟動命令 | platform=linux | 建立 child process | 直接 spawn `codex app-server` | Critical |
| TC4 | Desktop discovery | 多個 Desktop binary | 選擇 executable | 使用 mtime 最新的 regular file | High |
| TC5 | 真實 Windows production | 本機 Codex Desktop 已登入 | Electron 冷啟動三次 | 3/3 ready 且 account=chatgpt | Critical |

## 6. Implementation Notes

- 在 Codex transport 邊界建立可單元測試的子程序啟動與 Desktop discovery helper。
- Desktop 掃描範圍固定為 `%LOCALAPPDATA%\OpenAI\Codex\bin` 的直接子目錄，只接受
  regular `codex.exe`，並以修改時間選擇最新版本。
- native 路徑來自固定的 Codex Desktop 安裝根目錄；fallback 命令字串是固定產品
  常數，兩者都不接受 Renderer 或使用者輸入。
- 優先使用 `process.env.ComSpec`，缺少時退回 `cmd.exe`。
- 不使用 `shell: true` 擴張一般命令解析範圍。

## 7. Affected Modules and Files

- `apps/desktop/src/main/codex-app-server-client.ts`
- `apps/desktop/src/main/codex-app-server-client.test.ts`
- `documents/modules/ai-conversation.md`
- `documents/implements/B12-launch-codex-app-server-on-windows.md`

## 8. Assumptions and Non-goals

### Assumptions

- Windows Codex CLI 由 npm shim 提供，且 `codex.cmd` 可由目前 PATH 找到。
- `ComSpec` 若存在，指向可執行 Windows 命令處理器。

### Non-goals

- 不新增內嵌登入、API key 或 Codex 安裝流程。
- 不改變 Codex App Server JSONL 協定。
- 不修改 Fastify `AiGateway` 的 unconfigured 狀態。
- 不處理使用者 PATH 本身缺少 Codex CLI 的情況。

## 9. Implementation Record

### Status

Implemented on 2026-07-28.

### Implementation Summary

- 新增 `spawnCodexAppServer()` 作為 Codex transport 的平台啟動邊界。
- 新增 `findCodexDesktopExecutable()`，在固定 Desktop 安裝根目錄選擇最新 binary。
- Windows 優先直接啟動 Desktop native CLI；缺席時透過 `ComSpec`（缺少時使用
  `cmd.exe`）執行固定的 `codex.cmd app-server`，並隱藏命令視窗。
- 非 Windows 維持 `spawn("codex", ["app-server"])`。
- `SpawnedCodexAppServerClient` 仍優先使用測試注入的 `spawnProcess`，沒有改變
  JSONL transport、逾時或帳戶解析。

### Test Coverage

- TC1：驗證 Windows 直接啟動 Desktop native CLI。
- TC2：驗證 Desktop 缺席時的 Windows npm shim fallback。
- TC3：驗證非 Windows 行為不變。
- TC4：驗證選擇最新 Desktop executable，未安裝時回傳 null。
- TC5：production Electron 冷啟動 3/3 ready，回傳 ChatGPT account。

### Changed Files

#### Production Code

- `apps/desktop/src/main/codex-app-server-client.ts`

#### Test Code

- `apps/desktop/src/main/codex-app-server-client.test.ts`

#### Documents

- `documents/implements/B12-launch-codex-app-server-on-windows.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Windows 優先使用 Desktop native CLI | Pass | discovery／spawn tests；production Electron 3/3 |
| Desktop 缺席時 fallback 到 npm shim | Pass | Windows fallback unit test |
| 非 Windows 直接啟動行為不變 | Pass | non-Windows command unit test |
| fake transport 保持可注入 | Pass | 既有 Controller tests；241 tests passed |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Desktop native spawn unit test |
| TC2 | Pass | npm shim fallback unit test |
| TC3 | Pass | non-Windows spawn unit test |
| TC4 | Pass | Desktop discovery tests |
| TC5 | Pass | production Electron 3/3 ready |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/codex-app-server-client.test.ts
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop
npm run test -w @reader/desktop -- --run src/main/learning-library-service.test.ts
npm run build -w @reader/desktop
node <Windows Codex initialize/account-read verification harness>
git diff --check
```

### Hypotheses and Decisions

1. 原始回饋迴圈以和產品相同的 `spawn("codex")` 重現 `ENOENT`；第一版修正後，
   production Electron 又捕捉到 `Codex app-server 已結束（代碼 1）。`。
2. `codex --version` 與 `codex login status` 成功，排除未安裝及未登入。
3. 後續檢查發現 npm 0.145.0 更新留下暫存 shim 並缺少主 binary；同時 Codex
   Desktop native CLI 可正常握手，因此改以 Desktop 為 Windows 首選。
4. Desktop discovery 限制於固定安裝根目錄且只接受 regular file；fallback 使用固定
   命令處理器參數，不採一般性的 `shell: true`。

### Deferred Items

- 完整 Desktop suite 的 `learning-library-service.test.ts` 目前因共用 Vitest jsdom
  配置無法 bundle Node 內建 `node:sqlite` 而未收集。這是既有測試配置問題，不在
  B12 範圍；其餘 241 tests passed。

### Notes

本次修正沒有改變 Codex protocol、Renderer IPC、登入流程或 Fastify `AiGateway`。
未發現需要另開 RXX 的新架構問題；新增的啟動 helper 正位於既有 Codex transport
責任邊界。
