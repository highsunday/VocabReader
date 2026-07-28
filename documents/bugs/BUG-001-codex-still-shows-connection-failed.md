---
bug-id: BUG-001
title: Windows 修正後 Codex 仍顯示連線失敗
status: resolved
severity: high
created: 2026-07-28
updated: 2026-07-28
related-bxx: B12
---

# BUG-001 排查軌跡：Windows 修正後 Codex 仍顯示連線失敗

## 狀態快照（接手者先讀這一段）

- **現在相信的根因方向：** 已確認並修復：Windows 優先使用 Codex Desktop native CLI，不再被不完整 npm shim 阻斷。
- **已排除（別再找）：** Codex CLI 未安裝、未登入；`spawn("codex")` ENOENT 已由 B12 修正；獨立 `codex.cmd app-server` initialize／account-read 可成功。
- **下一步要做什麼：** 使用者重新啟動目前 dev App 做最終畫面驗收。
- **進度：** 已做 4 次實驗，目前最佳指標 = production Electron 冷啟動連線成功率 3/3

## 1. Bug 描述

使用者在 Windows 看到 LingoShelf Codex 狀態顯示「連線失敗」。B12 已修正 Node 無法
直接啟動 npm shim 的 `ENOENT`，獨立命令也能完成 Codex initialize／account-read，
但使用者重新驗收時狀態仍是「連線失敗」。

**錯誤指紋（用來辨識復發）：**

```text
Codex
連線失敗
```

typed snapshot 的精確 `connectionDetail` 待 EXP-001 捕捉。

```text
Codex app-server 已結束（代碼 1）。
```

## 2. 重現步驟

```text
# 環境：Windows、Codex CLI 0.144.4、ChatGPT 已登入
1. 啟動目前 production build 的 LingoShelf Electron App。
2. 等待 Main Process 自動執行 Codex connect。
3. 讀取 Codex 狀態卡或 window.readerDesktop.chat.getState()。
4. 預期 connection=ready；實際使用者看到「連線失敗」。
```

出現頻率：目前使用者驗收 1/1。

## 3. 完成條件 (Done)

| 指標 | 基準值（現在） | 目標值（修好後） | 目前最佳 |
| ---- | -------------- | ---------------- | -------- |
| production Electron 冷啟動連線成功率 | 0/2 | 3/3 | 3/3 |
| 真實 Codex initialize／account-read | 1/1 | 1/1 | 1/1 |
| transport focused tests | 2/2 | 5/5 | 5/5 |
| Codex Desktop native CLI 握手 | 未測 | 1/1 | 1/1 |

## 4. 已確認事實（建立後視為真，不再重測）

| 事實 | 如何被確認 | 日期 |
| ---- | ---------- | ---- |
| PowerShell 可執行 Codex CLI 0.144.4 | `codex --version` | 2026-07-28 |
| 本機已使用 ChatGPT 登入 | `codex login status` | 2026-07-28 |
| 經 Windows 命令處理器可完成 initialize／account-read | B12 verification harness | 2026-07-28 |
| Electron 與成功 Node harness 的 PATH、cwd、ComSpec 相同 | EXP-002 process environment diff | 2026-07-28 |
| 全域 npm Codex 0.145.0 安裝缺少 shim 與主 codex.exe | EXP-002 filesystem inspection | 2026-07-28 |
| Codex Desktop 另有 native codex.exe | 掃描 `%LOCALAPPDATA%\OpenAI\Codex\bin` | 2026-07-28 |

## 5. 調查範圍

### 5.1 已排除 — 確認非原因

| 範圍 / 元件 | 排除依據 | 日期 |
| ----------- | -------- | ---- |
| Codex CLI 未安裝或未登入 | version／login status 成功 | 2026-07-28 |
| App Server initialize／account-read 協定完全不相容 | 獨立真實握手成功 | 2026-07-28 |
| UI 只是顯示錯誤、實際連線成功 | production snapshot 為 error 且 child exit code=1 | 2026-07-28 |

### 5.2 可疑點

| 優先 | 範圍 / 元件 | 懷疑理由 | 狀態 |
| ---- | ----------- | -------- | ---- |
| 🟢 | Codex Desktop native CLI fallback | production Electron 3/3 ready | 已修復 |
| 🟢 | Electron GUI process PATH／環境 | 與 Node harness 相同 | 已排除 |
| 🟡 | production Electron 實際 snapshot | 已取得 child exit code 1，仍缺 stderr | 部分確認 |
| 🟡 | B12 command wrapper process lifecycle | 獨立 harness 與完整 Controller 生命週期不同 | 未調查 |
| 🟡 | 使用者執行的 build／process 是否為最新 | 舊 Electron process 可能仍載入修正前 bundle | 未調查 |

### 5.3 未調查

- [ ] `ChatController.connect()` 在 production Electron 中的精確錯誤。
- [ ] production bundle 實際包含的 Windows spawn 命令。
- [ ] 連線後 allowance／model catalog 是否誤改 connection 狀態。

## 6. 當前假說

若 Codex Desktop 自帶的 native CLI 能使用相同登入狀態完成握手，則 Windows launcher
可在 npm shim 缺失時安全 fallback 到 Desktop binary，不依賴 npm 更新的暫存檔。

## 7. 實驗紀錄

### EXP-004 — 2026-07-28

- **假說：** Windows launcher 優先直接啟動 Codex Desktop native CLI，找不到時才使用 npm shim，可讓目前 production Electron 連線成功且保留相容性。
- **預計修改範圍：** `codex-app-server-client.ts`、對應 transport tests、B12 與 module 文件。
- **修改內容：** 新增 Codex Desktop native executable discovery；Windows 優先直接
  spawn 最新 native CLI，找不到才使用 `codex.cmd`。
- **測試指令：** focused Vitest、typecheck、build、production Electron 3 次冷啟動。
- **指標變化：**
  - transport focused tests：2/2 → 5/5。
  - production Electron 冷啟動連線成功率：0/2 → 3/3。
  - typecheck：pass；production build：pass。
- **結果：** ✅ 完全修復。
- **觀察 / 新線索：** 三次 snapshot 都是 `connection=ready`、
  `connectionDetail=Codex 已連線。`、`account.type=chatgpt`。

### EXP-003 — 2026-07-28

- **假說：** Codex Desktop 自帶的 native `codex.exe` 可使用相同登入狀態完成 App Server 握手，可作為 npm shim 缺失時的安全 fallback。
- **預計修改範圍：** 先不修改；直接啟動 `%LOCALAPPDATA%\OpenAI\Codex\bin\<version>\codex.exe app-server`。
- **修改內容：** 尚未修改。
- **測試指令：** Node JSONL initialize／account-read harness。
- **指標變化：** native CLI initialize／account-read 由未測 → 1/1。
- **結果：** ✅ 假說成立，可作為修復路徑。
- **觀察 / 新線索：** `%LOCALAPPDATA%\OpenAI\Codex\bin\3135b80b111fd431\codex.exe`
  直接啟動後回傳 ChatGPT account，stderr 為空。

### EXP-002 — 2026-07-28

- **假說：** Electron Main 繼承了會改變 Codex npm shim／Node 行為的環境變數，或使用不同 PATH／cwd。
- **預計修改範圍：** 不修改生產程式；讀取 Electron Main 的 process 環境並與成功的 Node harness 比較。
- **修改內容：** 尚未修改。
- **測試指令：** Playwright Electron main-process evaluate。
- **指標變化：** production Electron 仍為 0/2；根因範圍由環境差異縮小為 CLI 安裝／解析。
- **結果：** ⚠️ 部分收斂。
- **觀察 / 新線索：** Electron 與 Node 的 PATH、cwd、ComSpec 相同。全域 npm
  `@openai/codex@0.145.0` 處於不完整狀態：正常 `codex.cmd` 已被改名為 npm 暫存
  shim，Windows optional package 缺少主 `codex.exe`；舊 0.144.4 package 位於 npm
  暫存目錄且正被目前 Codex process 使用。

### EXP-001 — 2026-07-28

- **假說：** production Electron 的 typed snapshot 會暴露比 UI「連線失敗」更精確的錯誤指紋。
- **預計修改範圍：** 不修改生產程式；以 Playwright 啟動 production build 並讀取 chat state。
- **修改內容：** 尚未修改。
- **測試指令：** Node + Playwright Electron launch，輪詢 `window.readerDesktop.chat.getState()`。
- **指標變化：** production Electron 連線成功率 0/1 → 0/2。
- **結果：** ⚠️ 部分收斂；取得精確錯誤但尚未修復。
- **觀察 / 新線索：** snapshot 為 `connection=error`，detail 為
  `Codex app-server 已結束（代碼 1）。`；失敗發生在 account-read 前。

## 8. 解決方案

- **根因：** Windows 全域 npm Codex 更新留下暫存 shim 與缺少主 binary 的
  0.145.0 package；B12 第一版只啟動 `codex.cmd`，因此 cmd 立即以代碼 1 結束。
- **修復方式：** 掃描固定的 `%LOCALAPPDATA%\OpenAI\Codex\bin\<version>\codex.exe`
  位置，選擇最新 native CLI 並直接啟動；找不到 Codex Desktop 時才退回 npm shim。
- **最終 commit 序列：** —
- **回歸測試：** Windows native CLI、Desktop discovery、未安裝安全降級、npm
  shim fallback、非 Windows direct spawn，共 5 cases。
- **對應 BXX：** B12。
