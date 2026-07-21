---
author: Codex
date: 2026-07-22
title: 建立本機生詞庫與來源卡片基礎
uuid: 5e1f0e0aaef74a87aebc348d2ec9a1d0
version: 1.0.0
status: approved
source_plan: documents/planning/P01-ai-learning-items-and-learning-library.md
source_queue_item: Q01-02
---

# Feature Specification – 本機生詞庫與來源卡片基礎

## 1. Goal

建立獨立於 EPUB 書庫索引的本機 **生詞庫（Learning Library）**。Electron Main
擁有以 `node:sqlite` 實作的 repository 與可重複執行的 schema migration；Renderer
只能透過窄化、型別化的 preload API 列出、取得、從標記建立草稿、編輯及封存**學習項目
（Learning Item）**。

本階段把原本「Anki 複習」的靜態占位入口改為「生詞庫」，以真實資料顯示零筆、清單及
詳情。它提供一個非 AI fallback：使用者可從既有**標記（Annotation）**建立一筆
「待 AI 整理」項目。這只驗證保存與來源追溯；不建立 AI 提案、合併、排程或複習回合。

## 2. User Story

- **As a** EPUB 閱讀器使用者
- **I want** 將一個標記加入可保存、可查看、可編輯與可封存的生詞庫
- **So that** 我能在閱讀後累積可追溯到書籍、章節、標記及原句的學習材料，且未來可交給
  獨立的 AI 整理與間隔複習流程

## 3. Confirmed Rules and Data Model

### Learning item

每筆項目保存：`displayForm`、`canonicalForm`、`itemType` (`word` / `phrase`)、可空的
`partOfSpeech`、`contextualMeaning`、`conciseExplanation`、可空 `cefr`、可空
`pronunciation`、可空 `collocationNotes`、`status`、`createdAt`、`updatedAt`，以及一至多筆
來源快照。fallback 的 status 是 `pending_ai`（畫面文案「待 AI 整理」）；封存為
`archived`。同一 canonical form 不設全域唯一鍵。

### Source snapshot

每筆來源保存 `bookId`、`bookTitle`、`chapterId`、`chapterTitle`、`annotationId`、
標記原文、章內 offset 與建立當下的原句／必要上下文。`bookTitle`、`chapterTitle`、標記
原文與原句都是 snapshot，不能在原書刪除後遺失。相同 `(bookId, chapterId, annotationId)`
是確定匹配，第二次建立必須回傳既有項目而不新增項目或來源。

### Storage, migration, and availability

- SQLite 檔案位於 Electron `app.getPath("userData")/learning-library/learning.sqlite`；測試環境
  使用其自己的 temporary child path。
- migration 以版本表記錄，並在 repository 開啟時於 transaction 內套用；可安全重開。
- EPUB `library/index.json` 仍只擁有書籍、閱讀狀態、閱讀區段與標記，不能承載學習項目。
- 書籍刪除不刪 learning database 資料。回傳來源時以目前書庫查詢 availability；不存在的
  `bookId` 要標示「原書已刪除」。

### Explicit non-goals

- 不實作 Q01-03 的 AI structured proposal workflow、bundled skill 或 `outputSchema`。
- 不實作 Q01-04 的語義合併、版本檢查、proposal batch 或交易式套用。
- 不實作到期計算、間隔複習、遠端 HTTP API、同步、帳號、硬刪除、匯入匯出或字典資料。

## 4. Requirements

| ID | Requirement | Verification |
|---|---|---|
| F1 | Main process 在 userData 下建立獨立 SQLite repository，明確 migration 建立 items、sources 與 migration version 記錄 | repository migration / restart tests |
| F2 | Main、Preload、Renderer 共用窄化 typed contracts；Renderer 無 SQL、檔案路徑、database handle 或 generic IPC | IPC contract tests and typecheck |
| F3 | 學習項目與一對多來源快照分離；同 annotation source 建立是 idempotent | create-draft persistence test |
| F4 | 原 Anki 占位入口改為「生詞庫」，預設 active list 真實顯示 0，並可檢視詳情、編輯與封存／篩選封存 | renderer behavior tests |
| F5 | 閱讀中的既有標記可從右鍵選單加入生詞庫，建立 `pending_ai` 項目與完整 snapshot | renderer create-draft behavior test |
| F6 | 刪除來源書籍後項目與 snapshot 均保留，且來源顯示原書已刪除 | deletion availability test |

## 5. Acceptance Criteria

- [ ] Given an empty database, when the user opens 生詞庫, then it shows a real zero-item state and no hard-coded review count.
- [ ] Given an existing chapter annotation, when the user chooses 加入生詞庫, then a 待 AI 整理 item shows the captured book title, chapter title, annotation text and source sentence.
- [ ] Given the same annotation source, when the action is repeated or the application is restarted, then only one persisted item/source exists.
- [ ] Given an active item, when the user edits allowed fields and archives it, then its changes persist, it leaves the default list, and appears under archived.
- [ ] Given a source book is later deleted, when the item detail is opened, then its source snapshot remains and visibly says the original book is unavailable.

## 6. Automated Test Scenarios

| ID | Given | When | Then | Priority |
|---|---|---|---|---|
| TC1 | Fresh SQLite directory | Repository opens and list active is requested | migration creates schema and returns an actual empty list | Critical |
| TC2 | A source-linked annotation draft | create-draft is called twice and repository is reopened | one `pending_ai` item and one snapshot persist; second response is existing | Critical |
| TC3 | Persisted active item | update then archive and list each filter | edited fields persist; active excludes it; archived includes it | Critical |
| TC4 | Persisted snapshot whose book becomes unavailable | item detail is read after deleting the source book | snapshot remains with `bookAvailable: false` | High |
| TC5 | Registered learning IPC | valid and malformed list/create/update/archive requests | valid requests delegate; malformed input is rejected before repository access | High |
| TC6 | Renderer with the typed learning bridge | open 生詞庫, add a marked annotation, edit/archive and filter | real zero state, source card, idempotency feedback and archive navigation are visible | Critical |

## 7. Expected Files

### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/workspace/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

### Tests and documentation

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/learning-library.md`
- `documents/modules/book-library.md`

## 8. Stop Conditions

- `node:sqlite` cannot be bundled or run by the project Electron version without an unapproved native dependency or deployment change.
- The schema, migration, edit/archive, deleted-book retention, or source snapshot rules conflict with this document or the completed intake.
- A correct missing-behavior RED test cannot be created.
- Any required change reaches AI proposal/merge, review scheduling, remote API, sync or account behavior.

## 9. Assumptions

- A fallback has no AI-derived definition, so its editable explanatory fields begin empty; its visible status is the authoritative indication that AI organization remains pending.
- `word` versus `phrase` for a fallback is determined only from the captured annotation text (contains whitespace => phrase); it is not an AI classification.
- Availability is evaluated against the current EPUB book library at read time, avoiding a destructive cross-database delete/update operation.

## 10. Implementation Record

### Status

Implemented

### Implementation Summary

Implemented a dedicated `node:sqlite` learning database with an explicit version-1
migration for `learning_items`, `learning_item_sources`, and `schema_migrations`.
`LocalLearningLibrary` creates idempotent `pending_ai` drafts from a source annotation,
returns a full item/detail projection, persists allowed edits, and archives rather than
deleting. Source availability is evaluated through `LocalBookLibrary.hasBook`, so a
deleted EPUB leaves its captured source snapshot intact and visibly unavailable.

The Electron bridge now exposes only list/get/create-draft/update/archive. Renderer
navigation is renamed to 生詞庫, has a real zero state and count, and supplies the
fallback action in the existing annotation right-click menu. The detail UI supports the
intake fields, source snapshots, saving and archived filtering. No AI proposal, merge,
review scheduling, HTTP API, sync, account, or hard-delete behavior was added.

### Test Coverage

- TC1–TC4: `learning-library-service.test.ts` verifies fresh migration, restart
  persistence and idempotent source creation, editing/archive, and unavailable sources.
- TC4 additionally: `library-service.test.ts` imports then deletes an EPUB and verifies
  the learning source snapshot remains with `bookAvailable: false`.
- TC5: `learning-library-ipc.test.ts` verifies the five valid operations and malformed
  payload rejection before repository access.
- TC6: `learning-library-workspace.test.tsx` verifies the real zero state;
  `App.test.tsx` verifies annotation fallback, source display, edit and archive filtering.

### Changed Files

#### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/workspace/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/workspace-boundaries.test.tsx`

#### Documentation

- `documents/modules/learning-library.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Real zero-item 生詞庫 has no hard-coded review count | Pass | `learning-library-workspace.test.tsx`; `App.test.tsx` |
| Annotation fallback creates a source-linked 待 AI 整理 item | Pass | `App.test.tsx`; service tests |
| Same source is idempotent and persists after restart | Pass | `learning-library-service.test.ts` |
| Edit/archive persist and archived filter displays item | Pass | service and App tests |
| Deleted source book retains snapshot and marks unavailable | Pass | `library-service.test.ts` integration test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `learning-library-service.test.ts` fresh-list test |
| TC2 | Pass | `learning-library-service.test.ts` idempotency/restart test |
| TC3 | Pass | `learning-library-service.test.ts` edit/archive test |
| TC4 | Pass | `library-service.test.ts` deletion integration test |
| TC5 | Pass | `learning-library-ipc.test.ts` |
| TC6 | Pass | workspace and App renderer tests |

### Commands Executed

```bash
npm test -- learning-library-service.test.ts learning-library-workspace.test.tsx
# RED: learning repository module was absent; workspace still rendered Anki and hard-coded 10.

npm test -- App.test.tsx workspace-boundaries.test.tsx learning-library-service.test.ts learning-library-ipc.test.ts learning-library-workspace.test.tsx library-service.test.ts
# GREEN: 6 files / 75 tests passed.

npm test
# GREEN: desktop 15 files / 138 tests passed.

npm run typecheck
npm run build
# GREEN: desktop TypeScript and Electron/Vite production build passed.

npm test && npm run typecheck && npm run build
# GREEN: full project server + desktop suite, typecheck and build passed (run twice as final regression confirmation).
```

### Hypotheses and Decisions

- F19 is auto-approved because the clarified queue intake explicitly authorizes the
  schema, migration, retention semantics and narrow IPC; all behavior has deterministic
  local tests.
- `node:sqlite` was verified to be available in this Node/Electron toolchain, and the
  Electron Main bundle completed without a third-party native dependency.
- Availability is deliberately a read-time lookup instead of a destructive database
  mutation when a book is deleted; this preserves immutable source evidence.

### Deferred Items

- Q01-03: structured AI candidate/proposal generation.
- Q01-04: safe semantic merge, proposal confirmation, versions and audit batches.
- Review scheduling, review sessions, remote API, sync, accounts and hard deletion.

### Notes

- Per-item ddd-tdd completion notification is suppressed because this work runs inside
  DDD queue Q01. No email is configured or sent.
