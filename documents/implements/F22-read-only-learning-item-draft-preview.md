---
author: Codex
date: 2026-07-24
title: 學習項目草稿確認浮層只顯示預覽
uuid: 0f41bfe9e5be4283a0cad0e56a0d610e
version: 1.0.0
status: implemented
---

# Feature Specification - 唯讀預覽學習項目草稿

## 1. Feature Overview

調整 **AI 輔助建立**的學習項目草稿確認浮層。確認階段只供讀者檢視 AI 產生的
學習卡片預覽，不再提供標題、類型、CEFR、語義或原始 Markdown 的編輯控制。

每筆草稿仍顯示標題、類型、CEFR、目前提交狀態及安全渲染後的 Markdown 內容，
並保留排除／恢復操作。批次層級的已存在、垃圾桶還原、關閉及明確提交行為維持不變。

## 2. Requirements (User Story)

- **As a** 準備把 AI 草稿加入生詞庫的讀者
- **I want** 在確認浮層直接查看每張學習卡片的最終預覽
- **So that** 我不會在提交前誤入編輯流程，能專注決定是否包含或排除每張草稿

## 3. Acceptance Criteria

- **Scenario 1：待確認草稿只顯示預覽**
  - **Given** 學習項目草稿批次包含一筆待提交草稿
  - **When** 使用者打開「確認學習卡片」浮層
  - **Then** 畫面顯示草稿標題、類型、CEFR、提交狀態及安全渲染的 Markdown 預覽
  - **And** 畫面沒有可編輯輸入欄位、原始 Markdown 文字區或「儲存修改」操作

- **Scenario 2：唯讀確認仍可調整是否提交**
  - **Given** 批次同時包含 included 與 excluded 草稿
  - **When** 使用者在確認浮層排除 included 草稿或恢復 excluded 草稿
  - **Then** 系統仍透過既有草稿狀態操作保存新狀態
  - **And** 沒有呼叫草稿內容更新操作

- **Scenario 3：批次確認操作維持可用**
  - **Given** 批次包含至少一筆 included 草稿，且另有垃圾桶重複項目
  - **When** 使用者還原垃圾桶項目或提交批次
  - **Then** 既有還原及提交操作正常執行

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 唯讀草稿預覽 | 待確認草稿含結構化資料與 Markdown | 開啟確認浮層 | 顯示標題、類型、CEFR、狀態及渲染內容；不存在 textbox、combobox、原始 Markdown 與儲存修改 | Critical |
| TC2 | 排除及恢復 | 同批有 included 與 excluded 草稿 | 分別點擊排除及恢復 | 狀態 API 收到正確批次與草稿 id；內容更新 API 未被呼叫 | Critical |
| TC3 | 還原及提交 | 批次有垃圾桶 match 與 included 草稿 | 點擊還原及提交 | 既有還原與提交 API 收到正確 id | High |

## 5. Implementation Notes

- 變更限制在 Renderer 的確認浮層與樣式，不改變草稿資料格式、IPC 或 Main process
  邊界。
- 預覽繼續使用 `react-markdown`、GFM 與 `skipHtml`，不渲染原始 HTML。
- 保留既有 `updateLearningItemDraft` API 以維持相容性，但確認浮層不再提供呼叫入口。

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`
- `documents/modules/learning-item-creation.md`
- `documents/implements/F21-ai-assisted-learning-item-creation.md`
- `CONTEXT.md`

## 7. Assumptions, Non-goals and Open Questions

### Assumptions

- 「只顯示預覽」代表移除確認浮層中的所有內容編輯控制；排除／恢復與提交不是內容編輯，
  因此繼續保留。
- 生詞庫中的正式學習項目詳情仍可進入編輯狀態，不在本次範圍。

### Non-goals

- 不改變 AI 產生草稿的欄位或內容。
- 不移除 Main process、IPC 或 preload 中既有草稿更新能力。
- 不改變去重、垃圾桶還原、提交交易或對話持久化流程。

### Open Questions

- 無。

## 8. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- 將確認浮層內的草稿元件由可編輯表單改為唯讀預覽。
- 移除標題、類型、CEFR、語義、原始 Markdown 的輸入控制及「儲存修改」按鈕。
- 保留標題、類型、CEFR、提交狀態、安全 Markdown 預覽、排除／恢復、垃圾桶還原、
  關閉及明確提交。
- 未變更草稿資料、IPC、Main process、去重或交易提交契約。

### Test Coverage

- `learning-item-draft-dialog.test.tsx`
  - TC1：驗證預覽內容存在，且沒有 textbox、combobox、原始 Markdown 標籤或儲存按鈕。
  - TC2：驗證 included／excluded 草稿仍可排除及恢復，且不呼叫內容更新 API。
  - TC3：驗證垃圾桶還原與批次提交仍使用原有 typed chat actions。
- Desktop 全測試：17 個 test files、170 個 tests 全數通過。
- Desktop TypeScript typecheck 與 production build 通過。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F21-ai-assisted-learning-item-creation.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/F22-read-only-learning-item-draft-preview.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Scenario 1：待確認草稿只顯示預覽 | Pass | Renderer test 驗證內容、摘要與所有編輯控制不存在 |
| Scenario 2：唯讀確認仍可調整是否提交 | Pass | Renderer test 驗證排除／恢復與內容更新 API 未呼叫 |
| Scenario 3：批次確認操作維持可用 | Pass | Renderer test 驗證垃圾桶還原及提交 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `shows read-only previews while preserving exclude, restore and submit actions` |
| TC2 | Pass | 同一測試驗證兩種草稿狀態 mutation 及 update API 零次呼叫 |
| TC3 | Pass | 同一測試驗證 restore 與 submit API 參數 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- learning-item-draft-dialog.test.tsx
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop
npm run build -w @reader/desktop
```

- 紅燈：目標測試因找到多個 textbox／combobox 而失敗，原因符合尚未實作唯讀預覽。
- 綠燈：目標 2/2 tests passed。
- 回歸：17/17 test files、170/170 tests passed。
- TypeScript typecheck：passed。
- Desktop production build：passed。

### Hypotheses and Decisions

- 依使用者提供畫面與文字，確認浮層保留卡片摘要與渲染預覽，移除所有草稿內容編輯控制。
- 排除／恢復只改變草稿是否參與提交，不改變內容，因此保留。
- 正式學習項目詳情的編輯功能屬於另一個介面與生命週期，不受本需求影響。

### Deferred Items

- 既有草稿更新 API 暫時保留作相容邊界；Renderer 確認浮層已無呼叫入口。

### Notes

- 未發現新的模組耦合、責任邊界或測試接縫問題。
- DDD 完成通知未寄送：`notify_email_from` 與 `notify_email_to` 尚未設定。
