---
author: Codex
date: 2026-09-12
title: 新卡進入學習即計數，既有學習不受新卡設定影響
version: 1.0.0
status: implemented
---

# Bug Fix: 新卡進入學習即計數，既有學習不受新卡設定影響

## 1. Bug Overview

每日新卡設為 20 時，今日計數只在初學完成、下次排程移到隔天後增加，因此尚在
學習中的卡片會讓系統持續補入新卡。另一方面，新卡上限改成 0 會隱藏既有初學
路徑，改成 1 又重新出現，造成今日可學習數大幅跳動。

本次以使用者 2026-09-12 明確描述的預期行為作為修正依據，取代 B15 的新卡完成
額度規則；到期複習完成額度與 FSRS 排程計算維持原規則。

## 2. Fix Objective

- 新卡第一次確認評級、建立排程時即計入當日本地日期的新卡數，所有評級一致。
- 同日重練、隔日完成初學均不重複增加新卡數；重啟沿用既有確認事件重建。
- 每日新卡剩餘名額只扣今日首次開始的卡數；達限就不再選入未開始卡片。
- 已在學習中的初學卡不受新卡額度或零值影響，抵達精確到期時間後仍優先選入。
- 試卷摘要將已開始的學習中卡片明確標示為 learning，不算成 new items。

## 3. Acceptance Criteria

- **AC1** Given 上限 20、14 張初學完成與 6 張今日首次進入學習中，When 查摘要，
  Then 今日新卡為 20、剩餘為 0、不再引入新卡。
- **AC2** Given 26 張已到期學習中卡與 3 張其他到期卡，When 將新卡上限在
  0／1／20 之間切換，Then 26 張學習中卡維持可用、優先順序與生詞庫分類不變。
- **AC3** Given 同一卡已首次確認，When 同日重練、隔日重練或完成初學，Then
  只在首次確認當日計一次新卡；跨日本日額度重新計算。
- **AC4** Given 既有事件與儲存設定，When 重開資料庫或反覆讀取摘要，Then
  計數相同，單純預覽／出題不新增確認事件或消耗額度。
- **AC5** Given 新卡與學習中卡同時入卷，When 顯示摘要與設定，Then 畫面分別
  說明新卡開始數、學習中數與到期完成數，零值說明不暗示暫停既有初學。

## 4. Test Scenarios

| ID | Given / When | Then | Priority |
|---|---|---|---|
| TC1 | 14 張 easy + 6 張 forgotten，20 上限 | 今日新卡 20，不補剩餘 backlog | Critical |
| TC2 | 首次 forgotten / hard / good / easy | 各計入新卡一次 | Critical |
| TC3 | 26 張已到期初學卡 + 3 張到期卡，切換 0/1/20 | 學習中仍 26、總可用 29、分類與順序不變 | Critical |
| TC4 | 同日再次 good 並完成初學 | 新卡數仍 1，完成活動另行保留 | High |
| TC5 | 昨日開始卡跨日至今日完成、今日另開始一張新卡 | 今日只計今日首次開始者 | Critical |
| TC6 | 尚未再次到期、抵達到期、重新開啟資料庫 | 排程與計數持續一致，不提前出題 | High |
| TC7 | 混合 learning / due / new 的首頁 | 三類呈現正確，設定與今日進度文案一致 | High |

## 5. Implementation Notes

- 從最早的已確認事件判定首次開始日期，不新增資料庫欄位、不改寫歷史。
- 保留初學／到期的內部路徑分類供 FSRS 與完成活動統計使用；對外 queue 的
  `reviewKind` 增加 `learning`，讓已開始的卡不再被畫面稱為新卡。
- 設定儲存鍵與摘要欄位名稱保留相容；`reviewedNewTodayCount` 表示今日首次開始數。
- 30 天活動圖仍表達已完成次數，與新卡引入額度各自有明確語義。
- 新卡設為 0 不擋既有初學路徑；到期複習設為 0 的既有行為不在此變更範圍。

## 6. Affected Modules and Non-goals

影響 learning-library-service、review-contracts、SpacedReviewWorkspace、App 設定，
及對應測試、CONTEXT.md、spaced-review 模組文件。不變更 AI 出題、FSRS 間隔、
試卷生命週期、資料格式或既有卡片排程；既有超額卡片繼續學習，不倒退為新卡。

## 7. Implementation Record

### Status

Implemented on 2026-09-12.

### Implementation Summary

- `reviewProgress()` 將今日首次確認數 `startedNewToday` 與初學完成活動分開計算。
  額度和 `reviewedNewTodayCount` 使用首次確認數，初學成功與否不影響扣額度時點。
- `getReviewSummary()` 只對未建立排程的新卡套用新卡額度；既有初學路徑即使新卡
  設定為 0，抵達 `due_at` 後仍優先入卷。
- `ReviewQueueItem.reviewKind` 增加 `learning`，首頁分開呈現三種來源；今日進度
  改為 New items started／Due reviews completed，設定改為 Daily new-item limit。
- 使用既有 SQLite 事件重建今日進度，無 schema migration 或使用者資料重寫。
- 同步 CONTEXT.md、spaced-review 與 learning-library 模組文件。CONTEXT 原先
  提到的「今日新項目加量」在程式中尚未實作，保留為明確標示的規畫項目。

### Test Coverage and Acceptance

| Scenario | Acceptance | Result | Automated evidence |
|---|---|---|---|
| TC1 | AC1 | Pass | `stops introducing new items once twenty have started, including six still learning`；14 完成 + 6 初學計為 20，額度 0，活動完成數仍 14 |
| TC2 | AC1 / AC4 | Pass | `counts a new item immediately after its first %s confirmation and after reopening`；四種評級各計一次，重啟摘要相同 |
| TC3 | AC2 | Pass | `keeps twenty-six learning items available when the new-item limit changes to zero or one`；0/1/20 均有 26 learning + 3 due 可用，Library studying 仍 26 |
| TC4 | AC3 | Pass | `keeps a same-day retry in its new learning path until it reaches a later date`；首次與完成初學後今日新卡數都為 1 |
| TC5 | AC3 | Pass | `does not charge today's new-item capacity for a learning path started yesterday`；昨日卡今日完成不計新卡，今日新卡首次確認才計一次 |
| TC6 | AC4 | Pass | 四評級重啟測試、昨日路徑測試與 `prioritizes a same-day new learning item once its exact due time arrives`；到期前不提前出題 |
| TC7 | AC5 | Pass | `describes learning cards separately from new items in the next paper`、今日進度測試與 App 設定保存／更新摘要測試 |

### Changed Files

- Production: `learning-library-service.ts`、`review-contracts.ts`、
  `SpacedReviewWorkspace.tsx`、`App.tsx`。
- Tests: `learning-library-service.test.ts`、`SpacedReviewWorkspace.test.tsx`、
  `App.test.tsx`。
- Documentation: 本 B45、`CONTEXT.md`、`documents/modules/spaced-review.md`、
  `documents/modules/learning-library.md`。

### Verification Commands and Results

```bash
npm test -w @reader/desktop -- src/main/learning-library-service.test.ts -t 'twenty|counts a new item immediately|does not charge|same-day retry'
npm test -w @reader/desktop -- src/renderer/SpacedReviewWorkspace.test.tsx -t 'started new items|describes learning'
npm test -w @reader/desktop -- src/main/learning-library-service.test.ts src/main/spaced-review-controller.test.ts src/main/spaced-review-ipc.test.ts src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/App.test.tsx
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

- Red：service 7 個測試失敗、1 個 easy 案例原本通過；20 張開始卻只計 14，且
  新卡設 0 時 26 張學習中被排除，總可用僅 3。Renderer 2 個測試重現舊標示。
- Green：完整 desktop **64 個檔案、622 個測試全部通過**，包含本次回歸情境。
- TypeScript 與 production build 通過；build 有既有單一 chunk 大於 500 kB 提醒。
- 一次聚焦組合執行中，未修改的朗讀 auth-failure 測試找不到選取朗讀按鈕。
  同一版本單獨重跑與後續完整測試均通過，未修改測試斷言或朗讀程式。

### Hypotheses and Decisions

1. 新卡直到初學完成才計數：只更動首次確認計數後，20 張與四種評級的 5 個
   聚焦測試即通過，驗證計數時點是持續補卡的原因。
2. 零值被套用在既有初學路徑：解除這個條件後，26 張學習中與跨日零值測試通過。
3. 畫面將初學重練稱為新卡：新增 queue 的 learning 類別並更新呈現後，混合三類
   的 Renderer 測試通過；內部初學／到期路徑仍用於活動與複習狀態。

### Limitations and Follow-up

- 今日總可用卡片仍受精確到期時間影響，不保證等於 Library 的全部 Studying。
- 降低設定前已開始的卡或已生成試卷保留，今日實際首次開始數可能大於新設定值；
  不回退既有進度，之後不再自動引入未開始卡片。
- 現有初學／到期完成活動繼續保留，不將歷史完成次數改成首次開始數。
- 未更改到期複習設定為 0 的規則，也未實作臨時加量操作。
- 未新增架構層或測試接縫；既有事件重建及 service／Renderer 測試足以覆蓋修正。
- 已更新專案程式碼並建置；執行中的桌面 Main process 需重啟才載入新邏輯。
- 本次未發送外部完成通知郵件；使用者未授權寄信。
