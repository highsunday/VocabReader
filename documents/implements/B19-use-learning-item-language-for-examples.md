---
author: Codex
date: 2026-08-10
title: 讓學習項目例句使用項目語言
uuid: 9bbf90d0f1224e6885d98440f340365f
version: 1.1.0
status: implemented
---

# Bug Fix: 讓學習項目例句使用項目語言

## 1. Bug Overview

`create-learning-items` 目前將每張草稿的三至五句例句固定要求為英文。當使用者為
日文或繁體中文學習項目選擇「原文語言」時，釋義與例句翻譯會使用項目語言，但
例句本體仍為英文。因此日文項目無法展示目標詞在自然日文語境中的用法。

## 2. Root Cause

- `.agents/skills/create-learning-items/SKILL.md` 明文要求 `complete English examples`。
- **講解語言**與**學習項目語言**已分開建模，但舊例句契約仍假設所有學習項目都是英文。
- Main Process 直接打包該 skill；Renderer 與 artifact schema 沒有把日文例句轉為英文的
  後處理。

## 3. Fix Objective

- 每句例句本體使用該筆**學習項目語言**：英文項目使用英文，日文項目使用日文，
  繁體中文項目使用繁體中文，其他語言項目使用可靠判定的目標語言。
- **講解語言**只決定釋義、學習說明與例句翻譯的語言。
- 講解語言與學習項目語言不同時，每句例句後提供講解語言翻譯；兩者相同時，
  不產生重複的同語言翻譯。

## 4. Acceptance Criteria

- **Scenario 1：日文項目的原文例句**
  - **Given** 學習項目語言為日文，講解語言為原文語言
  - **When** AI 輔助建立學習項目草稿
  - **Then** 例句本體是自然日文，不產生英文例句或重複日文翻譯

- **Scenario 2：項目語言與固定講解語言不同**
  - **Given** 學習項目語言為日文，講解語言為繁體中文或英文
  - **When** AI 輔助建立學習項目草稿
  - **Then** 例句本體是日文，其後翻譯使用選定的講解語言

- **Scenario 3：英文項目不回歸**
  - **Given** 學習項目語言為英文
  - **When** AI 輔助建立學習項目草稿
  - **Then** 例句本體仍為自然、完整的英文句子

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 例句語言契約 | bundled creation skill | 檢查 Draft Contract | 要求例句使用每筆學習項目語言 | Critical |
| TC2 | 不再固定英文 | bundled creation skill | 檢查 Draft Contract | 不存在 `complete English examples` | Critical |
| TC3 | 同語言翻譯去重 | 講解語言與項目語言相同 | 檢查 language contract | 明確禁止重複翻譯 | High |
| TC4 | 現有建立流程回歸 | 已有 creation controller tests | 執行聚焦測試 | routing、草稿、去重與提交測試通過 | High |

## 6. Implementation Notes

- 最小修正點是 `.agents/skills/create-learning-items/SKILL.md`；不需要變更 IPC、artifact schema、
  持久化或 Renderer。
- 保持三至五句、自然、完整且符合目標語義的例句契約。
- 同步 `CONTEXT.md` 與 `documents/modules/learning-item-creation.md`，移除學習項目固定英文例句的舊規則。

## 7. Assumptions and Non-goals

### Assumptions

- 學習項目標題與目標語義足以讓 AI 判斷自然例句所需的語言。
- `language: other` 仍由 AI 依標題與語義判定具體目標語言。

### Non-goals

- 不修改已建立學習項目的既有 Markdown 內容。
- 不新增例句語言設定。
- 不變更學習項目語言分類、語義去重或提交邊界。

## 8. Implementation Record

### Status

Implemented on 2026-08-10.

### Implementation Summary

- `create-learning-items` 現在要求每句例句使用該筆學習項目語言，不再固定英文。
- 只在講解語言與學習項目語言不同時，才要求每句例句後附上翻譯。
- 例句必須在自然語境中展示目標語義，不得只定義、拼寫、翻譯或討論標題。
- 本次只修改 bundled skill 與契約文件；IPC、artifact schema、持久化與 Renderer 未變更。

### Test Coverage

- TC1／TC2／TC3：`chat-controller.test.ts` 新增
  `uses each learning item's language for examples instead of forcing English`，直接驗證
  bundled skill 的項目語言例句、同語言翻譯去重與移除固定英文契約。
- TC4：完整 `chat-controller.test.ts` 62 項通過；專案完整測試 494 項通過。

### Changed Files

#### Production Contract

- `.agents/skills/create-learning-items/SKILL.md`

#### Test Code

- `apps/desktop/src/main/chat-controller.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B06-use-explanation-language-for-learning-cards.md`
- `documents/implements/B19-use-learning-item-language-for-examples.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 日文項目使用自然日文例句，原文講解不重複翻譯 | Pass | bundled skill 項目語言與同語言去重 assertions |
| 固定講解語言不改變例句本體的項目語言 | Pass | skill 將 example language 明確設為 independent of explanation language |
| 英文項目仍使用英文例句 | Pass | skill 明確列出 `English items use English examples` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 新增 bundled skill 契約測試 |
| TC2 | Pass | 新增測試拒絕 `complete English examples` |
| TC3 | Pass | 新增同語言翻譯去重 assertion |
| TC4 | Pass | `chat-controller.test.ts` 62/62 與 root test 494/494 |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts -t "uses each learning item's language for examples"
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

### Hypotheses and Decisions

- 已確認根因是 bundled skill 的 `complete English examples`；新增契約測試在修正前可穩定重現。
- UI 文案語意不是直接根因；「原文語言」已逐筆依 target title 判定講解語言。
- artifact schema 與 Renderer 只驗證、保存與呈現 Markdown，沒有強制英文例句。
- Main Process 直接打包 repo skill；production build 通過，不需要額外 runtime 快取處理。

### Deferred Items

- 既有草稿與已提交學習項目不自動重新產生；需由使用者重新建立或使用現有編修流程調整。

### Notes

- production build 只出現既有的 renderer chunk-size advisory，不影響建置成功。
- 契約修正有現成、直接的 bundled skill 測試切點，未發現需要另開 RXX 的架構問題。

## Appendix: TDD Fix Workflow

1. 新增 bundled skill 例句語言契約測試並確認紅燈。
2. 修正 creation skill 的語言與 Draft Contract。
3. 執行聚焦與相關回歸測試。
4. 同步 BXX、module document 與 `CONTEXT.md`。
