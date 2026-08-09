---
author: Codex
date: 2026-08-08
title: 從複習完成頁編修或移除學習項目
uuid: 5cd9f9ed-8008-4600-9fcb-e87a0d1e560d
version: 1.1.0
status: implemented
---

# Feature Specification - 從複習完成頁編修或移除學習項目

> 後續變更：F55 已把編修能力提前到 reviewing；本文件的完成頁編修與移入垃圾桶行為
> 維持有效，但「未確認試卷維持唯讀」已被取代。本文件保留當時實作紀錄。

## 1. Feature Overview

使用者確認整份**複習試卷**後，可以從完成頁逐筆開啟**學習項目詳情**，但目前詳情
仍是唯讀。實際複習常會暴露原內容中的易錯點、解釋缺口，或讓使用者發現某個過長的
單字／片語不值得繼續複習；此時必須離開間隔複習、前往生詞庫重新搜尋才能處理。

本功能只在排程已成功確認的完成頁放寬詳情能力，沿用生詞庫既有的人工編輯、
**AI 輔助編修**及移入**垃圾桶**流程。批改後但尚未確認排程的詳情繼續唯讀，避免改變
目前試卷使用的目標語義。編修不重設既有複習排程；移入垃圾桶不撤銷已完成的本次
複習歷史，完成摘要也繼續保留。

## 2. Requirements (User Story)

- **As a** 剛完成一個複習回合的語言學習者
- **I want** 從完成結果直接人工或透過 AI 編修學習項目，也能把不適合的項目移入垃圾桶
- **So that** 我能在最容易察覺內容問題的時刻立即修正或停止複習該項目

## 3. Confirmed Product Rules

### 3.1 可編修邊界

- 只有 `completed` 狀態的完成結果開啟 editable **學習項目詳情**。
- `reviewing`／`confirming` 等尚未完成狀態開啟的詳情仍為唯讀。
- 完成頁沿用同一個共用詳情元件，不建立另一套 editor、AI 對話或刪除流程。

### 3.2 人工與 AI 編修

- 完成頁詳情顯示既有 `Edit` 與 `Edit with AI` 入口。
- 人工保存後，詳情立即顯示 repository 回傳的最新正式內容，並維持開啟。
- AI 編修仍使用暫態草稿與明確 Apply；未套用草稿、停止及離開守衛沿用 F51。
- 人工或 AI 編修不得重設 FSRS 排程、刪除本次複習歷史或再次確認複習試卷。

### 3.3 移入垃圾桶

- `Delete` 沿用既有確認視窗；只有明確確認後才把項目移入垃圾桶，且可日後還原。
- 成功後關閉詳情並刷新 App 顯示的生詞庫 active／trash 數量。
- 完成結果列、最終評級與本次下次到期時間仍留在畫面，表示本回合確實完成；刪除不
  重新生成、批改或確認試卷。
- 失敗時詳情保持開啟並顯示錯誤，完成頁與下一步操作不受破壞。

## 4. Acceptance Criteria

- **Scenario 1：完成後可人工編輯**
  - **Given** 使用者已確認複習試卷並從完成結果開啟 active 學習項目
  - **When** 使用者選擇人工編輯、修改內容並保存
  - **Then** 正式學習項目更新，詳情顯示最新內容並維持開啟
  - **And** 試卷生成、批改及確認皆不會再次執行

- **Scenario 2：完成後可使用 AI 編修**
  - **Given** 完成頁開啟的 active 學習項目具有 AI 編修能力
  - **When** 使用者啟動 AI 編修、提出需求並明確套用草稿
  - **Then** 沿用既有 AI 輔助編修流程保存並顯示最新正式內容
  - **And** 複習排程與本次複習歷史不被重設或重寫

- **Scenario 3：完成後可移入垃圾桶**
  - **Given** 使用者從完成結果開啟 active 學習項目
  - **When** 使用者按下 Delete 並確認 Move to Trash
  - **Then** 項目只被移入垃圾桶一次，詳情關閉，生詞庫數量刷新
  - **And** 完成結果與返回複習總覽／繼續下一回合操作仍存在
  - **And** 試卷確認不會再次執行

- **Scenario 4：未確認試卷維持唯讀**
  - **Given** AI 已批改試卷但使用者尚未確認評級
  - **When** 使用者從題目開啟學習項目詳情
  - **Then** 不顯示人工編輯、AI 編修或 Delete 入口

- **Scenario 5：mutation 失敗不破壞完成頁**
  - **Given** 使用者從完成頁開啟學習項目詳情
  - **When** 人工保存、AI Apply 或移入垃圾桶失敗
  - **Then** 詳情維持可處理狀態並顯示錯誤
  - **And** 完成結果及下一步操作仍可使用

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 完成頁人工編輯 | 已完成 review 並開啟項目 | Edit、修改、Save | `updateItem` 收到完整輸入；詳情顯示更新內容；review API 呼叫數不變 | Critical |
| TC2 | 完成頁 AI 編修 | learning API 提供 AI edit capability | 啟動、送出、Apply | 既有 start/send/apply 契約依序執行；正式內容刷新 | Critical |
| TC3 | 完成頁移入垃圾桶 | 已完成 review 並開啟項目 | Delete、確認 | `trashItem` 一次；詳情關閉；counts callback 更新；完成結果保留 | Critical |
| TC4 | 未確認詳情唯讀 | AI 批改完成、排程未確認 | 打開學習項目 | Edit／Edit with AI／Delete 均不存在 | Critical |
| TC5 | 刪除失敗 | `trashItem` reject | 確認移入垃圾桶 | 顯示錯誤；詳情與完成結果保留；確認不重跑 | High |

## 6. Implementation Notes

- `SpacedReviewWorkspace` 依目前 phase 決定共用 `LearningItemDialog` capability：只有
  `completed` 傳入 editable 與 `onChanged`。
- `onChanged` 以正式 repository 回傳值更新 `selectedItem`，支援人工保存及 AI Apply
  後的同窗刷新；trashed 結果則由既有 dialog 關閉流程結束詳情。
- 移入垃圾桶後以 `learning.countItems()` 取得可信任完整 counts，再由 App callback
  更新側欄；不在 Renderer 自行加減推測。
- 完成摘要使用已確認的 `ConfirmReviewSessionResult`，不因後續 mutation 移除列或改寫
  歷史結果。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`

### Test code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

### Documentation

- `CONTEXT.md`
- `documents/implements/F52-edit-learning-items-from-completed-review.md`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者所稱「單字卡」對應現有**學習項目**；項目也可能是片語。
- 「刪除」沿用現有 `active → trashed`，不是永久刪除。
- 完成結果是已發生複習事件的摘要，不因之後編修或移入垃圾桶而消失。

### Non-goals

- 不允許在尚未確認的試卷中編輯或刪除。
- 不重跑 AI 出題、批改或 FSRS 確認，不修改既有複習事件。
- 不新增 undo、單筆永久刪除、複習完成頁專用 editor 或新的 AI skill。
- 不讓編修自動重設排程或變更本次最終評級。

### Open Questions

- 無阻擋實作的未決問題。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-08.

### Implementation Summary

- `SpacedReviewWorkspace` 現在依 phase 指定共用詳情能力：排程確認後的 `completed`
  詳情可編輯；批改後尚未確認的 `reviewing` 詳情繼續唯讀。
- 完成頁把 `handleItemChanged()` 交給 `LearningItemDialog`，因此人工 Save 與 AI Apply
  都使用 repository 回傳的正式 `LearningItem` 即時刷新同一個詳情，不重跑 review。
- Delete 沿用既有具名確認視窗與 `learning:trash`；成功後完成摘要保留、詳情關閉，
  並以 `countItems()` 重查可信任 active／trash 數量回報 App 更新側欄。
- mutation 失敗沿用詳情內錯誤狀態；完成摘要與返回總覽／下一回合操作不受影響。
- 沒有變更 SQLite、IPC、FSRS、複習歷史、AI 編修 controller 或 skill。

### Test Coverage

| Test | Covered scenarios |
|---|---|
| `generates, submits blank answers, allows rating overrides and confirms once` | 完成頁 editable 入口與開關詳情不重跑 review |
| `colors the current rating and opens a read-only learning item after grading` | TC4 尚未確認詳情唯讀回歸 |
| `manually edits and moves a learning item to Trash from the completed review` | TC1、TC3：人工 Save、正式內容刷新、刪除確認、counts callback、完成摘要保留 |
| `applies an AI edit from the completed review without reconfirming it` | TC2：start／send／Apply、正式內容刷新、review API 呼叫數不變 |
| `keeps the completed review and detail open when moving to Trash fails` | TC5：刪除錯誤、詳情與完成頁保留 |

### Changed Files

#### Production code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`

#### Test code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F52-edit-learning-items-from-completed-review.md`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 完成後可人工編輯 | Pass | TC1 驗證完整 update payload、正式內容刷新與 review 呼叫數 |
| 完成後可使用 AI 編修 | Pass | TC2 驗證既有 AI edit 契約與 Apply 後刷新 |
| 完成後可移入垃圾桶 | Pass | TC3 驗證確認後單次 trash、counts、關閉詳情及完成摘要保留 |
| 未確認試卷維持唯讀 | Pass | TC4 既有 grading-phase 唯讀測試持續通過 |
| mutation 失敗不破壞完成頁 | Pass | TC5 驗證刪除錯誤、詳情、完成摘要與下一步保留 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `manually edits and moves a learning item to Trash from the completed review` |
| TC2 | Pass | `applies an AI edit from the completed review without reconfirming it` |
| TC3 | Pass | `manually edits and moves a learning item to Trash from the completed review` |
| TC4 | Pass | `colors the current rating and opens a read-only learning item after grading` |
| TC5 | Pass | `keeps the completed review and detail open when moving to Trash fails` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "generates, submits blank answers, allows rating overrides and confirms once"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "manually edits and moves|applies an AI edit|keeps the completed review and detail open|colors the current rating and opens a read-only"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 初始 red：完成頁詳情找不到 `Edit`，確認現況固定傳入 `readOnly`。
- 第二組有效 red：人工 Save、AI Apply 與 Delete 都因缺少 `onChanged` 而沒有呼叫 mutation。
- 聚焦間隔複習 Renderer：25/25 passed。
- Desktop Vitest：39 files、397/397 passed。
- Server／Desktop TypeScript typecheck：passed。
- Desktop production build：passed。

### Hypotheses and Decisions

1. 新 mutation 測試第一次被 fixture 評級文字擋住：DOM 是 `Forgotten`，測試查詢卻寫
   `Easy`。依序檢查「共用 fixture 固定 final rating」、「等待時序」與「跨測試共享
   狀態」三個假說；共用 `reviewApi()` 明確固定 `finalRating: forgotten`，修正查詢後
   測試進入預期的 `onChanged` feature red。
2. 完成結果繼續使用已確認 paper／event 的標題、評級與到期時間，不因之後 mutation
   移除該列；它表達已發生的本次複習，不是 active 生詞庫查詢結果。
3. 刪除後 counts 不由 Renderer 自行加減，而是重查 repository。counts 刷新失敗不讓
   已成功的 trash mutation 被誤報為刪除失敗；詳情仍關閉並在完成頁顯示非破壞性錯誤。

### Architectural Observations

- 共用 `LearningItemDialog` 的 editable／read-only capability 與 `onChanged` 回傳值已提供
  足夠接縫；本功能沒有新增平行 editor 或跨越 Main／Renderer 邊界。
- 未發現需要另開 RXX 的耦合、責任混淆或缺少測試接縫。

### Deferred Items

- 無。本 F52 的 TC1–TC5 全部實作。

## Appendix: TDD Implementation Checklist

1. 新增完成頁 editable 與未確認唯讀邊界的 Renderer 失敗測試。
2. 以 phase capability 與 `onChanged` 實作最小行為。
3. 新增／完成 AI 編修、移入垃圾桶、counts 刷新與失敗保留測試。
4. 執行目標測試、Desktop 完整測試、typecheck、build 與 diff 檢查。
5. 同步 CONTEXT、F52 實作紀錄與兩份模組文件。
