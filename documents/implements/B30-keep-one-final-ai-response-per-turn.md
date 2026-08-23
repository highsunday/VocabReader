---
author: Codex
date: 2026-08-24
title: 每個 AI turn 只保留最後正式回答
uuid: 058f0af3-d01b-40eb-af7b-1f35ab160226
version: 1.1.0
status: implemented
---

# Bug Fix: 每個 AI turn 只保留最後正式回答

## 1. Bug Overview

Codex app-server 偶爾會在同一個 turn 內完成多個 `agentMessage`。已捕捉的區段解析案例中，
同一 turn 先後產生五個 `phase: final_answer` 的不同 item；前四個是不完整的重試輸出，
第五個才是完整正式回答。

`ChatController` 目前依 item id 保存每一則訊息，turn 完成時只更新狀態；Renderer 又逐一顯示
所有保存訊息，導致使用者在一個 AI 回覆中看到多份近似的單字、片語與句子講解。

## 2. Fix Objective

- AI 對話面板在一個 turn 中任何時刻最多顯示一則 assistant 訊息。
- 同一 turn 開始新的 agent message 時，以新訊息取代較早的 commentary、不完整回答或重試回答。
- `item/completed` 明確標示為 commentary 時，不解析或套用學習產物。
- turn 完成後只持久保存最後一則可見 assistant 訊息及其正式學習產物。
- 不同 turn 的正式回答仍依原順序完整保留。
- app-server 未提供 message phase 時維持相容行為，把該訊息視為可見回答。

## 3. Acceptance Criteria

- **Scenario 1：同一 turn 的重試回答被取代**
  - **Given** 一個 turn 依序串流並完成多個不同 item id 的 final answer
  - **When** 後一個 agent message 開始串流並且 turn 最終完成
  - **Then** AI 對話只顯示並保存最後一個 final answer
- **Scenario 2：commentary 不成為正式產物**
  - **Given** 一個 turn 先完成 commentary，再完成包含學習產物的 final answer
  - **When** Controller 處理兩個 item
  - **Then** commentary 不會觸發學習產物解析，且最後只保留 final answer 與其產物
- **Scenario 3：不同 turn 不互相取代**
  - **Given** 同一 AI 對話中有兩個先後完成的 turn
  - **When** 每個 turn 都產生正式回答
  - **Then** 兩個 turn 各保留一則 assistant 訊息
- **Scenario 4：舊版 phase 相容**
  - **Given** agent message 沒有 phase
  - **When** 訊息完成
  - **Then** Controller 仍顯示並保存該回答

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 多次 final retry | 同 turn 有多個不同 item id | 依序 delta／complete | 只留下最後回答 | Critical |
| TC2 | commentary + final | commentary 先完成 | final 隨後完成 | commentary 無產物且被取代 | Critical |
| TC3 | 多個正常 turn | 兩個 turn 各有回答 | 對話完成 | 各 turn 保留一則 | High |
| TC4 | phase 缺省 | item 不含 phase | item 完成 | 回答正常保留 | High |

## 5. Implementation Notes

- 收斂責任屬於 Main process 的 `ChatController`，Renderer 不自行猜測重複內容。
- 判斷邊界使用 `turnId` 與 item id，不比較自然語言文字相似度。
- 第一個屬於新 item id 的 delta 到達時，移除同 turn 較早的 assistant 訊息，讓串流期間也只有
  一個可見回答。
- `item/completed` 同樣先收斂同 turn 訊息，以涵蓋沒有 delta 的 provider。
- `phase: commentary` 可以暫時顯示為進度，但不得解析 learning-item invitation、intent、batch
  或其他正式產物；後續 final answer 會取代它。
- 不改變 Codex thread／turn 建立、閱讀區段傳送、模型選擇或學習項目去重規則。

## 6. Affected Modules and Files

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`
- `documents/modules/ai-conversation.md`

## 7. Assumptions and Non-goals

- 同一 turn 的多個 agent messages 是同一輪輸出的演進或重試，不是多個需要並列保存的使用者回答。
- 本修正不嘗試阻止 app-server 產生重試，只在產品 AI 對話邊界收斂成唯一正式回答。
- 本修正不以文字相似度去重，也不修改既有歷史檔中的舊重複內容。

## 8. Implementation Record

### Status

Implemented on 2026-08-24.

### Implementation Summary

- `ChatController` 在新 agent message item 的第一個 delta 或 completed notification 到達時，
  依 turn id 原地移除較早 assistant 訊息，只保留目前 item。
- 明確 `phase: commentary` 的 completed item 只校正暫時文字與狀態，不解析 learning item
  invitation、intent、batch 或錯誤產物。
- `final_answer` 與 phase 缺省訊息維持既有正式文字、產物解析及持久化流程。
- 同 turn 的訊息陣列採原地更新，維持 active conversation 與 `#messages` 的共享引用，確保
  snapshot 和本機 conversation store 保存相同的最後回答。

### Test Coverage

- TC1：新增同一 turn 三次 `final_answer` 的重試案例，驗證所有即時 snapshot 最多一則
  assistant 訊息，完成後只保留最後文字，且 store 與 snapshot 一致。
- TC2：新增 commentary 含假 learning invitation、final 含正式 invitation 的案例，驗證
  commentary 不解析產物且 final 正常取代。
- TC3：既有 `streams two answers on one thread...` 驗證兩個不同 turn 各保留一則回答。
- TC4：新增 phase 缺省案例，驗證回答仍正常顯示與保存。

### Changed Files

#### Production Code

- `apps/desktop/src/main/chat-controller.ts`

#### Test Code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`

#### Documentation

- `documents/implements/B30-keep-one-final-ai-response-per-turn.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 同一 turn 的重試回答被取代 | Pass | TC1 snapshot／store assertions |
| commentary 不成為正式產物 | Pass | TC2 interim／final artifact assertions |
| 不同 turn 不互相取代 | Pass | TC3 existing two-turn controller test |
| 舊版 phase 相容 | Pass | TC4 phase-omitted controller test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `keeps only the last final answer when one turn retries with new message items` |
| TC2 | Pass | `does not parse learning artifacts from commentary before the final answer` |
| TC3 | Pass | `streams two answers on one thread while keeping reader context out of the visible user message` |
| TC4 | Pass | `keeps a completed agent response when the app server omits its phase` |

### Commands Executed

```bash
# Expected red: received three assistant messages for one turn
npm test -w @reader/desktop -- src/main/chat-controller.test.ts -t \
  "keeps only the last final answer when one turn retries with new message items"

# Target green and acceptance cases: 4/4 passed
npm test -w @reader/desktop -- src/main/chat-controller.test.ts -t \
  "keeps only the last final answer|does not parse learning artifacts from commentary|keeps a completed agent response when the app server omits its phase|streams two answers on one thread"

# Related controller regression: 64/64 passed
npm test -w @reader/desktop -- src/main/chat-controller.test.ts

# Full regression: Server 3/3、Desktop 558/558
npm test

# Server and Desktop type checks passed
npm run typecheck

# Server and Desktop production builds passed; existing Vite chunk-size advisory only
npm run build

# Whitespace validation passed
git diff --check
```

### Hypotheses and Decisions

- 捕捉的真實 rollout 證明同一 turn 存在五個不同 id 的 `final_answer`；因此根因是
  Controller 缺少 turn 級 canonicalization，而不是 Renderer 重複訂閱或 delta 重播。
- 第一版修正以 `#messages = filter(...)` 取代陣列後，snapshot 已正確但 store 仍保存舊陣列；
  原因是 active conversation 與 `#messages` 共享同一陣列引用。最終改用 `splice` 原地收斂，
  使即時狀態與持久狀態維持一致。

### Deferred Items

- 是否遷移並清理已持久保存的舊重複訊息，留待另行決定。

### Notes

- 修正集中在既有 `ChatController` notification 投影責任，沒有新增模組或跨層耦合。
- 未寄送 DDD 完成通知：本次請求未明確授權把本機實作與測試摘要傳送到外部信箱；
  結果記錄於 `documents/ddd-email-notify.md` 的 L049。

## Appendix: TDD Fix Workflow

1. 先以同一 turn 多個 final messages 建立失敗測試。
2. 實作最小的 turn 級訊息取代與 commentary artifact 防護。
3. 驗證多個正常 turn、phase 缺省與 learning artifact 流程沒有回歸。
4. 同步本文件與 AI 對話模組文件。
