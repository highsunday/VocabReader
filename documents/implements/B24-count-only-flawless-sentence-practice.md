---
author: Codex
date: 2026-08-14
title: 只有無需修改的整合造句練習才計入每日目標
uuid: f73c8418-e424-4ba3-b9b7-f3aee27aa935
version: 1.0.0
status: implemented
---

# Bug Fix: 只有「Everything looks good」的整合造句練習才計入每日目標

## 1. Bug Overview

目前 **SentencePracticeController** 在 AI artifact 通過 parser 且狀態為 `completed` 時，
一律把該輪必要用詞數加入**每日整合造句目標**的完成數。`completed` 同時涵蓋兩種結果：

- 使用者原稿無需實質修改，畫面顯示 `Everything looks good`。
- 使用者已正確使用全部必要用詞，但原稿仍有文法、用字或搭配需要修改，畫面顯示修改清單。

因此，仍需要學習與修正的第二種結果也會降低側欄剩餘數量，不符合使用者要求。

## 2. Root Cause

- Controller 只判斷 parsed result 的 `status === "completed"`，未區分正式**造句批改結果**
  是否包含實質 `changes`。
- Renderer 已以 `feedback.changes.length === 0` 決定是否顯示 `Everything looks good`，但
  每日進度判定沒有沿用相同規則。
- F63 與 sentence-practice module 文件把 `completed` artifact 誤寫成足以累計的條件。

## 3. Fix Objective

- 只有正式造句批改結果的 `changes` 為空、也就是畫面顯示 `Everything looks good` 時，
  才按本輪 `itemCount` 增加當日完成數並降低側欄剩餘數量。
- 若結果包含任何實質修改，仍保留完整批改結果與 `completed` 畫面，但不增加每日完成數。
- `needs-revision`、AI／artifact error、只產生用法範例與同一合格 session 重複提交的既有
  不累計／去重規則維持不變。
- `conversationalSuggestions` 是正確句子的可選自然說法；只要 `changes` 為空，仍可顯示
  `Everything looks good` 並計入每日目標。

## 4. Acceptance Criteria

- **Scenario 1：有實質修改不計入每日目標**
  - **Given** 一輪整合造句練習已正確使用全部必要用詞
  - **When** AI 回傳 `completed` 造句批改結果，但 `changes` 含至少一項文法或用字修正
  - **Then** 畫面保留 completed 批改結果
  - **And** 今日完成數與側欄剩餘數量不變

- **Scenario 2：Everything looks good 才計入**
  - **Given** 一輪整合造句練習已正確使用全部必要用詞
  - **When** AI 回傳 `completed` 且 `changes` 為空的造句批改結果
  - **Then** 畫面顯示 `Everything looks good`
  - **And** 今日完成數增加本輪 `itemCount`

- **Scenario 3：自然口語建議不阻止合格累計**
  - **Given** AI 判定原稿沒有需要修正的錯誤
  - **When** `changes` 為空但另有可選的 `conversationalSuggestions`
  - **Then** 結果仍顯示 `Everything looks good` 並計入每日目標

- **Scenario 4：合格 session 仍只計入一次**
  - **Given** 同一 session 已以 `changes` 為空的結果計入
  - **When** 使用者再次提交同一 session
  - **Then** 今日完成數不重複增加

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Corrected completed result | completed feedback with one change | Controller handles result | session remains completed; progress recorder is not called | Critical |
| TC2 | Flawless completed result | completed feedback with zero changes | Controller handles result | progress records the session item count | Critical |
| TC3 | Optional conversational suggestion | zero changes and one suggestion | Controller handles result | progress records the session item count | High |
| TC4 | Flawless duplicate submission | same flawless session submitted twice | Controller handles both results | progress records the session once | Critical |

## 6. Affected Modules and Files

- `apps/desktop/src/main/sentence-practice-controller.ts`
- `apps/desktop/src/main/sentence-practice-controller.test.ts`
- `documents/implements/F63-daily-integrated-sentence-practice-goal.md`
- `documents/modules/sentence-practice.md`

## 7. Assumptions and Non-goals

- `Everything looks good` 的既有 UI 判定 `feedback.changes.length === 0` 是本修正的唯一
  合格條件；不新增另一個 AI status 或 shared contract 欄位。
- 不要求原稿與 `revisedText` 逐字相同；可信任的 structured `changes` 是正式修改紀錄。
- 不改變 necessary-item validation、AI prompt、artifact parser、completed feedback UI、
  本地日期邊界或 progress store 格式。
- 不回溯重算修正前已累計的當日進度。

## 8. Implementation Record

### Status

Implemented on 2026-08-14.

### Implementation Summary

- `SentencePracticeController` now records a session in the daily progress store only when the
  parsed `completed` feedback has an empty `changes` array.
- A completed feedback result containing corrections remains visible as completed feedback, but its
  item count does not reduce the daily remaining count.
- Change-free feedback still counts when it contains optional `conversationalSuggestions`, matching
  the Renderer condition that displays `Everything looks good`.
- CONTEXT, F63 and the sentence-practice module document now define the same completion rule.

### Test Coverage

- TC1: `does not count completed feedback that still requires changes` reproduces the original bug
  and verifies corrected completed feedback does not call the progress recorder.
- TC2／TC4: existing `records each completed round once and exposes today's completed item count`
  verifies change-free feedback records the item count and duplicate submissions remain idempotent.
- TC3: `counts change-free feedback with optional conversational suggestions` verifies optional
  suggestions do not prevent a change-free round from counting.
- Related Controller, Workspace and App suites passed 110 tests; the complete project suite passed
  533 tests (Server 3, Desktop 530).

### Changed Files

#### Production Code

- `apps/desktop/src/main/sentence-practice-controller.ts`

#### Test Code

- `apps/desktop/src/main/sentence-practice-controller.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F63-daily-integrated-sentence-practice-goal.md`
- `documents/implements/B24-count-only-flawless-sentence-practice.md`
- `documents/modules/sentence-practice.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 有實質修改不計入每日目標 | Pass | corrected completed Controller regression test |
| Everything looks good 才計入 | Pass | existing change-free completion and Renderer feedback tests |
| 自然口語建議不阻止合格累計 | Pass | change-free feedback with suggestion Controller test |
| 合格 session 仍只計入一次 | Pass | existing duplicate submission Controller test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `does not count completed feedback that still requires changes` |
| TC2 | Pass | `records each completed round once and exposes today's completed item count` |
| TC3 | Pass | `counts change-free feedback with optional conversational suggestions` |
| TC4 | Pass | duplicate submission assertion in completed-round test |

### Commands Executed

```bash
npm exec vitest -- run src/main/sentence-practice-controller.test.ts --reporter=dot
npm exec vitest -- run src/main/sentence-practice-controller.test.ts src/renderer/SentencePracticeWorkspace.test.tsx src/renderer/App.test.tsx --reporter=dot
npm test
npm run typecheck
npm run build
```

- Red: targeted Controller suite failed because `recordCompletedSession` was called once for feedback
  containing a change.
- Green: targeted related suites passed 110/110; full project tests, typecheck and build passed.

### Hypotheses and Decisions

- Root cause is known: progress recording is gated only by `completed`, while the Renderer gates
  `Everything looks good` on an empty `changes` array.
- The existing Renderer condition is the source of truth for the phrase in the user's requirement;
  therefore the minimum compatible fix is to gate progress on `feedback.changes.length === 0`.
- `conversationalSuggestions` remain optional alternatives, not required corrections, so they do not
  block daily progress.

### Deferred Items

- Historical same-day progress recorded by the old rule is not distinguishable in the aggregate local
  progress file and will not be migrated.

### Notes

- No new architectural debt or responsibility-boundary issue was exposed; the change remains inside
  the existing Controller-owned progress decision.
- Electron E2E was not rerun because the behavior is Main Controller state covered directly by unit
  tests, while the related Renderer and App suites verify the visible feedback and daily count flow.
