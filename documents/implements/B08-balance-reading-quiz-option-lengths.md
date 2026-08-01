---
author: Codex
date: 2026-07-24
title: 消除閱讀測驗以選項長度洩漏正解
uuid: c777a4d7aa6c43d1a327652b691c6702
version: 1.1.0
status: implemented
---

# Bug Fix Specification - 消除閱讀測驗的選項長度線索

## 1. Bug Overview

區段練習的選擇題常把正確答案寫得比三個錯誤選項更長、更完整或更具體。使用者即使
沒有理解閱讀區段，也能反覆用「選字最多的選項」猜中答案，降低閱讀理解測驗的效度。

## 2. Root Cause

`practice-reading-comprehension` skill 只要求錯誤選項合理、不得設陷阱，沒有要求同題
四個選項在長度、句型、資訊密度與具體程度上保持可比，也沒有要求出題後檢查正解是否
因表面形式而突出。模型因此傾向把完整限定條件都放入正解，並把干擾選項寫成較短片段。

## 3. Fix Objective

讓每題四個選項在不犧牲自然度與語意正確性的前提下，具有相近的表面形式與資訊量。
使用者不應能只靠選項最長、最完整或最具體等非閱讀線索穩定辨識正解。

## 4. Acceptance Criteria

- **Scenario 1：同題選項沒有長度捷徑**
  - **Given** skill 根據閱讀區段建立四選一題目
  - **When** 正解需要完整限定條件或較多資訊
  - **Then** 干擾選項也使用可比的長度與資訊密度
  - **And** 正解不得持續成為唯一明顯最長的選項

- **Scenario 2：選項使用平行形式**
  - **Given** 同一題有 A、B、C、D 四個選項
  - **When** skill 完成選項草稿
  - **Then** 四個選項使用可比的文法結構、抽象層級、具體程度與限定語氣
  - **And** 不得出現三個簡短片段搭配一個完整細緻正解的固定模式

- **Scenario 3：出題後執行偏誤檢查**
  - **Given** 一份尚未呈現給使用者的完整測驗
  - **When** skill 檢查每題是否存在非內容線索
  - **Then** 只靠長度、細節量、措辭完整度或格式突出即可猜答案的選項會被改寫
  - **And** 改寫不得洩漏答案、製造文字陷阱或破壞單一最佳答案

- **Scenario 4：題型與互動契約維持不變**
  - **Given** 既有區段練習流程
  - **When** 使用者建立及提交測驗
  - **Then** CEFR、8–12 題選擇題、1–3 題問答題、語言、artifact 與批改契約維持相容

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 反長度線索 rubric | 現有 quiz skill | 檢查出題規則 | 明定相近長度、資訊密度及正解不可因最長而突出 | Critical |
| TC2 | 平行選項 rubric | 現有 quiz skill | 檢查選項規則 | 明定文法結構、抽象層級、具體程度與限定語氣可比 | Critical |
| TC3 | 出題後偏誤檢查 | 完整選擇題草稿 | 呈現測驗前自我檢查 | 發現表面線索時改寫且維持單一最佳答案 | Critical |
| TC4 | Skill 與既有契約回歸 | 更新後 skill | 執行驗證及既有測試 | skill 格式、題數、語言、artifact 與批改測試通過 | High |

## 6. Implementation Notes

- 在 `practice-reading-comprehension` 的選擇題生成規則加入選項平衡要求。
- 「相近長度」是避免明顯突出，不要求機械式等字數；若內容自然需要長度差異，應改寫
  其他選項使整組仍具可比資訊量。
- 呈現測驗前逐題做一次 answer-cue audit；不得以把正解一律縮成最短選項取代平衡。
- 不變更 Renderer artifact schema、Main Process、題數、題型、語言或批改流程。

## 7. Implementation Record

### Status

Implemented.

### Diagnose Evidence

- 使用者觀察：經常只選字最多的選項就會正確。
- Skill 現況只寫明 `Make incorrect options plausible`，沒有選項表面形式平衡或
  answer-cue audit。

### Implementation Summary

- `practice-reading-comprehension` 現在要求同題四個選項具有大致相近的長度與資訊
  密度，並使用可比的文法結構、抽象層級、具體程度及限定語氣。
- Skill 明確禁止「三個簡短片段加一個完整細緻正解」，也禁止用把正解固定變成最短
  選項的方式反向製造新線索。
- 呈現試卷前，skill 逐題檢查正解是否因最長、最詳細或限定最完整而突出；若有線索，
  改寫整組選項並保留單一明確最佳答案。
- 題數、題型、語言、quiz／grade artifact schema、Renderer 與批改流程均未變更。

### Test Coverage

- TC1、TC2：`defines the adaptive quiz, grading and localized response contract` 驗證
  相近長度、資訊密度與平行形式的 rubric。
- TC3：同一測試驗證呈現前 answer-cue audit 與最長／最詳細／限定最完整線索。
- TC4：skill validation 通過；相關 Main tests 54/54；完整 Server 3/3、Desktop
  191/191，共 194 項通過；TypeScript typecheck 與 production build 成功。

### Changed Files

#### Production code

- `.agents/skills/practice-reading-comprehension/SKILL.md`

#### Test code

- `apps/desktop/src/main/reading-comprehension-skill.test.ts`

#### Documents

- `CONTEXT.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/implements/B08-balance-reading-quiz-option-lengths.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 同題選項沒有長度捷徑 | Pass | TC1 skill rubric |
| 選項使用平行形式 | Pass | TC2 skill rubric |
| 出題後執行偏誤檢查 | Pass | TC3 skill rubric |
| 題型與互動契約維持不變 | Pass | TC4 相關與完整回歸 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | option length and information density assertions |
| TC2 | Pass | parallel structure and specificity assertion |
| TC3 | Pass | pre-presentation answer-cue audit assertions |
| TC4 | Pass | skill validation、54 項相關測試、194 項完整測試、typecheck、build |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/reading-comprehension-skill.test.ts
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-reading-comprehension
npm run test -w @reader/desktop -- src/main/reading-comprehension-skill.test.ts src/main/bundled-skill.test.ts src/main/chat-controller.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

Red phase 先觀察到 skill rubric 1 項失敗，原因為舊 skill 缺少選項平衡規則；green
phase 的目標測試 2/2、相關測試 54/54、完整測試 194/194 全部通過。

### Hypotheses and Decisions

目前根因明確，不需要進入跨 session 的 debug trace。修正採 skill rubric 約束，因選項
內容由 Codex AI 執行層產生，Renderer 只負責驗證與呈現 artifact。

「相近長度」刻意採語意規則而非固定字數比例：嚴格計數容易產生不自然選項，也可能
把正解一律壓成最短而形成另一種捷徑。平衡對象因此同時包含長度、資訊密度、句型、
抽象層級、具體程度與限定語氣。

### Deferred Items

- 不新增機械式字數限制或 Renderer 端長度驗證，避免錯誤拒絕自然且有效的題目。

### Architectural Observation

本次缺陷位於 AI 出題 rubric，既有 skill 安裝、artifact 驗證與 Renderer 呈現邊界
足以承接修正，沒有暴露需要另開 RXX 的責任耦合或測試接縫問題。

## Appendix: TDD Fix Workflow

1. 先新增會因缺少選項平衡與偏誤檢查規則而失敗的 skill rubric 測試。
2. 以最小 skill 變更使測試通過。
3. 執行 skill validation、相關測試與專案回歸。
4. 同步本文件與閱讀測驗模組文件。
