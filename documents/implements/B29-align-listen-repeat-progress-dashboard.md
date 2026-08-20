---
author: Codex
date: 2026-08-20
title: 對齊逐句跟讀進度摘要版面
uuid: a268cf40-a94f-449b-bcde-12518538690c
version: 1.1.0
status: implemented
---

# Bug Fix: 對齊逐句跟讀進度摘要版面

## 1. Bug Overview

Listen & Repeat 的今日進度、所有日期累計與最近 30 天活動雖然沿用 Sentence Practice
卡片樣式，但響應式規則只綁定 `sentence-practice` container，未套用於 `listen-repeat`。
寬螢幕上今日卡橫跨整列而留下大量空白，下方兩張卡的欄寬與文字基線也缺乏一致關係；
窄螢幕則沒有對應的摘要區重排規則。

## 2. Fix Objective

- 將三項統計包在具名的 Listen & Repeat 進度摘要區內。
- 寬螢幕採左側今日／累計上下堆疊、右側最近 30 天跨兩列的規整 dashboard。
- 三張卡統一圓角、內距、陰影、標題節奏與最小高度，減少無意義空白。
- 窄螢幕依今日、累計、最近活動順序單欄堆疊；活動日曆改為 10 欄 × 3 列。
- 保留所有數值、日期、progressbar 與 accessible labels。

## 3. Acceptance Criteria

- **Scenario 1：摘要資訊被清楚分組**
  - **Given** Listen & Repeat snapshot 已載入
  - **When** 使用者查看頁首下方
  - **Then** 今日、累計與最近活動位於同一個具名進度摘要區，內容與標籤維持不變
- **Scenario 2：寬螢幕對齊**
  - **Given** Listen & Repeat container 寬度大於 860px
  - **When** dashboard 呈現
  - **Then** 今日與累計等寬上下排列，最近活動位於右側並跨兩列
- **Scenario 3：窄螢幕重排**
  - **Given** container 寬度不大於 860px
  - **When** dashboard 呈現
  - **Then** 三張卡以單欄排列，不產生水平溢出
- **Scenario 4：小尺寸活動格可讀**
  - **Given** container 寬度不大於 620px
  - **When** 30 天活動呈現
  - **Then** 日期格以 10 欄排列成 3 列，header 可垂直排列

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 語意分組 | snapshot ready | render | named summary 包含三張卡 | Critical |
| TC2 | 寬版 grid | container > 860px | CSS 套用 | left stack + right span | High |
| TC3 | 窄版 stack | container ≤ 860px | CSS 套用 | single column, no overflow | High |
| TC4 | 小版 calendar | container ≤ 620px | CSS 套用 | 10 columns × 3 rows | High |

## 5. Implementation Notes

- 新增 Listen & Repeat 專屬的 summary wrapper 與卡片修飾 class，不改寫 Sentence Practice。
- 使用 CSS grid areas 表達 `today / lifetime / activity` 關係。
- 響應式規則使用現有 `@container listen-repeat`，避免再次綁錯 container name。
- CSS layout 以本機瀏覽器在寬版與窄版 viewport 視覺驗證。

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/listen-and-repeat-practice.md`

## 7. Assumptions and Non-goals

- 不改變每日逐句跟讀目標、跟讀完成活動量或日期強度級別的計算。
- 不新增圖表 library、tooltip、動畫或可點擊日期。
- 不調整練習素材、片段卡、錄音流程或 Sentence Practice 頁面。

## 8. Implementation Record

### Status

Implemented on 2026-08-20.

### Implementation Summary

- 將今日進度、所有日期累計與最近 30 天活動包入具名
  `Listen and repeat progress summary` region。
- 寬版 dashboard 使用 grid areas：今日與累計在等寬左欄上下排列，最近活動在右欄跨兩列。
- 卡片 gap 對齊其他練習頁的 14px；摘要頂部 margin 14px、卡片內距縮為 18–22px，
  摘要至後續素材／練習區縮為 18px。
- 860px 以下改為單欄；620px 以下今日卡也改為單欄、活動 header 垂直排列，日期格為
  10 欄 × 3 列。
- 所有統計值、日期、progressbar 與原有 accessible labels 維持不變。

### Test Coverage

- TC1：`shows the daily goal, all-time total, and accessible 30-day activity` 驗證具名摘要 region
  同時包含今日、累計與最近活動三個既有具名 section。
- TC2–TC4：以本機瀏覽器實際套用 production CSS 驗證 1400px 寬版與 600px 窄版；窄版量測
  `clientWidth = scrollWidth = 600`、summary 單欄、activity 10 欄。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`

#### Documentation

- `documents/implements/B29-align-listen-repeat-progress-dashboard.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 摘要資訊被清楚分組 | Pass | named summary region component test |
| 寬螢幕對齊 | Pass | 1400px browser visual verification |
| 窄螢幕重排且無溢出 | Pass | 600px clientWidth／scrollWidth equality |
| 小尺寸活動格可讀 | Pass | 600px computed activity grid = 10 columns |

### Test Scenario Verification

| Test scenario ID | Status | Automated／visual basis |
|---|---|---|
| TC1 | Pass | Testing Library named-region assertions |
| TC2 | Pass | wide production-CSS browser screenshot |
| TC3 | Pass | narrow production-CSS browser screenshot + width metrics |
| TC4 | Pass | computed 10-column activity grid |

### Commands Executed

```bash
# Expected red: named progress summary region was absent
npm test -w @reader/desktop -- src/renderer/ListenRepeatWorkspace.test.tsx -t \
  "shows the daily goal, all-time total, and accessible 30-day activity"

# Target green: 1/1 passed
npm test -w @reader/desktop -- src/renderer/ListenRepeatWorkspace.test.tsx -t \
  "shows the daily goal, all-time total, and accessible 30-day activity"

# Related component regression: 16/16 passed
npm test -w @reader/desktop -- src/renderer/ListenRepeatWorkspace.test.tsx

# Full regression: Server 3/3、Desktop 550/550
npm test

# Server and Desktop type checks passed
npm run typecheck

# Server and Desktop production builds passed; existing Vite chunk-size advisory only
npm run build

# Whitespace and temporary-preview cleanup checks passed
git diff --check
test ! -e apps/desktop/src/renderer/ui-preview.html
```

### Hypotheses and Decisions

- 根因是共用視覺 class 與 container query scope 不一致，而非統計 DOM 或資料錯誤；因此新增
  Listen & Repeat 專屬 layout class，不改動 Sentence Practice。
- 使用者要求更緊湊後，card gap 採既有 14px rhythm，內距與 dashboard 前後距離同步縮短，
  不以負 margin 或固定高度壓縮內容。

### Deferred Items

None.

### Notes

- 本次只補上清楚的 layout ownership，未發現需要另開 RXX 的架構問題。
- 臨時視覺預覽已在驗證完成後移除。
- 未寄送 DDD 完成通知：雖有 Gmail connector，但本次未驗證登入身分是否等於設定寄件者，
  且使用者未明確授權對外傳送本次摘要；結果記錄於 `documents/ddd-email-notify.md` 的 L046。

## Appendix: TDD Fix Workflow

1. 先新增具名摘要區與三張卡關係的失敗測試。
2. 建立最小 DOM 分組與專屬 grid styles。
3. 執行 component 測試與完整回歸。
4. 在本機瀏覽器驗證寬、窄版畫面並同步文件。
