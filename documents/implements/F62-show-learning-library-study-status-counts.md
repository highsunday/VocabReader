---
author: Codex
date: 2026-08-14
title: 在生詞庫緊湊顯示學習進度分類數量
uuid: 9c3c8373-ef4e-43cf-a25f-50bb7b19c6ed
version: 1.2.0
status: implemented
---

# Feature Specification - Compact Learning Library Progress Status Counts

## 1. Feature Overview

生詞庫已會在每張項目卡顯示 New、Learning、Due 或 Scheduled 時間狀態，
但這些狀態只回答何時需要複習，不代表對內容的熟悉程度。

本功能將 New、Studying、Familiar 與 Strong 四個互斥的**生詞庫進度分類**
放入頁首緊湊指標，並讓指標兼作進度篩選入口。Strong 與 Review 頁的
Solid recall 共用完全相同的 Main-owned 判定與數量。項目卡仍保留 Due 等時間狀態。

## 2. Requirements (User Story)

- **As a** 使用生詞庫的語言學習者
- **I want** 進入頁面時直接看到各學習進度的學習項目數量
- **So that** 我能快速掌握從未學到穩定掌握的分佈，並不會因大型統計卡壓縮清單空間

## 3. Confirmed Product Rules

- 顯示 New、Studying、Familiar、Strong 四個 active 生詞庫進度分類數量。
- New 是尚未開始複習的 active 學習項目，與 Review summary `newCount` 使用相同資料。
- Studying 是目前處於新項目初學或到期項目重新學習的短間隔路徑，數量等於
  Review summary 的 `newLearningCount + dueLearningCount`。
- Strong 與 Review 頁 Solid recall 共用相同判定：至少兩個不同本地日期
  Good／Easy、FSRS stability 至少 30 天、最新評級仍為 Good／Easy，且查詢時
  retrievability 至少 85%。Library Strong 與 Review `solidItemCount` 必須恆等。
- Familiar 是已開始複習，但目前既不屬於 Studying 也尚未達 Strong 的其餘 active 項目。
- 四個進度分類互斥，加總必須等於 active 數量。最新評級或記憶衰退可使項目
  從 Strong 回到 Familiar 或 Studying。
- Due／Scheduled 繼續作為獨立時間狀態顯示於項目卡與 Review 入口，不混入四個進度分類。
- 數量是完整 active 生詞庫統計，不受 50 筆分批載入、搜尋、類型、語言、
  CEFR 或排序影響。
- 指標可點擊：點擊未選取進度會套用該進度篩選；再點擊已選取進度會回到全部。
- 移除重複的 Study status select；其他搜尋、篩選與排序能力不變。
- 寬螢幕的狀態指標與原有頁首共用同一水平節奏，不新增大型統計區塊。
- 四個狀態指標在所有支援寬度都必須同時可見；不使用水平捲動、隱藏捲軸
  或滾輪才能看完的呈現。
- 中等寬度下可將完整狀態列移到標題下方，同時隱藏說明文字以抵銷高度；
  不得將四個狀態堆疊成多列大卡。
- 學習項目新增、複習確認、移入垃圾桶或還原後，進度數量與 Review summary
  使用同一查詢時點重新載入。

## 4. Acceptance Criteria

- **Scenario 1：顯示完整學習進度數量**
  - **Given** active 生詞庫同時包含四種進度分類
  - **When** 使用者開啟生詞庫
  - **Then** 頁首顯示 New、Studying、Familiar、Strong 及各自完整數量
  - **And** 四者加總等於 active 數量

- **Scenario 2：指標兼作進度篩選**
  - **Given** 生詞庫目前顯示全部進度
  - **When** 使用者點擊 Familiar 數量指標
  - **Then** 清單以 `progressStatus: familiar` 重新查詢，且 Familiar 指標呈現選取狀態
  - **And** 再點擊 Familiar 指標會移除該篩選

- **Scenario 3：Strong 與 Review Solid recall 數量恆等**
  - **Given** active 項目包含穩定掌握、正在鞏固、初學中與未開始項目
  - **When** Library counts 與 Review summary 以同一時點查詢
  - **Then** Library Strong 等於 Review `learningProgress.solidItemCount`
  - **And** Strong 項目因遺忘或衰退離開 Solid recall 時，Library Strong 同步下降

- **Scenario 4：指標不受畫面篩選或分批影響**
  - **Given** active 生詞庫超過一批載入上限，且使用者套用搜尋或其他篩選
  - **When** 清單只顯示符合條件的部分項目
  - **Then** 四個狀態數量仍反映完整 active 生詞庫

- **Scenario 5：不壓縮寬螢幕清單空間**
  - **Given** 生詞庫使用寬螢幕版面
  - **When** 顯示狀態數量
  - **Then** 狀態指標維持單列緊湊呈現
  - **And** 原 Study status select 不再佔用篩選工具區格位

- **Scenario 6：窄螢幕不使用滾輪或水平捲動**
  - **Given** 標題、四個狀態與 Trash 無法在同一橫列中完整容納
  - **When** 生詞庫在窄螢幕顯示
  - **Then** 狀態列改佔一列並以四欄自動壓縮，四個狀態同時可見
  - **And** 狀態列不可水平捲動，也不依賴隱藏捲軸

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Main 統計四進度 | active 項目涵蓋四種進度 | 取得 counts | 四類互斥且加總等於 active | Critical |
| TC2 | Strong 共用 Solid recall | 項目達成穩定掌握 | 同時查詢 Library 與 Review | Strong 等於 `solidItemCount` | Critical |
| TC3 | Renderer 顯示指標 | counts API 回傳各進度數量 | 開啟生詞庫 | 四個具名按鈕顯示正確數量 | Critical |
| TC4 | 點擊套用與取消篩選 | 顯示全部進度 | 連續點擊 Familiar | 第一次查詢 familiar，第二次回到全部 | Critical |
| TC5 | 移除重複 select | 進度指標已顯示 | 檢視篩選工具區 | 不存在 Study status select | High |
| TC6 | 寬螢幕單列呈現 | 正常桌面寬度 | 檢視頁首 | 指標使用不換行的單列容器 | High |
| TC7 | 窄螢幕四進度完整顯示 | 標題與 action 無法同列 | 檢視頁首 | action 換到單獨一列；四進度自動壓縮且無水平捲動 | High |

## 6. Impact Scope

- `apps/desktop/src/shared/learning-contracts.ts`：新增進度類型與 `LearningItemCounts.progress`。
- `apps/desktop/src/main/learning-library-service.ts`：共用 Review progress 推導四種進度及篩選集合。
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`：緊湊指標、點擊篩選與移除重複 select。
- `apps/desktop/src/renderer/styles.css`：頁首單列指標、選取狀態與窄螢幕四欄無捲動版面。
- `apps/desktop/src/main/learning-library-service.test.ts`：狀態統計規則。
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`：指標呈現與互動。
- 使用 `LearningItemCounts` mock 的相關 Renderer／IPC 測試：contract 形狀同步。
- `documents/modules/learning-library.md`：同步當前行為與測試覆蓋。

## 7. Non-goals and Assumptions

- 不新增趨勢圖、百分比、週或月統計。
- 不把垃圾桶項目納入四種學習狀態數量。
- 不修改 FSRS、Solid recall 或 Due／Scheduled 判定規則。
- 不變更搜尋、類型、語言、CEFR、排序或分批載入語意。
- Strong 是 Review Solid recall 的生詞庫 UI 標籤，不代表永久學會。

## 8. Implementation Record

### Status

Implemented.

### Implementation summary

新增 `LearningItemProgressStatus` 與四類完整 counts。Main 的 `reviewProgress()` 在計算
Review `solidItemCount` 時同時保留 exact Solid recall item id 集合，Library Strong
直接復用該集合；Studying 復用 learning path state，New 使用與 Review 相同的無 schedule
查詢，Familiar 則由已開始項目排除 Studying／Strong 得出。分頁查詢使用相同集合完成
server-side progress filter，cursor fingerprint 也包含進度條件。

Renderer 把頁首改為 New／Studying／Familiar／Strong 四個 compact pressed-state
button，並移除重複的 Study status select。卡片上的 New／Learning／Due／Scheduled
時間狀態不變。四個按鈕以四欄 grid 同時可見；中等寬度讓 action row 換至標題下方並
隱藏說明文字，沒有水平 overflow 或滾輪導覽。

### Test coverage

- Main tests 覆蓋四類數量、互斥加總、New／Studying／Familiar／Strong 分頁篩選，及
  Library Strong 與 Review Solid recall 恆等。
- IPC tests 覆蓋 progress contract 與非法 enum 拒絕。
- Renderer tests 覆蓋四個具名按鈕、數量、pressed state、Familiar 套用／取消篩選，
  以及卡片 Due／Scheduled 時間標籤仍存在。
- Electron E2E 在 1180×820 viewport 驗證四個按鈕都位於 overview 可見範圍、容器
  `scrollWidth <= clientWidth` 且 `overflow-x: visible`。

### Changed files

- `CONTEXT.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/learning-library.md`
- `documents/modules/spaced-review.md`

### Acceptance criteria verification

| Scenario | Result | Evidence |
|---|---|---|
| 1. 顯示完整學習進度數量 | Pass | Main count 與 Renderer named-button tests |
| 2. 指標兼作進度篩選 | Pass | Renderer Familiar toggle 與 Main page filter tests |
| 3. Strong 與 Solid recall 恆等 | Pass | 同一時點 `countItems()`／`getReviewSummary()` assertion |
| 4. 不受畫面篩選或分批影響 | Pass | Main full-library count、55 與 10,000 筆 pagination tests |
| 5. 不壓縮寬螢幕清單空間 | Pass | compact header action 與移除 select Renderer tests |
| 6. 窄螢幕無水平捲動 | Pass | Electron geometry／overflow E2E |

### Test scenario verification

TC1–TC7 全部通過；完整 Desktop Vitest 52 files／515 tests passed，Electron E2E 3/3
passed。

### Commands executed

- `npm run test -w @reader/desktop -- --run src/main/learning-library-service.test.ts src/main/learning-library-ipc.test.ts src/renderer/learning-library-workspace.test.tsx`
- `npm run test -w @reader/desktop -- --run src/main/learning-library-service.test.ts src/main/learning-library-ipc.test.ts src/renderer/learning-library-workspace.test.tsx src/renderer/App.test.tsx src/renderer/SentencePracticeWorkspace.test.tsx src/renderer/SpacedReviewWorkspace.test.tsx`
- `npm run typecheck -w @reader/desktop`
- `npm run build -w @reader/desktop`
- `npm run test:e2e -w @reader/desktop`
- `npm run test -w @reader/desktop -- --run`

### Hypotheses and decisions

- 狀態統計來自 Main-owned 完整資料，不以 Renderer 已載入項目推算。
- 狀態指標取代現有 Study status select，以相同互動同時承擔概覽與篩選。
- Strong 必須使用 Review 的 exact Solid recall 集合，不以 `review_count`、due 或單一
  stability 近似。
- Due／Scheduled 是時間維度；New／Studying／Familiar／Strong 是進度維度，兩者不互換。

### Deferred items

無。

### Notes

TDD red 階段確認舊 contract 仍回傳 `study` 且 Renderer 仍顯示舊 study group；green
階段完成共用 progress 集合後，所有 targeted、full-suite、typecheck、build 與 Electron
acceptance checks 通過。未發現需要新增 RXX 的架構問題。

## Appendix: TDD Implementation Checklist

1. 先建立 Main 狀態 counts 與 Renderer 指標互動的 failing tests。
2. 以 Review progress／Solid recall 共用規則擴充 count query 與 shared contract。
3. 將狀態篩選從 select 移到緊湊指標，加入可存取的 pressed state。
4. 加入桌面與窄螢幕樣式，確認不增加大型頁首區塊。
5. 執行相關 Vitest、typecheck、build 與視覺檢查。
6. 同步本文件與 `documents/modules/learning-library.md`。
