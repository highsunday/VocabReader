---
author: Codex
date: 2026-08-25
title: 在學習項目中保留 AI 判斷有價值的詳細說明
uuid: 7c2912ed-99e0-4ab1-bc61-eb7f848ccb8c
version: 1.0.0
status: approved
---

# Feature Specification - 保留學習項目的詳細說明

## 1. Feature Overview

目前**區段解析**可以依標記的實際困難加入 Context、Grammar、Synonyms、Common
mistakes、Pronunciation tip 等選擇性說明；但使用者接受邀請、建立**學習項目草稿**時，
`create-learning-items` 只要求簡明意思、詞性／發音、常用搭配與例句。即使同一個 AI
對話已經產生有價值的詳細解析，建立流程仍可能把內容重新壓縮成較短版本。

本功能讓 AI 在固定核心內容之外，自主保留與學習項目**目標語義**直接相關、值得長期
複習的詳細說明。從區段解析進入建立流程時，AI 應優先沿用該次解析中的相關資訊；直接
新增學習項目時，也可依語義與常見學習困難產生必要的補充小節。系統不逐字複製整份右側
解析，也不把其他標記、整句分析或重複複習表混入單一學習項目。

## 2. Requirements (User Story)

- **As a** 從閱讀解析建立學習項目的 VocabReader 使用者
- **I want** 學習項目保留 AI 判斷值得複習的語境、用法與辨析細節
- **So that** 之後打開學習項目時，不會只剩比原始區段解析明顯更精簡的說明

## 3. Confirmed Product Rules

### 3.1 固定核心內容

每筆新草稿仍必須包含：

- `Meaning` 中先給出可快速複習的簡明意思；
- 詞性或片語類型，以及適用時的 IPA；
- `Common collocations`；
- 三至五句符合既有 **Example Support** 契約的例句。

詳細內容是核心內容的補充，不得以長篇說明取代快速可讀的簡明意思。

### 3.2 AI 選擇性詳細說明

AI 判斷對理解或未來正確使用有長期價值時，可以加入一個或多個補充小節，例如：

- Context and nuance；
- Grammar and usage；
- Synonyms and distinctions；
- Common mistakes；
- Pronunciation notes。

只加入實際有幫助的小節，不機械輸出完整清單、不為了增加長度而重複 Meaning、搭配詞
或例句。內容不設固定字數上限；長短由目標語義的學習價值決定。

### 3.3 區段解析銜接

- 使用者接受**區段解析**後的加入生詞庫邀請時，建立 skill 可以使用同一 AI 對話中
  該次解析與有限閱讀區段。
- 草稿優先保留該次解析中與該標題及目標語義直接相關的語境、語氣、辨析、易錯點、
  發音或用法說明。
- 不逐字複製整份解析；應整理成可獨立閱讀、避免重複的學習內容。
- 不加入其他標記的說明、只適用於完整句子的句法分析、整段摘要、複習表或來源 metadata。
- 若既有解析沒有額外且值得長期保留的內容，維持只有固定核心內容的精簡草稿是合法結果。

### 3.4 既有邊界維持不變

- 草稿仍是唯讀預覽，只有使用者明確提交後才寫入生詞庫。
- 不新增資料庫欄位；詳細說明保存於既有 `markdownContent`。
- 不改變語義去重、工作區語言 gate、CEFR、例句語言、例句輔助說明、提交 recheck、
  交易建立或草稿生命週期。
- 既有學習項目不批次改寫；日後可沿用既有人工或 AI 編修功能補充內容。

## 4. Acceptance Criteria

- **Scenario 1：固定核心內容仍完整**
  - **Given** AI 為單字或片語建立新草稿
  - **When** 產生 `markdownContent`
  - **Then** 仍包含簡明 Meaning、詞性／類型、適用時的 IPA、常用搭配及三至五句例句

- **Scenario 2：有學習價值時加入詳細說明**
  - **Given** 目標語義有重要語境、用法差異、易錯點、同義詞辨析或發音注意事項
  - **When** AI 建立草稿
  - **Then** AI 選擇相關補充小節保存完整說明
  - **And** 不因既有「簡明意思」要求而省略這些有價值資訊

- **Scenario 3：沿用區段解析中的相關細節**
  - **Given** 同一 AI 對話已完成區段解析，且使用者接受加入生詞庫邀請
  - **When** AI 為其中一個單字或片語建立草稿
  - **Then** 優先保留該次解析中與該項目目標語義直接相關的詳細說明
  - **And** 將其整理為可獨立閱讀的學習內容

- **Scenario 4：排除不相關或重複內容**
  - **Given** 區段解析同時包含多個標記、完整句子說明及複習表
  - **When** AI 建立其中一筆學習項目草稿
  - **Then** 不複製其他標記、整句專屬分析、整段摘要、複習表或來源 metadata
  - **And** 不重複核心 Meaning、搭配詞或例句已充分表達的內容

- **Scenario 5：簡單項目保持精簡**
  - **Given** 目標語義沒有值得額外保留的說明
  - **When** AI 建立草稿
  - **Then** 只產生固定核心內容，不機械加入空泛的補充小節

- **Scenario 6：既有建立與提交邊界不變**
  - **Given** 草稿包含選擇性詳細小節
  - **When** App 驗證、預覽及提交草稿
  - **Then** 使用既有 Markdown 欄位與安全渲染流程完成，不需要 schema 或 IPC 契約變更

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 核心內容契約 | 建立 skill | 檢查 Markdown 規則 | Meaning、詞性／IPA、搭配與 3–5 例句仍為必填 | Critical |
| TC2 | 選擇性詳細小節 | 具有長期學習價值的語義資訊 | 檢查建立規則 | 要求 AI 視需要保留語境、用法、辨析、易錯或發音細節 | Critical |
| TC3 | 區段解析銜接 | 同一對話有解析與邀請 | 檢查建立規則 | 明確允許並優先重用與目標語義相關的解析內容 | Critical |
| TC4 | 內容隔離 | 解析含多標記與句子內容 | 檢查排除規則 | 不複製無關標記、整句專屬分析、複習表或來源資料 | Critical |
| TC5 | 不機械加長 | 簡單且無額外資訊的項目 | 檢查建立規則 | 允許只輸出核心內容，禁止填充式小節 | High |
| TC6 | 既有契約回歸 | 詳細 Markdown 草稿 | 執行既有 parser／UI／提交測試 | 不需新增欄位且既有流程通過 | High |

## 6. Implementation Notes

- 主要行為邊界位於 `.agents/skills/create-learning-items/SKILL.md`；以 prompt contract
  決定何時保留詳細內容。
- 同一 Codex AI 對話已保留先前區段解析，建立 turn 不需新增或持久化第二份解析資料。
- 以契約測試固定「允許詳細說明、優先重用解析、只取目標語義相關內容、不得機械
  加長」等關鍵要求；不以 deterministic 測試宣稱 AI 每次用字完全一致。
- 更新 `CONTEXT.md` 的學習項目定義，以及 `learning-item-creation`、
  `annotation-explanation` 模組文件，讓產品語言與目前行為一致。

## 7. Assumptions and Non-goals

### Assumptions

- 使用者所稱「卡片」是正式領域詞彙中的**學習項目**。
- 「完整」表示保留與該項目目標語義相關且值得長期複習的內容，不表示逐字保存 AI
  對話訊息。
- AI 可以依同一對話的先前解析、有限閱讀區段及一般語言知識判斷哪些資訊有長期價值。

### Non-goals

- 不逐字封存右側 AI 回覆或建立解析訊息與學習項目之間的永久引用。
- 不保存完整句子標記的所有文法分析，也不把句子拆成未請求的學習項目。
- 不強制每個項目擁有相同補充小節或相同長度。
- 不批次重寫既有學習項目。
- 不修改學習項目詳情、草稿預覽或間隔複習 UI。

## 8. Module Documentation Impact

需更新：

- `documents/modules/learning-item-creation.md`
- `documents/modules/annotation-explanation.md`

不需要新增模組文件或 ADR；本功能延伸既有 Markdown 內容契約，沒有新的不可逆架構決策。

## 9. Implementation Record

### Status

Implemented on 2026-08-25.

### Implementation Summary

- `create-learning-items` 保留既有簡明 Meaning、詞性／IPA、常用搭配與三至五句例句作為
  固定核心，並新增 Optional Learning Detail Contract。
- AI 可依目標語義的長期學習價值選擇 Context and nuance、Grammar and usage、
  Synonyms and distinctions、Common mistakes 或 Pronunciation notes；不設固定字數上限，
  也不為簡單項目機械加入小節。
- 使用者接受區段解析 invitation 後，建立 turn 可沿用同一 AI 對話的解析與有限閱讀
  區段，優先整理該標題及目標語義的相關細節；明確排除其他標記、整句專屬分析、整段
  摘要、複習表、來源 metadata 與重複內容。
- 選擇性詳細小節仍保存於既有 `markdownContent`，插入 Meaning metadata 與 Common
  collocations 之間；沒有新增 schema、IPC 或 UI。
- 已同步 `CONTEXT.md` 與學習項目建立、區段解析模組文件。

### Test Coverage

- TC1：既有 creation skill 契約測試持續固定 Meaning、詞性／IPA、搭配與 3–5 例句。
- TC2、TC5：新增 `preserves useful target-sense detail without mechanically copying
  annotation analysis`，驗證可選細節種類、長度判斷與禁止機械填充。
- TC3、TC4：新增 `reuses only relevant detail when creation follows an annotation
  invitation`，驗證同一 AI 對話解析的重用與無關內容排除。
- TC6：既有 artifact parser 與草稿 preview 測試確認詳細 Markdown 沿用原契約；完整
  desktop suite、typecheck、build 與 skill validator 通過。

### Changed Files

#### Production code

- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/annotation-explanation.md`
- `documents/implements/F70-preserve-useful-detail-in-learning-items.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 固定核心內容仍完整 | Pass | 既有核心與 Example Support 契約測試，完整 suite 通過 |
| 有學習價值時加入詳細說明 | Pass | Optional Learning Detail Contract 與新增契約測試 |
| 沿用區段解析中的相關細節 | Pass | 同一 AI 對話 invitation 銜接規則與新增契約測試 |
| 排除不相關或重複內容 | Pass | other items／sentence-only／summary／table／metadata 排除斷言 |
| 簡單項目保持精簡 | Pass | 禁止機械小節與 padding 的契約斷言 |
| 既有建立與提交邊界不變 | Pass | artifact／draft preview 回歸、完整 desktop suite、typecheck、build |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 既有 `create-learning-items skill` 核心格式測試 |
| TC2 | Pass | `preserves useful target-sense detail...` |
| TC3 | Pass | `reuses only relevant detail...` |
| TC4 | Pass | 同上，驗證無關內容排除 |
| TC5 | Pass | `preserves useful target-sense detail...` 的 no-padding 斷言 |
| TC6 | Pass | artifact／draft dialog 聚焦測試與完整 desktop suite |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts -t "preserves useful target-sense detail|reuses only relevant detail"
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts
npm run test -w @reader/desktop -- --run src/main/learning-item-artifacts.test.ts src/renderer/learning-item-draft-dialog.test.tsx
npm run test -w @reader/desktop -- --run
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/create-learning-items
git diff --check
```

### Hypotheses and Decisions

- 根因是 creation skill 的內容契約只要求簡明核心，而不是保存或 Renderer 顯示時截斷。
- 同一 Codex AI 對話已包含先前區段解析，因此不建立第二份解析 artifact 或資料庫欄位；
  skill 以受限上下文重用內容即可滿足需求。
- 詳細小節採高自由度選擇，而固定核心與內容排除維持明確 guardrails，兼顧完整性與
  複習時的可掃讀性。
- 契約測試只驗證穩定的行為邊界，不宣稱 deterministic 控制每次 AI 回覆的確切篇幅。

### Deferred Items

- 不批次補寫既有學習項目；使用者仍可透過既有人工或 AI 編修個別補充。
- 不新增解析快照、來源句或學習項目與解析訊息的永久引用。

### Notes

- 完整 desktop 驗證為 58 個 test files、561 個 tests 通過；typecheck、build、skill
  validator 與 `git diff --check` 通過。
- Build 只有既有的 Vite 500 kB chunk-size advisory，與本功能無關。

## Appendix: TDD Implementation Checklist

1. 先新增建立 skill 的詳細內容、區段解析銜接與排除邊界契約測試並確認紅燈。
2. 更新最小 skill 規則，保留既有固定 Markdown 與 Example Support 契約。
3. 更新領域與模組文件。
4. 執行聚焦測試、完整 desktop 測試、typecheck、build、skill validation 與 diff check。
