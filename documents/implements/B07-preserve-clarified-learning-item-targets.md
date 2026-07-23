---
author: Codex
date: 2026-07-24
title: 保留新增學習卡片的澄清後目標
uuid: 59f85979c34c467795ce0bf7a92d604b
version: 1.1.0
status: implemented
---

# Bug Fix Specification - 澄清回答被誤當成學習項目標題

## 1. Bug Overview

使用者先在一般對話提到 `apple banana`，再執行「新增學習卡片」但沒有直接提供 targets
時，creation skill 會詢問要加入哪個目標。若使用者回答「都加」，Main Process 目前把
這段回答直接解析成唯一 target `都加`；AI 則能從既有對話理解使用者確認的是
`apple` 與 `banana`，因此產生的兩張草稿被受信任範圍驗證拒絕，畫面顯示
「AI 回傳了未請求的學習項目草稿」。

同一缺陷也會影響拼字修正等澄清流程，例如使用者輸入 `aplle`、確認改成 `apple`
之後，正確拼字的草稿仍可能被當成未請求。

## 2. Root Cause

- creation skill 的澄清問題只有人類可讀文字，沒有把澄清後準備使用的 targets
  以結構化資料交給 App。
- `ChatController.#continuedLearningItemInput()` 在原 request 沒有 targets 時，
  一律把下一則使用者回答按逗號或換行解析為新標題。
- AI 可以從同一對話理解「都加／是」等上下文式回答，但下一個 turn 的 exact-title
  候選查詢與草稿 scope 仍只信任被錯誤解析的回答文字。
- 有多個 assistant message 時，延續邏輯讀取第一個回覆，而不是包含最新澄清附件的
  最後一個已完成回覆。

## 3. Fix Objective

當 creation skill 必須澄清 target 時，回覆附上一個不顯示原始 JSON 的
`learning-item-request` 結構化區塊。使用者下一則回答會延續這組澄清後 targets，
App 先用其完整標題查詢有限候選，再讓 AI 比較語義及產生草稿。

## 4. Acceptance Criteria

- **Scenario 1：上下文式「都加」保留澄清後 targets**
  - **Given** 既有對話提到 `apple`、`banana`，creation request 沒有 targets
  - **And** skill 詢問是否都加入並附上兩個結構化 targets
  - **When** 使用者回答「都加」
  - **Then** App 以 `apple`、`banana` 查詢 exact-title 候選
  - **And** `都加` 只作為澄清回答，不作為卡片標題
  - **And** 兩張合法草稿通過受信任範圍驗證

- **Scenario 2：澄清附件不顯示原始 JSON**
  - **Given** AI 回覆含一個合法 `learning-item-request` fenced block
  - **When** App 解析 assistant message
  - **Then** targets 成為 typed message attachment
  - **And** 對話欄只顯示人類可讀的澄清問題

- **Scenario 3：直接回答目標與語義澄清維持相容**
  - **Given** 原 request 沒有 targets 且 AI 沒有提供澄清後 targets
  - **When** 使用者直接回答 `bank`
  - **Then** App 仍把 `bank` 當成 target
  - **And** 已知 target 的下一則回答仍可附加為 `senseHint`

- **Scenario 4：安全與去重邊界不放寬**
  - **Given** 澄清後 targets 最多 50 筆且使用既有 title／senseHint 契約
  - **When** App 延續 creation turn
  - **Then** 仍先執行 exact-title 候選查詢
  - **And** 最終 draft／existing／trashed 必須落在該 turn 的 targets 與候選範圍

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 解析澄清 targets | 合法 request fenced block | 解析 artifacts | typed attachment；JSON 不顯示 | Critical |
| TC2 | 都加兩個前文目標 | 空 request → apple/banana 澄清 | 回答「都加」 | 查詢兩標題並接受兩張草稿 | Critical |
| TC3 | 直接回答 target | 空 request、無 structured clarification | 回答 `bank` | 仍查詢 `bank` | High |
| TC4 | 已知 target 的 sense 回答 | request 已有 `bank` | 回答語義 | 保留 title 並追加 senseHint | High |
| TC5 | 多訊息回覆 | 同 turn 有多個 assistant messages | 下一則回答 | 使用最後一個已完成澄清附件 | High |
| TC6 | Creation workflow 回歸 | 建立、去重、提交測試 | 完整回歸 | 原有安全驗證全部通過 | High |

## 6. Implementation Notes

- 擴充 `parseLearningItemArtifacts()` 支援單一 `learning-item-request` fenced block，
  targets 沿用 `learningItemInvitationFromUnknown()` 的嚴格驗證。
- 將解析後 request 附在 assistant `ChatMessage.learningItemRequest`；既有 store 已對
  任何 message 驗證並保存這個 typed attachment，不新增資料版本。
- 延續 creation 時選取最後一個已完成 assistant message。若它含非空 structured
  targets，優先使用它們；使用者回答只成為這些 targets 的 `senseHint`。
- structured targets 為空或缺席時，維持把使用者直接回答解析為 title 的 fallback。
- 更新 `create-learning-items` skill：每次詢問 target／拼字／word-or-phrase
  澄清時都輸出一個 request block；純 sense 澄清也保留原 targets。
- 不從人類可讀 AI 文字抽取 targets、不放寬 draft scope 驗證、不略過資料庫候選查詢。

## 7. Implementation Record

### Status

Implemented.

### Diagnose Evidence

- 使用者畫面錯誤：`AI 回傳了未請求的學習項目草稿。`
- 本機保存對話顯示：
  - creation request targets 為 `[]`
  - 下一則「都加」被保存為 targets `[{ "title": "都加" }]`
  - AI 回傳 `apple`、`banana` 後被 scope 驗證拒絕
- Red tests：
  - artifact parser 未移除或解析 `learning-item-request`
  - controller 候選查詢實際收到 `["都加"]`，未收到 `["apple", "banana"]`

### Implementation Summary

- `create-learning-items` skill 現在每次詢問 target、拼字、語義或單字／片語邊界時，
  都以 `learning-item-request` fenced block 回傳 typed targets。
- artifact parser 會移除原始 JSON、驗證最多 50 個 targets，並把結果附在 assistant
  message 的 `learningItemRequest`。
- 下一則 creation 回答會讀取最後一個已完成 assistant message；若存在非空的澄清後
  targets，優先使用它們查詢 exact-title 候選，並把回答附加為 `senseHint`。
- 沒有 structured targets 時，直接回答 `bank` 等原有 fallback 保持不變。
- 最終草稿仍必須通過原有 requested target 與候選範圍驗證，沒有放寬安全邊界。

### Test Coverage

- TC1：`extracts clarified creation targets without rendering raw JSON`
- TC2：`uses structured targets from a clarification before interpreting a contextual answer`
- TC3：既有 `continues a persisted creation clarification and queries candidates for the answer`
- TC4：`keeps a known target and appends the user's sense clarification`
- TC5：`uses the last completed assistant clarification when a turn produced multiple messages`
- TC6：完整 server 3 項、desktop 170 項，共 173 項通過
- 額外覆蓋：超過 50 個 clarified targets 被拒絕；assistant request 跨重啟持久化；
  skill 必須輸出 structured clarification contract。

### Changed Files

#### Production code

- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-conversation-store.test.ts`

#### Documents

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/B07-preserve-clarified-learning-item-targets.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 「都加」沿用 apple／banana 並先查候選 | Pass | TC2 |
| 澄清 JSON 不顯示、成為 typed attachment | Pass | TC1 |
| 直接 target 與 sense clarification 相容 | Pass | TC3、TC4 |
| 最多 50 筆、exact-title 與 scope 驗證不放寬 | Pass | boundary test、完整回歸 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | artifact parser request test |
| TC2 | Pass | contextual answer controller test |
| TC3 | Pass | persisted direct-target continuation test |
| TC4 | Pass | known-target sense test |
| TC5 | Pass | multiple assistant messages test |
| TC6 | Pass | full project test |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/learning-item-artifacts.test.ts src/main/chat-controller.test.ts -t "clarified creation targets|structured targets from a clarification"
npm run test -w @reader/desktop -- src/main/learning-item-artifacts.test.ts src/main/chat-controller.test.ts src/main/chat-conversation-store.test.ts
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/create-learning-items
npm test
npm run typecheck
npm run build
git diff --check
```

### Hypotheses and Decisions

1. **Confirmed**：空 request 的上下文式回答被直接解析成 target；保存對話與 red test
   都顯示候選查詢收到 `["都加"]`。
2. **Confirmed contributing condition**：澄清後 targets 只有 AI 可讀的對話文字，沒有
   App 可使用的 typed attachment。
3. **Rejected**：大小寫或首尾空白正規化錯誤；既有正規化已正確處理。
4. **Rejected**：候選資料污染；錯誤在 title scope 驗證即觸發。

選擇結構化 request artifact，而非解析可見 AI 文字或按空白拆詞，避免誤拆
`take for granted` 等片語，並確保資料庫查詢仍由程式以有限完整標題執行。

### Deferred Items

None.

### Architectural Observation

這個缺陷暴露出「人類可讀澄清」與「機器可驗證 target scope」原本沒有共同表示。
沿用既有 message attachment 與 artifact parser 後，責任邊界已清楚，不需要另開 RXX。

## Appendix: TDD Fix Workflow

1. 以實際三回合流程建立 deterministic failing test。
2. 新增最小 artifact、message attachment 與 continuation 支援。
3. 執行 parser、controller、store、skill 與完整專案回歸。
4. 更新本文件、learning-item-creation 與 ai-conversation 模組文件。
