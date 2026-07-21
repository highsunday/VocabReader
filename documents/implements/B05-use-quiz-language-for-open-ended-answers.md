---
author: Codex
date: 2026-07-21
title: 讓閱讀測驗問答題與回答遵守講解語言
uuid: 885cc1dcdf8b48f19e1bf01a74c7a5a6
version: 1.0.0
status: implemented
---

# Bug Fix Specification - 問答題作答語言被固定為英文

## 1. Bug Overview

使用者在閱讀測驗設定選擇「原文語言」且閱讀區段為中文時，測驗畫面仍顯示「請以英文作答」，開放題也可能以英文產生。這與閱讀測驗題面應遵守全域**講解語言**的行為不一致。

畫面證據顯示標題與說明已使用中文，但開放題本文及回答要求仍是英文，形成同一份**區段練習**內的混合語言。

## 2. Root Cause

- Main Process 的 `composeCodexInput()` 無條件加入 `Answer language for open-ended questions: English.`。
- App 內建 `practice-reading-comprehension` skill 明定無論題面語言為何都用英文回答，並在出題步驟再次要求英文。
- `CONTEXT.md`、F17、F18 與模組文件仍記錄「Part B 固定英文」的舊決策，使實作與文件共同強化錯誤行為。

## 3. Expected Behavior

- `source`：開放題題目、回答要求、使用者回答及相關批改使用目前閱讀區段的原文語言。
- `zh-TW`：上述內容使用繁體中文。
- `en`：上述內容使用 English。
- `ja`：上述內容使用日本語。
- 選擇題、開放題、CEFR 說明、作答指示及批改共用同一個講解語言，不混用另一個固定回答語言。
- 引用閱讀區段原文時保留原文，不把引文翻譯成講解語言。
- 題數、START／END 邊界、第一輪不揭露答案、後續批改與 skill 隔離行為不變。

## 4. Acceptance Criteria

- **Scenario 1：原文語言不被英文覆寫**
  - **Given** 講解語言為 `source` 且目前閱讀區段為中文
  - **When** 使用者點擊「閱讀測驗」
  - **Then** Main input 明確要求開放題回答使用目前閱讀區段的語言
  - **And** 不包含固定 `Answer language ... English` 指令

- **Scenario 2：四種題面與作答語言一致**
  - **Given** `practiceReading` 分別帶入 `source | zh-TW | en | ja`
  - **When** Main Process 組成 Codex input
  - **Then** `Quiz language` 與 `Answer language for open-ended questions` 使用相同映射

- **Scenario 3：Skill 不再硬編碼英文問答題**
  - **Given** `practice-reading-comprehension` skill 已載入
  - **When** skill 產生問答題或批改答案
  - **Then** 問答題本文、回答要求、修正版、自然版、寫作評估及可學習句型使用本次指定語言
  - **And** 不把 skill 文件中的英文指令誤解成要求使用者以英文作答
  - **And** 只有閱讀區段的直接引文保留原文

- **Scenario 4：既有測驗與安全邊界不回歸**
  - **Given** 使用者開始閱讀測驗、解釋標記或一般提問
  - **When** 系統建立 turn input
  - **Then** 閱讀測驗仍注入固定閱讀 skill，標記解析仍注入固定標記 skill，一般提問不注入 skill
  - **And** 8–12／1–3 題、CEFR、第一輪不揭露答案及後續 final review 契約維持不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 原文中文作答 | `source` 與中文區段 | 組成測驗 input | 題面與回答語言都要求使用目前區段語言，不固定英文 | Critical |
| TC2 | 四種語言映射 | `source / zh-TW / en / ja` | 組成測驗 input | Quiz 與 Answer language 兩行映射相同 | Critical |
| TC3 | Skill 語言契約 | repo skill | 驗證 rubric | 問答題、回答與批改遵守指定語言，只有直接引文保留原文 | Critical |
| TC4 | 既有 workflow 回歸 | 三種 turn 類型 | 執行聚焦及完整測試 | skill 注入、題數、CEFR、延後答案與 final review 全數通過 | High |

## 6. Implementation Notes

- 沿用既有 `explanationLanguage` enum 與語言映射，不新增設定欄位或 IPC 契約。
- Main Process 把同一個映射值同時傳給 `Quiz language` 與 `Answer language for open-ended questions`。
- Skill 將所有生成內容與答案批改統一稱為 requested quiz／answer language；保留原文只限直接引用的 passage text。
- 不修改 Renderer、設定儲存、題數或對話資料格式。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- `composeCodexInput()` 不再把問答題作答語言固定為 English；`Quiz language` 與 `Answer language for open-ended questions` 現在共用 `source | zh-TW | en | ja` 的既有映射值。
- `practice-reading-comprehension` skill 明確要求所有問答題本文使用指定題面語言，並用指定回答語言處理作答要求、修正版、自然版、寫作評估與可學習句型。
- 直接引用閱讀區段時仍保留原文；題數、CEFR、第一輪不揭露答案、後續 final review 與 skill 安全邊界未改變。
- `CONTEXT.md`、F17、F18、B04 及兩份模組文件已同步，移除現行規格中的「Part B 固定英文」規則，並保留歷史決策的 B05 覆蓋說明。

### Test Coverage

- `chat-controller.test.ts` 以 `source | zh-TW | en | ja` 四組參數驗證題面與問答題作答語言使用相同映射，並以中文區段覆蓋原文語言案例。
- `reading-comprehension-skill.test.ts` 驗證問答題本文、作答與批改遵守 requested language，且 skill 不再包含固定英文指令。
- 既有完整單元測試、型別檢查、production build 與 Electron E2E 全數通過。

### Changed Files

#### Production code

- `apps/desktop/src/main/chat-controller.ts`
- `.agents/skills/practice-reading-comprehension/SKILL.md`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/reading-comprehension-skill.test.ts`

#### Documents

- `CONTEXT.md`
- `documents/implements/B04-use-language-setting-for-reading-quiz.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/B05-use-quiz-language-for-open-ended-answers.md`
- `documents/modules/annotation.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 原文中文不被固定英文覆寫 | Pass | `source` controller 回歸測試使用中文閱讀區段並驗證兩行都要求目前區段語言 |
| 四種題面與作答語言一致 | Pass | 四組參數化 controller 測試 |
| Skill 的問答題、作答與批改不硬編碼英文 | Pass | skill rubric 正向與負向字串契約測試 |
| 既有測驗與安全邊界不回歸 | Pass | 全部單元測試 131/131、Electron E2E 2/2、typecheck 與 build |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `uses source for both the reading quiz and open-ended answers` |
| TC2 | Pass | `uses %s for both the reading quiz and open-ended answers` 四組參數 |
| TC3 | Pass | `defines the adaptive quiz, grading and localized response contract` |
| TC4 | Pass | `npm test`、`npm run typecheck`、`npm run build`、`npm run test:e2e` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-controller.test.ts src/main/reading-comprehension-skill.test.ts
python3 /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-reading-comprehension
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

結果：red phase 精準觀察到 controller 4 個與 skill 1 個失敗；green phase 聚焦測試 35/35、skill validation passed、Server Vitest 3/3、Desktop Vitest 128/128、Electron Playwright 2/2、TypeScript typecheck、production build 與 diff whitespace 檢查全數通過。

### Hypotheses and Decisions

- 截圖、Main prompt 與 skill 內容三者互相印證，根因已知，依 `ddd-start` E1 路線直接建立 B05 並進入 TDD。
- 使用者本次回報覆蓋先前「Part B 固定英文」決策；閱讀測驗所有生成與作答語言改為遵守講解語言。

### Deferred Items

- 不重新命名持久化欄位 `explanationLanguage`，也不新增獨立的問答題語言設定。

### Notes

- 本修正不擴張 Renderer 權限、IPC method、skill 數量或 Codex 工具能力。
- 沒有發現需要另開 RXX 的架構問題；修正讓原本已存在的單一語言映射同時驅動題面與作答，減少規則分歧。
- `documents/ddd-email-notify.md` 的寄件與收件地址仍是 placeholder，因此依 DDD 完成流程跳過郵件通知。
