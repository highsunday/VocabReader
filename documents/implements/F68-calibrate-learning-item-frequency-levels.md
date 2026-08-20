---
author: Codex
date: 2026-08-21
title: 以特定語義常見度校準學習項目難度
uuid: f9326151-37bc-443a-9993-919136d8e136
version: 1.0.0
status: approved
---

# Feature Specification - 校準學習項目常見度級別

## 1. Feature Overview

現有 `create-learning-items` 只要求 AI 為新的**學習項目**回傳 A1–C2，沒有定義
評估基準、特定語義邊界或等級間的校準點。目前 533 個啟用中項目全部是
英文，分布為 A1 1、A2 21、B1 88、B2 289、C1 134、C2 0，顯示判定過度集中
在 B2–C1。

本功能將 A1–C2 明確定義為跨語言共用的**使用頻率難度級別**：AI 以該語言
一般成年使用者在現代日常口語與一般書面內容中，使用該項目**特定語義或用法**
的常見程度來分級。日常高頻用詞較低，只見於罕見、古舊、高度專業或限定文體之語義
較高。

除了改善未來新項目，本次也以一次性、可恢復的維運流程重新評估目前 533 個
啟用中項目。重評只更新 `cefr`，不修改標題、類型、語言、語義、Markdown、
注意事項、狀態、複習歷史或 FSRS 排程。

## 2. Requirements (User Story)

- **As a** VocabReader 使用者
- **I want** AI 依特定語義在目標語言中的實際常見度評估 A1–C2
- **So that** 常見用詞較早引入，罕見或限定用法不會被誤判為基礎級別

## 3. Frequency-level Rubric

- 判斷單位是 `language + canonical title + sense`，不只看字面。同一標題的常見語義
  與罕見語義可有不同級別。
- 參照族群是該語言的一般成年使用者；參照語域是現代日常口語與一般書面內容。
- A1：核心生活、基礎功能詞，在日常互動中極常見。
- A2：常見日常詞或常用語義，一般使用者會頻繁遇到。
- B1：一般會話、新聞、工作或大眾文本中定期出現，但不屬最核心詞彙。
- B2：受過教育的成年使用者可理解，但在日常交流中不常用，或偏正式、書面。
- C1：低頻、精確、文學性、學術性或特定領域用詞，主要出現在進階內容。
- C2：極罕見、古舊、專業度極高、地域／時代限定，或即使受過教育的一般成年
  使用者也很少遇到的語義。
- 詞形、拼寫長度或概念抽象度不能單獨決定級別。在專業領域內常見、但一般語域
  少見的詞仍應為 C1 或 C2。
- 邊界情況應在相鄰級別間比較後選擇最符合者，不因缺少把握而習慣性集中 B2。

## 4. Acceptance Criteria

- **Scenario 1：未來新項目使用完整 rubric**
  - **Given** AI 建立任意支援語言的單字或片語草稿
  - **When** 它產生 `cefr`
  - **Then** 依學習項目語言、標題及特定語義套用第 3 節 rubric
  - **And** 不依請求語言、講解語言或書籍整體難度覆蓋評估

- **Scenario 2：相同標題依語義分級**
  - **Given** 同一標題有一個常見語義及一個罕見語義
  - **When** AI 評估兩個學習項目
  - **Then** 分別依該語義的常見度分級，不強制使用相同級別

- **Scenario 3：跨語言一致性**
  - **Given** 學習項目語言是 `en`、`ja`、`zh-TW` 或 `other`
  - **When** AI 評估常見度
  - **Then** 使用該項目實際目標語言的一般現代語域作為基準

- **Scenario 4：既有啟用項目一次性重評**
  - **Given** 正式資料庫有 533 個啟用中學習項目
  - **When** 以同一 rubric 重新評估全部項目
  - **Then** 每個項目都恰好有一個經驗證的 A1–C2 結果
  - **And** 執行前建立資料庫備份及可審查的重評結果檔

- **Scenario 5：只修改 CEFR**
  - **Given** 一次性重評完成
  - **When** 將結果套用到正式資料庫
  - **Then** 只有啟用中學習項目的 `cefr` 可改變
  - **And** 標題、類型、語言、語義、Markdown、注意事項、狀態、時間、圖片、複習歷史與
    FSRS 排程內容皆與執行前相同

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 建立 skill 含頻率 rubric | 內建 skill | 檢查契約 | 含特定語義、參照語域與 A1–C2 六級定義 | Critical |
| TC2 | 語言邊界 | 任意支援語言 | 檢查契約 | 以學習項目的目標語言為基準 | Critical |
| TC3 | 語義邊界 | 同標題不同 sense | 檢查契約 | 要求逐語義獨立分級 | Critical |
| TC4 | 重評輸入完整 | 533 個 active 項目 | 產生輸入 | id、language、title、sense 全數且不重複 | Critical |
| TC5 | 重評結果驗證 | 分批 AI 輸出 | 驗證結果 | 每個 id 恰好一次、級別合法、無額外 id | Critical |
| TC6 | 只更新 CEFR | 備份及完整快照 | 交易套用結果 | 除 active `cefr` 外的資料不變 | Critical |
| TC7 | 數量與分布報告 | 套用完成 | 比對前後 | 仍有 533 active，輸出變更數與新分布 | High |

## 6. Implementation Notes

- 未來項目的正確性邊界維持在 `.agents/skills/create-learning-items/SKILL.md`；不增加
  新資料庫欄位或 UI。
- 以契約測試固定 rubric 中會改變行為的關鍵語義，不以測試偽裝對 AI 統計準確度
  做出無法驗證的保證。
- 一次性維運流程必須先產生可審查結果，驗證 id 集合與 enum，再用單一 SQLite
  交易寫入。
- 備份檔放在正式資料庫同目錄，使用時間戳檔名，不覆寫既有備份。
- 更新 `cefr` 後不改 `updated_at`，以符合「只改難度欄位」與不擾動使用者編輯時序。

## 7. Assumptions and Non-goals

### Assumptions

- A1–C2 在本產品中作為跨語言頻率難度标籤，不宣稱為各語言官方 CEFR 詞表。
- AI 使用其語言知識進行估計；本次不引入外部詞頻資料庫。
- 執行時的 active 項目集合必須仍與已驗證的 533 個輸入一致；若發生變動則停止寫入。

### Non-goals

- 不新增 App 內永久的「重新評估難度」功能。
- 不修改 trashed 學習項目。
- 不修改學習項目內容、狀態、圖片、歷史或排程。
- 不以使用者個人熟悉度改寫這個常見度級別。
- 不引入線上查詞、詞典 API 或第三方語料庫。

## 8. Implementation Record

### Status

Implemented on 2026-08-21.

### Implementation Summary

- `create-learning-items` 新增跨語言 Frequency-based CEFR Contract，以項目語言、
  canonical title 與特定 sense 判斷現代一般語域的常見度，並完整定義
  A1–C2 六級。
- 新增一次性維運工具，支援匯出受限輸入、移除舊 CEFR 的盲評輸入、分批、
  動態 id schema、全量合併驗證、SQLite 一致性備份、單一交易更新與逐表不變驗證。
- 533 個 active 學習項目均完成 AI 盲評；318 個 CEFR 改變，215 個維持原級別。
- 新分布為 A1 6、A2 65、B1 198、B2 201、C1 62、C2 1。
- 執行後自動驗證只有 active `learning_items.cefr` 發生變化；其他欄位、
  trashed 項目與所有其他資料表完全相同。

### Test Coverage

- TC1–TC3：`chat-controller.test.ts` 驗證內建 skill 含目標語言、特定語義、
  現代一般語域、六級 rubric、邊界比較與禁止 B2 預設集中契約。
- TC4–TC7：維運工具 `self-test` 以暫存 SQLite fixture 驗證匯出、盲評、分批、
  備份、交易更新、非 CEFR 資料不變與分布報告；正式資料另通過 533-id
  全集驗證與套用後逐表比對。

### Changed Files

#### Production code

- `.agents/skills/create-learning-items/SKILL.md`
- `scripts/maintenance/recalibrate-learning-item-levels.mjs`
- `scripts/maintenance/frequency-level-output.schema.json`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/spaced-review.md`
- `documents/implements/F68-calibrate-learning-item-frequency-levels.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 未來新項目使用完整 rubric | Pass | creation skill contract test 64/64 |
| 同標題依特定語義分級 | Pass | sense-specific contract assertion |
| 任意語言依目標語言評估 | Pass | target-language contract assertion |
| 533 個 active 項目一次性重評 | Pass | 11 批盲評結果合併後 533/533 id 驗證 |
| 只修改 CEFR | Pass | 套用後逐表與 learning-item 非 CEFR 欄位比對 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `calibrates CEFR as sense-specific cross-language usage frequency` |
| TC2 | Pass | target-language assertion |
| TC3 | Pass | different-sense assertion |
| TC4 | Pass | export count 533 and unique-id validation |
| TC5 | Pass | dynamic batch schemas and full-set merge validation |
| TC6 | Pass | transactional apply plus backup differential verification |
| TC7 | Pass | generated before/after distribution report |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts
node scripts/maintenance/recalibrate-learning-item-levels.mjs self-test
node scripts/maintenance/recalibrate-learning-item-levels.mjs export <db> <input>
node scripts/maintenance/recalibrate-learning-item-levels.mjs blind <input> <blind-input>
node scripts/maintenance/recalibrate-learning-item-levels.mjs split <blind-input> <directory> 50
node scripts/maintenance/recalibrate-learning-item-levels.mjs schemas <directory>
node scripts/maintenance/recalibrate-learning-item-levels.mjs merge <input> <results> <batch-results...>
node scripts/maintenance/recalibrate-learning-item-levels.mjs apply <db> <input> <results> <backup> <report>
npm test
npm run typecheck
npm run build
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/create-learning-items
git diff --check
```

### Hypotheses and Decisions

- 第一次評估把舊 CEFR 包在 AI 輸入，模型出現沿用舊值後少量覆寫的錨定偏誤。
  該執行在產生可套用結果前已中止；正式重評使用完全移除舊 CEFR 的盲評輸入。
- 首次 11 批盲評中，第 02、04、08 批各有一個 UUID 被 AI 改寫。全集驗證因此正確
  擋下寫入。新增每批動態 id enum schema 後只重跑這三批，再次合併時 533 個 id
  全數且唯一。
- 一次性更新不修改 `updated_at`，以免重排使用者編輯時間；也不觸碰 FSRS
  schedule 與 review events。
- AI 估計仍不是外部語料庫的統計真值，但統一 rubric、盲評與語義邊界消除了
  本次已識別的主要不穩定來源。

### Operational Artifacts

- Backup: `/Users/highsunday/Library/Application Support/@reader/desktop/learning-library/learning-items.before-F68-20260821.sqlite`
- Audit result: `/Users/highsunday/Library/Application Support/@reader/desktop/learning-library/F68-frequency-recalibration-results-20260821.json`
- Verification report: `/Users/highsunday/Library/Application Support/@reader/desktop/learning-library/F68-frequency-recalibration-report-20260821.json`

### Deferred Items

- 未引入獨立詞頻語料庫或外部字典 API。
- 不新增 App 內永久批次重評 UI。

### Notes

- 若需恢復，必須在 App 關閉時使用備份取代正式 SQLite；本次未執行恢復。
- 最終驗證：server 3/3、desktop 551/551 tests 通過；typecheck、build、skill validator、
  maintenance self-test 與 `git diff --check` 通過。Build 只有既有的 Vite chunk-size advisory。
- DDD 完成通知已從經驗證的 `highsunday0630@gmail.com` 寄送至
  `highsunday.project@gmail.com`，並記錄於 communication ledger L047。
