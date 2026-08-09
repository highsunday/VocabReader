---
author: Codex
date: 2026-08-09
title: 從已批改的複習結果編修學習項目
uuid: c35d640e-3925-4011-9508-656869c39581
version: 1.1.0
status: implemented
---

# Feature Specification - 從已批改的複習結果編修學習項目

## 1. Feature Overview

使用者在**複習試卷**完成 AI 批改、尚未確認評級與更新排程時，可以從每題結果開啟
**學習項目詳情**，但目前只能查看。複習結果正是使用者最容易發現解釋不清、內容不足
或易混淆之處的時刻，因此此階段也應能直接人工編輯或使用 **AI 輔助編修**，不必先
完成回合或離開間隔複習。

本功能讓 `reviewing` 階段的詳情具備編修能力，同時把「編修」與「移入垃圾桶」拆成
獨立 capability。編修只更新正式學習項目及目前開啟的詳情；已生成的題目、使用者
答案、AI 批改、AI 建議評級與目前選中的最終評級維持不變。為避免尚未確認排程時把
題目所屬項目移出複習，移入垃圾桶仍只在 `completed` 完成頁提供。

## 2. Requirements (User Story)

- **As a** 正在檢視複習試卷批改結果的語言學習者
- **I want** 從結果中的學習項目詳情直接人工或透過 AI 編修內容
- **So that** 我能在剛發現內容問題時立即修正，而不必先完成回合再回到生詞庫搜尋

## 3. Confirmed Product Rules

### 3.1 Reviewing 階段可編修

- AI 批改完成並進入 `reviewing` 後，從「Open learning card」開啟的 active
  **學習項目詳情**顯示 `Edit` 與 `Edit with AI`。
- 人工 Save 與 AI Apply 沿用共用詳情及既有 learning mutation API。
- 保存成功後，同一詳情立即顯示 repository 回傳的最新正式內容並維持開啟。

### 3.2 試卷狀態保持不變

- 編修不得重新生成或重新批改複習試卷，也不得自動確認評級或更新排程。
- 題目、作答、意思回饋、表達建議、AI 建議評級及使用者覆寫的目前評級均維持不變。
- 編修學習項目不重設既有 FSRS 排程；本次排程只在使用者明確接受評級後更新。

### 3.3 垃圾桶能力維持完成後才開放

- `reviewing` 詳情不顯示 `Delete`，也不得呼叫 `trashItem`。
- `completed` 完成頁詳情維持 F52 的人工編輯、AI 編修與移入垃圾桶能力。
- 生詞庫及其他共用詳情的既有 editable／read-only 邊界不受影響。

## 4. Acceptance Criteria

- **Scenario 1：批改後可人工編輯**
  - **Given** AI 已批改複習試卷且使用者尚未確認評級
  - **When** 使用者開啟題目對應的學習項目、選擇 Edit、修改內容並 Save
  - **Then** 正式學習項目更新，詳情顯示最新內容並維持開啟
  - **And** 不重新生成、批改或確認試卷

- **Scenario 2：批改後可使用 AI 編修**
  - **Given** `reviewing` 詳情已開啟且 learning API 提供 AI 編修能力
  - **When** 使用者啟動 AI 編修並明確 Apply 草稿
  - **Then** 正式學習項目更新，詳情顯示套用後內容
  - **And** 答案、回饋及目前評級保持不變

- **Scenario 3：批改後不可移入垃圾桶**
  - **Given** 使用者從 `reviewing` 結果開啟學習項目詳情
  - **When** 詳情顯示可用操作
  - **Then** 顯示 Edit 及可用時的 Edit with AI，但不顯示 Delete
  - **And** 不呼叫 `trashItem`

- **Scenario 4：完成頁與生詞庫行為不回歸**
  - **Given** 使用者從 `completed` 完成頁或生詞庫開啟 active 學習項目
  - **When** 詳情顯示
  - **Then** 原有編修與移入垃圾桶能力仍可用

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Reviewing 人工編輯 | 已批改未確認且詳情已開啟 | Edit、修改、Save | `updateItem` 收到完整輸入；詳情刷新；review API 呼叫數不變 | Critical |
| TC2 | Reviewing AI 編修 | learning API 有 AI edit capability | Start、Send、Apply | 正式內容刷新；答案、回饋、rating 保留；review API 呼叫數不變 | Critical |
| TC3 | Reviewing 禁止移入垃圾桶 | 已批改未確認且詳情已開啟 | 檢查操作 | 有 Edit／Edit with AI；無 Delete；`trashItem` 未呼叫 | Critical |
| TC4 | Completed 回歸 | 已確認排程並開啟詳情 | 檢查及使用操作 | Edit／Edit with AI／Delete 與 F52 行為維持 | Critical |
| TC5 | 生詞庫與 read-only 回歸 | 從其他既有入口開啟詳情 | 檢查 capability | 生詞庫可編修可移垃圾桶；明確 read-only 入口仍無 mutation | High |

## 6. Implementation Notes

- `LearningItemDialog` 將「可編修」與「可移入垃圾桶」表示成獨立 capability；避免為了
  隱藏 Delete 又複製 editor，或讓 `readOnly` 同時承擔兩種不同產品規則。
- `SpacedReviewWorkspace` 在 `reviewing` 與 `completed` 都提供 `onChanged` 並允許編修；
  只有 `completed` 允許移入垃圾桶。
- `handleItemChanged()` 仍以 repository 回傳的 `LearningItem` 更新 `selectedItem`。
  `reviewing` 編修不碰 `paper`、`answers`、`grade` 或 `finalRatings` state。
- 不新增 IPC、資料庫 schema、AI skill 或複習 controller 行為。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`

### Test code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`（回歸）

### Documentation

- `CONTEXT.md`
- `documents/implements/F55-edit-learning-items-from-graded-review.md`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者所稱「測驗結果」是截圖中的 `reviewing` 階段：AI 已批改，但尚未接受評級並
  更新排程。
- 「可以編輯」包含既有人工編輯與 AI 輔助編修；不隱含刪除。
- 編修後本張試卷仍呈現出題與批改當下的結果，不嘗試讓歷史回饋追隨新內容重算。

### Non-goals

- 不在生成中、作答中、批改中或其他明確 read-only 入口提供編修。
- 不在 `reviewing` 階段移入垃圾桶或永久刪除學習項目。
- 不重新生成題目、重跑 AI 批改、改寫 AI 建議評級或自動確認排程。
- 不新增獨立的複習結果 editor、編修歷史或 undo。

### Open Questions

- 無阻擋實作的未決問題。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-09.

### Implementation Summary

- `LearningItemDialog` 新增獨立 `allowMoveToTrash` capability，預設仍跟隨既有
  editable／read-only 行為；不允許時不渲染 Delete、確認視窗，mutation guard 也拒絕
  `trashItem`。
- `SpacedReviewWorkspace` 在 `reviewing` 與 `completed` 都傳入 editable capability、
  `onChanged` 及最新正式項目刷新；只有 `completed` 允許移入垃圾桶。
- `reviewing` 人工 Save 與 AI Apply 都只更新 `selectedItem`，不改動 `paper`、`answers`、
  `grade`、`finalRatings` 或複習 phase，因此不重跑出題、批改或排程確認。
- 沒有新增 IPC、SQLite schema、AI skill、複習 controller 或 FSRS 行為。

### Test Coverage

| Test | Covered scenarios |
|---|---|
| `colors the current rating and allows editing but not Trash after grading` | TC1、TC3：人工 Save、正式內容刷新、無 Delete／trash、答案與評級保留、review 呼叫數不變 |
| `applies an AI edit after grading without changing the graded paper` | TC2、TC3：start／send／apply、正式內容刷新、答案／回饋／rating 保留、無確認或 trash |
| `manually edits and moves a learning item to Trash from the completed review` | TC4：完成頁人工編輯與移入垃圾桶回歸 |
| `applies an AI edit from the completed review without reconfirming it` | TC4：完成頁 AI 編修回歸 |
| 共用詳情相關四檔 Renderer suite | TC5：生詞庫 editable、AI 建立／造句 read-only 與焦點／關閉行為回歸 |

### Changed Files

#### Production code

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`

#### Test code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F33-color-review-results-and-open-learning-item-detail.md`
- `documents/implements/F52-edit-learning-items-from-completed-review.md`
- `documents/implements/F55-edit-learning-items-from-graded-review.md`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-editing.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 批改後可人工編輯 | Pass | TC1 驗證完整 update payload、正式內容刷新及 review API 呼叫數 |
| 批改後可使用 AI 編修 | Pass | TC2 驗證 start／send／apply、正式內容刷新與試卷 state 保留 |
| 批改後不可移入垃圾桶 | Pass | TC1／TC2 驗證無 Delete 且 `trashItem` 未呼叫；正式碼 guard |
| 完成頁與生詞庫行為不回歸 | Pass | F52 完成頁案例與四檔共用詳情回歸 suite |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `colors the current rating and allows editing but not Trash after grading` |
| TC2 | Pass | `applies an AI edit after grading without changing the graded paper` |
| TC3 | Pass | 兩個 reviewing 編修案例的 Delete／trash negative assertions |
| TC4 | Pass | F52 完成頁人工、AI、Trash 與失敗保留案例 |
| TC5 | Pass | learning library、sentence practice、learning item draft dialog 回歸 suite |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "allows editing but not Trash after grading"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "after grading"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/learning-library-workspace.test.tsx src/renderer/SentencePracticeWorkspace.test.tsx src/renderer/learning-item-draft-dialog.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 初始 red：兩個 reviewing 案例分別因找不到 `Edit` 與 `Edit with AI` 而失敗，符合
  現況唯讀 capability 的預期，沒有測試環境或 fixture 問題。
- 聚焦新案例：2/2 passed。
- 共用詳情與間隔複習回歸：4 files、57/57 passed。
- Desktop Vitest：39 files、401/401 passed。
- Server／Desktop TypeScript typecheck：passed。
- Desktop production build：passed。
- `git diff --check`：passed。

### Hypotheses and Decisions

1. 截圖對應 `reviewing`，不是排程已確認的 `completed`；因此本功能只補上 F52 尚未
   涵蓋的已批改結果入口。
2. 使用者要求「可以編輯」解讀為人工與既有 AI 輔助編修，不擴張為刪除。把
   `allowMoveToTrash` 從 `readOnly` 分離，能沿用單一 editor 又避免尚未確認時移除項目。
3. 編修後保留本張試卷出題與批改當下的內容，不以新內容重算回饋或評級；這讓 mutation
   與複習確認維持明確、可預測的兩個操作。
4. 現有 `onChanged` 與 repository 回傳正式項目已是足夠測試接縫；未發現需要另開 RXX
   的模組耦合、責任混淆或缺少測試接縫。

### Deferred Items

- `reviewing` 仍不可移入垃圾桶；完成回合後才沿用 F52 Delete 流程。
- 不重跑題目或批改，也不保存學習項目編修歷史。

### Notes

- 工作樹在本功能開始前已有其他未提交變更；本功能在其上做最小增量修改，未還原或
  覆寫那些變更。

## Appendix: TDD Implementation Checklist

1. 新增 `reviewing` 人工編輯與禁止 Delete 的 failing test。
2. 新增或擴充 `reviewing` AI Apply 與試卷狀態保留測試。
3. 以獨立 capability 完成最小正式碼並讓目標測試轉綠。
4. 執行間隔複習與共用詳情回歸、desktop typecheck、build 及 diff 檢查。
5. 回填 Implementation Record，並同步 CONTEXT 與兩份模組文件。
