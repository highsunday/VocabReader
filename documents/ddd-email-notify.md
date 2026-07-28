---
notify_email_from: highsunday0630@gmail.com
notify_email_to: highsunday.project@gmail.com
notify_on_tdd_completed: true
notify_on_queue_blocked: true
notify_on_queue_completed: true
---

# DDD Email Notification Settings

This file stores the project-level notification settings for the DDD workflow. Only email addresses and notification timing are stored here — never email passwords, tokens, SMTP keys, or app passwords.

## Current Settings

- From: `highsunday0630@gmail.com`
- To: `highsunday.project@gmail.com`
- Standalone ddd-tdd completed: enabled
- DDD queue blocked: enabled
- DDD queue completed: enabled

## Notification Rules

- When `/ddd-tdd` completes a standalone F/R/B implementation, send a completed notification.
- When `/ddd-queue` completes the entire batch, send a completed notification.
- When `/ddd-queue` is blocked, send a blocked notification.
- When `/ddd-tdd` is called internally by a `/ddd-queue` worker, do not send a per-item completion notification; only `/ddd-queue` sends a single notification when the full batch is done.
- If the sending tool is unavailable or the sender cannot be verified, report in the current conversation instead. No credentials are stored here.

## Agent Communication Ledger (Append-only)

#### L001 — 2026-07-27 15:29 CST — email-test — orchestrator -> user — notification

**Message**
DDD email delivery test.

**Context**
- From: `highsunday0630@gmail.com`
- To: `highsunday0630@gmail.com`
- Subject: `[DDD Email Test] 寄信功能測試成功`

**Artifacts**
- Delivery status: sent
- Tool: Gmail
- Message ID: `19fa27a695537d56`

**Follow-up**
- No action required. Project-level notification addresses remain unconfigured.

#### L002 — 2026-07-28 11:45 CST — F36 — orchestrator -> user — notification

**Message**
DDD standalone TDD completion notification.

**Context**
- From: `highsunday0630@gmail.com`
- To: `highsunday.project@gmail.com`
- Subject: `[DDD TDD Completed] F36 以單一 ZIP 匯出並完整還原書庫與生詞庫`

**Artifacts**
- Delivery status: failed
- Tool: Gmail
- Reason: external disclosure was rejected because this task did not include explicit authorization
  to send the implementation and test summary to the configured destination.

**Follow-up**
- Implementation remains complete. The user may explicitly authorize sending this completion
  notification in a later request.
