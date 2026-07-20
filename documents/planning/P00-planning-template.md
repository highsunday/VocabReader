---
author: <author>
date: <YYYY-MM-DD>
title: <one-line description of this large-scale change>
uuid: e6de64dedf57426ea39eac7ffa2dc451
version: 1.0
status: draft
---

# Planning Document – XXX Large-Scale Change

## 1. Background & Motivation

Describe why this large-scale change is needed, including the current problems, business motivation, or technical drivers.

## 2. Overall Goal

Describe in the user's language: when all phases are complete, what will the user see or experience differently?

> Example: Users will be able to log in through a new authentication flow and view synchronized data in real time on the dashboard.

## 3. Scope & Impact

List the modules or functional areas this change is expected to affect, for reference when AI later drafts F/R/B documents.

| Affected module / feature | Expected change type              | Notes |
|---------------------------|-----------------------------------|-------|
| <module name>             | New feature / Refactor / Bug fix  |       |

## 4. Phase Plan

### Overview

| Phase | Name           | Suggested doc type | Related doc | Status      |
|-------|----------------|-------------------|-------------|-------------|
| P1    | <phase name>   | FXX               | —           | [ ] Not started |
| P2    | <phase name>   | RXX               | —           | [ ] Not started |
| P3    | <phase name>   | BXX               | —           | [ ] Not started |

---

### Phase 1 — <phase name>

**Description**
Describe what this phase will accomplish, including the technical direction and logical boundaries.

**User acceptance actions**
After this phase is complete, the user should perform the following to confirm the outcome:
- [ ] <specific action, e.g. "enter credentials on the login page and successfully reach the dashboard">
- [ ] <another confirmation action, e.g. "click 'Forgot password' and receive a reset email">

**Suggested doc type**: `FXX` (feature spec)

**Related doc**: — (fill in after execution, e.g. `F01-xxx.md`)

**Status**: `[ ] Not started`

---

### Phase 2 — <phase name>

**Description**
Describe what this phase will accomplish.

**User acceptance actions**
- [ ] <specific action>
- [ ] <another confirmation action>

**Suggested doc type**: `RXX` (refactor spec)

**Related doc**: —

**Status**: `[ ] Not started`

---

### Phase 3 — <phase name>

**Description**
Describe what this phase will accomplish.

**User acceptance actions**
- [ ] <specific action>
- [ ] <another confirmation action>

**Suggested doc type**: `BXX` (bug fix)

**Related doc**: —

**Status**: `[ ] Not started`

---

## 5. Handoff Instructions (AI guidance)

> This section is execution guidance for the handoff AI.

Before starting work, the handoff AI must:

1. Read "Overall Goal" and "Phase Plan" to understand the overall direction.
2. Identify the current phase to execute: prioritize any phase with status `[~] In progress`; if none, select the earliest `[ ] Not started` phase.
3. Change that phase's status to `[~] In progress` and update the overview table.
4. Based on the "Suggested doc type", call `ddd-doc` to draft the corresponding FXX / RXX / BXX document.
5. After the user reviews and approves, run `ddd-tdd` to implement.
6. After implementation is complete:
   - Fill in the "Related doc" field with the actual document number (e.g. `F01-auth-login.md`)
   - Change phase status to `[x] Completed` and update the overview table
7. Identify the next unstarted phase and repeat the above; when all phases are done, change this document's `status` to `completed`.

> If a phase's scope is not clear enough, run `grill-me` to elicit requirements before drafting FXX / RXX / BXX.

## 6. Additional Notes
