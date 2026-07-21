---
author: Codex
date: 2026-07-21
title: 以 App 內建 skill 執行閱讀理解測驗與批改
uuid: 02fa21fd8ee34f358789aa44b36ee013
version: 1.0.0
status: implemented
---

# Feature Specification - 閱讀理解測驗 Skill

## 1. Feature Overview

把既有「閱讀測驗」預設動作的教學 prompt 收斂為 App 內建 `practice-reading-comprehension` skill。使用者點擊後，Main Process 明確注入固定 marker 與安裝在 Electron user data runtime 的型別化 skill input，根據目前 START／END **閱讀區段**先估計 CEFR，再產生 8 至 12 題選擇題及 1 至 3 題英文輸出問答題。

測驗題面沿用全域**講解語言**；題面使用繁體中文、日本語或原文語言時，英文詞句、引文與必要語言分析仍保留英文。Part B 的使用者回答固定使用英文。使用者在同一 **AI 對話**提交答案後，skill 延續逐題批改、英文寫作修正與 final review workflow。

## 2. Requirements (User Story)

- **As a** 閱讀英文 EPUB 的學習者
- **I want** 由一致且可版本管理的閱讀理解 skill 出題並批改
- **So that** 我能依文章難度檢查理解、練習英文輸出，並得到具體可複習的回饋

## 3. Acceptance Criteria

- **Scenario 1：App 安裝第二個受信任 skill**
  - **Given** 桌面 App bundle 內含 `practice-reading-comprehension/SKILL.md`
  - **When** Electron Main 啟動
  - **Then** skill 被原子安裝或更新到 user data runtime 的固定路徑
  - **And** 新建及恢復的 Codex thread 都只載入兩個 App 內建 skills，不探索全域、個人、plugin 或其他 repo skills

- **Scenario 2：點擊閱讀測驗明確呼叫 skill**
  - **Given** START／END 已界定非空閱讀區段
  - **When** 使用者點擊「閱讀測驗」
  - **Then** `turn/start` 的文字包含 `$practice-reading-comprehension` marker、目前閱讀區段與講解語言
  - **And** 第二個 input 是名稱與固定安裝路徑正確的型別化 skill item
  - **And** Renderer 仍不能提供任意 prompt、skill 名稱、內容或路徑

- **Scenario 3：依文章難度建立測驗**
  - **Given** skill 收到目前閱讀區段
  - **When** 產生第一輪測驗
  - **Then** 先簡短估計文章 CEFR A1–C2 及造成難度的主要原因
  - **And** 依文章長度與複雜度產生 8 至 12 題 A–D 四選一及 1 至 3 題問答題
  - **And** 選擇題平衡涵蓋主旨、重要細節、上下文詞彙、推論、作者態度或目的、改寫，以及有用時的文法或句型
  - **And** 錯誤選項合理但不設陷阱、不考無關緊要細節
  - **And** 第一輪不揭露答案、解析或提示

- **Scenario 4：題面遵守講解語言**
  - **Given** 講解語言分別為 `source | zh-TW | en | ja`
  - **When** Main Process 組成閱讀測驗 turn
  - **Then** skill 的題目、選項、CEFR 說明、作答指示與後續批改使用原文語言、繁體中文、English 或日本語
  - **And** 英文文章原文、必要引文、英文修正版本與學習用英文詞句保持英文
  - **And** Part B 始終要求使用者用英文作答，不限制句數

- **Scenario 5：提交答案後提供完整批改**
  - **Given** 同一 AI 對話已由此 skill 產生尚待作答的測驗
  - **When** 使用者提交選擇題或問答題答案
  - **Then** 正確選擇題得到精簡正解理由
  - **And** 錯誤選擇題得到正解、正解原因、所選答案錯因、文章證據、重要詞語及可遷移作答策略
  - **And** 每題問答檢查切題程度、文法、詞彙、拼字與用字，提供貼近原意修正版、較自然版本及一個可學習句型
  - **And** 不因回答長短本身扣評，並保留使用者原意與個人語氣
  - **And** 全部可辨識答案批改後提供選擇題分數、閱讀理解評估、英文寫作評估、修正表、3 至 5 個複習重點及一項實用建議

- **Scenario 6：一般對話與標記解析隔離**
  - **Given** 使用者進行一般提問或點擊「解釋標記」
  - **When** Main Process 組成 turn input
  - **Then** 一般提問不注入任何 skill item
  - **And** 標記解析只注入 `explain-reader-annotations`
  - **And** 閱讀測驗只注入 `practice-reading-comprehension`
  - **And** 閱讀測驗後只有與該次測驗答案相關的後續訊息延續批改 workflow

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Skill 結構與 rubric | repo skill | 驗證 `SKILL.md` | frontmatter、CEFR、8–12／1–3、混合題型、批改與 final review 契約齊全 | Critical |
| TC2 | 第二個 skill 安裝 | 乾淨／相同／舊版 runtime | 安裝 bundle | 分別 installed／unchanged／updated，路徑固定 | Critical |
| TC3 | Developer instructions | 兩份內嵌 skill | 新建或恢復 thread | 只載入兩份 App skills 與各自 marker gate | Critical |
| TC4 | 閱讀測驗 skill input | `practiceReading` | 啟動 turn | text 含 marker、區段與語言，skill item 名稱／路徑正確 | Critical |
| TC5 | 三種 turn 隔離 | 一般／解析／測驗 | 啟動 turn | input 分別為無 skill／解析 skill／測驗 skill | Critical |
| TC6 | 四種題面語言 | 四種合法設定 | 組成測驗 input | 語言映射正確，Part B 仍為英文且不限制句數 | Critical |
| TC7 | 題數新規則 | 不同長度與複雜度區段 | 套用 skill | 選擇題 8–12、問答題 1–3，不再要求舊 3–10 公式 | High |
| TC8 | 安裝包回歸 | production build | 啟動 Electron | runtime 同時存在並可讀兩份 App skills | High |

## 5. Implementation Notes

- 新 skill 位於 `.agents/skills/practice-reading-comprehension/`，包含必要 `SKILL.md` 與 `agents/openai.yaml`，不需要 scripts、references 或 assets。
- production build 透過既有 Markdown text loader 內嵌 skill；Main Process 以固定名稱安裝到 user data runtime，不接受 Renderer 提供的 skill 資訊。
- `composeCodexInput()` 只保留可信任 marker、有限閱讀區段、動態講解語言及必要的本次參數；完整教學與批改 rubric 由 skill 單一維護。
- developer instructions 可載入兩份 App skill，但 marker gate 必須確保只有對應預設動作啟用；閱讀測驗產生後，與該測驗答案直接相關的後續 turn 可延續批改規則。
- Codex thread 維持 read-only、無工具、無網路與停用其他 skill catalog 的隔離設定。

## 6. Assumptions and Non-goals

- 使用者已確認以新 prompt 的 8–12 題覆蓋 F17 原有 3–10 題規則；實際題數由 AI 依閱讀區段長度與複雜度判斷。
- 問答題維持 1–3 題，使用者自行決定回答長度；不再要求「完整句數量」或任何句數上下限，但答案仍須使用英文。
- 題面與批改語言沿用既有講解語言設定，不新增測驗專屬語言欄位。
- 第一版仍以 Markdown 多輪對話呈現；不保存結構化題目、正解、分數或作答歷史。
- 不呼叫工具、讀取區段外內容、建立學習項目或更新 Anki 式複習排程。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- 新增 repo 版控的 App 內建 `practice-reading-comprehension` skill 與 UI metadata；skill 定義 CEFR 難度評估、8–12 題混合選擇題、1–3 題英文輸出問答題、逐題批改、英文寫作修正及 final review。
- 題面、CEFR 理由、作答說明與批改依 `source | zh-TW | en | ja` 使用原文語言、繁體中文、English 或日本語；英文文章、引文、修正版、自然版與學習詞句保留英文。
- Main Process 在點擊「閱讀測驗」的 turn 加入 `$practice-reading-comprehension` marker、目前閱讀區段、講解語言與型別化 skill input；Renderer 仍只傳受限 intent 與 enum，不能指定 prompt 或 skill 路徑。
- Electron 啟動時把第二份 skill 從 bundle 原子安裝或更新到 user data runtime；共用安裝核心支援兩個固定 App skill 名稱。
- 新建與恢復的 Codex thread 都內嵌兩份 App skill instructions，其他 skill catalogs、plugins、apps、memories 與 web search 維持停用。marker gate 只啟用對應預設 workflow；閱讀測驗答案可在同一 AI 對話延續批改。
- 原本由 Main 組成的詳細測驗 prompt 與 3–10 題精確公式已移除，改由 skill 依區段長度與複雜度選擇 8–12／1–3 題。

### Test Coverage

- TC1：`reading-comprehension-skill.test.ts` 驗證 frontmatter、CEFR、題數、題型、錯題解析、英文雙版本修正、final review、語言及不信任原文契約。
- TC2：`bundled-skill.test.ts` 驗證第二份 skill 的 installed／unchanged／updated 與固定 runtime 路徑。
- TC3、TC4、TC5、TC6：`chat-controller.test.ts` 驗證兩份 developer instructions、新建／恢復 thread、三種 turn 隔離、固定 marker／型別化 input 與四種語言映射。
- TC7：skill rubric 測試驗證 8–12／1–3 範圍並確認 Main input 不再包含舊精確題數；繁體中文 forward test 實際產生 10 題選擇題與 2 題問答題。
- TC8：`desktop.spec.ts` 驗證 production Electron runtime 同時存在兩份 App 內建 skills。
- Forward test 後續 turn：使用含兩題錯誤選擇題及英文錯誤的答案，確認完整錯題解釋、兩版英文修正、8/10、修正表及複習建議。

### Changed Files

#### Production code

- `.agents/skills/practice-reading-comprehension/SKILL.md`
- `.agents/skills/practice-reading-comprehension/agents/openai.yaml`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/main.ts`

#### Test code

- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/reading-comprehension-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `CONTEXT.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/modules/annotation.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| App 原子安裝第二個受信任 skill | Pass | installer 單元測試與 Electron E2E runtime 檔案驗證 |
| 點擊閱讀測驗明確呼叫固定 skill | Pass | controller turn input 測試驗證 marker、區段、語言、名稱與路徑 |
| 先估 CEFR，再建立 8–12／1–3 混合題型 | Pass | skill rubric 測試與繁體中文 forward test |
| 題面及批改遵守四種講解語言，Part B 英文且不限制句數 | Pass | 四種 prompt 參數測試、skill 語言契約與 forward test |
| 提交答案後完整批改與 final review | Pass | skill rubric 自動測試與兩回合 forward test |
| 一般、標記解析、閱讀測驗及其他 skills 維持隔離 | Pass | 三種 turn input、developer instructions 與 isolation config 測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `defines the adaptive quiz, grading and localized response contract`；`provides matching UI metadata` |
| TC2 | Pass | `installs, preserves and atomically updates the App-bundled skill` |
| TC3 | Pass | `injects only the matching App skill for each preset action` 與 resume 回歸 |
| TC4 | Pass | 同一 controller 測試驗證 `$practice-reading-comprehension` 及固定 skill item |
| TC5 | Pass | 一般／解析／測驗三個 `turn/start.input` 斷言 |
| TC6 | Pass | `uses %s as the reading quiz language while keeping English output` 四組參數 |
| TC7 | Pass | skill rubric、lean Main input 斷言與 forward test |
| TC8 | Pass | `launches the secure Electron reading shell` runtime skill 驗證 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-controller.test.ts src/main/reading-comprehension-skill.test.ts
npm run test -w @reader/desktop -- src/main/bundled-skill.test.ts
npm run test -w @reader/desktop -- src/main/chat-controller.test.ts src/main/bundled-skill.test.ts src/main/reading-comprehension-skill.test.ts
python3 /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-reading-comprehension
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

結果：red phase 分別觀察到 9 個 controller／skill 失敗及 1 個 installer 失敗；green phase 聚焦測試 39/39、skill validation passed、Server Vitest 3/3、Desktop Vitest 128/128、Electron Playwright 2/2、TypeScript typecheck 與 production build 全數通過。

### Hypotheses and Decisions

- `grill-with-docs` 發現新 prompt 的 8–12 題與 F17 原 3–10 題衝突；使用者明確選擇讓新規則覆蓋舊規則。
- skill 是 App 內建且受信任的教學 workflow，不是讓 Renderer 或 EPUB 內容選擇任意 Codex skill。
- 題數與題型判斷屬自然語言教學決策，移入 skill；安全邊界、區段、語言 enum、marker 與固定路徑仍由產品層控制。
- 後續答案 turn 不重送 skill item；同一 thread 已載入完整 instructions，developer marker gate 允許只對先前由此 skill 產生的測驗延續評量，並排除不相關訊息。
- installer 原本只服務標記 skill；實作時抽出私有共用原子安裝核心，兩個公開入口仍固定名稱，未擴張 Renderer 權限。
- forward test 以繁體中文題面實際產生 B2、10 題選擇題與 2 題英文問答；後續答案得到逐題批改、英文雙版本修正、8/10 與 final review，未發現 rubric 缺口。

### Deferred Items

- 專用作答元件、分段提交狀態、結構化評分資料與歷史成績延後。
- 若未來 App 內建 skills 顯著增加，可另以 RXX 將 controller 的個別 skill options 收斂為固定 registry；目前兩份設定仍清楚且可測試。

### Notes

- 本功能延伸既有區段練習，不建立新的領域名稱或資料保存邊界。
- 沒有發現需要立即另開 RXX 的新架構問題；既有 `App.tsx` 協調責任偏重仍由 annotation 模組限制清單追蹤。
