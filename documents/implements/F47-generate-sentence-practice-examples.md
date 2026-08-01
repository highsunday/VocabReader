---
author: Codex
date: 2026-08-01
title: 在整合造句練習中產生三篇用法範例
uuid: 766cf328bf4d48aba6bd2068fc101f64
version: 1.0.0
---

# Feature Specification - 在整合造句練習中產生三篇用法範例

## 1. Feature Overview

整合造句練習目前會列出本輪全部必要用詞與簡明解釋，要求使用者自行撰寫多句故事或
短文，但沒有示範如何把多個不同字詞自然組合成完整語境。本功能在既有練習回合加入
明確的「Show 3 examples」動作，由受限 AI workflow 依同一組必要用詞及各自目標語義，
產生恰好三篇彼此不同的英文**造句用法範例**。

範例只作為觀察用的鷹架：不得自動寫入或取代使用者草稿，不是標準答案，也不建立複習
歷史、寫作歷史、評級或 FSRS 更新。範例跟隨既有暫態練習回合，在 App 關閉或開始新一
輪後消失。

## 2. Requirements (User Story)

- **As a** 正在進行整合造句練習的英文學習者
- **I want** 讓 AI 依本輪全部必要用詞產生三篇完整用法範例
- **So that** 我可以先觀察這些字詞如何自然組成句子或短文，再完成自己的英文寫作

## 3. Acceptance Criteria

- **Scenario 1：產生三篇完整範例**
  - **Given** 使用者已開始一輪包含 2 至 10 個必要用詞的整合造句練習
  - **When** 使用者選擇「Show 3 examples」
  - **Then** AI 產生並顯示恰好三篇非空英文造句用法範例
  - **And** 每篇都自然使用本輪全部必要用詞及各自目標語義
  - **And** 三篇應採用不同情境或表達方式，不只做表面改字

- **Scenario 2：範例不取代學習者作答**
  - **Given** 使用者已在輸入區撰寫草稿
  - **When** 產生並顯示三篇範例
  - **Then** 原草稿內容保持不變
  - **And** 範例只顯示在獨立區塊，不自動複製到輸入區

- **Scenario 3：產生中狀態與重複操作防護**
  - **Given** AI 正在產生造句用法範例
  - **When** 畫面等待結果
  - **Then** 範例按鈕顯示清楚的產生中狀態並停用
  - **And** 同一練習回合不得同時執行範例產生與草稿批改

- **Scenario 4：失敗後可重試**
  - **Given** AI runtime 失敗或回傳不符合契約的範例
  - **When** 本次產生結束
  - **Then** 畫面顯示範例產生錯誤而不清除必要用詞或使用者草稿
  - **And** 使用者可再次執行範例產生

- **Scenario 5：範例的暫態生命週期**
  - **Given** 本輪已產生三篇範例
  - **When** 使用者切換至其他工作區後再返回
  - **Then** 同一次 App 執行期間仍顯示本輪範例
  - **When** 使用者確認開始新一輪
  - **Then** 舊範例隨舊回合一起被取代

- **Scenario 6：維持資料與排程邊界**
  - **Given** 任一範例產生成功或失敗
  - **When** 檢查生詞庫與複習狀態
  - **Then** 不新增 `learning_review_events`、不修改 FSRS／due time，也不建立永久範例紀錄

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 嚴格解析三篇範例 | 正確 session 與本輪 items | 解析合法 AI artifact | 得到恰好 3 篇且每篇 usage 完整覆蓋本輪 items | Critical |
| TC2 | 拒絕越界範例 | 缺篇、重複／未知 item、標題不符或空文字 | 解析 artifact | 拒絕結果，不把資料交給 Renderer | Critical |
| TC3 | Controller 產生範例 | 已開始練習回合 | 呼叫 generate examples | bounded prompt 只含本輪 source items，snapshot 保存 3 篇範例 | Critical |
| TC4 | 失敗可重試 | AI 首次回傳 malformed artifact | 產生後再次觸發 | 首次保留回合與草稿並顯示 error，第二次可成功 | High |
| TC5 | 防止並行 AI 操作 | 範例正在產生或草稿正在批改 | 再觸發另一 AI 操作 | 請求被拒絕或 UI 操作停用 | High |
| TC6 | IPC／Preload 白名單 | Renderer 傳入 session id 與講解語言 | 呼叫 generate examples | 只轉送窄化輸入，拒絕任意 scope 或語言 | Critical |
| TC7 | Renderer 顯示與草稿隔離 | 已有非空草稿 | 點擊 Show 3 examples 並取得結果 | 顯示產生中與 3 篇獨立範例，草稿維持原值 | Critical |
| TC8 | 新一輪清除範例 | 舊回合已有範例 | 確認開始新一輪 | 新 session 回到未產生範例狀態 | High |
| TC9 | 既有回歸 | 新增 artifact、controller、IPC、UI 與 skill 分支 | 執行相關 tests、typecheck、build | 既有造句批改與其他工作區維持通過 | Critical |

## 5. Implementation Notes

- 延伸 `SentencePracticeSession`，以獨立 example generation state 保存 `idle |
  generating | ready | error`、三篇範例與錯誤；不得混用既有 writing／checking／completed
  phase，以免看範例被誤認為提交草稿。
- 新增窄化的 `generateExamples({ sessionId, explanationLanguage })` Desktop API 與 IPC；
  Renderer 不得提供 item ids、sense、Markdown、數量或 AI prompt。
- 延伸 App-bundled `practice-integrated-sentences` skill，清楚區分 example generation 與
  draft validation／feedback 兩種 bounded task。範例本文固定為英文；必要用詞的目標語義
  仍以 App 提供的 `sense` 與 Markdown 為準。
- AI artifact 必須包含正確 session id、恰好三篇非空 example text，且每篇包含恰好一次
  覆蓋全部本輪 items 的結構化 usage 清單。Parser 驗證 id、title、重複與完整 coverage。
- 產生中不可啟動批改，批改中也不可產生範例。錯誤只更新 example state，不改變草稿
  phase 或內容。
- 顯示範例時以 React 文字節點呈現，不渲染 AI HTML；不提供一鍵覆寫草稿。
- 更新 `documents/modules/sentence-practice.md`；這是既有模組能力擴充，不新增 module doc
  或 ADR。

## 6. Assumptions, Non-goals, and Open Questions

### Assumptions

- 使用者所稱「測驗」是現有整合造句練習，而非閱讀區段練習或間隔複習試卷；依據是
  需求明確提到「這些字詞」組成「句子或小段落文章」，與現有 Required items 工作區完全
  對應。
- 每篇範例都使用全部本輪必要用詞，才能直接示範使用者目前要完成的同一任務。
- 第一版允許成功後再次產生新的三篇範例，但不保留舊批次；新結果原子取代舊結果。

### Non-goals

- 不把範例當作唯一標準答案，不評分使用者與範例的相似度。
- 不提供單一字詞各三句的獨立例句清單。
- 不自動貼入、追加或改寫使用者草稿。
- 不保存範例歷史、不更新學習項目內容、複習紀錄或排程。
- 不增加主題、難度、文體、長度或 item 手動選擇設定。

### Open Questions

- 無阻擋實作的未決問題。

## 7. Implementation Record

### Status

Not implemented

### Implementation summary

Pending.

### Test coverage

Pending.

### Changed files

Pending.

### Acceptance criteria verification

Pending.

### Test scenario verification

Pending.

### Commands executed

Pending.

### Hypotheses and decisions

- 依現有領域與 UI 將「測驗」解讀為整合造句練習；若產品未來希望在間隔複習也提供
  多詞短文示範，應另立功能，避免混淆逐題語義回想與主動輸出練習。

### Deferred items

Pending.

### Notes

Pending.
