---
author: Codex
date: 2026-07-21
title: 只載入 App 隨附的標記解析 skill
uuid: dd03ac9517cd4cc4a9202c690c6facba
version: 1.0.0
status: implemented
---

# Bug Fix: 只載入 App 隨附的標記解析 Skill

## 1. Bug Overview

使用者點擊「解釋標記」後，`turn/start` 雖然帶有 `$explain-reader-annotations` 文字標記與型別化 skill input，但實際 Codex rollout 沒有出現 `SKILL.md` 的教學規則。AI 因此只做一般回答，可能漏掉 CEFR 與複習表；在後續詢問時還會錯誤表示自己沒有載入 skill。

根因是對話隔離設定的 `skills.include_instructions: false`。它原本用來禁止其他 skills，實際上也抑制了本次明確提供的 skill instructions。既有 fake App Server 測試只驗證 request payload，沒有模擬 App Server 的指令注入，因此產生假綠燈。

## 2. Fix Objective

桌面 App 必須把隨安裝包內嵌的 `explain-reader-annotations` 內容，作為唯一允許的 App skill instructions 提供給新建與恢復的 Codex thread。只有「解釋標記」動作加入的 marker 才啟用該 workflow；一般問答照常回答。Codex 的全域、個人、bundled、plugin 或其他 repo skills 必須繼續保持未載入狀態。

## 3. Acceptance Criteria

- **Scenario 1：新對話載入唯一的 App skill**

  - **Given** 桌面 App 內嵌 `explain-reader-annotations/SKILL.md`
  - **When** `ChatController` 建立新 thread
  - **Then** `developerInstructions` 包含該內嵌 skill 的完整內容及 marker 啟用條件
  - **And** `skills.include_instructions`、bundled skills、plugins 與 apps 仍為停用

- **Scenario 2：恢復的對話仍載入相同 skill**

  - **Given** 使用者選擇一筆已保存的 AI 對話
  - **When** `ChatController` 執行 `thread/resume`
  - **Then** 使用與新 thread 相同的唯一 App skill instructions

- **Scenario 3：點擊解釋標記會遵守完整學習契約**

  - **Given** 閱讀區段含有標記，且使用者已設定講解語言
  - **When** 使用者點擊「解釋標記」
  - **Then** turn 仍包含 `$explain-reader-annotations` 與固定名稱／固定安裝路徑的 skill input
  - **And** 已載入的 skill 要求依本文用法判斷 CEFR、只選必要小節，並在結尾產生複習表

- **Scenario 4：不能導入任何其他 skill**

  - **Given** 電腦可能另有 Codex 個人、系統或 plugin skills
  - **When** App 建立或恢復 AI thread
  - **Then** 不啟用一般 skill discovery 或 instruction catalog
  - **And** App 只傳入打包在應用程式內的 `explain-reader-annotations` 內容，不讀取使用者提供的任意 skill 名稱、內容或路徑

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 新 thread 的 App skill 指令 | 內嵌 skill 內容 | `thread/start` | developer instructions 含 marker gate、CEFR 與 review table 契約 | Critical |
| TC2 | 其他 skills 保持關閉 | thread 建立 | 檢查 config | general instructions、bundled skills、plugins、apps 都是 false | Critical |
| TC3 | 恢復 thread | 已保存 thread | `thread/resume` | developer instructions 與新 thread 相同 | Critical |
| TC4 | 一般與解析 turn 隔離 | 同一 thread | 先一般問答再點解析 | 一般 turn 僅 text；解析 turn 才有 marker 與指定 skill item | High |
| TC5 | 安裝包來源固定 | App 啟動 | 建立 controller | instructions 與 runtime 路徑皆由 Electron Main 的同一份內嵌 markdown 提供 | High |

## 5. Implementation Notes

- 保留 `skills.include_instructions: false`，避免 Codex 自動列入或載入其他可發現 skills。
- Electron Main 已以 text loader 內嵌指定 `SKILL.md`；把同一字串同時交給 runtime installer 與 `ChatController`，避免開發 repo 或使用者檔案成為 production 指令來源。
- `ChatController` 將基本安全邊界、唯一 skill 聲明、marker gate 與內嵌 skill 組成 `developerInstructions`，在 `thread/start` 及 `thread/resume` 共用。
- 型別化 skill input 繼續保留，因為它只指向同一個 App 隨附 skill，並維持 Codex App Server 的明確呼叫格式。
- 不開放 Renderer、設定檔或自由輸入覆寫 skill 名稱、內容與路徑。

## 6. Additional Notes

- 已查核本機 Codex App Server schema，`turn/start.input` 支援 `{ type: "skill", name, path }`。
- 已核對 App user data 內的 skill 與 repo 版本雜湊相同，排除遺失或安裝舊版。
- 修復後以 request-level 回歸測試、完整 Desktop 測試、typecheck、production build 與 Electron E2E 驗證。因安全審核不允許在診斷工具中另開未隔離的真實 Codex backend session，不以該方式繞過限制。

## 7. Implementation Record

### Root Cause Evidence

- App user data 的 `SKILL.md` 存在，且 SHA-256 與 repo 內建版本相同，排除未安裝或版本過舊。
- 本機 Codex App Server schema 支援型別化 skill input，排除 request 格式或 CLI 版本不相容。
- 實際問題 thread 的 rollout 含 `$explain-reader-annotations`，但完全不含 skill 本文；同一 rollout 的 thread config 設為 `skills.include_instructions: false`。
- 舊 fake App Server 只記錄 request，沒有模擬 instruction injection，因此只驗證「送出了 skill item」，沒有驗證「模型收到 skill 規則」。

### Fix

- `ChatControllerOptions` 新增必要的 `annotationExplanationSkillInstructions`，只接受 Electron Main 傳入的 App bundle markdown。
- 新建與恢復 thread 共用 `composeDeveloperInstructions`：內含基礎安全規則、唯一 App skill 聲明、`$explain-reader-annotations` marker gate，以及完整內嵌 skill。
- `skills.include_instructions`、bundled skills、plugins、apps、memories 與 web search 全部保持關閉；未啟用一般 skill discovery。
- Main 以同一份 build-time markdown 同時安裝 runtime `SKILL.md` 並提供 instructions，避免兩個來源漂移。

### Verification

| Test | Result |
|---|---|
| Red reproduction：thread instructions 缺少唯一 App skill | failed as expected |
| Focused controller regression | 28/28 passed |
| Full Server tests | 3/3 passed |
| Full Desktop tests | 119/119 passed |
| TypeScript typecheck | passed |
| Production build | passed；`main.cjs` 含 marker gate、CEFR 與 review table 契約 |
| Electron E2E | 2/2 passed（桌面環境） |

### Files Changed for B03

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/main.ts`
- `documents/implements/B03-load-only-bundled-annotation-skill.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`
