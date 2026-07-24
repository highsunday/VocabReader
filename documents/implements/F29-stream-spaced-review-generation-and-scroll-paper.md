---
author: Codex
date: 2026-07-24
title: 顯示複習試卷生成進度並恢復試卷捲動
uuid: fe28294eecff479f9e62d70c870e928c
version: 1.0.0
status: implemented
---

# Feature Specification - 顯示複習試卷生成進度並恢復試卷捲動

## 1. Feature Overview

目前使用者按下「生成本回合試卷」後，只看到固定的「AI 正在依本回合項目生成例句」
文字，無法像右側 AI 對話面板的閱讀測驗一樣看見 Codex 正在產生的內容。生成完成後，
中央複習工作區又因沿用生詞庫的 `overflow: hidden` 外層，沒有生詞庫自己的內部
scroll region，導致十題試卷超過可視高度後無法上下捲動。

本功能讓專用間隔複習 workflow 把目前 generation turn 的文字 delta 只推送給發起
呼叫的 Renderer。複習頁以純文字、`aria-live` 區域顯示 artifact 之前的學習者可讀
進度；原始或尚未完成的 `review-paper` JSON 不顯示。合法試卷完成後即切換為正式題目。
同時把間隔複習與生詞庫的中央容器樣式分離，讓複習頁本身成為可捲動區域。

所有生成進度仍是暫態資料：不保存到 AI 對話、複習歷史、SQLite 或重新啟動狀態。

## 2. Requirements (User Story)

- **As a** 正在等待 AI 生成複習試卷的學習者
- **I want** 看見 AI 目前的生成輸出，並能捲動完整試卷
- **So that** 我知道生成仍在進行，也能順利完成超過一個畫面高度的十題回合

## 3. Acceptance Criteria

- **Scenario 1：顯示 AI 生成中的可讀輸出**
  - **Given** 使用者已按下「生成本回合試卷」
  - **When** Codex 回傳 `item/agentMessage/delta`
  - **Then** Main 將累積中的生成文字推送給發起該次生成的 Renderer
  - **And** 複習頁在固定 loading 說明下方以純文字即時更新可讀內容

- **Scenario 2：不顯示未完成 artifact**
  - **Given** AI 進度文字後開始輸出 `review-paper` fenced JSON
  - **When** artifact 仍在串流或已完整到達
  - **Then** 生成中面板只顯示 fence 之前的可讀進度
  - **And** 不把 JSON、原始 HTML 或不完整題目插入畫面

- **Scenario 3：完成、失敗或離開時清理進度**
  - **Given** 複習頁正在顯示生成進度
  - **When** 合法試卷完成、生成失敗，或使用者離開複習頁
  - **Then** 生成進度不再顯示
  - **And** 不保存到一般 AI 對話、SQLite 或複習歷史

- **Scenario 4：生成後可捲動完整試卷**
  - **Given** 複習試卷內容高度超過中央工作區可視高度
  - **When** 使用者以滑鼠、觸控板或鍵盤上下移動
  - **Then** 中央間隔複習內容可以垂直捲動到底
  - **And** 生詞庫仍維持固定工具列及自己的內部 scroll region

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Controller delta | 有效 generation turn | 收到多段 agent message delta | 依順序累積並通知呼叫端 | Critical |
| TC2 | IPC progress | Renderer 呼叫 generate | Controller 發布 progress | 只由該 invoke event sender 收到 typed progress | Critical |
| TC3 | UI live output | generation Promise 尚未完成 | progress listener 收到文字 | `aria-live` 顯示累積可讀輸出 | Critical |
| TC4 | Artifact 隱藏 | progress 含 prose 與部分 fenced JSON | Renderer 呈現 | 只顯示 fence 前 prose，不顯示 JSON | Critical |
| TC5 | Progress cleanup | 完成、失敗或 unmount | 狀態轉移 | 進度清空且 subscription/discard 解除 | High |
| TC6 | Review container | 進入間隔複習 | 檢查 main class 與 overflow | 使用專用可捲動 class，不沿用生詞庫 hidden class | Critical |
| TC7 | Electron scroll | 在 production CSS 建立超高 review 內容 | 設定 main scrollTop | scrollTop 可增加且 overflow-y 為 auto | High |

## 5. Implementation Notes

- 沿用 Codex app-server 的 `item/agentMessage/delta`，不建立第二個 AI request。
- `review:generate` 的 invoke event 只把 progress 送回自己的 `event.sender`；不廣播到
  其他視窗，也不讓 Renderer 指定 channel 或 scope。
- Preload 新增具名 subscription，並回傳解除訂閱函式；不暴露通用 IPC。
- Review skill 在 artifact 前輸出精簡、無答案的進度行。Renderer 只顯示第一個
  `review-paper` fence 之前的文字，並以 React 純文字節點呈現。
- 批改 workflow 不在本次範圍；它仍顯示既有固定「AI 正在批改」狀態。
- `content.learning-library-content` 繼續只服務生詞庫。間隔複習改用
  `content.spaced-review-content`，保留相同背景但恢復 `overflow-y: auto`。

## 6. Affected Modules and Files

- `documents/modules/spaced-review.md`
- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- Corresponding Controller, IPC, Renderer, App and Electron E2E tests

## 7. Assumptions and Non-goals

- 「取得 AI 目前的輸出」指目前 generation turn 的可讀串流文字，不是模型隱藏推理。
- 不逐題解析半完成 JSON，也不在正式 artifact 通過 Main 驗證前顯示題目。
- 不保存生成進度，不新增取消按鈕，不改變 FSRS、選題、批改或確認評級規則。
- 不把專用複習 turn 合併進右側一般 AI 對話紀錄。

## 8. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- Added generation-only Codex delta delivery from `SpacedReviewController` through the invoking
  IPC sender and a narrow preload subscription.
- Added learner-readable progress lines to the bundled review skill and generation prompt.
- Added defense-in-depth artifact filtering in Main and Renderer; only prose before
  the `review-paper` fence is rendered as plain text in an `aria-live` progress panel.
- Split `spaced-review-content` from `learning-library-content`, restoring vertical scrolling while
  preserving the existing background and the learning library's independent fixed-toolbar layout.

### Test Coverage

- TC1: Controller test verifies ordered message delta delivery during generation.
- TC2／TC4: IPC test verifies sender-scoped progress and removes partial artifact JSON.
- TC3–TC5: Workspace test verifies live prose, partial artifact hiding, completion cleanup and
  subscription cleanup.
- TC6: App test verifies review mode uses `spaced-review-content` and not the hidden-overflow
  learning-library class.
- TC7: Electron Playwright inserts over-height review content and verifies production computed
  `overflow-y: auto`, `scrollHeight > clientHeight` and an increased `scrollTop`.

### Changed Files

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/spaced-review-ipc.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/implements/F29-stream-spaced-review-generation-and-scroll-paper.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

- Scenario 1: Pass — Controller delta and sender-scoped IPC progress are automated.
- Scenario 2: Pass — Main and Renderer both hide the artifact boundary and Renderer uses text nodes.
- Scenario 3: Pass — completion and unmount cleanup are covered; no persistence path was added.
- Scenario 4: Pass — App class regression and production Electron scroll metrics are automated.

### Test Scenario Verification

TC1–TC7 passed at their owning Controller, IPC, Renderer, App and Electron seams.

### Commands Executed

- `npm test` — Server 3/3 and Desktop 216/216 passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-spaced-review`
  — `Skill is valid!`
- `npx playwright test tests/e2e/desktop.spec.ts --grep "launches the secure" --repeat-each=3`
  — 3/3 passed after layout stabilization.
- `npm run test:e2e -w @reader/desktop` — 2/2 passed.
- `git diff --check` — passed.
- DDD completion email — skipped because `documents/ddd-email-notify.md` still contains placeholder
  sender and recipient values.

### Hypotheses and Decisions

- The supplied screenshot shows a full-height review workspace with only the fixed generation label;
  the visible symptom is consistent with the center grid cell clipping descendants rather than a
  short paper.
- Root-cause inspection found that `App.tsx` assigns both learning-library and spaced-review modes
  the `learning-library-content` class. That class intentionally sets `overflow: hidden` because
  `LearningLibraryWorkspace` owns an inner `.learning-library-scroll-region`; the review workspace
  has no equivalent inner region. A dedicated review class is therefore the smallest boundary-safe
  correction.
- The right-side reading quiz obtains visible progress from existing app-server message deltas.
  Reusing the same notification type for the dedicated review Controller preserves UX consistency
  without persisting the review turn in `LocalChatConversationStore`.
- The first green typecheck failed only because the deferred Promise in the new Renderer test inferred
  `Promise<unknown>`. Giving that test harness the public `ReviewPaper` return type resolved the
  mismatch without changing production behavior.
- The first Electron acceptance run passed the new review scroll assertions, then hit the existing
  learning-library sticky toolbar exact-position assertion with a 2px shift. Ranked hypotheses were
  layout/font settling, a leaked review probe, or cross-applied CSS. Repeating the case produced the
  same 2px result once and passed twice, while the review probe had been removed and selectors were
  disjoint. The old test measured its baseline before waiting two animation frames; waiting for
  `document.fonts.ready` and two frames before the baseline stabilized the layout. The exact equality
  assertion was retained and then passed 3/3.

### Deferred Items

- Live grading output and a user-facing cancel button remain outside this request.

## Appendix: TDD Implementation Checklist

1. Add failing Controller, IPC and Renderer tests for generation delta delivery and artifact hiding.
2. Add a failing App/class regression test for the scroll-container boundary.
3. Implement the minimum typed progress channel and dedicated review content class.
4. Run focused tests, full tests, typecheck, build, skill validation, Electron E2E and
   `git diff --check`.
5. Update this record and `documents/modules/spaced-review.md`.
