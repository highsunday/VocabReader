---
author: Codex
date: 2026-08-03
title: 讓間隔複習題避免沿用學習項目例句線索
uuid: afcfbab4-c064-4c99-b85f-1c402e1e53c7
version: 1.1.0
status: implemented
---

# Feature Specification - 讓間隔複習題避免沿用學習項目例句線索

## 1. Feature Overview

目前 AI 生成**間隔複習題**時會收到學習項目的完整 Markdown，其中包含三至五句既有
Examples。既有生成規則要求題句自然且能明確呈現目標語義，但沒有說明 Examples 只可
作為理解用法的參考，也沒有要求 AI 避免直接使用或表面改寫它們。結果可能反覆出現
相似的人物、事件、關鍵字與句型，使使用者依賴熟悉的上下文線索，而不是回想目標詞在
新語境中的意思。

本功能強化 `practice-spaced-review` 的 generation prompt：明確說明適度發散的學習
目的，要求 AI 先理解目標語義與典型用法，再把 Examples 視為不得複製或輕微改寫的
參考集合。新題句應在自然、準確且符合典型用法的前提下，改變具體事件、表達視角、
溝通目的或句型，減少固定上下文成為答案提示。

多元性是受語義與自然度約束的柔性要求，不得為了追求完全不同而排除必要語境、常見
搭配或典型領域。本功能不保存歷次複習題句，因此只避免沿用目前學習項目內可見的
Examples，不保證不同複習回合之間永遠不會產生相似句子。

## 2. Requirements (User Story)

- **As a** 使用間隔複習鞏固學習項目的英文學習者
- **I want** 每道新題不要直接使用或表面改寫學習項目中的既有例句
- **So that** 我必須根據目標詞在新語境中的實際意思作答，而不是依賴熟悉的上下文
  關鍵字或句型回想答案

## 3. Acceptance Criteria

- **Scenario 1：說明發散的學習目的**
  - **Given** App 要求 AI 生成一份複習試卷
  - **When** `practice-spaced-review` 執行 generation mode
  - **Then** 生成規則明確說明新語境是為了避免使用者依賴固定人物、事件、關鍵字或
    句型作為記憶提示
  - **And** AI 應讓題句測試目標語義的回想，而不是對既有例句的辨認

- **Scenario 2：禁止複製或表面改寫 Examples**
  - **Given** 學習項目的 Markdown 包含一或多句 Examples
  - **When** AI 為該項目產生間隔複習題
  - **Then** 新題句不得直接複製其中任何一句
  - **And** 不得只替換人物、代名詞、地點、時間、時態或少數同義詞
  - **And** 不得保留相同的具體事件及近似句型骨架後只改動表面文字

- **Scenario 3：產生實質不同但自然的新語境**
  - **Given** Examples 已示範目標語義的一種具體情境
  - **When** AI 產生新題句
  - **Then** AI 應在適合該目標語義時改變具體事件、表達視角、溝通目的或句型
  - **And** 題句仍須自然、完整，並讓指定 `sense` 明確且不揭露答案

- **Scenario 4：自然與典型用法優先**
  - **Given** 目標詞的自然用法依賴特定領域、常見搭配或典型語法結構
  - **When** 發散要求與自然用法可能衝突
  - **Then** AI 可以沿用必要領域、常見搭配或典型語法結構
  - **And** 不得為了刻意不同而產生罕見、不自然或偏離目標語義的句子
  - **And** 語義準確度與自然度優先於情境差異程度

- **Scenario 5：不新增題句歷史**
  - **Given** 使用者生成、提交並確認一份複習試卷
  - **When** App 保存複習事件與排程
  - **Then** 資料庫仍不保存 AI 產生的複習題句
  - **And** 不新增 migration、題句歷史欄位或額外備份資料

- **Scenario 6：既有生成與批改契約保持不變**
  - **Given** 強化後的 generation prompt
  - **When** AI 生成並批改複習試卷
  - **Then** `review-paper` 與 `review-grade` artifact 結構保持不變
  - **And** 題數、目標詞呈現、講解語言、評級、表達建議與 FSRS 更新行為保持不變

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 學習目的 | 讀取 bundled spaced-review skill | 檢查 generation 規則 | 明載避免固定上下文線索及測試新語境回想的原因 | Critical |
| TC2 | 禁止表面改寫 | 讀取 bundled spaced-review skill | 檢查 Examples 比對規則 | 明載不得複製，且人物、地點、時間、時態、同義詞等局部替換仍不合格 | Critical |
| TC3 | 實質情境變化 | 讀取 bundled spaced-review skill | 檢查新題句規則 | 要求適度改變事件、視角、溝通目的或句型 | High |
| TC4 | 自然度優先 | 讀取 bundled spaced-review skill | 檢查優先順序 | 允許必要領域與典型搭配，且自然、準確的目標語義優先 | Critical |
| TC5 | Prompt 仍提供參考內容 | 學習項目含 Markdown Examples | Controller 建立 generation prompt | payload 仍包含完整 `markdownContent`，讓 AI 能識別需避免的原句 | Critical |
| TC6 | 無持久化變更 | 生成及確認試卷 | 檢查 contracts、controller 與資料表 | 不新增題句欄位、migration 或 review event payload | High |
| TC7 | 既有回歸 | prompt 規則完成 | 執行相關 tests、typecheck 與 build | 既有生成、批改、artifact 與桌面程式建置通過 | Critical |

## 5. Implementation Notes

- 在 `.agents/skills/practice-spaced-review/SKILL.md` 的 Generation mode 加入一段
  明確的 context-diversity 規則。規則要先解釋教學目的，再列出禁止的表面改寫方式及
  語義／自然度優先順序。
- 保留 `markdownContent` 在既有 bounded payload 中。AI 必須看得到 Examples，才能把
  它們當作 negative references 逐句比較；不可單純移除 Examples 後宣稱已避重。
- 「實質不同」以具體事件、表達視角、溝通目的或句型至少有合理變化為準，不要求每個
  面向全部不同，也不要求同一份試卷的每題屬於不同領域。
- 測試以 skill contract 的必要語句與優先順序為自動化邊界。AI 文字生成具有非確定性，
  本功能不新增 parser-level 語義相似度判定或自動重試。
- 更新 `documents/modules/spaced-review.md` 與 `documents/modules/skill-management.md`，
  記錄 generation workflow 會把學習項目 Examples 當作需避免複製或表面改寫的參考。

## 6. Assumptions, Non-goals, and Open Questions

### Assumptions

- 學習項目 Markdown 仍遵循既有內容契約並包含足以判斷目標語義與典型用法的資訊。
- 「發散」是協助語義回想的手段，不是要求題句刻意使用罕見語境或冷僻搭配。
- 同一典型領域可以再次出現；只要新題句不是既有 Example 的複製或表面改寫即可。

### Non-goals

- 不保存、顯示、搜尋、備份或匯出歷次 AI 複習題句。
- 不保證不同複習回合之間從不出現相似題句。
- 不新增字串或語義相似度演算法，不在 Main process 拒絕題句，也不自動重新生成。
- 不移除學習項目 Markdown 中的 Examples，也不改變學習項目建立流程。
- 不強迫同一份複習試卷中的每題使用完全不同的領域、文體或語法。
- 不改變複習作答、AI 批改、評級確認、FSRS 排程或複習歷史內容。

### Open Questions

- 無阻擋實作的未決問題。

## 7. Affected Modules and Files

### Production code

- `.agents/skills/practice-spaced-review/SKILL.md`

### Test code

- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`（既有 payload 回歸）

### Documentation

- `documents/implements/F48-diversify-spaced-review-sentences.md`
- `documents/modules/spaced-review.md`
- `documents/modules/skill-management.md`

## 8. Implementation Record

### Status

Implemented on 2026-08-03.

### Implementation Summary

- `practice-spaced-review` 的 generation mode 現在先說明發散的學習目的：避免使用者
  依賴熟悉的人物、事件、關鍵字或句型，而未真正回想目標語義。
- 學習項目 `markdownContent` 內的 Examples 明確成為 negative references；AI 在輸出前
  必須比較新題句與每句 Example，不得直接複製或只替換人物、代名詞、地點、時間、
  時態或少數同義詞。
- 新題句應在適合時改變具體事件、表達視角、溝通目的或句型，但這是柔性方向；目標
  語義、自然度及典型用法優先，必要領域、常見搭配與典型語法結構仍可保留。
- Controller 仍傳送完整 Markdown 供 AI 辨識 Examples；artifact、IPC、資料表、複習
  歷史與 FSRS 流程均未改變，也沒有保存 AI 題句。

### Test Coverage

- TC1–TC4：`spaced-review-skill.test.ts` 驗證學習目的、Examples negative-reference
  規則、表面改寫禁令、實質變化方向及自然度優先順序。
- TC5：`spaced-review-controller.test.ts` 驗證 generation bounded payload 保留完整
  `markdownContent` 與其中的 Examples。
- TC6：既有 contracts、controller 與 SQLite schema 未新增題句欄位或 event payload。
- TC7：Desktop 全套 364 tests、typecheck 與 production build 通過。

### Changed Files

#### Production code

- `.agents/skills/practice-spaced-review/SKILL.md`

#### Test code

- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`

#### Documents

- `documents/implements/F48-diversify-spaced-review-sentences.md`
- `documents/modules/spaced-review.md`
- `documents/modules/skill-management.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 說明發散的學習目的 | Pass | Skill contract test 驗證固定上下文線索與新語境回想說明 |
| 禁止複製或表面改寫 Examples | Pass | Skill contract test 驗證 negative references 與局部替換禁令 |
| 產生實質不同但自然的新語境 | Pass | Skill contract test 驗證事件、視角、目的或句型變化方向 |
| 自然與典型用法優先 | Pass | Skill contract test 驗證必要領域、搭配及語法框架可保留 |
| 不新增題句歷史 | Pass | 無 contracts、repository、schema 或 backup 變更 |
| 既有生成與批改契約保持不變 | Pass | Desktop 全套測試、typecheck 與 production build 通過 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | uses fresh contexts without turning diversity into unnatural usage |
| TC2 | Pass | 同一 skill test 的 negative-reference 與 light-paraphrase assertions |
| TC3 | Pass | 同一 skill test 的 event／perspective／purpose／structure assertion |
| TC4 | Pass | 同一 skill test 的 accuracy／naturalness／typical-usage assertions |
| TC5 | Pass | keeps learning-item examples in the bounded generation payload |
| TC6 | Pass | 既有 ephemeral paper 與 trusted confirmation tests；無 persistence diff |
| TC7 | Pass | Desktop 364/364 tests、typecheck、production build |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts
npm test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts src/main/spaced-review-controller.test.ts
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

### Hypotheses and Decisions

- 已確認原行為的原因是完整 Markdown Examples 會交給 AI，但 generation skill 沒有說明
  它們不可作為題句模板；修正集中在擁有教學規則的 bundled skill，不改動 public API。
- 保留 Examples 在 payload，因為完全移除後 AI 無法主動比對並避開原句。
- 測試初次綠燈因 Markdown 自然換行導致精確字串 assertion 失敗；改以跨空白 regex
  驗證相同語義契約，未降低規則覆蓋範圍。
- 依使用者選擇不保存歷次題句；跨回合多元性仍屬 prompt-level best effort。

### Deferred Items

- 歷次題句保存、跨回合相似度比較、parser-level 拒絕與自動重新生成均明確不實作。

### Known Limitations

- Prompt-level 行為無法提供跨複習回合的絕對不重複保證；這是「不保存題句歷史」決策
  下的已知限制。
