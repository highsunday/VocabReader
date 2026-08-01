---
author: Codex
date: 2026-08-01
title: 在整合造句練習中產生三篇用法範例
uuid: 766cf328bf4d48aba6bd2068fc101f64
version: 1.1.0
---

# Feature Specification - 在整合造句練習中產生三篇用法範例

## 1. Feature Overview

整合造句練習目前會列出本輪全部必要用詞與簡明解釋，要求使用者自行撰寫多句故事或
短文，但沒有示範如何把多個不同字詞自然組合成完整語境。本功能在既有練習回合加入
明確的「Show 3 examples」動作；按下後開啟一張範例對話卡片，由受限 AI workflow 依
同一組必要用詞及各自目標語義，產生恰好三篇彼此不同的英文**造句用法範例**。

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
  - **Then** 系統開啟一張具名範例對話卡片並顯示產生狀態
  - **And** AI 完成後在同一張卡片中顯示恰好三篇非空英文造句用法範例
  - **And** 每篇都自然使用本輪全部必要用詞及各自目標語義
  - **And** 三篇應採用不同情境或表達方式，不只做表面改字

- **Scenario 2：範例不取代學習者作答**
  - **Given** 使用者已在輸入區撰寫草稿
  - **When** 產生並顯示三篇範例
  - **Then** 原草稿內容保持不變
  - **And** 範例只顯示在對話卡片，不自動複製到輸入區
  - **And** 關閉卡片後可再次以「Show 3 examples」開啟同一批範例

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

- **Scenario 7：範例入口位於寫作操作列左側**
  - **Given** 使用者正在整合造句練習中撰寫故事或短文
  - **When** 使用者查看輸入框下方的操作列
  - **Then** 「Show 3 examples」位於操作列左側，「Check my writing」位於右側
  - **And** 畫面不顯示草稿字數計數
  - **And** 頁面標題列不重複顯示「Show 3 examples」

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 嚴格解析三篇範例 | 正確 session 與本輪 items | 解析合法 AI artifact | 得到恰好 3 篇且每篇 usage 完整覆蓋本輪 items | Critical |
| TC2 | 拒絕越界範例 | 缺篇、重複／未知 item、標題不符或空文字 | 解析 artifact | 拒絕結果，不把資料交給 Renderer | Critical |
| TC3 | Controller 產生範例 | 已開始練習回合 | 呼叫 generate examples | bounded prompt 只含本輪 source items，snapshot 保存 3 篇範例 | Critical |
| TC4 | 失敗可重試 | AI 首次回傳 malformed artifact | 產生後再次觸發 | 首次保留回合與草稿並顯示 error，第二次可成功 | High |
| TC5 | 防止並行 AI 操作 | 範例正在產生或草稿正在批改 | 再觸發另一 AI 操作 | 請求被拒絕或 UI 操作停用 | High |
| TC6 | IPC／Preload 白名單 | Renderer 傳入 session id 與講解語言 | 呼叫 generate examples | 只轉送窄化輸入，拒絕任意 scope 或語言 | Critical |
| TC7 | Renderer 卡片與草稿隔離 | 已有非空草稿 | 點擊 Show 3 examples 並取得結果 | 開啟具名對話卡片，顯示產生中與 3 篇獨立範例，關閉／重開卡片後草稿及範例均維持 | Critical |
| TC8 | 新一輪清除範例 | 舊回合已有範例 | 確認開始新一輪 | 新 session 回到未產生範例狀態 | High |
| TC9 | 既有回歸 | 新增 artifact、controller、IPC、UI 與 skill 分支 | 執行相關 tests、typecheck、build | 既有造句批改與其他工作區維持通過 | Critical |
| TC10 | Renderer 操作列版面 | 已開始練習回合 | 顯示寫作輸入區 | 範例按鈕在輸入框下方操作列左側、提交按鈕在右側，且沒有字數計數或標題列範例按鈕 | High |

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
- Renderer 在寫作輸入框下方操作列左側提供「Show 3 examples」按鈕，右側保留
  「Check my writing」，並移除字數計數；按下範例按鈕後先開啟具名 `dialog` 卡片，再觸發
  尚未產生的本輪範例。卡片提供明確關閉操作，關閉只隱藏卡片，不清除本輪範例。
- 顯示範例時以 React 文字節點呈現，不渲染 AI HTML；不提供一鍵覆寫草稿。成功後允許
  從卡片明確要求重新產生三篇範例，新結果原子取代舊結果。
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

Implemented

### Implementation summary

- 延伸整合造句 session，以獨立 `exampleGeneration` 狀態保存產生中、恰好三篇範例與
  可重試錯誤；開始新一輪時回到 idle。
- 新增受限 AI examples prompt、`sentence-practice-examples` artifact parser、controller
  操作、IPC 與 preload API；每篇都必須完整覆蓋本輪必要用詞。
- 練習頁新增「Show 3 examples」按鈕與具名對話卡片；卡片支援產生中、錯誤重試、關閉
  後重開同一批範例，以及明確重新產生三篇範例。
- 「Show 3 examples」位於寫作輸入框下方操作列左側，右側保留「Check my writing」；
  原有字數計數已移除，頁面標題列也不再重複顯示範例入口。
- 範例只以 React 文字節點顯示，不讀寫草稿、複習歷史、FSRS 或 due time。

### Test coverage

- TC1／TC2：`sentence-practice-artifacts.test.ts` 驗證恰好三篇、完整 usage coverage、不同
  本文，以及缺篇、重複、未知 scope 拒絕。
- TC3／TC4／TC5／TC8：`sentence-practice-controller.test.ts` 驗證 bounded prompt、成功保存、
  malformed retry、範例與批改互斥，以及新一輪清除。
- TC6：`sentence-practice-ipc.test.ts` 驗證第四個窄化 operation 與惡意 payload 拒絕。
- TC7／TC10：`SentencePracticeWorkspace.test.tsx` 驗證卡片產生中、三篇顯示、草稿隔離、
  關閉重開不重跑 AI、錯誤重試，以及範例／提交按鈕的左右位置與移除字數計數。
- TC9：Desktop 全套 361 tests、typecheck 與 production build 通過。

### Changed files

#### Production code

- `.agents/skills/practice-integrated-sentences/SKILL.md`
- `apps/desktop/src/shared/sentence-practice-contracts.ts`
- `apps/desktop/src/main/sentence-practice-artifacts.ts`
- `apps/desktop/src/main/sentence-practice-controller.ts`
- `apps/desktop/src/main/sentence-practice-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/sentence-practice-artifacts.test.ts`
- `apps/desktop/src/main/sentence-practice-controller.test.ts`
- `apps/desktop/src/main/sentence-practice-ipc.test.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documents

- `documents/implements/F47-generate-sentence-practice-examples.md`
- `documents/modules/sentence-practice.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 產生並在對話卡片顯示三篇完整範例 | Pass | Artifact、controller 與 Renderer card tests |
| 範例不取代或修改學習者草稿 | Pass | Renderer draft isolation test |
| 產生中狀態與 AI 操作互斥 | Pass | Renderer loading test、controller concurrency test |
| 失敗顯示錯誤並可重試 | Pass | Controller malformed retry、Renderer card retry tests |
| 同 App 執行期間保留，新一輪清除 | Pass | Cached reopen test、controller new-round assertion |
| 不建立複習紀錄或更新排程 | Pass | Controller 僅持有 memory session，未新增任何 library mutation |
| 範例入口位於操作列左側且不顯示字數 | Pass | Renderer footer placement test、實際瀏覽器畫面驗收 |

### Test scenario verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | accepts exactly three examples covering every trusted item |
| TC2 | Pass | rejects missing, duplicate and out-of-scope examples |
| TC3 | Pass | generates three bounded examples without changing the learner draft |
| TC4 | Pass | keeps the round retryable after malformed example output |
| TC5 | Pass | prevents example generation and draft checking from running together |
| TC6 | Pass | registers only bounded operations and rejects malformed payloads |
| TC7 | Pass | opens a card with exactly three AI examples without changing the draft；shows an example-generation error in the card and retries |
| TC8 | Pass | controller test verifies a new session has idle empty example state |
| TC9 | Pass | Desktop 361/361 tests、typecheck、production build |
| TC10 | Pass | places the examples action on the left of the writing footer without a word count |

### Commands executed

```bash
npm test -w @reader/desktop -- ../main/sentence-practice-artifacts.test.ts
npm test -w @reader/desktop -- ../main/sentence-practice-controller.test.ts
npm test -w @reader/desktop -- ../main/sentence-practice-ipc.test.ts
npm test -w @reader/desktop -- SentencePracticeWorkspace.test.tsx
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

### Hypotheses and decisions

- 依現有領域與 UI 將「測驗」解讀為整合造句練習；若產品未來希望在間隔複習也提供
  多詞短文示範，應另立功能，避免混淆逐題語義回想與主動輸出練習。
- 例句產生使用獨立 session state，不改變既有 writing／checking／completed phase。
- IPC 只在 AI 完成後回傳 snapshot，因此 Renderer 以本地 pending state 立即呈現產生中，
  controller 仍保存 authoritative generating／ready／error state。
- 成功後重新開啟卡片沿用同一批結果；只有卡片內的「Generate 3 new examples」才重跑 AI。
- 實際渲染驗收發現卡片說明的 JSX 文字邊界缺少空格，已改成顯式空格並重新驗證。
- 依使用者後續畫面回饋，範例入口由標題列移至寫作操作列左側，直接取代資訊價值較低的
  即時字數計數；提交按鈕維持在右側。

### Deferred items

- 無。

### Notes

- Parser 可拒絕完全相同的範例本文；情境是否真正不同仍由受限 AI skill 的語義規則保證。
- 專案本身維持桌面應用程式的 `body min-width: 1080px`；範例卡片另有窄視窗收斂樣式，
  但本功能不改變整體產品的最小桌面寬度。
