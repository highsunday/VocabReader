---
author: Codex
date: 2026-07-25
title: 以評級顏色標示複習結果並開啟學習項目詳情
uuid: f398596f-45e3-4d70-9265-dfc508f38227
version: 1.1.0
status: implemented
---

# Feature Specification - 以評級顏色標示複習結果並開啟學習項目詳情

> 後續變更：F55 已取代本文件中「尚未確認的複習結果詳情一律唯讀」的產品邊界；
> reviewing 現可人工或透過 AI 編修，但仍不可移入垃圾桶。本文件保留當時實作紀錄。

## 1. Feature Overview

目前複習試卷批改後，每題結果區都使用相同的紅色樣式。使用者無法快速從視覺上區分
忘記、困難、順利與簡單，必須逐題閱讀評級文字。批改結果也沒有直接開啟**學習項目
詳情**的入口；若想重新查看完整學習內容，必須離開試卷前往生詞庫搜尋。

本功能讓批改結果區依目前選中的**複習評級**呈現不同色彩：忘記紅色、困難橘色、
順利藍綠色、簡單綠色。顏色隨使用者覆寫評級立即更新，讓「簡單」題能被快速辨識並
跳過，同時保留評級文字及 radio，不只依靠色彩傳達狀態。

AI 完成整份試卷批改後，每一道題目都新增「查看學習項目」入口。使用者可在目前畫面
中央開啟與生詞庫相同的**學習項目詳情**浮層，查看 Markdown 學習內容、播放發音及
檢視複習排程與精簡歷史。為避免已生成題目與學習內容失去一致性，從尚未確認的複習
試卷開啟時採唯讀模式，不提供編輯或刪除。

## 2. Requirements (User Story)

- **As a** 正在檢視間隔複習批改結果的語言學習者
- **I want** 以顏色快速區分每題評級，並可直接打開該題的完整學習內容
- **So that** 我能迅速略過已熟悉項目，並立即重看忘記或困難項目的內容

## 3. Confirmed Product Rules

### 3.1 Rating color

- 批改結果區依「目前選中的評級」著色，不固定依 AI 原始建議。
- 初次顯示時目前選中評級等於 AI 建議；使用者覆寫 radio 後，顏色必須立即更新。
- 色彩對應固定為：
  - 忘記 `forgotten`：紅色；
  - 困難 `hard`：橘色；
  - 順利 `good`：藍綠色；
  - 簡單 `easy`：綠色。
- 顏色只作為快速辨識輔助；AI 建議文字、目前 checked radio 與四級中文標籤全部保留。
- 色彩只標示逐題批改結果區，不改變題目原文、答案輸入區或整頁背景。

### 3.2 Learning item detail availability

- 作答階段不得顯示「查看學習項目」，避免提前揭露完整釋義及例句。
- AI 完成整份試卷批改後，每一題都顯示入口，不依忘記／困難／順利／簡單篩選。
- 入口對 reviewing 階段的所有題目可用；使用者修改評級後仍可開啟同一項目。
- 開啟詳情不改變答案、AI 回饋、表達建議、目前評級、複習歷史或排程。

### 3.3 Read-only shared detail

- 詳情在目前畫面中央以置中 modal 顯示，視覺、Markdown 渲染、發音與複習排程內容
  與生詞庫的**學習項目詳情**一致。
- 從複習試卷開啟時為唯讀：不顯示編輯、刪除、儲存或移到垃圾桶操作。
- 點擊關閉按鈕、按 Escape 或點擊 modal 外部可關閉；關閉後焦點回到原
  「查看學習項目」按鈕。
- 開關詳情不得收合試卷、重新生成、重新批改、捲回頁首或清除目前評級選擇。
- 生詞庫原有的可編輯詳情維持原行為，不因共用元件而失去編輯、刪除或確認能力。

## 4. Acceptance Criteria

- **Scenario 1：AI 建議評級決定初始顏色**
  - **Given** AI 已完成批改並為四題分別建議忘記、困難、順利與簡單
  - **When** 使用者查看批改結果
  - **Then** 四題結果區依序使用紅、橘、藍綠與綠色樣式
  - **And** 每題仍顯示 AI 建議文字及 checked radio

- **Scenario 2：覆寫評級立即改變顏色**
  - **Given** 一題 AI 建議為簡單且目前呈現綠色
  - **When** 使用者把該題改選為困難
  - **Then** 同一題結果區立即改為橘色
  - **And** AI 原始建議仍顯示為簡單
  - **And** 最終 checked radio 為困難

- **Scenario 3：不只依靠顏色**
  - **Given** 任一已批改題目
  - **When** 結果區依評級著色
  - **Then** DOM 同時具有可辨識的評級狀態或文字
  - **And** 四級選項仍可由鍵盤及輔助技術操作

- **Scenario 4：作答前不揭露詳情**
  - **Given** 複習試卷正在作答且尚未提交
  - **When** 題目顯示
  - **Then** 不出現「查看學習項目」按鈕

- **Scenario 5：批改後所有題目都有詳情入口**
  - **Given** AI 已批改整份試卷
  - **When** 使用者檢視忘記、困難、順利或簡單題
  - **Then** 每題都顯示對應的「查看學習項目」按鈕

- **Scenario 6：置中開啟相同學習內容**
  - **Given** 一題已顯示詳情入口
  - **When** 使用者按下「查看學習項目」
  - **Then** 以置中 modal 顯示該題 item id 對應的最新學習項目
  - **And** 顯示類型、CEFR、標題、語義與完整 Markdown
  - **And** 顯示發音操作、複習排程及精簡歷史

- **Scenario 7：複習頁詳情為唯讀**
  - **Given** 學習項目詳情是從未確認的複習試卷開啟
  - **When** modal 顯示
  - **Then** 不顯示編輯、刪除、儲存或移到垃圾桶操作
  - **And** 不呼叫任何 learning mutation API

- **Scenario 8：三種關閉方式及焦點回復**
  - **Given** 複習頁已開啟學習項目詳情
  - **When** 使用者分別使用關閉按鈕、Escape 或點擊 backdrop
  - **Then** modal 關閉
  - **And** 焦點回到觸發該 modal 的「查看學習項目」按鈕

- **Scenario 9：關閉後保留試卷狀態**
  - **Given** 使用者已修改一題評級並開啟學習項目詳情
  - **When** 使用者關閉詳情
  - **Then** 原題答案、AI 回饋、表達建議及覆寫評級全部保留
  - **And** 結果區維持覆寫後的顏色
  - **And** 不重新呼叫生成或批改

- **Scenario 10：詳情載入失敗不破壞試卷**
  - **Given** learning item 查詢失敗
  - **When** 使用者按下「查看學習項目」
  - **Then** 在複習工作區顯示可理解的錯誤
  - **And** 試卷、答案、批改結果及評級仍完整保留

- **Scenario 11：生詞庫詳情維持可編輯**
  - **Given** 使用者從生詞庫開啟同一個學習項目
  - **When** 共用詳情 modal 顯示
  - **Then** 原有編輯與刪除操作仍可用
  - **And** 既有儲存、刪除確認、Escape 及焦點回復行為不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 四級初始顏色 | 四題 AI 評級各不相同 | 顯示 reviewing | feedback 分別有 forgotten／hard／good／easy 狀態與對應樣式 | Critical |
| TC2 | 覆寫後變色 | easy 題為綠色 | 改選 hard | 同一 feedback 立即變橘；AI label 仍 easy；hard checked | Critical |
| TC3 | 非純色彩訊號 | 任一已批改題 | 檢查結果區 | 評級文字、radio 與可存取狀態保留 | Critical |
| TC4 | 作答時隱藏入口 | 尚未提交試卷 | 顯示 answering | 無「查看學習項目」 | Critical |
| TC5 | 全部評級都有入口 | 四題批改完成 | 顯示 reviewing | 每題各有一個對應 item 的詳情按鈕 | Critical |
| TC6 | 開啟正確項目 | q1 對應 item-1 | 點擊詳情 | learning API 以 item-1 查詢；modal 顯示完整內容 | Critical |
| TC7 | 唯讀詳情 | 從 review 開啟 modal | 檢查操作 | 有內容、發音、排程；無編輯／刪除／儲存 | Critical |
| TC8 | 關閉按鈕 | modal 已開啟 | 點擊關閉 | modal 關閉；焦點回 trigger | High |
| TC9 | Escape 關閉 | modal 已開啟 | 按 Escape | modal 關閉；焦點回 trigger | High |
| TC10 | Backdrop 關閉 | modal 已開啟 | 點擊外部 | modal 關閉；焦點回 trigger | High |
| TC11 | 保留複習狀態 | 覆寫 rating 並開啟 modal | 關閉 | 答案、grade、rating、顏色保留；generate／grade 不重跑 | Critical |
| TC12 | 查詢失敗 | learning getItem reject | 點擊詳情 | 顯示錯誤；試卷仍可確認 | High |
| TC13 | 生詞庫回歸 | 從 library 開啟 modal | 編輯或刪除 | 原行為與確認流程維持 | Critical |

## 6. Implementation Notes

- 把目前內嵌於 `LearningLibraryWorkspace.tsx` 的 `LearningItemDialog` 與安全 Markdown
  renderer 抽成可共用元件。元件以明確 mode 或 capability props 區分：
  - 生詞庫：editable，保留 update／trash／delete confirmation；
  - 間隔複習：read-only，只顯示內容、發音、排程與歷史。
- `SpacedReviewWorkspace` 新增受限的 `LearningDesktopApi` dependency，由 `App` 傳入
  既有 `desktopLearning()`；點擊詳情時以受信任 question `itemId` 呼叫 `getItem()`。
  複習排程仍沿用既有 `ReviewDesktopApi.getItemDetail()`。
- 結果區以 `finalRatings[questionId] ?? result.rating` 得到目前選中的評級，透過
  `data-rating` 或等價 class 驅動 CSS。不得複製另一份與 radio 不同步的 color state。
- CSS 為四級結果定義清楚但不刺眼的 border、background 與文字色；必須維持足夠
  對比，且不可移除 legend／radio 等非色彩訊號。
- 詳情只在 grade 已存在的 reviewing／尚未完成確認畫面提供。作答中的 paper question
  不得因 summary 已含 `markdownContent` 而提前渲染詳情入口。
- Modal 開啟狀態屬於 `SpacedReviewWorkspace` 的顯示 state，不改變 review phase。
  關閉 modal 不應重新載入 summary、paper 或 grade。
- 若共用元件抽取時發現生詞庫 modal 與 workspace mutation state 過度耦合，先以
  capability props 保留現有行為，不在本功能中重寫 learning domain API。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/LearningItemDialog.tsx`（新增或等價共用元件）
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/learning-library.md`
- `documents/modules/spaced-review.md`
- `CONTEXT.md`

## 8. Assumptions and Non-goals

### Assumptions

- 「用不同顏色標記 AI 結果」指逐題 feedback panel，而不是整個題目卡或頁面背景。
- 「跟單字頁面一樣」指共用相同的**學習項目詳情** modal、內容渲染及關閉互動；
  複習頁透過 read-only capability 刻意不提供 mutation。
- 「解完題後」指整份複習試卷已由 AI 批改並進入 reviewing，而不是單題 textarea
  一填完就解鎖。

### Non-goals

- 不在作答前或 AI 批改進行中提供完整學習內容。
- 不允許在未確認複習回合中編輯、刪除或移動學習項目。
- 不新增評級、改變 AI rubric、FSRS、排程確認或複習歷史。
- 不以顏色自動收合、隱藏或跳過簡單題；使用者仍控制捲動與確認。
- 不把 modal 改為新頁面、側欄或另一個 AI 對話。
- 不重新設計生詞庫詳情的內容、編輯表單或垃圾桶流程。

## 9. Implementation Record

### Status

Implemented on 2026-07-25.

### Implementation Summary

- 每題結果區以 `finalRatings[questionId] ?? result.rating` 作為單一目前評級來源，
  透過 `data-rating` 呈現 forgotten 紅、hard 橘、good 藍綠、easy 綠；改選 radio
  會立即換色，AI 原始建議及可存取中文評級狀態保持不變。
- `LearningLibraryWorkspace` 既有 `LearningItemDialog` 成為共用元件，新增明確
  `readOnly` capability；生詞庫仍可編輯與刪除，複習頁只呈現安全 Markdown、發音、
  複習排程與精簡歷史。
- `SpacedReviewWorkspace` 只在 grade 存在時為每題顯示「查看學習項目」，以受信任
  `question.itemId` 呼叫 `LearningDesktopApi.getItem()`；作答階段不顯示入口。
- Modal 關閉、Escape 與 backdrop 都會關閉詳情並將焦點還給觸發按鈕；開關詳情不
  改變 review phase、答案、回饋或評級，查詢失敗也保留可確認的試卷。
- `App` 將既有 learning capability 傳給常駐的複習工作區，沒有新增 IPC、資料庫
  schema 或 learning mutation 路徑。

### Test Coverage

- TC1／TC3／TC5：四題 Renderer test 驗證 forgotten／hard／good／easy 的
  `data-rating`、checked radio 與全部結果狀態。
- TC2／TC11：單題 test 驗證 easy→hard 即時換色、AI 建議仍為簡單、答案與 grade
  保留且 generate／grade 不重跑。
- TC4：同一 test 在 answering 階段驗證無「查看學習項目」。
- TC6／TC7：驗證 item-1 查詢、完整 Markdown、排程 region、唯讀操作與沒有
  update／trash 呼叫。
- TC8／TC9／TC10：驗證關閉按鈕、Escape、backdrop 與每次焦點回復。
- TC12：驗證 getItem 失敗顯示 alert，rating 與確認按鈕仍可用。
- TC13：`learning-library-workspace.test.tsx` 與完整 regression suite 驗證生詞庫的
  編輯、刪除確認、Escape、backdrop 及安全 Markdown 行為不變。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- 既有 `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- 既有 `apps/desktop/src/renderer/App.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/implements/F33-color-review-results-and-open-learning-item-detail.md`
- `documents/modules/learning-library.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| AI 建議評級決定初始顏色 | Pass | four-rating Renderer test；CSS data-rating selectors |
| 覆寫評級立即改變顏色 | Pass | easy→hard test |
| 不只依靠顏色 | Pass | accessible result label、legend、checked radios |
| 作答前不揭露詳情 | Pass | answering negative assertion |
| 批改後所有題目都有詳情入口 | Pass | result-scoped unconditional action when learning API exists |
| 置中開啟相同學習內容 | Pass | shared dialog Markdown／pronunciation／schedule test |
| 複習頁詳情為唯讀 | Pass | no edit／delete and no mutations |
| 三種關閉方式及焦點回復 | Pass | close／Escape／backdrop sequence |
| 關閉後保留試卷狀態 | Pass | answer、rating、AI label、call-count assertions |
| 詳情載入失敗不破壞試卷 | Pass | load-failure test |
| 生詞庫詳情維持可編輯 | Pass | learning-library regression suite |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `marks all four AI ratings with distinct result states` |
| TC2 | Pass | `colors the current rating...` |
| TC3 | Pass | accessible name、legend and radio assertions |
| TC4 | Pass | answering-stage negative button assertion |
| TC5 | Pass | result-scoped detail action and four-rating test |
| TC6 | Pass | item-1 API call and dialog content assertions |
| TC7 | Pass | read-only action／mutation assertions |
| TC8 | Pass | close-button sequence |
| TC9 | Pass | Escape sequence |
| TC10 | Pass | backdrop sequence |
| TC11 | Pass | state and call-count assertions |
| TC12 | Pass | `keeps the graded paper intact when...cannot load` |
| TC13 | Pass | full learning-library workspace regression tests |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/learning-library-workspace.test.tsx src/renderer/App.test.tsx
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/learning-library-workspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

1. 紅燈如預期顯示 review feedback 沒有評級狀態，且 reviewing 畫面沒有詳情入口。
2. 沿用並匯出既有 `LearningItemDialog`，以 capability prop 保留生詞庫行為，比複製
   第二份 Markdown／發音／排程 UI 更能確保兩處內容一致。
3. `learningApi` 在 `SpacedReviewWorkspace` 保持可選，讓沒有 learning capability 的
   測試或降級環境仍可批改與確認；正式 App 同時具備 review 與 learning API 時，
   reviewing 階段每題都顯示入口。
4. 顏色直接衍生自 radio 使用的相同 `finalRatings`，不建立第二份同步 state。
5. 詳情查詢失敗沿用 workspace error region；不清除 grade，所以使用者仍可確認。
6. 本次最小抽取未暴露新的資料層耦合；共用 dialog 仍位於 Renderer 檔案內，若未來
   第三個工作區也需要使用，再考慮獨立檔案重構。

### Deferred Items

- 不在作答前、AI 批改中或回合完成後提供詳情入口。
- 不允許未確認複習回合修改或刪除學習項目。
- 不自動收合或跳過 easy 題；顏色只幫助快速辨識。

### Notes

完成通知未寄送：`documents/ddd-email-notify.md` 的 From／To 仍是未配置占位符。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC5 新增評級色彩與入口可用性的 failing tests。
2. 依 TC6–TC12 新增唯讀 modal、焦點回復、狀態保留及失敗邊界 failing tests。
3. 依 TC13 保留生詞庫 editable modal 回歸測試。
4. 以最小 refactor 抽出共用 detail component，再完成 rating-driven styles。
5. 執行 focused tests、完整 desktop tests、專案 typecheck、desktop build 與
   `git diff --check`。
6. 更新 Implementation Record、spaced-review 與 learning-library module documents。
