---
author: Codex
date: 2026-08-19
title: 統一學習項目例句輔助說明格式
uuid: 61db83d7-7901-4b94-92b9-43133f5f9220
version: 1.1.0
status: implemented
---

# Feature Specification - 統一學習項目例句輔助說明格式

## 1. Feature Overview

目前 AI 建立與編修的**學習項目**雖然都有三至五句例句契約，卻只規定講解語言與
學習項目語言不同時提供翻譯，沒有規定同語言時如何解釋例句，也沒有固定每句例句的
Markdown 外形。因此部分項目有 `In other words` 類的解釋，部分只有翻譯或只有例句，
縮排與標籤也可能不同。

本功能新增統一的**例句輔助說明**：每一句例句之後固定只有一行輔助內容。當講解語言
與學習項目語言相同時，該行使用更簡單的同語言換句話說；當兩者不同時，該行使用講解
語言翻譯例句。兩種模式共用相同的編號、縮排與粗體標籤位置，避免同時顯示翻譯與改寫。

新格式套用於新建立的學習項目，以及日後經 **AI 輔助編修**產生的完整草稿。既有生詞庫
資料不批次改寫；人工 Markdown 編修仍保留自由度。

## 2. Requirements (User Story)

- **As a** 使用 VocabReader 理解單字與片語用法的學習者
- **I want** 每一句學習項目例句都有位置與功能一致的輔助說明
- **So that** 我能依講解語言設定，透過簡單改寫或母語翻譯理解目標詞在句中的意思

## 3. Confirmed Product Rules

### 3.1 固定例句外形

- `markdownContent` 的 `## Examples` 小節仍包含三至五句自然、完整且符合目標語義的
  例句，例句本體使用學習項目語言。
- 每句使用有序清單，目標詞或片語以粗體標示，下一行使用縮排子項目提供一行
  **例句輔助說明**。
- 輔助說明使用粗體標籤；標籤使用講解語言，但位置、層級與每句一行的結構固定。
- 不在同一句下同時產生換句話說與翻譯，也不把文法分析、搭配講解或第二份字典定義
  塞入該行。

### 3.2 講解語言為原文

- 每筆草稿仍逐筆依目標標題判斷原文講解語言。
- 輔助說明以同一語言重新表達完整例句，並把目標詞在該語境中的意思換成較簡單、直接
  的說法。
- 改寫必須保留原句語義，不得只是重複原句、重複目標詞或貼上孤立的字典定義。
- 例如英文標籤使用 `In other words:`；其他原文語言使用相應的自然標籤。

### 3.3 講解語言為固定其他語言

- 例句本體仍使用學習項目語言，不因設定為使用者母語而改變。
- 每句輔助說明改為講解語言的自然翻譯，並清楚反映目標詞在該句中的語義。
- 翻譯行就是該句唯一的例句輔助說明，不再另外附同語言改寫。
- 標籤使用講解語言，例如繁體中文使用 `翻譯：`。

### 3.4 AI 編修與相容性

- AI 輔助編修每次都回傳完整 Markdown；有效編修草稿必須把完整 Examples 小節正規化為
  新格式，即使使用者本輪只要求調整其他內容。
- 編修流程沿用從目前 Markdown 推定出的**學習內容主要語言**，並以項目的
  **學習項目語言**判斷兩者是否相同。
- 既有學習項目不執行啟動時、升級時或背景批次改寫。
- 人工 Markdown 儲存、資料備份與還原、資料庫 schema、既有複習排程及歷史均不改變。

## 4. Acceptance Criteria

- **Scenario 1：原文講解產生簡單改寫**
  - **Given** 英文學習項目使用原文英文講解
  - **When** AI 建立三至五句英文例句
  - **Then** 每句下一行都有英文 `In other words:` 輔助說明
  - **And** 輔助說明以更簡單英文保留整句語義並解開目標詞意思
  - **And** 不產生重複翻譯

- **Scenario 2：母語講解產生翻譯**
  - **Given** 英文學習項目使用繁體中文講解
  - **When** AI 建立三至五句英文例句
  - **Then** 每句下一行都有繁體中文 `翻譯：` 輔助說明
  - **And** 不另外產生 `In other words` 改寫

- **Scenario 3：格式與語言逐筆一致**
  - **Given** 同一批次包含不同學習項目語言
  - **When** 使用 source 或固定講解語言建立草稿
  - **Then** 每筆依自己的項目語言決定例句本體
  - **And** 每句都使用有序清單、粗體目標詞、縮排子項目及一行粗體標籤

- **Scenario 4：AI 編修正規化完整 Examples**
  - **Given** 一個既有項目的例句缺少輔助說明或格式不同
  - **When** 使用者成功取得任一 AI 編修草稿
  - **Then** AI 保留有用內容並把完整 Examples 小節整理成新格式
  - **And** 使用者明確套用前不寫入正式項目

- **Scenario 5：既有資料不批次改寫**
  - **Given** 生詞庫已有舊格式項目
  - **When** App 升級或開啟生詞庫
  - **Then** 原 Markdown 維持不變
  - **And** 只有新建或日後 AI 編修草稿使用新契約

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 原文英文輔助 | 英文項目、source 講解 | 檢查建立 skill | 要求每句簡單同語言改寫與 `In other words:` | Critical |
| TC2 | 固定繁中輔助 | 英文項目、zh-TW 講解 | 檢查建立 skill | 要求每句唯一的繁中翻譯與本地化標籤 | Critical |
| TC3 | 固定 Markdown 外形 | 任一語言與三至五句例句 | 檢查建立 skill | 有序清單、粗體目標、縮排子項目、粗體標籤 | Critical |
| TC4 | 不重複兩種說明 | 任一建立草稿 | 檢查建立 skill | 每句只有改寫或翻譯其中之一 | High |
| TC5 | AI 編修正規化 | 既有舊格式 Markdown | 檢查編修 skill | 任一成功編修均正規化完整 Examples | Critical |
| TC6 | 編修語言分支 | 項目語言與主要講解語言相同／不同 | 檢查編修 skill | 分別產生簡單改寫／翻譯 | Critical |
| TC7 | 無批次遷移 | 既有 repository 與 schema | 檢查變更範圍及回歸測試 | 無 migration 或背景改寫 | High |

## 6. Implementation Notes

- 主要正確性邊界是 App 內建的 `create-learning-items` 與 `edit-learning-item` skills；兩者
  都應明文定義相同的 Example Support Contract 與固定 Markdown 範本。
- 建立流程已知道所選講解語言及每筆學習項目語言，可直接判斷改寫或翻譯分支。
- 編修 payload 目前只有 `primaryExplanationLanguage`；應加入受 App 信任的
  `learningItemLanguage`，讓 skill 不必從標題、使用者要求或混合語言內容猜測項目語言。
- 保留 Markdown 作為可人工編輯內容，不新增例句資料表或嚴格 parser，避免舊資料、手動
  編修及備份還原被新格式拒絕。
- 模組文件 `learning-item-creation.md` 與 `learning-item-editing.md` 需要同步新契約。

## 7. Assumptions and Non-goals

### Assumptions

- 「母語」由現有固定講解語言設定代表；本功能不新增獨立母語設定。
- AI 依講解語言產生自然本地化標籤，英文與繁體中文分別固定使用
  `In other words:` 與 `翻譯：`。

### Non-goals

- 不批次遷移、重新生成或自動保存既有學習項目。
- 不把例句、改寫或翻譯拆成新的結構化資料庫欄位。
- 不限制使用者人工編輯 Markdown 的格式。
- 不改變例句數量、學習項目語言分類、講解語言設定或複習流程。

## 8. Implementation Record

### Status

Implemented on 2026-08-19.

### Implementation Summary

- `create-learning-items` 現在以固定 `Meaning`、詞性／IPA、`Common collocations`、
  `Examples` Markdown 層級建立內容；每句例句都是有序清單、粗體目標詞與唯一縮排的
  例句輔助說明。
- 講解語言與項目語言相同時產生較簡單的同語言改寫；不同時產生講解語言翻譯，且
  明確禁止同一句同時產生兩者。
- `edit-learning-item` 對每次有效完整草稿套用相同 Examples 正規化契約。
- 編修 Controller 以受信任的 `learningItemLanguage` 加入 bounded payload，讓 AI 能與
  `primaryExplanationLanguage` 做可靠比較。
- 未新增 migration、資料庫欄位或嚴格 Markdown parser；既有項目只在日後 AI 編修時
  取得新格式，人工編輯與備份還原相容性維持不變。

### Test Coverage

- TC1–TC4：`chat-controller.test.ts` 的
  `standardizes one explanation-language-aware support line under every example` 驗證建立
  skill 的固定外形、英文同語言改寫、繁中翻譯與互斥規則。
- TC5–TC6：`learning-item-edit-skill.test.ts` 驗證每次編修正規化完整 Examples、可信項目
  語言、固定子項目格式與語言分支；`learning-item-edit-controller.test.ts` 驗證 payload
  實際包含正式項目的 `learningItemLanguage`。
- TC7：完整測試、型別檢查與 build 通過，且變更未加入 migration、repository mutation
  或 schema 修改。

### Changed Files

#### Production Code

- `.agents/skills/create-learning-items/SKILL.md`
- `.agents/skills/edit-learning-item/SKILL.md`
- `apps/desktop/src/main/learning-item-edit-controller.ts`

#### Test Code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/learning-item-edit-skill.test.ts`
- `apps/desktop/src/main/learning-item-edit-controller.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-item-editing.md`
- `documents/implements/F65-standardize-learning-item-example-support.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 原文講解逐句產生簡單同語言改寫 | Pass | creation skill contract test |
| 固定母語講解逐句產生唯一翻譯 | Pass | creation skill contract test |
| 所有新例句使用統一 Markdown 外形 | Pass | fixed template 與 contract assertions |
| 任一成功 AI 編修正規化完整 Examples | Pass | edit skill contract test |
| 既有資料不批次改寫 | Pass | 無 migration／schema／repository 變更，完整回歸通過 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | creation skill 同語言改寫與 `In other words` assertions |
| TC2 | Pass | creation skill 跨語言翻譯與 `翻譯` assertions |
| TC3 | Pass | creation skill 有序清單、粗體目標與縮排子項目 assertions |
| TC4 | Pass | creation skill paraphrase／translation 互斥 assertion |
| TC5 | Pass | edit skill 完整 Examples 正規化 assertion |
| TC6 | Pass | edit skill 語言分支與 Controller trusted payload assertions |
| TC7 | Pass | 543 tests、typecheck、build、diff check |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts src/main/learning-item-edit-skill.test.ts src/main/learning-item-edit-controller.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

### Hypotheses and Decisions

- 使用 prompt contract 統一 AI 產生內容，但保留 Markdown 的向後相容與人工編輯自由度。
- 首次聚焦紅燈為 3 個預期的缺少契約／payload 失敗；實作後的中間失敗只是文字契約測試
  對 Markdown 換行與已被新需求取代的舊句子過度敏感，調整為驗證相同語義後轉綠。
- 結構標題固定使用英文以維持 Markdown 外形；輔助說明標籤與內容依講解語言本地化。

### Deferred Items

- 既有資料批次遷移依使用者確認不納入本功能。

### Notes

- Production build 只有既有的 renderer chunk-size advisory，不影響成功狀態。
- 未發現需要另開 RXX 的架構問題；現有兩個獨立 App skill 是適合的契約測試接縫。

## Appendix: TDD Implementation Checklist

1. 先以 bundled skill 契約測試覆蓋建立與編修的兩種講解語言分支及固定格式。
2. 讓測試因缺少統一例句輔助說明契約而失敗。
3. 最小修改兩份 skill 與編修 payload。
4. 執行聚焦、相關回歸、型別檢查與建置。
5. 同步 F65、CONTEXT.md 與兩份模組文件。
