---
notify_email_from: <optional, sending address; must be an account authorized to send in the current environment>
notify_email_to: <optional, notification recipient address>
notify_on_tdd_completed: true
notify_on_queue_blocked: true
notify_on_queue_completed: true
---

# DDD Email Notification Settings

This file stores the project-level notification settings for the DDD workflow. Only email addresses and notification timing are stored here — never email passwords, tokens, SMTP keys, or app passwords.

## Current Settings

- From: `notify_email_from`
- To: `notify_email_to`
- Standalone ddd-tdd completed: `notify_on_tdd_completed`
- DDD queue blocked: `notify_on_queue_blocked`
- DDD queue completed: `notify_on_queue_completed`

## Notification Rules

- When `/ddd-tdd` completes a standalone F/R/B implementation, send a completed notification.
- When `/ddd-queue` completes the entire batch, send a completed notification.
- When `/ddd-queue` is blocked, send a blocked notification.
- When `/ddd-tdd` is called internally by a `/ddd-queue` worker, do not send a per-item completion notification; only `/ddd-queue` sends a single notification when the full batch is done.
- If the sending tool is unavailable or the sender cannot be verified, report in the current conversation instead. No credentials are stored here.
