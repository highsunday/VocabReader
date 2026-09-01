---
author: Codex
date: 2026-09-01
title: 隔離右側欄直接新增與自然語言意圖路由
uuid: 1239f7fa-15dd-43bc-b22e-994125de551d
version: 1.0.0
status: implemented
---

# Bug Fix: 隔離右側欄直接新增與自然語言意圖路由

## 1. Bug Overview

使用者在 **AI 對話面板**輸入多個單字或片語後點選「Add cards」，Renderer
已送出 `createLearningItems` intent 及 trusted targets，本應直接執行
`create-learning-items` 並回傳 `learning-item-result`。

目前同一份 developer instructions 另外要求 AI 對「建立意圖明確」的輸入回傳
`learning-item-intent`，但沒有明確排除已含 `$create-learning-items` 的直接建立 turn。
AI 因此可能在應用建立 skill 時同時產生 routing-only artifact；當該額外 block
格式不合時，現有 parser 會清掉同一回覆中的有效草稿，UI 顯示
`Invalid learning-item creation intent`。

## 2. Fix Objective

- 明確定義含 `$create-learning-items` 的 turn 是 trusted fast path，不得輸出
  `learning-item-intent`。
- 自然語言 routing 只適用於沒有 typed intent 與 skill marker 的 ordinary turn。
- Controller 解析 trusted creation turn 時不接受 routing-only intent；多餘或格式錯誤的
  intent block 不得使同一回覆中的有效 `learning-item-result` 失效。
- ordinary turn 的 `learning-item-intent` 驗證與自動兩階段流程維持不變。

## 3. Acceptance Criteria

- **Scenario 1：右側欄直接新增不進入 intent routing**
  - **Given** Renderer 已提供 `createLearningItems` 與一至五十個 trusted targets
  - **When** Controller 組合 `$create-learning-items` turn
  - **Then** developer contract 明確禁止該 turn 輸出 `learning-item-intent`
  - **And** AI 應依建立 skill 輸出 `learning-item-result` 或必要的聚焦澄清

- **Scenario 2：多餘 intent 不破壞有效草稿**
  - **Given** trusted creation turn 的 AI 回覆含有效 `learning-item-result`
  - **And** 回覆也含一個多餘且格式錯誤的 `learning-item-intent`
  - **When** Controller 解析回覆
  - **Then** 有效草稿仍依 trusted targets 與 candidates 驗證後顯示
  - **And** 不顯示 `Invalid learning-item creation intent`

- **Scenario 3：ordinary routing 維持嚴格**
  - **Given** 沒有 typed intent 的 ordinary turn
  - **When** AI 輸出 `learning-item-intent`
  - **Then** 合法 artifact 仍可啟動自動草稿準備
  - **And** 格式錯誤或超過 50 targets 仍被拒絕

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Fast-path prompt 契約 | developer instructions 含 creation skill | 檢查 routing 規則 | `$create-learning-items` turn 被明確排除 | Critical |
| TC2 | 多餘 malformed intent | trusted targets + 有效 result + 錯誤 intent | Controller 完成 turn | batch 可用且沒有 artifact error | Critical |
| TC3 | Ordinary valid intent | 無 typed intent | 回傳合法 intent | 繼續現有兩階段流程 | Critical |
| TC4 | Ordinary invalid intent | 無 typed intent | 回傳錯誤／51 targets intent | 拒絕 artifact | Critical |
| TC5 | Existing fast paths | 按鈕 targets 或 invitation targets | 執行建立 | 仍直接查 candidates 與啟動 skill | High |

## 5. Implementation Notes

- 在 `composeDeveloperInstructions()` 明確定義 ordinary turn 不包含
  `$create-learning-items`，並禁止 fast path 輸出 `learning-item-intent`。
- `parseLearningItemArtifacts()` 增加是否接受 intent artifact 的 context option。
  Controller 先取得當輪 typed input，只在 `input.intent` 未定義時接受 routing intent。
- 不放寬 ordinary turn 的 schema，不修改 batch trusted scope，不降低提交前驗證。

## 6. Affected Files and Boundaries

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B42-isolate-direct-card-creation-from-intent-routing.md`

## 7. Assumptions and Non-goals

- 使用者提供的多行內容已被 Renderer 正確拆成 trusted targets；本案不改變分隔語法。
- 不改變句子／子句的學習項目資格邊界。
- 不將 AI 的任意錯誤草稿視為可信任資料；有效 batch 仍必須通過原有 scope 驗證。

## 8. Implementation Record

### Status

Implemented and verified on 2026-09-01.

### Implementation Summary

- Developer instructions 現在明確定義 `$create-learning-items` 是 trusted
  direct-creation fast path，不屬於 ordinary user turn，並禁止在該 turn
  輸出 `learning-item-intent`。
- `parseLearningItemArtifacts()` 新增 context-aware `acceptIntent` option。Controller
  只在當輪沒有 typed intent 時接受 routing artifact；trusted creation turn
  會移除但忽略多餘 intent block。
- 原有 `learning-item-result` 的 requested-target、workspace-language 與 candidate
  scope 驗證完全保留，ordinary natural-language routing 仍嚴格驗證 intent
  schema 與 50-target 邊界。

### Red → Green Record

- 紅燈：fast-path prompt 契約沒有排除 intent routing；當模擬回覆同時含
  有效 result 與 malformed intent 時，Controller 實際回傳
  `Invalid learning-item creation intent`，2/2 目標測試失敗。
- 綠燈：加入 prompt 隔離契約與 context-aware parser 後，同一組測試
  2/2 通過；草稿可正常顯示且沒有 artifact error。
- 相關驗收：3 個測試檔共 22 項相關測試通過。
- 完整回歸：Server 3/3、Desktop 587/587 通過；全專案 typecheck 與
  production build 通過。

### Test Coverage

| Test scenario | Automated basis | Result |
|---|---|---|
| TC1 | `injects only the matching App skill for each preset action` | Passed |
| TC2 | `keeps a trusted fast-path draft when the AI also emits a malformed routing intent` | Passed |
| TC2 | `ignores routing-only intent when parsing a trusted creation turn` | Passed |
| TC3–TC4 | 既有 multilingual route、50-target 與 invalid-intent parser tests | Passed |
| TC5 | 既有 Renderer direct targets／invitation 與 Controller skill-routing tests | Passed |

### Changed Files

#### Production code

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/learning-item-artifacts.test.ts`

#### Documentation

- `documents/modules/learning-item-creation.md`
- `documents/implements/B42-isolate-direct-card-creation-from-intent-routing.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 右側欄直接新增不進入 intent routing | Pass | TC1 prompt contract 與 TC5 fast-path regressions |
| 多餘 intent 不破壞有效草稿 | Pass | TC2 Controller 與 parser regression tests |
| ordinary routing 維持嚴格 | Pass | 既有 valid、invalid、50/51 target routing tests |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-controller.test.ts -t 'injects only the matching App skill|keeps a trusted fast-path draft'
npm run test -w @reader/desktop -- src/main/learning-item-artifacts.test.ts src/main/chat-controller.test.ts src/renderer/App.test.tsx -t 'learning-item|matching App skill|sends direct learning-item targets|Add cards|trusted fast-path draft'
npm test
npm run typecheck
npm run build
git diff --check
```

### Hypotheses and Decisions

- 已確認根因是 natural-language routing 與 typed fast path 共用全局 prompt 時的
  artifact 契約重疊。錯誤文字只可由 `learning-item-intent` parser 產生，
  Renderer 同時已正確把多行內容拆成 trusted targets，且使用者輸入未超過
  50-target 邊界，因此排除了 targets schema 與數量限制假說。
- 只修正 prompt 仍依賴生成穩定性；加入 context-aware parser 後，即使 AI
  多輸出錯誤 routing artifact，有效草稿仍能經原有 trusted scope 驗證。

### Deferred Items

- 本案未改變草稿生成品質、字典原型化或句子／子句適格性邊界。
- Build 仍有既有的 500 kB bundle-size warning，不影響建置成功，也非本案引入。

### Architecture Observation

現有 `turnInput` typed context 提供了合適的 artifact 解析接縫，修正不需要
新增 IPC、store schema 或變更 batch lifecycle；沒有暴露需要另立 RXX 的架構問題。
