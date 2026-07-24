---
author: Codex
date: 2026-07-24
title: 使用快速模型生成與批改複習試卷
uuid: a0cfd8c8-f2ab-41c1-9f19-198a3ba3c85a
version: 1.1.0
status: implemented
---

# Bug Fix Specification - 複習試卷沿用預設模型導致等待過久

## 1. Bug Overview

間隔複習的生成與批改都由 `SpacedReviewController` 建立獨立的一次性 Codex thread，
目前 `thread/start` 與 `turn/start` 都沒有指定模型或推理強度，因此完全沿用
Codex AI 執行層當下的預設模型。預設模型可能偏向最高品質及較高推理成本，對
「最多 10 題、無工具、固定 fenced JSON」的複習試卷工作負載造成不必要的等待。

右側 AI 對話面板已擁有自己的模型目錄與 `ChatController` 選擇狀態；間隔複習不應
改動或沿用該選擇，避免以快速複習模型降低一般問答品質。

## 2. Root Cause

- `runReviewTurn()` 初始化 Codex client 後直接建立 thread，未查詢可用模型。
- 複習專用 thread／turn 沒有傳入 `model` 或 `effort`。
- 複習與右側 AI 對話雖然已有 Controller 隔離，但尚未利用這個邊界採用不同的模型策略。

## 3. Fix Objective

間隔複習的生成與批改先查詢目前帳號可用的模型，優先選擇
`gpt-5.6-luna` 並使用 `low` reasoning effort；若 Luna 不可用或不支援 low，
改用 `gpt-5.6-terra` low。兩者都不可用、模型目錄讀取失敗或格式無法辨識時，
不阻擋複習流程，省略 model／effort 並沿用 Codex 預設模型。

模型策略只存在於 `SpacedReviewController`，不得修改 `ChatController`、
右側 AI 模型選擇器、使用者目前選擇或一般 AI 對話的 thread。

## 4. Acceptance Criteria

- **Scenario 1：優先使用 Luna low**
  - **Given** `model/list` 回傳可見且支援 low 的 `gpt-5.6-luna`
  - **When** App 生成或批改複習試卷
  - **Then** 專用 thread 使用 `gpt-5.6-luna`
  - **And** 專用 turn 使用 `gpt-5.6-luna` 與 `effort: low`

- **Scenario 2：Luna 不可用時使用 Terra low**
  - **Given** Luna 缺席、隱藏或不支援 low
  - **And** `gpt-5.6-terra` 可見且支援 low
  - **When** App 生成或批改複習試卷
  - **Then** 專用 thread／turn 使用 Terra，turn 使用 low

- **Scenario 3：安全沿用 Codex 預設模型**
  - **Given** Luna 與 Terra 都不可用，或 `model/list` 失敗／格式無法辨識
  - **When** App 生成或批改複習試卷
  - **Then** 流程仍繼續
  - **And** thread／turn 不傳 model 或 effort

- **Scenario 4：不影響右側 AI 對話模型**
  - **Given** 使用者在 AI 對話面板選擇任一可用模型
  - **When** 間隔複習採用快速模型策略
  - **Then** `ChatController` 的模型目錄、`selectedModelId`、thread 及 turn 參數維持不變
  - **And** 複習模型不出現在右側選擇器的持久選擇中

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Luna 優先 | Luna、Terra 都支援 low | 生成與批改 | thread/turn 選 Luna；turn effort=low | Critical |
| TC2 | Terra fallback | Luna 不可用、Terra 支援 low | 生成 | thread/turn 選 Terra；turn effort=low | Critical |
| TC3 | Codex default fallback | 無候選或目錄失敗 | 生成 | request 繼續且沒有 model/effort | Critical |
| TC4 | 對話模型隔離 | ChatController 選擇其他模型 | 執行複習回合 | 既有 chat model tests 不變且全數通過 | High |
| TC5 | 分頁目錄 | Luna 位於後續 model/list page | 選擇模型 | 仍選 Luna，不因首頁 Terra 提前停止 | High |

## 6. Implementation Notes

- 在 `spaced-review-controller.ts` 建立窄範圍模型選擇 helper，不把
  `ChatController` 的私有模型狀態抽出或共用。
- 使用 `model/list({ includeHidden: false, cursor })` 讀完分頁，只接受：
  - 精確 model id；
  - 非 hidden；
  - `supportedReasoningEfforts` 明確包含 `reasoningEffort: "low"`。
- 優先序固定為 Luna → Terra，與 model/list 回傳順序無關。
- `thread/start` 只傳 model；`turn/start` 傳 model 與 effort，保持與現有一般對話
  Codex request 形狀一致。
- 目錄失敗屬於可恢復的效能能力缺失，不應讓複習試卷失敗。
- 官方模型定位依
  `https://developers.openai.com/api/docs/guides/latest-model.md`：
  Luna 適合高效率工作，Terra 提供品質與效率平衡，low 適合延遲敏感流程。

## 7. Assumptions and Non-goals

- 不在 UI 新增複習模型選擇器；快速模型是間隔複習的內部效能策略。
- 不修改一般 AI 對話模型選擇、設定持久化或模型目錄顯示。
- 不保證固定耗時；實際延遲仍受帳號、模型供應、項目內容與輸出長度影響。
- 不重用生成與批改 thread，不改變 skill、artifact、FSRS 或複習排程規則。
- 不在模型名稱相似但 id 不同時猜測相容性。

## 8. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- 新增複習專用 model catalog 選擇 helper，完整讀取 `model/list` 分頁。
- 只接受精確 Luna／Terra model id、非 hidden 且明確支援 low reasoning 的候選。
- 固定依 Luna → Terra 排序；`thread/start` 傳 model，`turn/start` 傳 model 與 low。
- 沒有候選、目錄 request 失敗、格式錯誤或 cursor 重複時回到 Codex 預設值，
  不讓效能策略阻擋生成或批改。
- 所有變更只在 `SpacedReviewController`；`ChatController` 與 Renderer 模型選擇器
  沒有修改。

### Test Coverage

- TC1／TC5：`prefers Luna low across paginated models for generation and grading`
  驗證分頁讀完後仍以 Luna 優先，且生成／批改的 thread／turn 都使用正確參數。
- TC2：`uses Terra low when Luna cannot serve low-effort review turns`
  驗證 Luna 不支援 low 時改用 Terra。
- TC3：parameterized default fallback test 覆蓋無快速候選、catalog request failure
  與 malformed catalog，流程都繼續且不傳 model／effort。
- TC4：完整 `chat-controller.test.ts` 49 項通過，既有對話模型目錄、選擇與 request
  行為未改變。

### Changed Files

#### Production code

- `apps/desktop/src/main/spaced-review-controller.ts`

#### Test code

- `apps/desktop/src/main/spaced-review-controller.test.ts`

#### Documents

- `documents/implements/B10-use-fast-model-for-spaced-review.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Luna 可用時 generation／grading 使用 Luna low | Pass | TC1 |
| Luna 不可用時使用 Terra low | Pass | TC2 |
| 目錄無候選、失敗或格式錯誤時沿用 Codex 預設 | Pass | TC3 |
| 不影響右側 AI 對話模型 | Pass | TC4、production diff scope |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Luna generation/grading request assertions |
| TC2 | Pass | Terra fallback request assertions |
| TC3 | Pass | three default fallback cases |
| TC4 | Pass | 49 chat-controller regression tests |
| TC5 | Pass | two-page catalog and request cursor assertions |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/spaced-review-controller.test.ts
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts
npm test
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

1. **Confirmed**：複習 thread／turn 原本未傳 model 或 effort，完全依賴 Codex 預設值。
2. 選擇動態 model catalog 而非硬編碼，因模型可用性受帳號與 Codex runtime 決定。
3. 讀完所有 catalog pages 後才套優先序，避免第一頁 Terra 讓後續 Luna 被忽略。
4. 不共用 `ChatController` 私有選擇狀態，保留一般對話品質與使用者選擇自主性。
5. model catalog 是效能能力而非複習正確性的必要依賴，因此所有查詢／格式錯誤都
   fail open 到 Codex 預設模型。

### Deferred Items

- 尚未保存實際端到端延遲 telemetry；本次以正確模型 request routing 為完成條件。
- 未重用 Codex client 或 thread；若快速模型後仍過慢，可另行量測 client initialize、
  thread start、first token 與 artifact generation 各階段耗時。

### Architectural Observation

複習與一般對話原本已有獨立 Controller、client 及 thread 邊界，因此能在單一檔案內
加入快速模型策略，沒有產生新的耦合或缺少測試 seam，不需要另開 RXX。

## Appendix: TDD Fix Workflow

1. 新增 controller red tests，驗證 Luna、Terra、default fallback 與分頁優先序。
2. 實作最小 model/list 選擇 helper 及 thread／turn 參數。
3. 執行 spaced-review、chat model regression、完整測試、typecheck、build。
4. 更新本文件與 `documents/modules/spaced-review.md`。
