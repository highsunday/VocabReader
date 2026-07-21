---
author: Codex
date: 2026-07-21
title: 讓解釋標記動作呼叫專用語言學習 skill
uuid: 09010b7444c649328ed3771ad2638c55
version: 1.3.1
status: implemented
---

# Feature Specification - 標記解析 Skill

## 1. Feature Overview

目前「解釋標記」已能把閱讀區段、標記與全域講解語言送到 Codex AI 執行層，但實際講解規則需要作為 App 隨附、可維護且唯一允許的 Codex workflow。由於 thread 隔離設定會停用一般 skills instruction catalog，App 必須自行載入這份內嵌規則，同時保持其他 skills 關閉。

本功能新增 repo 專用的標記解析 skill。使用者點擊「解釋標記」時，App Server 的 `turn/start` 會以型別化 skill input 明確載入該 skill；skill 依標記在閱讀區段中的用法提供實用、精簡的語言學習說明及 CEFR 難度，最後產生複習表。講解輸出語言由既有「講解語言」設定決定，不固定為英文。一般 AI 問答仍不呼叫此 skill。

## 2. Requirements (User Story)

- **As a** 閱讀外語原文並標記不理解內容的學習者
- **I want** 點擊「解釋標記」時使用一致且可維護的專用學習 workflow
- **So that** 我能依自己的講解語言設定理解每個標記，並得到適合複習的精簡整理

## 3. Acceptance Criteria

- **Scenario 1：明確呼叫標記解析 skill**
  - **Given** 使用者位於具有目前閱讀區段的章節
  - **When** 使用者點擊「解釋標記」
  - **Then** thread 的 `developerInstructions` 已載入 App 內嵌的唯一 `explain-reader-annotations` skill 與 marker gate
  - **And** `turn/start` 同時包含 `$explain-reader-annotations` 文字標記與指向 App 安裝到 user data 的 `SKILL.md` 型別化 `skill` input

- **Scenario 2：依設定決定講解語言**
  - **Given** 講解語言為原文語言、繁體中文、English 或日本語之一
  - **When** 使用者執行標記解析
  - **Then** 本次輸入把已驗證的語言要求提供給 skill
  - **And** skill 要求所有標題、說明、例句註解與複習表使用該講解語言
  - **And** 原文、標記文字、必要的 IPA 與英文例句可以保留其本來形式

- **Scenario 3：提供實用而非機械式的學習說明**
  - **Given** 閱讀區段含一個或多個 `<reader-annotation>`
  - **When** skill 解析標記
  - **Then** 每個標記只使用有助理解或運用的 Meaning、Context、Grammar、Vocabulary、Examples、Synonyms、Common collocations、Pronunciation、Common mistakes、Easy paraphrase 等小節
  - **And** 每個標記依它在本文中的用法給出約略 CEFR 等級
  - **And** 回覆最後包含標記項目、簡單意思、CEFR 等級及實用備註的複習表

- **Scenario 4：尊重閱讀區段與標記邊界**
  - **Given** 產品輸入包含 `<reading-segment>` 與零個或多個 `<reader-annotation>`
  - **When** skill 產生回覆
  - **Then** 只有標籤包住的內容視為標記，其他文字只作為上下文
  - **And** 不主動翻譯或解釋整個閱讀區段，也不假設區段外內容
  - **And** 沒有標記時只說明目前區段沒有可解析的標記

- **Scenario 5：一般問答維持隔離**
  - **Given** 使用者在 AI 對話面板輸入一般問題
  - **When** 系統建立一般 `turn/start`
  - **Then** input 不包含 skill item 或 `$explain-reader-annotations`
  - **And** 原有唯讀、禁止工具、一般 skill discovery、bundled skills、plugins、apps、memories 與 web search 的安全邊界維持不變

- **Scenario 6：Skill 隨桌面應用程式安裝**
  - **Given** 使用者只安裝桌面應用程式，電腦上沒有本專案原始碼 repo
  - **When** 應用程式首次啟動或升級到含新版 skill 的版本
  - **Then** Electron Main 從應用程式 bundle 內的 skill 內容，在 user data runtime 安裝或更新 `SKILL.md`
  - **And** `ChatController` 使用這份已安裝 skill 的絕對路徑，不引用開發 repo `.agents` 路徑
  - **And** 已安裝內容與目前 App 內建版本相同時不做不必要的檔案替換

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Skill 明確注入 | `intent=explainAnnotations` | 組成 turn input | 第二個 input 為名稱與絕對路徑正確的 `skill` item，文字含 `$explain-reader-annotations` | Critical |
| TC2 | 一般問答無 skill | 沒有解析 intent | 組成 turn input | 只有一般 text input，不含 skill 名稱或路徑 | Critical |
| TC3 | 四種語言映射 | 各種合法講解語言 | 組成解析輸入 | 對應原文、繁體中文、English、日本語要求傳給 skill | Critical |
| TC4 | Skill 教學契約 | repo skill 已建立 | 驗證 skill 內容 | 含選擇性小節、本文用法 CEFR、複習表、標記與區段邊界 | High |
| TC5 | 空標記 | 區段無標籤 | 組成解析輸入 | 明確告知 skill 目前沒有標記 | High |
| TC6 | 對話延續 | 既有 thread 被恢復 | 再次執行解析 | 相同 turn-level skill input 仍被送出，不依賴 thread 建立時載入 | High |
| TC7 | Skill 結構驗證 | skill 檔案完成 | 執行官方 quick validator | frontmatter、名稱與資料夾結構通過 | High |
| TC8 | 跨電腦安裝與升級 | runtime 沒有、已有相同或已有舊 skill | 安裝內建 skill | 建立正確路徑；相同內容不重寫；舊內容被原子更新 | Critical |

## 5. Implementation Notes

- skill 放在 `.agents/skills/explain-reader-annotations/`，讓它隨 repo 版本管理並由工作目錄自動發現。
- 使用 App Server 建議的 `turn/start.input` 結構：text input 內含 `$explain-reader-annotations`，另加 `{ type: "skill", name, path }`，避免只靠模型解析名稱。
- production build 以 text loader 把 repo `SKILL.md` 內容內嵌進 Electron Main bundle；啟動時由 Main 安裝到 user data runtime 的 `.agents/skills/explain-reader-annotations/SKILL.md`，再把該路徑以必要設定傳給 `ChatController`。Renderer 不得提供或覆寫內容或路徑。
- 安裝採同內容不重寫、不同內容以暫存檔原子替換；App 內建版本是此 app-owned runtime skill 的來源，不把 user data 副本當成使用者可編輯設定。
- 保留 `skills.include_instructions: false`、`skills.bundled.enabled: false`、plugins、apps、memories 與 web search 禁用。Electron Main 將 App bundle 內同一份 skill markdown 交給 `ChatController`，在新建與恢復 thread 時作為唯一 App skill instructions 載入；marker 只由解析 turn 明確啟用。skill 本身禁止工具、檔案與網路操作。
- `composeCodexInput` 繼續負責有限閱讀上下文與本次動態語言參數，不再承載完整教學 rubric；另以純函式組成 `turn/start.input` 便於測試。
- `source` 表示依目前閱讀區段辨識講解語言；其他 enum 使用明確名稱傳給 skill。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 原文多數為英文，但 skill 不把輸出語言固定為英文；講解語言與介面語言、書籍語言仍是不同概念。
- 現有 Main／IPC enum 已阻止任意講解語言或 skill 路徑進入 App Server。
- 使用者提供的教學小節是可選 rubric；對每個標記不要求機械式輸出所有小節。

### Open Questions

- 無。觸發方式、語言來源、輸出內容與一般問答隔離都可由現有需求和設定直接判定。

### Non-goals

- 不新增講解語言選項、自訂語言文字框或每書／每對話語言設定。
- 不解析 AI Markdown 為結構化資料，也不在本功能建立學習項目或寫入生詞庫。
- 不讓一般自由問答自動或隱式使用標記解析 skill。
- 不啟用 bundled skills、plugins、apps、memories、web search 或任何工具操作。
- 不改變「解釋標記」按鈕外觀、標記資料、閱讀區段裁切或對話持久化。

## 7. Affected Modules and Files

- `.agents/skills/explain-reader-annotations/SKILL.md`
- `.agents/skills/explain-reader-annotations/agents/openai.yaml`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/assets.d.ts`
- `apps/desktop/package.json`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`

## 8. Implementation Record

### Status

Implemented on 2026-07-21.

### Implementation Summary

- 新增 repo 專用 `.agents/skills/explain-reader-annotations`，將使用者提供的語言學習 rubric 整理為精簡 skill：只解析標記、使用周圍區段判斷、依單字／片語／句子分組、選擇有用小節、依本文用法給 CEFR，最後提供本次講解語言的複習表。
- skill 以 turn 的 `Explanation language` 作為動態輸出語言；`source` 依閱讀區段判斷，另支援 Traditional Chinese、English 與 Japanese。只有 English 講解要求 B1–B2 英文，其他語言使用同等清楚的學習者友善表達。
- `ChatController` 在新建或恢復 thread 時載入 App 內嵌的唯一 skill instructions；在 `explainAnnotations` turn 同時送出 `$explain-reader-annotations` text marker 與 App Server 建議的型別化 skill item。一般問答維持單一 text input，且 marker gate 不套用 skill workflow。
- Desktop build 以 text loader 把 repo `SKILL.md` 內嵌進 Electron Main bundle；應用程式啟動時把內建內容安裝到 user data runtime，再將該絕對路徑交給 `ChatController`。因此安裝到沒有原始碼 repo 的其他電腦也能呼叫 skill。
- Runtime 安裝器會建立缺少的目錄與 skill、略過完全相同的內容，並以 `.next` 暫存檔原子替換舊版內容；Renderer 仍無法提供 skill 名稱、內容或路徑。
- 保留 read-only sandbox、`approvalPolicy: never` 與一般 skill discovery／bundled skills／plugins／apps／memories／web search 禁用；不會載入使用者電腦上的其他 skills。skill 自身禁止工具、檔案與網路操作。

### Test Coverage

- TC1、TC2：`injects the repo annotation explanation skill only for the preset action` 驗證 thread instructions 含唯一 App skill 的 CEFR／複習表契約，隔離設定仍停用其他 skills，解析 action 有 text + skill items，一般問答只有 text。
- TC3：參數化測試驗證 `source | zh-TW | en | ja` 對應的動態講解語言。
- TC4：直接驗證 repo skill 含選擇式小節、本文 CEFR、動態標題語言與複習表契約。
- TC5：驗證無 `<reader-annotation>` 時傳給 skill 的空標記提示。
- TC6：全域對話切換與 `thread/resume` 測試驗證恢復既有 thread 時載入相同 App skill instructions，且解析 turn 仍注入 skill item。
- TC7：官方 `quick_validate.py` 驗證 skill frontmatter、命名與結構。
- TC8：`bundled-skill.test.ts` 驗證乾淨 runtime 安裝、相同內容不重寫與舊內容原子升級；Electron E2E 驗證實際啟動後 user data 具有內建 skill。

### Changed Files

#### Production code

- `.agents/skills/explain-reader-annotations/SKILL.md`
- `.agents/skills/explain-reader-annotations/agents/openai.yaml`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/assets.d.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/package.json`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Scenario 1 | Pass | Controller 測試驗證 App skill instructions、`$skill` marker、名稱與絕對 `SKILL.md` 路徑的型別化 input。 |
| Scenario 2 | Pass | 四種 enum 參數化測試與 skill 的 requested-language 契約。 |
| Scenario 3 | Pass | Skill 內容測試與官方結構 validator。 |
| Scenario 4 | Pass | Skill 明確限制 reader annotation／reading segment，空標記輸入另有回歸測試。 |
| Scenario 5 | Pass | 一般問答 input 沒有 skill；既有 thread isolation config 未放寬。 |
| Scenario 6 | Pass | Main bundle 內嵌 skill；installer 單元測試與 Electron user data E2E 驗證。 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1–TC2 | Pass | `chat-controller.test.ts` turn input 隔離測試。 |
| TC3 | Pass | 四種講解語言參數化測試。 |
| TC4 | Pass | repo skill 內容契約測試。 |
| TC5 | Pass | 空標記 compose 測試。 |
| TC6 | Pass | `thread/resume` 後解析 skill input 測試。 |
| TC7 | Pass | `quick_validate.py`：Skill is valid。 |
| TC8 | Pass | `bundled-skill.test.ts` 3/3 與 Electron E2E 的已安裝內容檢查。 |

### Commands Executed

- `npm test --workspace @reader/desktop -- --run src/main/chat-controller.test.ts`：先觀察 6 個預期紅燈；完成後 28/28 passed。
- `python3 .../quick_validate.py .agents/skills/explain-reader-annotations`：passed。
- `npm test --workspace @reader/desktop -- --run src/main/bundled-skill.test.ts`：先觀察模組不存在的預期紅燈；完成後 3/3 passed。
- `npm test`：Server 3/3、Desktop 119/119 passed。
- `npm run typecheck`：Server、Desktop passed。
- `npm run build`：Server、Electron main/preload 與 Vite renderer production build passed。
- `npm run test:e2e`：受限沙箱內 Electron 無法啟動；依權限流程在桌面環境重跑後 2/2 passed。

### Hypotheses and Decisions

- App Server 官方建議明確 skill invocation 同時包含 `$<skill-name>` 與型別化 skill item；實作保留此結構。B03 以實際 rollout 證實 `skills.include_instructions: false` 也會抑制該 item 的 instruction injection，因此改由 App 載入唯一的內嵌 skill 內容，不開啟一般 skill catalog。
- thread 的 `workingDirectory` 是 Electron user data 下的安全 runtime，並非 repo 根目錄。使用開發 repo 路徑無法支援其他電腦，因此 build 直接內嵌 Markdown；Main 在每次啟動時把 App-owned 版本安裝／更新到 runtime，`ChatController` 只接收該已安裝路徑。
- 保留 `skills.include_instructions: false` 與 bundled skill 禁用，因為本功能只需要 turn-level 明確 skill 注入，不需要讓一般 AI 對話看到或隱式選擇其他 skills。
- Skill validator 首次拒絕 frontmatter description 中的 angle brackets；移除 frontmatter 的標籤符號後通過，正文仍保留精確 XML 標籤契約。
- Vite 測試環境的 `import.meta.url` 不是 file URL；skill 內容測試改由 workspace 測試 cwd 解析固定 repo asset，沒有改變 production 路徑行為。

### Deferred Items

- 尚未把 skill 輸出解析為結構化學習項目；依 F16 non-goal 保留為 Markdown AI 回覆。

### Notes

- 實作未增加 Renderer 權限或任意檔案路徑入口。
- skill 內容已進入 `main.cjs`，不依賴 installer 額外複製 dot-folder 或原始碼 repo；未來 Electron installer／asar 只要包含既有 Main bundle 即可。
- B03 修正了原先 fake App Server request 測試無法察覺的 instruction injection 假綠燈。
