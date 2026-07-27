---
author: Codex
date: 2026-07-27
title: 在複習完成頁顯示學習項目與開啟詳情
uuid: f4fa7fa3-d95f-4cd0-b356-9a660f62bcea
version: 1.1.0
status: implemented
---

# Feature Specification - 在複習完成頁顯示學習項目與開啟詳情

## 1. Feature Overview

目前使用者確認整份**複習試卷**後，完成頁只列出「忘記／困難／順利／簡單」等
**複習評級**與下次到期時間，沒有顯示每筆結果對應的**學習項目**。使用者無法判斷
哪個單字或片語在何時到期，也無法從完成頁回看其完整學習內容。

本功能讓每筆完成結果清楚顯示學習項目標題、最終複習評級與下次複習時間，並把每列
設為可操作入口。使用者點擊後沿用既有唯讀**學習項目詳情**浮層；關閉後留在完成頁，
不重新批改、不再次更新排程，也不影響繼續下一回合。

## 2. Requirements (User Story)

- **As a** 完成一個複習回合的語言學習者
- **I want** 在完成頁辨認每個學習項目及其下次複習時間，並可直接打開詳情
- **So that** 我能理解剛才的評級如何影響各項排程，並立即回看需要加強的內容

## 3. Confirmed Product Rules

### 3.1 完成結果的資訊層級

- 每筆結果的主要資訊是學習項目標題；標題可以是單字或片語。
- 同列顯示最終複習評級與下次複習時間。
- 不再以複習評級作為每列唯一的左側識別資訊。
- 排程時間沿用既有顯示規則：一小時內顯示相對分鐘數，其餘顯示本地日期與時間。

### 3.2 整列開啟學習項目詳情

- 正式 App 具備 learning capability 時，每筆結果整列皆可點擊。
- 點擊結果列以該筆可信任的 `itemId` 開啟既有唯讀學習項目詳情。
- 浮層內容、排程、歷史、Escape、backdrop、關閉按鈕與焦點回復沿用既有行為。
- 詳情不得提供編輯、刪除或任何學習項目 mutation。

### 3.3 完成狀態保持不變

- 開啟或關閉詳情不重新生成試卷、不重新批改，也不再次確認排程。
- 詳情查詢失敗時顯示可理解的錯誤，完成結果與下一步按鈕仍保留。
- 關閉詳情後，使用者仍可繼續下一回合或返回複習總覽。

## 4. Acceptance Criteria

- **Scenario 1：完成頁顯示項目、評級與下次複習時間**
  - **Given** 使用者完成含 `bank` 的複習回合
  - **When** 排程更新成功並顯示完成頁
  - **Then** 結果列顯示 `bank`
  - **And** 同列顯示最終評級與下次複習時間

- **Scenario 2：點擊完成結果開啟正確詳情**
  - **Given** 完成結果中的 `bank` 對應 `item-1`
  - **When** 使用者點擊 `bank` 結果列
  - **Then** learning API 以 `item-1` 查詢
  - **And** 顯示既有唯讀學習項目詳情

- **Scenario 3：關閉詳情保留完成頁**
  - **Given** 使用者從完成頁開啟詳情
  - **When** 使用者關閉浮層
  - **Then** 完成結果、下次複習時間與下一步按鈕仍存在
  - **And** 焦點回到剛才的結果列
  - **And** 試卷生成、批改與排程確認皆未重跑

- **Scenario 4：詳情查詢失敗不破壞完成結果**
  - **Given** 完成頁已顯示，但 learning item 查詢失敗
  - **When** 使用者點擊該結果列
  - **Then** 顯示錯誤
  - **And** 完成結果與下一步按鈕仍可使用

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 顯示項目資訊 | 完成 `bank` 的複習回合 | 進入完成頁 | 同列顯示 `bank`、最終評級與到期時間 | Critical |
| TC2 | 整列開啟詳情 | `bank` 對應 `item-1` | 點擊結果列 | `getItem("item-1")`；顯示唯讀詳情 | Critical |
| TC3 | 關閉後保留狀態 | 詳情已開啟 | 點擊關閉 | 完成頁保留；焦點回列；AI 與確認呼叫數不變 | Critical |
| TC4 | 查詢失敗 | `getItem` reject | 點擊結果列 | 顯示錯誤；完成列與下一步仍存在 | High |
| TC5 | 多項正確對應 | 一回合含多個 itemId 與 title | 查看並逐列點擊 | 每列標題、評級、排程及詳情 itemId 正確 | High |

## 6. Implementation Notes

- 完成確認後 `SpacedReviewWorkspace` 仍保留本回合 `paper.questions`；以
  `entry.itemId` 對應可信任的 question `title`，不擴充 IPC、資料庫或複習歷史契約。
- 結果列使用原生 `button` 承載整列互動，保留鍵盤操作、清楚的 focus-visible 樣式
  及可存取名稱；評級仍以文字呈現，不只靠顏色。
- 沿用 `openItemDetail()`、`selectedItem` 與共用 `LearningItemDialog readOnly`。
- 若因舊資料或異常回應找不到本回合標題，顯示中性的「學習項目」，但仍以
  `entry.itemId` 開啟正確詳情。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/spaced-review.md`

## 8. Assumptions and Non-goals

### Assumptions

- 使用者所稱「單字卡」對應既有唯讀**學習項目詳情**；學習項目也可能是片語。
- 正式 App 已依 F33 提供 `learningApi`，不需要新增 capability。
- 完成頁只需顯示標題即可辨認項目；完整釋義、發音與來源留在詳情浮層。

### Non-goals

- 不改變 FSRS、複習評級、到期時間計算或確認交易。
- 不允許從完成頁編輯、刪除或移動學習項目。
- 不把詳情改成新頁面、側欄或另一套卡片 UI。
- 不在完成頁重複顯示完整 Markdown 學習內容。

## 9. Implementation Record

### Status

Implemented on 2026-07-27.

### Implementation Summary

- 完成頁以本回合 `paper.questions` 建立 `itemId → title` 對應，每筆排程結果現在以
  學習項目標題為主資訊，並同列顯示最終評級 badge 與「下次複習」時間。
- 每筆結果使用整列原生 button；正式 App 具備 learning capability 時，可用滑鼠或
  鍵盤開啟既有 `LearningItemDialog readOnly`。關閉浮層後焦點回到原結果列。
- 完成列新增四級評級顏色、hover、focus-visible、長標題截斷及 760px 以下的上下排列；
  評級與到期時間皆保留文字，不依賴顏色辨識。
- 開關詳情沿用既有 `openItemDetail()` state，不重新生成、批改或確認排程；載入錯誤
  仍保留完成結果與下一回合／總覽按鈕。

### Test Coverage

- TC1／TC2／TC3：擴充既有完整 review flow test，驗證 `bank`、最終「忘記」、下次
  複習可存取名稱、`item-1` 詳情查詢、唯讀能力、關閉焦點回復，以及 AI／確認呼叫
  次數不變。
- TC4：新增完成頁 item query reject 測試，驗證錯誤、結果列與下一步仍存在。
- TC5：新增 `bank`／`in advance` 兩筆完成結果，驗證不同標題、評級與 `itemId`
  分別開啟正確詳情。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `documents/implements/F35-show-learning-items-in-completed-review.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 完成頁顯示項目、評級與下次複習 | Pass | 完整 review flow test 的結果列可存取名稱與可見標題 |
| 點擊完成結果開啟正確詳情 | Pass | `getItem("item-1")` 與唯讀 dialog assertions |
| 關閉詳情保留完成頁 | Pass | 焦點回復、結果與下一步保留、三個 API call-count assertions |
| 詳情查詢失敗不破壞完成結果 | Pass | completion-specific load-failure test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `generates, submits blank answers, allows rating overrides and confirms once` |
| TC2 | Pass | 同上：完成列 click、item-1 query、read-only dialog |
| TC3 | Pass | 同上：close focus、完成頁與 API call counts |
| TC4 | Pass | `keeps completed results usable when item detail cannot load` |
| TC5 | Pass | `maps every completed result to its learning item` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "generates, submits blank answers, allows rating overrides and confirms once"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Architectural Observations

- 不需擴充 `ConfirmReviewSessionResult`、IPC 或資料庫：完成 phase 仍保有本回合 paper，
  可在 Renderer 以可信任 itemId 對應標題。
- 既有共用詳情邊界足夠乾淨；完成頁直接沿用 F33 的 read-only capability，沒有發現
  需要另開 RXX 的模組耦合或責任混淆。

### Hypotheses and Decisions

1. Red phase 首先確認舊完成頁沒有帶項目標題的可操作列。
2. 初次開啟 dialog 的測試出現 `.then` of `undefined`；三個假說依序為測試 mock
   缺少 Promise、傳錯 review API、dialog 有多餘 mutation 依賴。補上符合
   `ReviewDesktopApi.getItemDetail()` 契約的 Promise mock 後直接轉綠，確認根因只在
   test factory。
3. 完整 typecheck 發現多項 fixture 被 TypeScript 從原 factory 推成過窄 literal；
   將該測試明確標為 `ReviewDesktopApi`／`LearningDesktopApi` 後通過，沒有改動
   production 型別或行為。
4. 嘗試透過本機瀏覽器檢查實際視覺，但 localhost 與 data URL 均被 Browser 安全策略
   阻擋；沒有繞過限制。版面以 DOM／CSS inspection、build 與 responsive rule 驗證。

### Deferred Items

- 無功能缺口。
- 本次沒有完成自動化像素或 screenshot regression；現有專案也沒有完成頁 visual
  fixture。若未來建立 Renderer visual harness，可把寬／窄版面加入固定快照。

## Appendix: TDD Implementation Checklist

1. 先新增完成頁顯示與互動測試，確認現況因缺少標題與入口而失敗。
2. 以本回合 question 對應補上標題，並沿用既有唯讀詳情流程。
3. 調整完成結果的視覺層級、hover、focus 與響應式排列。
4. 執行 Renderer 聚焦測試、desktop typecheck、build 與完整相關回歸。
5. 同步本文件與 `documents/modules/spaced-review.md`。
