---
author: <author>
date: <YYYY-MM-DD>
title: <one-line description of this work queue>
uuid: d1f21e4ca9284a1b8b0c33f9cc2b9a5d
version: 1.0
status: draft
batch_limit: 3
mode: sequential
intake_grill_status: pending
ready_for_execution: false
communication_format_version: 1
context_policy: compact
ledger_retention: latest_active_entries
ledger_archive_dir: documents/queue/logs
notify_email_from: <optional, sending address; must be an account authorized to send in the current environment>
notify_email_to: <optional, notification recipient address>
notify_on_queue_blocked: true
notify_on_queue_completed: true
notify_email: <deprecated, optional; legacy blocked notification recipient, use notify_email_to instead>
---

# Queue - XXX Long-Running Work Queue

## 1. When to use this

This document is for 2 to 5 ordered, auto-advanceable DDD tasks. Each item will be handled by a new Codex or Claude Code session independently, with a git commit after completion.

Items may be independent or sequentially dependent. If dependent, `depends_on` and `unlock_condition` must be filled in.

If the scope of a later item can only be determined after an earlier item completes, or if phase breakdown requires human review, use a `documents/planning/PXX` planning document instead.

## 2. Queue Intake Review (centralized grill-me)

> Complete this section before launching any workers. The goal is to clarify all requirements upfront in one session, reducing the number of interruptions to the user from each sub-session.

intake_grill_status: pending
ready_for_execution: false
reviewed_by: —
reviewed_at: —

### Clarification Matrix

| Item | Clarification | Key Decisions | Remaining Questions |
|------|---------------|---------------|---------------------|
| QXX-01 | pending | — | <questions to clarify> |
| QXX-02 | pending | — | <questions to clarify> |
| QXX-03 | pending | — | <questions to clarify> |

### Queue Intake Questions

#### QXX-01
- Q: <questions raised centrally by AI using grill-me>
- A: <fill in after the user responds>

#### QXX-02
- Q: <questions raised centrally by AI using grill-me>
- A: <fill in after the user responds>

#### QXX-03
- Q: <questions raised centrally by AI using grill-me>
- A: <fill in after the user responds>

### Cross-item Decisions

- <ordering, dependencies, shared design decisions, or out-of-scope decisions that span items>

### Execution Readiness

- [ ] All items to be executed have clear requirements
- [ ] All items to be executed have user-actionable acceptance criteria
- [ ] All dependent items have `depends_on` and `unlock_condition` filled in
- [ ] All blocking questions have been answered, or the corresponding items have been marked blocked / skipped
- [ ] If email notifications are needed, `notify_email_from` and `notify_email_to` are configured
- [ ] If a batch-completed notification is needed, `notify_on_queue_completed` is `true`
- [ ] `ready_for_execution` can be changed to `true`

### Email Notification Settings

> This section describes the sending configuration when blocked. QXX only stores email addresses — never passwords, tokens, SMTP keys, or app passwords.

- From: `notify_email_from` (sending address; must be an account authorized to send in the current environment)
- To: `notify_email_to` (recipient for blocked or completed notifications)
- Queue blocked: `notify_on_queue_blocked`
- Queue completed: `notify_on_queue_completed`
- Backward compatibility: if an old document only has `notify_email`, treat it as `notify_email_to` and add `notify_email_to` on the next QXX update
- Delivery rule: if the sending tool does not support specifying a From address, the orchestrator must verify the tool's currently authorized account matches `notify_email_from`; if not, stop and report blocked in the current conversation
- Suppression rule: `/ddd-tdd` called internally by a `/ddd-queue` worker must not send a per-item completion notification; only one notification is sent by the orchestrator when the entire queue batch is complete

## 3. Overview

| Item | Name | Type | Agent | Depends On | Status | Related doc | Commit |
|------|------|------|-------|------------|--------|-------------|--------|
| QXX-01 | <task name> | FXX | codex | — | pending | — | — |
| QXX-02 | <task name> | FXX | claude | QXX-01 | pending | — | — |
| QXX-03 | <task name> | BXX | auto | QXX-02 | pending | — | — |

---

## 4. Context Budget / Token Policy

> The QXX main document retains only status, index, summaries, and unresolved questions. Full stdout, long test output, old worker replies, and historical details should be archived to `documents/queue/logs/`, with a link back from the Log Index.

### Main File Keeps

- Queue Intake Review summary
- Overview and current status of each item
- Up to 8 lines of Agent Handoff Summary per item
- Log Index
- Recent, unresolved, or must-read Active Entries for the next worker

### Archive When

- A single ledger entry exceeds ~1200 words
- `worker_log` exceeds ~8 lines
- Full test output or stdout needs to be preserved
- QXX exceeds ~500 lines or the ledger exceeds 20 entries
- Completed item details no longer affect the next item

### Archive Format

- Archive path: `documents/queue/logs/<QXX>-<entry-id>.md`
- QXX retains only summary and `Archive Ref`
- After compaction, append a `compaction` or `archive` ledger entry

---

## 5. Agent Communication Ledger (Append-only)

> This section is the shared communication ledger for Codex, Claude Code, orchestrator, and the user. Append only — do not delete or modify existing entries. To correct an entry, add a `correction` entry. The main document retains only the index and active entries; long content goes to archive.

### Log Index

| Entry | Time | Item | From -> To | Type | Summary | Archive Ref |
|-------|------|------|------------|------|---------|-------------|
| L001 | <YYYY-MM-DD HH:MM> | QXX-01 | orchestrator -> codex | dispatch | <dispatch QXX-01> | — |

### Active Entries

#### L001 — <YYYY-MM-DD HH:MM> — QXX-01 — orchestrator -> codex — dispatch

**Message**
<Dispatch content. Example: Please handle QXX-01 with ddd-start -> ddd-doc -> ddd-tdd, then update the queue and commit when done.>

**Context**
- Depends on: []
- Unlock condition: none
- Relevant docs: —

**Expected Response**
- Create or update F/R/B document
- Record red and green test results
- Update item status, handoff_summary, commit hash

**Artifacts**
- —

**Follow-up**
- —

**Archive**
- —

---

## QXX-01 <task name>

id: QXX-01
type: FXX
agent: codex
status: pending
clarification_status: pending
depends_on: []
unlock_condition: none
auto_approve: true
commit_required: true
implemented_doc: —
commit: —
worker_session: —
worker_log: —
handoff_summary: —
communication_entries: [L001]
archive_refs: []

### Requirements

<Clearly describe the user behavior to be completed.>

### Clarification results

- Clarification status: pending
- Design notes: —
- Open questions: <if there are unanswered questions, list them here and keep ready_for_execution: false>
- User decisions: —

### Acceptance criteria

- [ ] <user-actionable confirmation action and expected outcome>
- [ ] <another confirmation action>

### Stop conditions

- <condition under which work should stop when requirements are unclear>
- <condition under which work should stop when a user decision is needed>

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: [L001]
archive_refs: []

### Agent Handoff Summary

- Current state: pending
- Important files: —
- Decisions: —
- Tests: —
- Risks: —
- Next agent notes: —

---

## QXX-02 <task name>

id: QXX-02
type: FXX
agent: claude
status: pending
clarification_status: pending
depends_on: [QXX-01]
unlock_condition: QXX-01 completed and the relevant baseline behavior has passing tests
auto_approve: true
commit_required: true
implemented_doc: —
commit: —
worker_session: —
worker_log: —
handoff_summary: —
communication_entries: []
archive_refs: []

### Requirements

<Clearly describe the next user behavior to be completed, building on QXX-01.>

### Clarification results

- Clarification status: pending
- Design notes: —
- Open questions: <if there are unanswered questions, list them here and keep ready_for_execution: false>
- User decisions: —

### Acceptance criteria

- [ ] <using the completed behavior from QXX-01 as a prerequisite, confirm the expected outcome of this item>

### Stop conditions

- <QXX-01 not completed or commit missing>
- <unlock condition cannot be confirmed from document, tests, or code>

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: []
archive_refs: []

### Agent Handoff Summary

- Current state: pending
- Important files: —
- Decisions: —
- Tests: —
- Risks: —
- Next agent notes: —

---

## QXX-03 <task name>

id: QXX-03
type: BXX
agent: auto
status: pending
clarification_status: pending
depends_on: [QXX-02]
unlock_condition: QXX-02 completed and the user flow is executable
auto_approve: true
commit_required: true
implemented_doc: —
commit: —
worker_session: —
worker_log: —
handoff_summary: —
communication_entries: []
archive_refs: []

### Requirements

<Clearly describe the bug symptom and expected behavior, or the fix to apply after the previous two items.>

### Clarification results

- Clarification status: pending
- Design notes: —
- Open questions: <if there are unanswered questions, list them here and keep ready_for_execution: false>
- User decisions: —

### Acceptance criteria

- [ ] <reproduce the original problem; confirm it no longer occurs after the fix>

### Stop conditions

- <unable to reproduce the problem>
- <user needs to provide data, an account, or reproduction steps>

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: []
archive_refs: []

### Agent Handoff Summary

- Current state: pending
- Important files: —
- Decisions: —
- Tests: —
- Risks: —
- Next agent notes: —

## 6. Queue execution rules

1. Each item must be handled by a new Codex or Claude Code session.
2. Before launching any worker, Queue Intake Review must be complete: `intake_grill_status: completed`, `ready_for_execution: true`, and all items to be executed must have `clarification_status: clarified`.
3. Each item must be processed with the full `ddd-start → ddd-doc → ddd-tdd` flow.
4. A git commit must be created after each item completes.
5. When there are dependencies, confirm all `depends_on` items are `completed` with commits, and that `unlock_condition` is verifiable, before starting the next item.
6. All cross-agent communication must be appended to the `Agent Communication Ledger`, with entry IDs written back to the corresponding item's `communication_entries` / `ledger_entries`; long content retains only a summary with an `archive_refs` link.
7. When a worker sub-session needs a user answer, it must write to `questions` / `need_user_decision`, append a `question` or `blocked` ledger entry, and set the item to blocked.
8. After the user responds, the orchestrator must append an `answer` ledger entry before launching a new worker session.
9. On any blocker, stop the entire queue immediately; do not continue to subsequent items.
10. Process at most `batch_limit` pending items per run; never exceed 5.
11. `/ddd-tdd` called by a queue worker must not send a completion notification; only the orchestrator sends a single completed notification when the entire queue batch is done, based on `notify_on_queue_completed`.
12. The next worker reads only QXX frontmatter, Queue Intake Review, the overview, the assigned item, dependent item handoffs, the Log Index, and related active entries by default; do not read the full archive unless blocked or there is a context conflict.
