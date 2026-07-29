---
author: Codex
date: 2026-07-29
title: 在間隔複習頁顯示穩定掌握成果與成長趨勢
uuid: 64c395bf-de6e-4c4a-843a-9a700e3f5177
version: 1.1.0
status: implemented
---

# Feature Specification - 顯示穩定掌握成果與成長趨勢

## 1. Feature Overview

目前間隔複習頁以今日完成數、30 天複習活動與首次完成學習的項目數呈現進度，主要
回答「做了多少」，無法回答使用者目前能穩定記住多少內容。本功能以既有複習歷史
與 FSRS 狀態建立可升可降的**穩定掌握**成果，在頁面顯示目前數量、近 30 天淨成長、
正在鞏固數、近期回想成功率，以及固定 90 天的簡潔成長折線。

介面維持單一主要數字、一條趨勢線與兩個次要數字；不使用裝飾性發光、複雜漸層、
預測或密集篩選器。既有 30 天活動方格保留為獨立的「複習活動」區塊，與新增的記憶
成果區分工；今日完成數繼續保留，但兩者的視覺權重都低於成果。

## 2. Requirements (User Story)

- **As a** 使用間隔複習記憶單字與片語的使用者
- **I want** 一眼看到目前穩定掌握多少學習項目，以及最近是否持續成長
- **So that** 我能以記憶成果而不是複習次數判斷學習是否有效

## 3. Confirmed Product Rules

### 3.1 穩定掌握

一個使用中的學習項目同時符合以下條件時，屬於**穩定掌握**：

- 至少在兩個不同的本地日曆日獲得 `good` 或 `easy` 最終評級。
- 目前 FSRS stability 至少為 30 天。
- 最近一次最終評級為 `good` 或 `easy`。
- 在統計時間點的 FSRS 預估可回想率至少為 85%。

有複習排程但不符合以上條件的使用中學習項目屬於**正在鞏固**。完全沒有複習排程的
新學習項目不屬於任一類。垃圾桶項目不納入目前或歷史成果。

### 3.2 成長與回想成功率

- 目前穩定掌握數可隨新項目達標而增加，也可因時間經過或忘記而下降。
- 近 30 天淨成長是目前穩定掌握數減去 30 個本地日曆日前的數量，可以為正、零或負。
- 90 天趨勢每天依該日結束前最後一筆複習狀態及當時預估可回想率重建；今天只計算到
  查詢時間，不使用尚未發生的當日時間。
- 近 30 天回想成功率只計算非首次複習事件，以 `good` 或 `easy` 為成功；沒有符合
  事件時顯示 `—`，不得顯示誤導性的 0%。

### 3.3 介面層級

- 成果區只顯示「穩定掌握」主數字、近 30 天淨成長、「正在鞏固」及「30 天回想
  成功率」。
- 固定呈現 90 天折線，不提供時間範圍、卡片類型或粒度控制器。
- 圖表以文字、數字與形狀共同傳達資訊，不能只依賴顏色；需提供可存取名稱與
  起訖成果摘要。
- 既有 30 天活動方格保留為第二張簡潔卡片，只回答完成複習數與活動日期；不得將
  活動量標示為穩定掌握或記憶成長。
- 今日新項目與到期複習完成數／目標保留在成果區下方，視覺權重低於成果。
- 頁面在有可用複習項目時仍保留清楚的開始複習操作。

## 4. Acceptance Criteria

- **Scenario 1：嚴格區分首次完成與穩定掌握**
  - **Given** 一個項目只完成首次學習，另一個項目在不同日期成功回想兩次且符合
    stability 與可回想率門檻
  - **When** 系統建立間隔複習摘要
  - **Then** 只有第二個項目計入穩定掌握
  - **And** 第一個項目計入正在鞏固

- **Scenario 2：忘記或衰退會降低成果**
  - **Given** 一個項目曾符合穩定掌握
  - **When** 最近評級成為 `forgotten`，或統計時間的預估可回想率低於門檻
  - **Then** 該項目不再計入穩定掌握
  - **And** 90 天趨勢與 30 天淨成長可以下降

- **Scenario 3：顯示簡潔成果摘要**
  - **Given** 摘要包含穩定掌握、正在鞏固、淨成長與回想成功率
  - **When** 使用者進入間隔複習首頁或完成一個回合
  - **Then** 頁面以穩定掌握為唯一大型主數字
  - **And** 只顯示兩個次要成果數字及一條 90 天趨勢
  - **And** 另以較低視覺權重保留 30 天複習活動方格
  - **And** 不顯示每日平均或獨立的活動天數 KPI 卡

- **Scenario 4：沒有複習歷史**
  - **Given** 生詞庫沒有任何已確認複習事件
  - **When** 使用者進入間隔複習頁
  - **Then** 穩定掌握與正在鞏固顯示 0
  - **And** 30 天回想成功率顯示 `—`
  - **And** 成長圖顯示可理解的零值狀態

- **Scenario 5：確認回合後立即刷新**
  - **Given** 使用者確認一份使項目進入或離開穩定掌握的複習試卷
  - **When** 確認交易成功
  - **Then** 完成頁保留
  - **And** 成果摘要與趨勢使用重新查詢後的最新資料

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 首次完成不算掌握 | 一筆首次 Good/Easy 事件 | 查詢摘要 | solid 0、building 1 | Critical |
| TC2 | 多日成功且記憶穩定 | 兩個日期成功、stability ≥ 30、retrievability ≥ 85% | 查詢摘要 | solid 1 | Critical |
| TC3 | Forgotten 退回鞏固 | 項目達標後最新評級 Forgotten | 查詢摘要 | solid 減少、building 增加 | Critical |
| TC4 | 時間衰退 | 過去達標項目在查詢日低於 85% | 查詢摘要 | 不再屬於 solid | High |
| TC5 | 90 天序列 | 期間內有進入與離開 solid 的事件 | 查詢摘要 | 每日點與 30 天淨值正確 | Critical |
| TC6 | 回想成功率 | 30 天內首次與後續複習混合 | 查詢摘要 | 排除首次，只計後續 Good/Easy 比例 | High |
| TC7 | 成果 UI | 摘要有正、負或零淨成長 | 顯示首頁 | 大數字、兩項次要數字、折線與文字摘要正確 | Critical |
| TC8 | 空資料 UI | 沒有事件 | 顯示首頁 | 0、0、— 與零值圖表正常 | High |
| TC9 | 完成後刷新 | 確認回合成功且摘要改變 | 顯示完成頁 | 成果採第二次摘要且完成頁不消失 | High |
| TC10 | 活動與成果分工 | 同時有 90 天成果與 30 天完成事件 | 顯示首頁 | 成果折線與活動方格分成兩個具名區塊，文案不混用 | High |

## 6. Implementation Notes

- 沿用 append-only `learning_review_events` 的 `reviewed_at`、`final_rating` 與
  `next_card_json` 重建每日狀態；不新增 schema 或快照表。
- 使用既有 `ts-fsrs` scheduler 取得指定時間的 retrievability，避免自行複製遺忘曲線。
- `ReviewLearningProgress` 改為成果語意，提供 90 天 daily solid count、目前 solid／
  building、30 天淨成長、30 天回想成功率與樣本數。
- 新增獨立 `ReviewActivity` 摘要，保留 30 天新項目／到期複習完成數與總完成數；
  Renderer 不從成果 daily 資料反推活動。
- Renderer 以原生 SVG 畫單一折線／面積，不新增圖表依賴。
- 每日完成數仍由 `ReviewSummary` 既有欄位提供，不混入成果型別。

## 7. Assumptions, Open Questions and Non-goals

### Assumptions

- 使用者同意以「穩定掌握」而不是永久「學會」描述結果。
- 30 天 stability、兩個成功日期及 85% retrievability 是第一版固定產品門檻。
- 目前只需單一整體成果，不按書籍、CEFR、單字／片語分組。

### Open Questions

- 無。

### Non-goals

- 不提供學習時數、連續天數、預測完成日或 deck completion。
- 不提供時間範圍、圖表粒度、學習項目類型篩選或目標線。
- 不提供成果卡點擊後的生詞庫篩選。
- 不新增自訂 mastery 門檻、FSRS optimizer 或目標記憶率設定。
- 不顯示每日平均或把 active days 做成獨立 KPI 卡；活動天數只可作為活動卡摘要。

## 8. Affected Modules and Files

- `CONTEXT.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/spaced-review.md`

## 9. Implementation Record

### Status

Implemented on 2026-07-29.

### Implementation Summary

- `LocalLearningLibrary` 依 active 學習項目的完整複習事件，在查詢時間重建穩定掌握
  與正在鞏固；判定使用兩個不同本地成功日期、30 天 stability、最新 Good／Easy 與
  85% retrievability 四個條件。
- `ReviewLearningProgress` 改為 90 天結果型資料，包含目前 solid／building、30 天淨
  成長、30 天回想成功率、樣本數及每日 solid count；Forgotten 或時間衰退可使折線
  與淨成長下降。
- 依使用者補充要求，既有完成量沒有被成果卡取代；新增獨立 `ReviewActivity` 保留
  30 天新項目／到期複習完成方格，讓成果與投入以兩張具名卡片分工。
- Renderer 以原生 SVG 顯示單一 90 天成果折線；主卡只保留 Solid recall、Building、
  30-day recall 與淨成長。活動卡只顯示完成總數、active days 摘要及 30 個日期方格。
- 無歷史時顯示 solid 0、building 0、recall `—`；確認回合後沿用既有第二次摘要查詢
  同步刷新成果、活動與今日狀態，完成頁保持不變。
- 視覺 QA 發現窄版工作區使用無效的 CSS width expression，改為
  `calc(100% - 28px)` 加 `max-width`，避免成果卡在 760px 以下維持 920px 寬度。

### Test Coverage

- TC1／TC2／TC5／TC6：`builds a 90-day solid-recall trend instead of treating first completion as mastery`
- TC3／TC4／TC5／TC6：`moves forgotten and decayed items out of solid recall`
- TC7／TC10：`shows a simple, accessible 90-day solid-recall outcome`
- TC8／TC10：`renders a safe empty solid-recall outcome`
- TC9：`refreshes the simplified plan after confirming a review paper`

### Changed Files

#### Production code

- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/implements/F42-show-solid-recall-growth.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 首次完成與穩定掌握嚴格分離 | Pass | repository 兩日期成功／首次事件情境 |
| Forgotten 或衰退降低成果 | Pass | repository Forgotten 與 180 天衰退情境 |
| 簡潔成果主次層級並保留獨立活動 | Pass | Renderer 成果／活動具名 region 測試與視覺 QA |
| 空歷史顯示 0、0、— 與零線 | Pass | Renderer empty outcome 測試 |
| 確認回合後立即刷新 | Pass | Renderer 完整確認流程第二次摘要 assertion |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 首次 Easy 只進入 building |
| TC2 | Pass | 兩個日期 Easy 且 stability／retrievability 達標進入 solid |
| TC3 | Pass | 第三次 Forgotten 後 solid 減少、building 增加 |
| TC4 | Pass | 180 天後 retrievability 低於門檻退出 solid |
| TC5 | Pass | 90 點 daily series、正成長與負成長 assertion |
| TC6 | Pass | 排除首次事件後的 100%／0% 回想成功率 |
| TC7 | Pass | 大型 solid、兩個次要數字、SVG 與無多餘 KPI |
| TC8 | Pass | 空資料成果與活動卡 |
| TC9 | Pass | 確認後成果由第二份摘要更新 |
| TC10 | Pass | Learning growth 與 Review activity 為兩個獨立 region |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/learning-library-service.test.ts src/renderer/SpacedReviewWorkspace.test.tsx -t "solid-recall|solid recall|forgotten and decayed|empty solid"
npm run test -w @reader/desktop -- src/main/learning-library-service.test.ts src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/App.test.tsx ../main/spaced-review-controller.test.ts
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm run test -w @reader/desktop
git diff --check
```

結果：desktop 全套 29 個 test files、322 個 tests 全數通過；desktop typecheck、
production build 與 diff whitespace check 通過。

### Hypotheses and Decisions

- 紅燈先確認 repository 仍回傳 30 天首次完成累計，Renderer 仍把活動方格當成
  learning growth；失敗原因符合新功能尚未實作，沒有進入 diagnose。
- 使用者在初版綠燈後補充「原本與新增區塊都要保留，因為資訊不同」；規格因此改為
  兩個 typed payload 與兩張卡片，而不是把活動資料塞回成果 daily series。
- 回想成功率排除首次事件，避免第一次接觸也被解讀成長期記憶成功。
- 不建立 snapshot table 或 schema migration；目前資料量可由 append-only events
  重建，並保留日後優化自由。
- 不建立 ADR：門檻屬於可調整產品規則，UI 與 typed summary 也可向後演進，沒有
  難以逆轉的架構決策。

### Deferred Items

- 不提供成果或活動時間範圍切換、書籍／CEFR／單字片語篩選或點擊後清單。
- 資料量大幅成長後，90 天每日重建可能需要 materialized snapshot 或增量索引；
  第一版先保持 schema 簡單並以測試鎖定語意。

### Notes

- 成果卡使用 `Solid recall`，不宣稱永久 mastered。
- 活動卡刻意寫明 practice 與 memory results 分離，避免使用者把方格深淺當成熟練度。

## Appendix: TDD Implementation Checklist

1. 新增 repository 紅燈測試，覆蓋首次完成、跨日成功、Forgotten、時間衰退、每日序列
   與回想成功率。
2. 新增 Renderer 紅燈測試，覆蓋成果主次層級、活動分工、零資料、負成長及完成後刷新。
3. 最小化擴充 review typed boundary 與 repository 計算。
4. 以簡潔原生 SVG 取代活動熱圖成果卡。
5. 執行相關測試、typecheck、build，回填本文件並同步模組文件。
