---
author: Codex
date: 2026-07-25
title: 讓表達建議改善既有描述而非要求增加句子
uuid: 6ba41b40-ea69-49c7-bc84-a4b175ef62bc
version: 1.2.0
status: implemented
---

# Bug Fix: 讓表達建議改善既有描述而非要求增加句子

## 1. Bug Overview

F32 將目標語言答案分成 natural、improvable、insufficient 與 not-applicable 四態。
其中 `insufficient` 會把單字、同義詞或短片語視為「資訊不足」，固定邀請使用者下次
使用完整句解釋。

這個規則把答案長度誤當成表達品質，導致 AI 可能反覆要求使用者增加句子，而沒有針對
使用者實際寫出的描述提出更精確、自然的說法。例如 `financial institution` 本身已是
自然精確的描述，不應因為不是完整句而收到擴寫要求；`place save money` 雖然簡短，
真正需要的是直接修正搭配與文法，而不是要求「再多寫一些」。

## 2. Root Cause

- `practice-spaced-review` skill 明確把 word／synonym／short phrase 導向
  `insufficient`。
- `ReviewExpressionFeedback`、artifact parser、Renderer tests 與 F32 文件把
  `insufficient` 固化為正式狀態。
- 因此 AI 的教學目標被設定成「增加答案長度」，而不是「改善現有遣詞用句」。

## 3. Fix Objective

- 移除以答案長短判定的 `insufficient` 表達狀態。
- 只依使用者實際寫出的目標語言描述是否自然、精確決定：
  - `natural`：表達已自然精確，無論是一個詞、片語或完整句；
  - `improvable`：遣詞、搭配、文法、自然度或精確度可改善，直接提供更好的說法；
  - `not-applicable`：空白或未使用學習項目的語言。
- 不要求句數、完整句或更長回答；答案長短只影響可觀察到的語言材料，不得本身成為
  建議內容。
- 空白答案代表使用者未能回想：意思判斷除了建議「忘記」，還必須直接提供該題在
  目前語境中的正確意思／參考答案；空白答案仍沒有可供改善的遣詞，因此不顯示
  表達建議。
- 複習評級仍只依語意正確度與完整度，不受表達建議影響。

## 4. Acceptance Criteria

- **Scenario 1：簡短自然片語獲得肯定**
  - **Given** 英文學習項目的答案是自然且精確的 `financial institution`
  - **When** AI 批改表達
  - **Then** 表達狀態為 natural
  - **And** 訊息肯定目前說法
  - **And** 不要求完整句、更多句子或更長說明

- **Scenario 2：簡短但不自然的描述直接獲得改寫**
  - **Given** 英文學習項目的答案是 `place save money`
  - **When** AI 批改表達
  - **Then** 表達狀態為 improvable
  - **And** 訊息指出最重要的遣詞、搭配或文法問題
  - **And** `suggestedAnswer` 直接提供自然、正確且符合目標語義的說法
  - **And** 不只要求使用者增加句子

- **Scenario 3：完整自然描述仍維持 natural**
  - **Given** 使用者提供自然、精確的完整句描述
  - **When** AI 批改表達
  - **Then** 表達狀態為 natural
  - **And** 不為了產生內容而強行改寫

- **Scenario 4：空白或其他語言仍不適用**
  - **Given** 答案不是學習項目的語言
  - **When** AI 批改表達
  - **Then** 表達狀態為 not-applicable
  - **And** 不顯示表達建議區塊

- **Scenario 5：空白答案直接揭示答案**
  - **Given** 使用者將答案留白
  - **When** AI 批改該題
  - **Then** 複習評級為 forgotten
  - **And** 意思判斷直接提供該詞在目前例句語境中的正確意思或參考答案
  - **And** 表達狀態為 not-applicable
  - **And** 不顯示表達建議區塊

- **Scenario 6：不再接受 insufficient 契約**
  - **Given** AI artifact 回傳舊的 `insufficient` 狀態
  - **When** Main parser 驗證 artifact
  - **Then** 該選用建議安全降級為 not-applicable
  - **And** 核心意思回饋及複習評級仍可使用

- **Scenario 7：評級獨立性不變**
  - **Given** 兩個答案語意同樣正確完整，但表達自然度不同
  - **When** AI 批改
  - **Then** 兩者仍得到相同的複習評級
  - **And** 差異只呈現在 natural 或 improvable 表達建議

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 短而自然 | `financial institution` | 檢查 skill contract | natural；肯定現有說法；沒有 fuller／complete sentence 要求 | Critical |
| TC2 | 短而不自然 | `place save money` | 檢查 skill contract | improvable；直接提供原因及自然改寫 | Critical |
| TC3 | 長而自然 | 自然完整句 | 批改 | natural；不強行改寫 | High |
| TC4 | 非目標語言 | 中文解釋英文項目 | 批改 | not-applicable；無建議 UI | Critical |
| TC5 | 空白答案揭示答案 | 留白 | 批改及顯示 | forgotten；意思判斷顯示正確意思；無表達建議 | Critical |
| TC6 | 移除 insufficient 型別 | shared contract | typecheck | 只允許 natural／improvable／not-applicable | Critical |
| TC7 | 舊 artifact 安全降級 | status=insufficient | parse | not-applicable；rating 保留 | Critical |
| TC8 | Renderer natural | 簡短自然答案的 grade | 顯示 | 顯示肯定訊息；無增加句子提示 | High |
| TC9 | Renderer improvable | 簡短不自然答案的 grade | 顯示 | 顯示建議說法及改善原因 | High |
| TC10 | 評級回歸 | 語意相同、表達不同 | 批改及確認 | rating／FSRS 行為不變 | Critical |

## 6. Implementation Notes

- `practice-spaced-review` grading 規則移除 `insufficient`，明確寫出：
  - length alone is never an expression-quality issue；
  - concise natural wording → natural；
  - concise awkward or imprecise wording → improvable with a direct rewrite；
  - never ask for more sentences merely because an answer is short。
- 同一份 grading 契約明確要求：空白答案的 `feedback` 必須在講解語言中直接給出
  題目語境所要求的正確意思，不能只寫「未作答」；評級仍固定為 forgotten，
  `expressionFeedback` 則為 not-applicable。
- `ReviewExpressionFeedback` union 移除 insufficient。
- `parseExpressionFeedback()` 不再把 insufficient 視為合法；舊或未知狀態沿用既有
  非阻斷策略，正規化為 not-applicable。
- 更新 skill、artifact、Renderer 測試資料，移除「下次使用完整句」的預期。
- F32 規格升版並修正 Confirmed Product Rules、acceptance、test mapping、
  implementation record 與 typed shape，使文件反映最終行為。
- `documents/modules/spaced-review.md` 從四態更新為三態，並明示長度不是品質判準。

## 7. Affected Modules and Files

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`
- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/main/spaced-review-artifacts.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `documents/implements/F32-add-expression-feedback-to-spaced-review.md`
- `documents/modules/spaced-review.md`
- `CONTEXT.md`

## 8. Assumptions and Non-goals

### Assumptions

- AI 可以針對短詞或片語判斷常見搭配、文法與自然度；無法可靠判斷時應簡短肯定可觀察
  到的部分，不得以要求擴寫取代建議。
- 使用者仍可自願寫完整句，但產品不把完整句當作獲得高品質表達回饋的前提。

### Non-goals

- 不改變意思批改或四級複習評級 rubric。
- 除空白答案必須揭示正確意思外，不重設其他意思回饋的格式。
- 不改變 F33 的顏色與唯讀學習項目詳情規格。
- 不新增最低字數、句數、寫作分數或強制作答格式。
- 不持久保存表達建議。

## 9. Implementation Record

### Status

Implemented on 2026-07-25.

### Implementation Summary

- 移除 `ReviewExpressionFeedback` 的 `insufficient` 狀態；短而自然的目標語言答案
  使用 natural，短而不自然或不精確的答案使用 improvable 並直接提供改寫。
- `practice-spaced-review` 明定答案長度不是表達品質，不得因答案短而要求完整句、
  更多句子或更長說明。
- 空白答案仍固定建議 forgotten，但 `feedback` 必須以講解語言直接提供目前例句語境
  的正確意思／參考答案；表達建議維持 not-applicable。
- Main parser 將舊 `insufficient` 或其他不可靠建議安全降級為 not-applicable，
  同時保留合法的意思回饋與複習評級。
- F32、間隔複習模組文件與 `CONTEXT.md` 已同步為最終三態契約及留白答案規則。

### Test Coverage

- TC1／TC3／TC5：`spaced-review-skill.test.ts` 驗證長度獨立、禁止擴寫要求，以及
  留白時必須揭示正確語境意思。
- TC2／TC8／TC9：`SpacedReviewWorkspace.test.tsx` 驗證 improvable 改寫、natural
  肯定、意思與表達分區及既有評級控制。
- TC4／TC5：Renderer 測試驗證非目標語言與空白答案都不顯示表達建議；空白答案另
  顯示正確答案並預選 forgotten。
- TC6：專案 TypeScript typecheck 驗證 shared contract 只允許三態。
- TC7：`spaced-review-artifacts.test.ts` 驗證舊 insufficient 降級且保留 rating。
- TC10：既有 Controller、Renderer 與完整 desktop regression tests 驗證評級與
  確認／排程流程不受表達建議影響。

### Changed Files

#### Production Code

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`

#### Test Code

- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/main/spaced-review-artifacts.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/implements/B11-base-expression-feedback-on-wording-not-answer-length.md`
- `documents/implements/F32-add-expression-feedback-to-spaced-review.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 簡短自然片語獲得肯定 | Pass | natural Renderer case；skill length-independent contract |
| 簡短但不自然的描述直接獲得改寫 | Pass | improvable artifact／Renderer tests；skill direct-rewrite rule |
| 完整自然描述維持 natural | Pass | skill natural rule |
| 其他語言不顯示表達建議 | Pass | Renderer not-applicable case |
| 空白答案直接揭示答案 | Pass | skill blank-answer rule；Renderer correct-answer／forgotten test |
| 不再接受 insufficient 契約 | Pass | shared type、legacy artifact normalization test |
| 評級獨立性不變 | Pass | skill invariant；controller／workspace regression tests |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | skill length rule；Renderer natural case |
| TC2 | Pass | skill improvable rule；Renderer direct rewrite |
| TC3 | Pass | skill natural rule |
| TC4 | Pass | Renderer not-applicable case |
| TC5 | Pass | skill blank-answer contract；Renderer correct answer and forgotten radio |
| TC6 | Pass | root typecheck |
| TC7 | Pass | legacy insufficient artifact normalization |
| TC8 | Pass | Renderer natural case |
| TC9 | Pass | Renderer improvable case |
| TC10 | Pass | controller／workspace regression suite |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts src/main/spaced-review-artifacts.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts src/main/spaced-review-artifacts.test.ts src/main/spaced-review-controller.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

1. 紅燈如預期證明 skill 仍把短答案導向 insufficient，且 parser 仍接受舊狀態。
2. 新增的留白 Renderer 測試第一次在生成尚未完成時尋找提交按鈕；依「缺少 async
   等待」假說補上 `findByRole` 後通過，確認是測試時序而非產品缺陷。
3. 正確答案沿用既有 `feedback` 欄位，因它本來就是講解語言的意思判斷內容；不新增
   第二個 AI turn、IPC 欄位或持久化 schema。
4. `insufficient` 舊 artifact 採非阻斷降級，不讓過渡期或舊暫態回覆破壞核心評級。
5. 實作未暴露新的模組耦合或責任邊界問題，不需要另開 RXX。

### Deferred Items

- F33 的評級配色與批改後唯讀學習項目詳情依獨立規格處理。
- 不保存答案、正確答案文字或表達建議至複習歷史。
- 不新增最低字數、句數、寫作分數或強制作答格式。

### Notes

留白答案的正確意思由同一個受限 grading turn 根據受信任 paper 中的 `sense` 與例句
語境產生；Renderer 已能直接顯示該意思回饋，沒有額外資料來源或 UI 分支。

## Appendix: TDD Fix Workflow

1. 新增 skill contract failing tests，禁止 length-based insufficient 及擴寫要求。
2. 新增 shared contract／artifact failing tests，移除 insufficient 並驗證舊值降級。
3. 更新 Renderer test，讓短而自然使用 natural、短而不自然使用 improvable。
4. 完成最小 skill、type 與 parser 修正。
5. 執行 focused tests、完整 desktop tests、專案 typecheck、desktop build 與
   `git diff --check`。
6. 更新 B11 implementation record、F32 及 spaced-review module document。
