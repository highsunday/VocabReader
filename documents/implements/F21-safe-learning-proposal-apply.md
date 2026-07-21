---
author: Codex
date: 2026-07-22
title: 安全確認並套用學習項目提案
uuid: 13a9bfc5da06454591d79ecb7927f0b1
version: 1.0.0
status: approved
source_plan: documents/planning/P01-ai-learning-items-and-learning-library.md
source_queue_item: Q01-04
---

# Feature Specification – 安全確認並套用學習項目提案

## 1. Goal

讓使用者在 **AI 對話面板**審閱 session-only 的 **學習項目**提案，逐項選取或取消、
在合法範圍內改選 action，並對每一個可能覆寫既有內容的欄位明確確認。Renderer 不能自行
寫入資料；它只呼叫一個窄化的 typed apply API。Electron Main 必須在一個 SQLite transaction
內重新驗證完整 batch，才可建立、更新、追加來源或回傳 unchanged 結果。

## 2. User Story

- **As a** 已取得 AI 學習卡提案的閱讀者
- **I want** 逐項確認要新增、更新、維持不變或另建不同語義
- **So that** AI 建議可成為可追溯的學習項目，但不會暗中覆蓋我的內容或造成重複資料

## 3. Confirmed Rules and Boundaries

- Pending proposals are Renderer-session-only: restarting, leaving, cancelling or regenerating drops
  them. Changing the source reading context (book, chapter, range, annotations or explanation
  language) also drops them, and a proposal generation response that completes after that context
  changed must not restore the stale review. SQLite stores only completed batch result summaries
  and per-proposal audit evidence.
- Renderer may select/cancel each proposal, choose only a valid action and tick the allowed
  content fields it explicitly approves for overwrite. It refreshes the Learning Library and shows
  the returned success/error summary.
- Main owns exactly one `applyProposalBatch` API. The API validates every proposal/source/action,
  candidate fields, selected target id, expected item version, allowed confirmation field and
  current source before any write. It recomputes the permitted candidate set; update/unchanged
  target ids must be in that set, while create actions cannot target an existing id.
- An update changes only explicitly confirmed allowlisted fields. Existing source snapshots are
  never replaced; the current source is appended idempotently. `unchanged` can record an
  idempotent source relation but never changes item content, version or `updatedAt`.
- An `update` whose confirmed fields already equal the candidate is reported as a per-result
  `unchanged` outcome and increments the batch `unchanged` count. It may append the current source
  once, without changing item content, version or `updatedAt`.
- `create` creates a source-linked item. `create-distinct-sense` intentionally permits the same
  canonical form/type as a separate source-linked item. No global canonical-form uniqueness is added.
- Version mismatch on any selected target rejects the entire batch. Invalid source, target/action,
  field confirmation, duplicate source conflict or any database error rolls back every write.
- A completed `batchId` with the same canonical request hash returns its stored summary without
  mutations; a changed replay is rejected. The completed result is auditable.
- AI remains proposal-only: it never calls apply and cannot write, delete or archive. No hard delete,
  implicit merge, review scheduling, old-card auto-translation, remote API or proposal persistence
  is introduced.

## 4. Acceptance Criteria

1. **Mixed review**
   - Given create, update and unchanged proposals
   - When the user cancels one proposal, changes a valid action and confirms the selected items
   - Then only selected changes occur and the result counts equal the refreshed library state.
2. **Explicit field protection and sources**
   - Given a target contains existing manual text and a proposal differs in several fields
   - When the user confirms only one field
   - Then only that field changes; all old sources remain and the new source is appended once.
3. **Distinct and stable actions**
   - Given the same canonical form has another meaning and an unchanged proposal
   - When the user applies create-distinct-sense and unchanged
   - Then a separate item exists for the new sense; unchanged has no content/version/`updatedAt`
     mutation and replay does not duplicate its source.
4. **Atomic rejection**
   - Given a proposal target is edited after generation, or a request has invalid action/item/field/source
   - When the user applies the batch
   - Then Main rejects it, rolls back the complete batch, and Renderer asks the user to regenerate.
5. **Retry, audit and restart**
   - Given a successfully completed batch
   - When its exact request replays or the application restarts
   - Then the stored summary is returned without additional mutations and created/updated items,
     sources and audit outcome remain available.

## 5. Test Scenarios

| ID | Given | When | Then | Priority |
|---|---|---|---|---|
| TC1 | selected create, selected update and cancelled unchanged | apply batch | matching changes/summary only; cancelled item untouched | High |
| TC2 | update with multiple field diffs | confirm one field | only that field changes; old/new sources retained | High |
| TC3 | same canonical but distinct meaning | create-distinct-sense | separate item and source are persisted | High |
| TC4 | unchanged with a new source | apply/replay | no item content/version/`updatedAt` change; source once | High |
| TC5 | exact completed batch replay and restart | reapply/get state | stored summary; no duplicate items/sources | High |
| TC6 | target version changes after generation | apply old batch | stale rejection and zero batch writes | High |
| TC7 | invalid action/id/field/source or later proposal failure | apply batch | validation error and full transaction rollback | High |
| TC8 | visible review proposals | select/cancel/change/confirm | Renderer sends typed batch, refreshes, displays success/error | High |
| TC9 | reading and AI flow | apply workflow added | proposal generation remains session-only and existing flows regressions pass | Medium |
| TC10 | visible session-only proposals | leave reader or change source reading context | proposals/reviews are discarded and a late response cannot restore stale review | High |
| TC11 | update with confirmed fields already equal to candidate and a new source | apply batch | result and batch count are unchanged; source appends once while content/version/`updatedAt` stay stable | High |

## 6. Anticipated Files

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- focused Main/IPC/Renderer tests
- `documents/modules/learning-library.md`, `documents/modules/learning-card-proposals.md`,
  `documents/planning/P01-ai-learning-items-and-learning-library.md` and Q01

## 7. Stop Conditions and Non-goals

- Block if field protection, distinct-sense semantics, transaction/version/audit/migration authority,
  or pending-proposal policy becomes ambiguous; the clarified intake already authorizes all of them.
- Do not implement review scheduling, due items, review sessions, answer evaluation, any automatic
  AI apply/write, hard delete, implicit merge, cloud sync, HTTP API or old-card auto-translation.

## Implementation Record

### Status

Implemented.

### Implementation Summary

Migration 2 adds item versions plus completed batch/audit tables. `LocalLearningLibrary`
validates the entire typed batch inside one immediate SQLite transaction, recomputes allowed
candidates, rejects stale/invalid targets, creates or patches only explicit fields, retains and
idempotently appends sources, and persists only completed result/audit records. Exact retries
return the recorded summary. No-op updates increment the batch unchanged count consistently with
their per-result outcome while retaining item version/timestamp stability and source append
semantics. Renderer keeps proposal review state in memory, supports selection, valid actions and
field confirmations, refreshes the library and displays success/error results, and discards pending
review state at every source-context mutation boundary. A generation context key rejects late
responses after the reader has navigated elsewhere.

### Test Coverage

- TC1–TC7: `learning-proposal-apply.test.ts` covers mixed selection/cancellation,
  field protection/source append, distinct senses, unchanged stability, replay/restart,
  stale conflict and rollback rejection.
- TC8–TC9: direct `App.test.tsx` and IPC tests cover typed review/apply dispatch,
  success feedback and existing reading/AI regressions.
- TC10: direct `App.test.tsx` tests cover leaving the reader, switching source chapters and a late
  generation response after navigation; all discard or suppress session-only review state.
- TC11: `learning-proposal-apply.test.ts` covers a confirmed no-op update returning/incrementing
  unchanged, appending one source and preserving content/version/`updatedAt`.

### Changed Files

- Main/IPC/preload: proposal batch contracts, migration 2, repository transaction and typed bridge.
- Renderer: review/apply UI, explicit book/chapter/range/annotation/language disposal boundaries
  and late-response context guard.
- Repository: no-op update batch-summary consistency inside the existing transaction.
- Tests: repository apply/source stability, IPC validation and direct Renderer lifecycle coverage.

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Mixed review | Pass | TC1 repository result summary |
| Explicit protection and source append | Pass | TC1 explicit field/source assertions |
| Distinct and unchanged stability | Pass | TC3–TC5 replay/restart assertions |
| Atomic rejection | Pass | TC6–TC7 stale/invalid rollback assertions |
| Retry/audit/restart | Pass | TC5 stored summary and restarted repository |
| Session-only context disposal | Pass | TC10 direct Renderer navigation and late-response tests |
| No-op update summary/source stability | Pass | TC11 repository result/count/source/version assertions |

### Test Scenario Verification

| Test scenario | Status | Automated test basis |
|---|---|---|
| TC1–TC7 | Pass | repository mixed apply, protection, distinct, replay, stale and rollback tests |
| TC8–TC9 | Pass | direct Renderer apply plus IPC and full reading/AI regression suites |
| TC10 | Pass | direct leave-reader, chapter-change and late-response Renderer tests |
| TC11 | Pass | direct repository no-op update summary/source stability test |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/learning-proposal-apply.test.ts
# RED: four tests failed because applyProposalBatch did not exist.

npm run test -w @reader/desktop -- src/renderer/App.test.tsx src/main/learning-proposal-apply.test.ts
# Acceptance-correction RED: 3 failed and 58 passed; both rejected gaps reproduced.

npm run test -w @reader/desktop -- src/main/learning-proposal-apply.test.ts src/main/learning-library-ipc.test.ts src/renderer/App.test.tsx
# GREEN after acceptance correction: 64 focused desktop tests passed.

npm test
# GREEN: server 3 + desktop 156 tests passed.

npm run typecheck
npm run build
npm run test:e2e
# GREEN: both workspaces typecheck, production build passes, Electron E2E 2/2 passes.
```

### Hypotheses and Decisions

- The completed intake explicitly authorizes schema migration 2, transaction, version,
  idempotency and audit data; no further product decision is needed.
- The narrow Main API accepts a typed user-confirmed representation, never raw AI output or
  an unrestricted SQL/patch request.
- A completed batch is inserted before audit rows inside the same transaction, then updated
  with the final summary; rollback prevents either placeholder or audit evidence from persisting.
- Acceptance-correction diagnosis found that broad reactive cleanup can race normal reader setup;
  explicit context mutation boundaries avoid that coupling, while the generation context key is
  used only to suppress late stale responses.

### Deferred Items

Review scheduling, due items, review sessions, answer evaluation, hard delete, implicit merge,
AI writes/deletes/archives, old-card auto-translation and remote sync remain deferred.

### Notes

ddd-tdd runs inside Q01; its per-item completion notification is suppressed.
Acceptance correction preserves the one typed Main transaction, manual-field protection,
version/candidate/source checks, audit/idempotency and all AI write/delete/archive prohibitions.
