---
author: Codex
date: 2026-07-24
title: 讓複習試卷生成狀態持續且清楚
uuid: 54aec606-077b-4a5e-9ee2-ef92be116ee6
version: 1.1.0
status: implemented
---

# Bug Fix Specification - 複習試卷生成進度看似停住

## 1. Bug Overview

使用者要求 AI 生成複習試卷後，Renderer 在頁面標題與進度輸出卡片之間另外顯示
「AI 正在依本回合項目生成例句…」。AI 接著快速輸出多行 `Preparing n/10`，然後
開始串流完整的 `review-paper` artifact。IPC 為避免顯示未完成試卷，會隱藏 artifact
起點後的內容，因此畫面停留在 `Preparing 10/10`，直到整份 artifact 完成並通過驗證。

這造成三個 UX 問題：

- 固定狀態文字位於卡片外，與 AI 輸出卡片割裂且視覺鬆散。
- 原始 `Preparing` log 佔用大量空間、語言不一致，也不是可信的逐題完成進度。
- `10/10` 暗示工作已完成，但系統仍在組裝試卷，使用者容易誤認為程式卡住。

## 2. Root Cause

- `ReviewGenerationProgress` 只傳遞累積文字，沒有表達生成階段。
- IPC 發現 `review-paper` fence 後只停止推送可見文字，未通知 Renderer 已進入下一階段。
- `SpacedReviewWorkspace` 只有單一 `generating` phase，並把固定狀態與原始文字分開呈現。
- 缺少持續活動指示、經過時間及使用者可控制的取消操作。

## 3. Fix Objective

將生成中的 UI 整合成一張 AI 狀態卡，不顯示原始 AI progress log。卡片以產品可控制的
繁體中文文案顯示「產生例句」及「組裝並檢查試卷」兩個真實階段，提供持續活動指示、
經過時間及取消操作；artifact 開始串流後必須立即切換第二階段，直到正式試卷出現。

## 4. Acceptance Criteria

- **Scenario 1：生成狀態集中在 AI 狀態卡**
  - **Given** 使用者按下「生成本回合試卷」
  - **When** AI request 尚未完成
  - **Then** 所有狀態文案、階段指示、活動進度與操作都位於同一張狀態卡
  - **And** 卡片外不再顯示「AI 正在依本回合項目生成例句…」
  - **And** 不顯示原始 `Preparing` 行或目標清單

- **Scenario 2：artifact 期間顯示下一個真實階段**
  - **Given** AI 已開始輸出 `review-paper` fenced artifact
  - **When** 試卷仍在串流或等待 Main 驗證
  - **Then** IPC 推送 `assembling` typed progress
  - **And** 狀態卡顯示「例句已完成，正在組裝並檢查試卷」
  - **And** 不揭露 artifact JSON 或未驗證題目

- **Scenario 3：等待期間持續回饋**
  - **Given** 生成 request 仍在執行
  - **When** 任一生成階段持續等待
  - **Then** 狀態卡具有非百分比活動進度條
  - **And** 顯示持續更新的等待秒數
  - **And** 容器以 `aria-busy` 及精簡 `aria-live` 狀態支援輔助技術

- **Scenario 4：使用者可以取消生成**
  - **Given** 試卷正在生成
  - **When** 使用者按下「取消生成」
  - **Then** App 中止並丟棄暫態生成工作
  - **And** 回到本回合摘要，不顯示取消為錯誤
  - **And** 已取消 request 的晚到結果不得重新打開試卷

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 整合生成狀態卡 | generation Promise 未完成 | 進入生成狀態 | 卡內顯示階段與活動指示；無外部固定文字及原始 log | Critical |
| TC2 | artifact 階段切換 | 累積 delta 含 `review-paper` fence | IPC 處理 delta | 推送 `assembling`，不推送 JSON | Critical |
| TC3 | 完成切換 | assembling 狀態 | 合法試卷完成 | 清除狀態卡並顯示正式題目 | Critical |
| TC4 | 取消生成 | generation Promise 未完成 | 點擊取消 | discard 被呼叫、回摘要、晚到結果被忽略 | High |
| TC5 | 輔助技術狀態 | 生成中 | 檢查 DOM | `aria-busy=true`、精簡 live status、活動 progressbar | High |

## 6. Implementation Notes

- 將 `ReviewGenerationProgress` 改為 typed phase，不再把任意模型文字暴露給 Renderer。
- Main 可從累積 response 是否包含 `review-paper` fence 判斷 `preparing`／`assembling`；
  只傳產品狀態，不解析或顯示半完成 JSON。
- Renderer 點擊生成後立即顯示 `preparing`；接到 `assembling` 後更新同一張卡。
- 使用 indeterminate CSS progressbar，不製造虛假完成百分比。
- 用 generation attempt token 忽略取消後的晚到 Promise completion。
- 沿用既有 `discardPaper()`／`AbortController`，不新增廣泛 IPC 或持久化。

## 7. Assumptions and Non-goals

- 不提供 ETA；沒有足夠歷史資料時不顯示預估完成時間。
- 不把 AI 原始進度文字移入一般 AI 對話，也不保存生成狀態。
- 不逐題渲染未驗證 artifact，不改變試卷、批改、FSRS 或到期項目選取規則。
- 本修正只處理複習試卷生成；批改中的等待 UI 不在本次範圍。

## 8. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- 將 Renderer progress boundary 從任意模型文字改為 `preparing`／`assembling` typed phase。
- IPC 偵測 `review-paper` fence 後即推送 assembling，且不傳送原始 progress、JSON
  或未驗證題目。
- 生成畫面改為單一 AI 狀態卡，整合標題、兩階段 stepper、產品文案、
  indeterminate progress、等待秒數與取消操作。
- 取消時沿用既有 `discardPaper()` 中止 Main request，並以 attempt token 忽略晚到
  Promise result，取消不顯示成錯誤。
- 動畫支援 `prefers-reduced-motion`；窄版將兩個階段由並排改為垂直堆疊。

### Test Coverage

- TC1／TC3／TC5：`keeps AI generation feedback inside one staged status card`
  驗證所有狀態位於卡內、沒有外部固定文字或 Preparing log、具有 busy/live/progress
  語意，完成後狀態卡消失並顯示正式題目。
- TC2：`registers only typed review operations and rejects malformed payloads`
  驗證 preparing、assembling 事件及 JSON 不外洩。
- TC4：`cancels generation and ignores a late paper result`
  驗證 discard、回到摘要、取消不報錯且晚到試卷不顯示。
- 桌面與 700px 窄版以本機實際 CSS 渲染進行視覺檢查；臨時 visual harness 已移除。

### Changed Files

#### Production code

- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/spaced-review-ipc.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `documents/implements/B09-clarify-spaced-review-generation-status.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 所有生成狀態集中於 AI 狀態卡且不顯示原始 log | Pass | TC1、實際渲染檢查 |
| artifact 期間切換組裝階段且不揭露 JSON | Pass | TC2 |
| 活動進度、等待秒數及輔助技術狀態 | Pass | TC1／TC5、CSS reduced-motion 檢查 |
| 取消、回摘要且忽略晚到結果 | Pass | TC4 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | staged status card Renderer test |
| TC2 | Pass | typed phase IPC test |
| TC3 | Pass | staged status card completion assertion |
| TC4 | Pass | cancel and late result Renderer test |
| TC5 | Pass | busy/live/progress accessibility assertions |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/spaced-review-ipc.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm exec vite -- --host 127.0.0.1
git diff --check
```

### Hypotheses and Decisions

1. **Confirmed root cause**：IPC 在 artifact fence 後停止更新可見文字，Renderer 只有單一
   generating state，因此停在最後一行 Preparing。
2. **Rejected as primary cause**：正式 10 題 React render 或本機 artifact parser 很慢；
   gap 發生時 AI 仍在串流被刻意隱藏的 artifact。
3. 選擇 typed phase 而非解析並顯示模型 progress，避免語言不一致、假 `10/10`
   及未受信任內容直接成為產品 UI。
4. 不顯示百分比或 ETA，因目前沒有可信的逐題完成度及歷史耗時資料。
5. Green 後首次 typecheck 只因測試 fixture 把 CEFR 推論成字面值 `A2`；
   將 fixture 標成公開 `ReviewPaper` 型別後通過，未改 production 行為。

### Deferred Items

- 批改階段仍使用既有固定狀態；其取消與階段化 UI 不在本次範圍。
- 若未來要顯示可信的逐題數字，需改用可驗證的 structured question stream，
  不應重新解析模型的 Preparing 文案。

### Architectural Observation

原始模型文字與產品生成狀態曾共用同一個跨程序契約。改成 typed phase 後，
Main 負責把不受信任輸出轉成有限狀態，Renderer 只負責產品呈現；責任邊界已清楚，
目前不需要另開 RXX。

## Appendix: TDD Fix Workflow

1. 新增 Renderer red tests，證明原始 log 仍顯示、缺少 assembling 狀態及取消保護。
2. 新增 IPC red test，證明 artifact fence 尚未產生 typed phase。
3. 實作最小 typed progress、狀態卡、等待時間與取消邏輯。
4. 執行 focused tests、完整 desktop tests、typecheck、build 及 `git diff --check`。
5. 更新本文件與 `documents/modules/spaced-review.md`。
