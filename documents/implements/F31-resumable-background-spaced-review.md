---
author: Codex
date: 2026-07-24
title: 讓複習試卷跨頁生成並可繼續作答
uuid: 9e72d8eb-69fc-4570-a691-ccd4e518eec4
version: 1.4.0
status: implemented
---

# Feature Specification - 讓複習試卷跨頁生成並可繼續作答

## 1. Feature Overview

目前使用者離開間隔複習頁時，Renderer 會卸載複習工作區、呼叫取消並清除 Main
process 中的複習試卷。若試卷仍在生成，切換到書庫或閱讀頁會中斷 AI；若試卷已可
作答，切頁也會遺失題目與答案。使用者返回後只能重新生成，而每次生成都需要等待。

本功能讓同一次 App 開啟期間的未完成複習回合跨頁保留。切換至其他工作區只暫時隱藏
間隔複習畫面，不取消生成或清除作答狀態；返回時顯示同一份生成進度、試卷、答案、
批改結果與評級選擇。只有使用者明確取消生成、確認完成回合，或關閉 App，才清除
未完成狀態。

間隔複習側欄入口同時顯示目前工作狀態：生成中使用動態 icon，試卷生成完成且尚未
確認回合時使用完成 icon，無未完成回合時不顯示狀態 icon。已生成狀態的可存取名稱
必須說明「試卷已生成，可繼續」，不可誤稱為整個複習回合已完成。

作答或檢視批改時，使用者可按「先離開」回到間隔複習首頁。這個操作只退出試卷視圖，
保留同一份題目、答案、回饋與評級。間隔複習首頁仍顯示本回合摘要，並在同一頁下方
顯示「當前試卷」卡，讓使用者查看原進度或放棄試卷；不可用當前試卷卡取代整個首頁。

間隔複習首頁的未完成試卷卡同時提供「放棄試卷」。因為這會不可復原地清除題目、
答案、AI 回饋及未確認評級，必須先顯示二次確認；只有使用者確認放棄後才真正 discard。
放棄不得寫入複習歷史或更新任何學習項目的排程。

## 2. Requirements (User Story)

- **As a** 使用間隔複習的學習者
- **I want** 在等待生成或作答途中切換到其他頁面，之後返回繼續同一回合
- **So that** 我不必因為切頁而重新等待 AI 生成試卷

## 3. Acceptance Criteria

- **Scenario 1：切頁後繼續背景生成**
  - **Given** 使用者已開始生成本回合複習試卷
  - **When** 使用者在生成完成前切換到生詞庫、書籍總覽或閱讀頁
  - **Then** AI 生成工作不得被取消
  - **And** 返回間隔複習頁時顯示同一次生成的最新進度或完成試卷
  - **And** 不得再次呼叫 AI 生成

- **Scenario 2：返回後繼續作答**
  - **Given** 複習試卷已完成，且使用者已填寫部分答案
  - **When** 使用者切換到其他頁面後再返回間隔複習頁
  - **Then** 顯示同一份複習試卷
  - **And** 保留每一題已填答案、未作答數量及目前作答狀態

- **Scenario 3：返回後繼續檢視批改**
  - **Given** AI 已完成批改，使用者尚未確認最終評級
  - **When** 使用者切換到其他頁面後再返回間隔複習頁
  - **Then** 保留逐題回饋、AI 建議與使用者已修改的最終評級
  - **And** 不得再次呼叫 AI 批改

- **Scenario 4：明確取消仍會清除**
  - **Given** 複習試卷正在生成
  - **When** 使用者按下「取消生成」
  - **Then** 中斷目前 AI 工作並清除未完成試卷
  - **And** 返回 ready 狀態，允許使用者重新生成

- **Scenario 5：App 生命週期邊界**
  - **Given** 存在生成中或未完成的複習試卷
  - **When** App 關閉，Renderer 工作區真正卸載
  - **Then** 取消生成並清除未完成狀態
  - **And** 下次開啟 App 不恢復題目、答案或未確認回饋

- **Scenario 6：側欄顯示複習試卷狀態**
  - **Given** 使用者已開始生成複習試卷
  - **When** AI 尚未完成生成
  - **Then** 間隔複習側欄入口顯示生成中 icon 與「試卷生成中」可存取狀態
  - **When** AI 完成試卷且回合尚未確認
  - **Then** 側欄改顯示完成 icon 與「試卷已生成，可繼續」可存取狀態
  - **And** 使用者取消、確認完成或回到無未完成試卷狀態後，狀態 icon 消失

- **Scenario 7：先離開並繼續當前試卷**
  - **Given** 使用者正在作答，或正在檢視 AI 批改與調整評級
  - **When** 使用者按下「先離開」
  - **Then** 返回間隔複習首頁，且不呼叫 discard
  - **And** 首頁顯示「繼續當前試卷」
  - **When** 使用者按下「繼續當前試卷」
  - **Then** 顯示同一份試卷及離開前的答案、回饋與評級

- **Scenario 8：確認後放棄當前試卷**
  - **Given** 間隔複習首頁顯示一份未完成試卷
  - **When** 使用者按下「放棄試卷」
  - **Then** 顯示 alert dialog，說明題目、答案、AI 回饋與未確認評級會清除且無法復原
  - **When** 使用者按「取消」
  - **Then** 關閉確認視窗並保留未完成試卷
  - **When** 使用者再次選擇放棄並按「確認放棄」
  - **Then** 呼叫 discard，清除未完成試卷與側欄可繼續狀態
  - **And** 返回可重新生成試卷的間隔複習首頁
  - **And** 不新增複習歷史、不更新複習排程

- **Scenario 9：首頁整合本回合摘要與當前試卷**
  - **Given** 使用者已有未完成試卷，並按下「先離開」
  - **When** 間隔複習首頁重新顯示
  - **Then** 頁面上方保留本回合題數、到期項目與新項目摘要
  - **And** 同一頁下方顯示「當前試卷」卡與作答進度
  - **And** 當前試卷卡提供「查看試卷」及「放棄試卷」
  - **And** 已有試卷時不得同時提供生成另一份試卷的操作
  - **When** 使用者按下「查看試卷」
  - **Then** 在同一間隔複習頁展開原試卷，且本回合摘要仍保留在上方

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 生成中切頁再返回 | generation Promise 尚未完成 | 切到生詞庫、完成生成、返回間隔複習 | 不呼叫 discard；顯示原試卷；generate 只呼叫一次 | Critical |
| TC2 | 作答中切頁再返回 | 已填寫部分答案 | 切到生詞庫再返回 | 同一輸入值與未作答數保持不變 | Critical |
| TC3 | 批改後切頁再返回 | 已有逐題回饋且覆寫評級 | 切到其他工作區再返回 | 回饋與覆寫評級保留；grade 只呼叫一次 | High |
| TC4 | 明確取消 | 生成仍在進行 | 按下取消生成 | 呼叫 discard 並忽略晚到結果 | Critical |
| TC5 | App 卸載 | 存在未完成回合 | App 根元件卸載 | 呼叫 discard 清除暫態 scope | High |
| TC6 | 側欄生成狀態 | generation Promise 仍 pending | 開始生成 | 顯示旋轉 icon 與「試卷生成中」可存取名稱 | Critical |
| TC7 | 側欄可繼續狀態 | generation Promise 完成 | 試卷進入作答狀態 | 顯示完成 icon 與「試卷已生成，可繼續」可存取名稱 | Critical |
| TC8 | 先離開與繼續 | 已填答案或已覆寫評級 | 先離開再繼續 | 首頁與試卷視圖切換；內容保留；不 discard | Critical |
| TC9 | 取消放棄 | 未完成試卷卡已顯示 | 放棄試卷後按取消 | dialog 關閉；試卷與狀態保留；不 discard | Critical |
| TC10 | 確認放棄 | 未完成試卷卡已顯示 | 放棄試卷後確認 | discard 一次；返回生成首頁；狀態回 idle；不 confirm 排程 | Critical |
| TC11 | 首頁整合當前試卷 | 未完成試卷已填部分答案 | 先離開後查看首頁，再查看試卷 | 摘要與當前試卷同頁顯示；無生成按鈕；展開後摘要及答案保留 | Critical |

## 5. Implementation Notes

- `SpacedReviewWorkspace` 必須在同一次 App 生命週期內保持掛載；非目前工作區時可以
  不輸出畫面，但其 React state、進度訂閱與進行中的 IPC Promise 必須繼續存在。
- 工作區模式切換不可呼叫 `discardPaper()`；真正卸載及使用者明確取消仍沿用既有
  discard 邊界。
- Main process 現有 `SpacedReviewController` 已擁有生成工作及受信任 paper／grade
  scope，本功能不把生成搬回 Renderer，也不建立第二份 AI 工作。
- 返回頁面不得透過重新生成重建狀態；應沿用同一個已掛載工作區的 state。
- `SpacedReviewWorkspace` 向 `App` 回報 idle／generating／resumable 三種最小顯示狀態；
  側欄不接觸試卷內容、答案或 AI 回饋。
- 「先離開」是 Workspace 內的視圖狀態，不改變 review phase；重新進入同一份試卷時
  不重新生成、不重新批改，也不呼叫 Main discard。
- 「放棄試卷」只出現在未完成試卷卡，採 alert dialog 二次確認；取消不改變任何
  state，確認後沿用既有 `discardPaper()` 並重新載入 review summary。
- 間隔複習首頁與試卷內容是同一個 Workspace 內的展開／收合狀態；已有 paper 時，
  review summary 必須持續顯示，但不得顯示生成按鈕。收合時在摘要下方顯示當前試卷
  卡，展開時在摘要下方顯示完整原試卷。

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `documents/modules/spaced-review.md`
- `CONTEXT.md`

## 7. Assumptions and Non-goals

- 「切換頁面」指同一個 App Renderer 生命週期內切換書籍總覽、閱讀、生詞庫或間隔
  複習工作區，不包含關閉視窗、重新載入 Renderer、App 當機或系統重啟。
- 不把完整複習試卷、答案、詳細回饋或未確認評級寫入 SQLite。
- 不支援關閉並重新開啟 App 後恢復未完成回合，也不提供跨裝置同步。
- 不改變到期項目選取、試卷內容、AI 模型策略、批改 rubric、FSRS 或確認交易。
- 同一次 App 開啟期間只保留一個複習回合。

## 8. Implementation Record

### Status

Implemented through version 1.4.0 on 2026-07-24.

### Implementation Summary

- `App` 在整個 Renderer 生命週期內維持同一個 `SpacedReviewWorkspace` instance；
  工作區非目前頁面時只回傳空畫面，不卸載元件。
- 跨頁期間保留生成 Promise、進度訂閱、試卷、答案、批改結果與最終評級 React
  state；回到間隔複習頁後直接顯示原狀態，不重複生成或批改。
- 使用者按下「取消生成」仍呼叫 `discardPaper()`；App 根元件真正卸載時既有 cleanup
  仍取消 Main process 工作並清除暫態 scope。
- 未新增 SQLite schema、IPC 或持久化資料；App 關閉後恢復仍明確不在範圍內。
- Workspace 以 idle／generating／resumable 三種最小狀態通知 `App`；側欄分別顯示
  旋轉生成 icon 或試卷已生成的勾選 icon，並提供對應可存取名稱。
- 作答與檢視批改畫面新增「先離開」；它只切換 Workspace 內的試卷視圖。間隔複習
  首頁顯示「繼續當前試卷」，恢復同一份答案、回饋與評級且不呼叫 Main discard。
- 未完成試卷卡新增「放棄試卷」與 alert dialog 二次確認。取消不改變任何狀態；
  確認後才呼叫 `discardPaper()`、重新載入摘要並讓側欄回到 idle，且不呼叫
  `confirmPaper()` 或更新排程。
- 本回合摘要與當前試卷整合到同一頁：摘要在試卷作答、批改及確認期間持續顯示；
  「先離開」只把完整試卷收合成摘要下方的當前試卷卡，卡片提供「查看試卷」與
  「放棄試卷」。已有試卷時隱藏生成按鈕，避免建立第二份試卷。

### Test Coverage

- TC1：App integration test 以 pending generation Promise 模擬背景生成，切到生詞庫
  後完成 Promise，再返回驗證同一份試卷、單次 generate 及未 discard。
- TC2：App integration test 在作答中填入答案，跨頁返回後驗證輸入值與單次 generate。
- TC3：App integration test 完成批改並覆寫評級，跨頁返回後驗證回饋、checked rating
  與單次 grade。
- TC4：既有 Workspace test 驗證明確取消呼叫 discard 並忽略晚到 paper。
- TC5：TC1 在 App unmount 後驗證只呼叫一次 discard；既有 Workspace tests 也驗證
  progress unsubscribe 與真正卸載 cleanup。
- TC6／TC7：App integration test 驗證 idle 無 icon、generating 旋轉 icon、取消回 idle，
  以及第二次生成完成後顯示 resumable 勾選 icon 與可存取名稱。
- TC8：Workspace test 先在作答狀態離開／繼續，再於批改狀態重複操作，驗證答案、
  回饋、評級與單次 generate／grade 全部保留且不 discard。
- TC9／TC10：Workspace test 驗證放棄 dialog 的警告內容、取消後保留試卷且不
  discard，以及確認後只 discard、回到生成首頁、狀態回 idle 且不 confirm 排程。
- TC11：Workspace test 驗證先離開後，本回合摘要與當前試卷卡依序在同一頁顯示、
  作答進度正確、生成按鈕隱藏；查看原試卷後摘要與答案仍保留。
- 完成回合測試透過 `onStatusChange` 驗證 resumable 在確認後回到 idle。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/implements/F31-resumable-background-spaced-review.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 切頁後繼續背景生成 | Pass | `continues generating a review paper while another workspace is open` |
| 返回後繼續作答 | Pass | `keeps review answers when switching workspaces` |
| 返回後繼續檢視批改 | Pass | `keeps review feedback and rating overrides when switching workspaces` |
| 明確取消仍會清除 | Pass | `cancels generation and ignores a late paper result` |
| App 關閉後不保留 | Pass | App integration unmount assertion、Workspace cleanup assertions |
| 側欄顯示生成中與可繼續狀態 | Pass | `shows generating and resumable review-paper icons in the sidebar` |
| 先離開並繼續同一份試卷 | Pass | `leaves and continues the current paper without discarding progress` |
| 二次確認後放棄試卷 | Pass | `confirms before abandoning the current paper without updating schedules` |
| 首頁整合本回合摘要與當前試卷 | Pass | `keeps the round summary and current paper together when leaving and viewing` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Background generation App test |
| TC2 | Pass | Answer restoration App test |
| TC3 | Pass | Feedback and rating restoration App test |
| TC4 | Pass | Existing explicit cancellation Workspace test |
| TC5 | Pass | App and Workspace unmount cleanup assertions |
| TC6 | Pass | Sidebar generating icon and cancellation assertions |
| TC7 | Pass | Sidebar resumable icon and accessible-name assertions |
| TC8 | Pass | Workspace leave／continue state-preservation assertions |
| TC9 | Pass | Abandon confirmation cancellation assertions |
| TC10 | Pass | Confirmed discard／idle／no-confirm assertions |
| TC11 | Pass | Round-summary／current-paper adjacency, progress, no-regenerate and restored-answer assertions |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "continues generating a review paper|keeps review answers|keeps review feedback"
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx src/renderer/App.test.tsx -t "leaves and continues|shows generating and resumable"
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "confirms before abandoning"
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "keeps the round summary"
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx
npm test -w @reader/desktop -- --run src/renderer/App.test.tsx src/renderer/SpacedReviewWorkspace.test.tsx
npm test
npm run typecheck
npm run build -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

1. 使用者確認同一次 App 開啟期間跨頁保留即可；App 重開後恢復不是本功能範圍。
2. 現有取消來源是工作區卸載 cleanup。把工作區提升為 App 生命週期常駐元件，可讓
   真正卸載繼續代表 App 關閉，同時讓一般工作區切換不再觸發取消。
3. Red phase 的三個測試皆如預期失敗：生成案例觀察到切頁後 `discardPaper()` 已呼叫
   一次；作答與批改案例返回後只剩 ready 畫面。這確認根因是 Renderer component
   lifecycle，而非 Main process、IPC 或 AI workflow。
4. 不新增 session snapshot IPC 或資料庫表；現有 Main controller 已能在 Renderer
   掛載期間持續生成，最小修正是在 App 層修正元件生命週期。
5. 實作未暴露新的架構問題：複習工作區既有 state 與 Main controller scope 的責任
   邊界足以承接本需求，不需要另開 RXX。
6. 「已完成 icon」採用 `CircleCheck`，但可存取名稱固定為「試卷已生成，可繼續」，
   避免與確認評級後的「本回合已完成」混淆。
7. 「先離開」沒有改變既有 review phase，而是獨立的 paused view state；因此不需要
   複製或重新載入答案與批改資料。
8. 側欄只接收三態 enum，不接收 paper、answer 或 grade，維持工作區資料封裝。
9. 放棄試卷沿用既有受控 `discardPaper()` 邊界，不新增可寫入排程的 IPC；確認流程
   只清除暫態 paper scope 並重新讀取摘要，因此不可能誤送最終評級。
10. Version 1.4 red phase 確認「先離開」後 DOM 只剩未完成試卷卡，完全沒有本回合
    摘要。最小修正是讓摘要依 active paper 狀態持續顯示，並把 paused view 放在摘要
    後方；不需要新增 page route、state snapshot 或 Main process 行為。
11. 第一個 Green 執行中，產品 DOM 已正確顯示「1 題詞義回想 · 已作答 1／1 題」，
    但測試使用完整文字比對而失敗。確認原因是斷言未包含文案前綴後，改為檢查進度
    子字串；產品邏輯不需為測試調整。

### Deferred Items

- App 重開後恢復未完成回合。
- 跨裝置同步未完成複習試卷。

### Notes

- 完整測試結果：server 3 tests、desktop 230 tests，全數通過。
- TypeScript typecheck、desktop production build 及 `git diff --check` 全數通過。
- 工作樹中既有 B08／reading-comprehension 變更與本功能無關，本次未修改或回退。

## Appendix: TDD Implementation Checklist

1. 新增 App 跨頁生成與作答恢復、放棄確認，以及同頁整合的 failing tests。
2. 驗證 failing reason 是工作區被卸載並呼叫 discard。
3. 以最小變更讓複習工作區在 App 生命週期內保持掛載，並讓摘要與當前試卷在同一頁
   依展開／收合狀態排列。
4. 執行 focused tests、完整 desktop tests、typecheck、build 及 diff check。
5. 更新本文件及 `documents/modules/spaced-review.md`。
