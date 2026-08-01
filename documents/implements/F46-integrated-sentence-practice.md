---
author: Codex
date: 2026-08-01
title: 以已複習學習項目進行整合造句練習
uuid: e746a029-ef1b-4bc5-958f-5cffcb6b23d0
version: 1.0.0
status: implemented
---

# Feature Specification - 以已複習學習項目進行整合造句練習

## 1. Feature Overview

目前 VocabReader 的主動輸出主要出現在區段問答題與間隔複習的意思回答，尚未提供讓
使用者同時運用多個已學習單字或片語、自行組織完整英文內容的獨立練習。

本功能新增側欄「Sentence Practice」入口與獨立的**整合造句練習**頁面。使用者可設定
2 至 10 個項目，預設 5 個；系統從仍在生詞庫使用、語言為英文且至少完成並確認過一次
間隔複習的學習項目中隨機抽取不重複項目，顯示每個項目的既有簡明解釋，讓使用者撰寫
一段可包含多個句子的故事或短文，且全文必須使用所有抽中項目。

使用者提交後，AI 先確認所有必要用詞及其自然詞形變化是否存在，並符合各項目的目標
語義。若有遺漏或誤用，頁面明確列出並保留原稿供修改；只有全部符合時才產生正式的
**造句批改結果**，包含保留原意的完整修正版、逐項修改說明、必要時的自然口語建議，
以及每個必要用詞在修正版中的實際用法。

本練習在同一次 App 開啟期間跨頁保留，開始新一輪時清除上一輪；關閉 App 後不恢復，
不建立永久寫作歷史，也不更新 FSRS、複習排程或間隔複習紀錄。

## 2. Requirements (User Story)

- **As a** 已透過間隔複習累積英文學習項目的 VocabReader 使用者
- **I want** 用一篇故事或短文同時運用多個隨機抽出的單字與片語，並取得保留原意的 AI 修正
- **So that** 我能練習把已認識的詞彙組織成正確、自然且較口語的英文句子

## 3. Acceptance Criteria

- **Scenario 1：顯示可用數量與設定練習項目數**
  - **Given** 生詞庫含有符合與不符合整合造句資格的學習項目
  - **When** 使用者開啟整合造句練習頁
  - **Then** 頁面顯示符合資格的項目總數
  - **And** 可設定 2 至 10 個項目，預設 5 個，且上限不得超過符合資格的項目數
  - **And** 少於 2 個符合資格項目時不得開始，並提示先完成更多英文項目的間隔複習

- **Scenario 2：只從符合資格的英文項目隨機抽取**
  - **Given** 使用中的英文項目包含未複習與至少已有一筆已確認複習紀錄者，另有非英文與垃圾桶項目
  - **When** 使用者以有效數量開始一輪練習
  - **Then** 系統只從 active、英文且 review count 大於零的項目隨機抽取
  - **And** 同一輪內不得重複抽到同一個項目
  - **And** 實際抽取數量等於使用者設定數量

- **Scenario 3：顯示必要用詞與簡單語意**
  - **Given** 一輪練習已建立
  - **When** 頁面顯示抽中的項目
  - **Then** 每個項目顯示標題、單字或片語類型及既有 Markdown `Meaning` 區塊的第一段簡明解釋
  - **And** 若 `Meaning` 區塊不存在或沒有內容，改顯示項目的英文目標語義
  - **And** 顯示提示說明使用者可撰寫多句故事或短文，但必須使用所有項目

- **Scenario 4：開啟唯讀學習項目詳情**
  - **Given** 練習頁已顯示抽中的單字或片語
  - **When** 使用者選擇其中一個項目
  - **Then** 開啟既有的學習項目詳情浮層並顯示完整內容與複習摘要
  - **And** 詳情不提供編輯、儲存或移入垃圾桶操作
  - **And** 關閉詳情後仍保留原練習與草稿

- **Scenario 5：提交前保留可編輯短文**
  - **Given** 一輪練習已建立
  - **When** 使用者在輸入區撰寫包含多個句子的英文故事或短文
  - **Then** 頁面保留完整輸入並允許繼續修改
  - **And** 空白或只有空白字元的內容不得提交

- **Scenario 6：必要用詞遺漏或誤用時要求修稿**
  - **Given** 使用者提交的短文遺漏項目、只提及錯誤語義，或不合理地使用詞形
  - **When** AI 驗證所有必要用詞與目標語義
  - **Then** 回傳結構化的遺漏或誤用項目與簡短說明
  - **And** 不產生正式造句批改結果
  - **And** 頁面保留原稿、顯示需修正項目並允許再次提交
  - **And** 合理的時態、單複數及其他自然詞形變化不得僅因未完全等於標題而判為遺漏

- **Scenario 7：產生保留原意的正式造句批改結果**
  - **Given** 使用者短文已正確使用全部必要用詞及目標語義
  - **When** AI 完成驗證與批改
  - **Then** 結果包含一篇完整修正版
  - **And** 修正版保留原故事、人物、事件、觀點與語氣，不加入原文沒有的新情節
  - **And** 結果包含原句、建議說法與以目前講解語言撰寫原因的逐項修改說明
  - **And** 只有在確實更自然時才包含自然口語建議，不為產生建議而強行改寫
  - **And** 結果列出每個必要用詞在修正版中的實際用法

- **Scenario 8：AI 回傳失敗時安全重試**
  - **Given** AI 未連線、工作失敗、逾時或回傳 malformed／不完整結構
  - **When** 使用者提交短文
  - **Then** 頁面顯示可重試錯誤且保留抽中項目與原稿
  - **And** malformed 的成功結果不得被呈現為正式批改
  - **And** 不寫入複習歷史或更新排程

- **Scenario 9：同一次 App 開啟期間跨頁恢復**
  - **Given** 使用者已有抽中項目、草稿、驗證問題或正式批改結果
  - **When** 使用者切換到其他工作區後再回到整合造句練習
  - **Then** 恢復同一輪的目前狀態與內容
  - **And** 切換頁面不取消進行中的 AI 批改

- **Scenario 10：明確開始新一輪並維持暫態邊界**
  - **Given** 使用者已有進行中或已完成的一輪練習
  - **When** 使用者明確選擇開始新一輪並確認放棄目前內容
  - **Then** 清除上一輪的項目、草稿、問題與結果，再依目前數量隨機抽取新一組
  - **And** 關閉並重新開啟 App 後不恢復未完成或已完成練習
  - **And** 任何練習行為都不建立永久寫作歷史、不更新 FSRS 或間隔複習紀錄

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 資格摘要 | active reviewed English、new English、reviewed non-English、trash 混合資料 | 載入頁面 | 只計算 active reviewed English | Critical |
| TC2 | 數量下限 | 符合資格項目少於 2 | 開啟頁面 | 不可開始並顯示指引 | Critical |
| TC3 | 數量設定 | 至少 10 個符合資格項目 | 設定 2、5、10 及越界值 | 合法值可用、越界值拒絕 | Critical |
| TC4 | 隨機抽取 | 多個符合與不符合資格項目 | 建立指定數量的一輪 | 數量正確、無重複且無不合格項目 | Critical |
| TC5 | Meaning 擷取 | Markdown 有有效、空白及缺少 Meaning 區塊 | 顯示必要用詞 | 有效者顯示首段，其餘 fallback sense | High |
| TC6 | 唯讀詳情 | 已抽中項目 | 開啟詳情 | 顯示內容與複習摘要，無 mutation 控制 | High |
| TC7 | 空白短文 | 已建立一輪 | 提交空白 | 不呼叫 AI 並保持可編輯 | High |
| TC8 | 詞形與語義驗證 | 短文含自然詞形、遺漏及錯誤語義案例 | AI 回傳 validation result | 自然詞形接受；遺漏／誤用列出且不呈現正式批改 | Critical |
| TC9 | 正式批改 contract | 全部必要用詞正確使用 | AI 回傳 feedback result | 完整修正版、逐項說明、選用口語建議與每項用法完整 | Critical |
| TC10 | Artifact 防護 | AI 回傳未知 item id、缺欄位或混合 validation／feedback shape | 解析結果 | 整份拒絕並顯示可重試錯誤 | Critical |
| TC11 | 講解語言 | 設定使用繁中、英文、日文或原文語言 | 提交有效短文 | 修改原因使用解析後的目前講解語言 | High |
| TC12 | 跨頁暫態 | AI 進行中、草稿、問題或結果存在 | 切換工作區再返回 | 狀態不遺失且進行中工作不中斷 | Critical |
| TC13 | 新一輪確認 | 目前已有草稿或結果 | 選擇新一輪 | 確認後清除並重抽；取消則完整保留 | High |
| TC14 | 無持久副作用 | 完成、失敗或放棄任一練習 | 查詢 schedules、events 與重啟狀態 | 排程／歷史不變且重啟無練習狀態 | Critical |
| TC15 | 既有回歸 | 新增頁面與 IPC | 執行 desktop tests、typecheck、build | 生詞庫、間隔複習、閱讀與 AI 對話保持通過 | Critical |

## 5. Implementation Notes

### Domain and selection

- 新增受限的 Main-owned 造句練習 repository query；Renderer 只傳入 2 至 10 的數量，
  不得提供 item ids、語言、狀態、review count、隨機排序或目前時間。
- eligibility 固定為 `learning_items.status = active`、`language = en`，且存在
  `learning_review_schedules.review_count > 0`；選取時以 SQLite 隨機順序限制數量，
  同一 item id 在一輪內只能出現一次。
- count query 與 selection query 都在 repository boundary 套用相同資格條件；不沿用
  間隔複習的 due／daily limit／paper size 選取規則。
- 項目資料包含 id、title、item type、CEFR、sense、Markdown 及從 `Meaning` heading
  擷取的提示。提示解析必須有界且可安全 fallback，不執行 Markdown HTML。

### AI contract and lifecycle

- 新增 App-bundled 的整合造句練習 skill 與結構化 artifact parser；一次提交在同一 AI
  workflow 中先驗證必要用詞，再依結果回傳 validation issues 或完整 feedback。
- 傳給 AI 的 scope 僅包含本輪可信任 item id、title、type、sense、必要的 learning
  content、使用者短文與講解語言；Renderer 不可替換已抽中的 item scope。
- validation result 與 feedback result 使用互斥 discriminator；parser 必須拒絕未知 id、
  duplicate／missing coverage、空字串、未知欄位值，以及一半 validation 一半 feedback 的結果。
- Controller 以 Main process memory 保存目前一輪與進行中的工作；切換 Renderer workspace
  不銷毀 controller。明確開始新一輪才替換狀態；App 結束後自然清除。
- AI 呼叫不得接觸 `confirmReviewSession()`，也不得新增 `learning_review_events` 或修改
  `learning_review_schedules`。

### IPC and Renderer

- 新增獨立、窄化的 `sentence-practice:*` IPC／preload bridge：取得快照、建立新一輪、
  提交短文、取得學習項目詳情及訂閱狀態變更；不暴露任意 SQL 或 item-id selection。
- `App` 新增與 Learning Library、Spaced Review 平行的 Sentence Practice workspace mode。
  頁面 component 在 App 生命週期內保持 mounted，透過 `active` 控制可見狀態，使生成中、
  草稿、validation issues 與 feedback 跨頁保留。
- 使用既有 `LearningItemDialog` 的 `readOnly` capability 顯示詳情與 review summary。
- 開始新一輪若目前已有非空草稿、問題、結果或進行中工作，必須使用具名確認 dialog；
  AI 進行中不得無提示覆蓋。
- 頁面需呈現 loading、eligible-empty、ready、writing、checking、needs-revision、completed、
  error 狀態，並保持鍵盤焦點與 `role=status`／`role=alert` 等基本可及性。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「非新卡」的正式定義是 active、英文且 `review_count > 0` 的學習項目，不依建立時間、
  currently due、stability 或今日額度判定。
- 自然詞形變化是否有效由 AI 依實際句子判斷；Renderer 不以 exact string match 阻擋提交。
- `Meaning` 提示沿用建立或編輯學習項目時保存的語言，不因目前講解語言變更而重新翻譯。
- 一輪練習只提交一篇短文；不要求所有必要用詞出現在同一句。
- 頁面文案沿用現有英文 GUI；AI 的逐項修改原因使用目前講解語言。

### Open Questions

- 無。

### Non-goals

- 不為每個項目各建立一個獨立造句欄位或要求每卡各造一句。
- 不強迫全部必要用詞出現在同一個句子。
- 不產生故事題目、情境或 AI 代寫初稿。
- 不新增永久練習紀錄、作文版本歷史、分數、成就、FSRS 評級或排程更新。
- 不抽取未複習新項目、非英文項目、垃圾桶項目或任意手動指定項目。
- 不在練習詳情中編輯、刪除或還原學習項目。
- 不為 Meaning 提示額外呼叫 AI 或批次重寫既有學習內容。
- 不新增 deck、標籤、主題、難度或書籍來源篩選。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/shared/sentence-practice-contracts.ts`
- `apps/desktop/src/main/sentence-practice-artifacts.ts`
- `apps/desktop/src/main/sentence-practice-controller.ts`
- `apps/desktop/src/main/sentence-practice-ipc.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `.agents/skills/practice-integrated-sentences/SKILL.md`

### Test code

- `apps/desktop/src/main/sentence-practice-artifacts.test.ts`
- `apps/desktop/src/main/sentence-practice-controller.test.ts`
- `apps/desktop/src/main/sentence-practice-ipc.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- Related Main, preload and Electron regression tests affected by API wiring

### Documentation

- `CONTEXT.md`
- `documents/implements/F46-integrated-sentence-practice.md`
- `documents/modules/learning-library.md`
- `documents/modules/sentence-practice.md`

## 8. Implementation Record

### Status

Implemented on 2026-08-01.

### Implementation Summary

- 新增 active、英文且 `review_count > 0` 的 Main-owned 資格 count 與 SQLite 隨機抽取；
  數量固定驗證 2–10，同輪 item id 不重複，可用數不足時拒絕建立不完整回合。
- 從學習項目 Markdown 的 `Meaning` heading 擷取第一段簡義，缺少或空白時 fallback 至
  item `sense`；query 全程 read-only，不修改 FSRS、schedule 或 review events。
- 新增 bounded sentence-practice contracts、union artifact parser、暫態 controller 與三個
  IPC／preload 操作。Controller 只接受 Main 選出的 scope，AI 錯誤時保留原稿並可重試。
- 新增 App-bundled `practice-integrated-sentences` skill；每次提交在無工具、無網路、唯讀、
  plugins／apps／memories 關閉的 Codex turn 先驗證全部必要用詞與 sense，再回傳 revision
  issues 或完整 feedback。
- 新增 Sentence Practice 側欄入口與工作區，包含動態 2–10 count、必要用詞簡義卡片、
  單一多句短文輸入、revision highlight、保留原意的修正版、逐項修改、自然口語建議與
  required-item usages。
- 重用 `LearningItemDialog` read-only capability 顯示完整項目與複習摘要；新一輪前以具名
  confirmation dialog 說明會丟棄目前內容，並可先修改新一輪數量。
- Workspace component 在 App 生命週期內保持 mounted；工作區切換不丟失 local draft 或
  controller snapshot，App 結束後自然清除且不建立永久歷史。

### Test Coverage and Verification

- TC1／TC4／TC5／TC14：`learning-library-service.test.ts` 驗證資格 count、混合資料排除、
  bounded random selection、Meaning 第一段／fallback 及抽取前後 review detail 完全不變。
- TC3／TC8／TC11／TC14：`sentence-practice-controller.test.ts` 驗證 2–10、空白拒絕、
  revision → retry → completed、malformed retry、講解語言／sense prompt 與 isolated Codex turn。
- TC8／TC9／TC10：`sentence-practice-artifacts.test.ts` 驗證 needs-revision／completed union、
  natural-form issue、完整 usage coverage、suggestion shape、未知／重複／缺少 scope 拒絕。
- TC3／TC10：`sentence-practice-ipc.test.ts` 驗證三個白名單 operation 與偽造 count、session、
  draft、explanation language payload 拒絕。
- TC2／TC3／TC6／TC7／TC8／TC9／TC12／TC13：`SentencePracticeWorkspace.test.tsx` 驗證
  資格不足、動態 count、空白 disabled、跨 active 工作區保留草稿、新一輪確認／改數量、
  唯讀詳情、revision 保留與完整四區 feedback。
- TC12／TC15：`App.test.tsx` 驗證獨立側欄入口與 workspace；全套既有 App、Library、Review、
  Reader 測試保持通過。
- Bundled skill 安裝另由 `bundled-skill.test.ts` 鎖定正確 runtime path。

驗證結果：Root Server 3/3、Desktop 351/351 tests passed；Server／Desktop typecheck passed；
Desktop production build passed。

### Changed Files

#### Production code

- `.agents/skills/practice-integrated-sentences/SKILL.md`
- `apps/desktop/src/shared/sentence-practice-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/sentence-practice-artifacts.ts`
- `apps/desktop/src/main/sentence-practice-controller.ts`
- `apps/desktop/src/main/sentence-practice-ipc.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/sentence-practice-artifacts.test.ts`
- `apps/desktop/src/main/sentence-practice-controller.test.ts`
- `apps/desktop/src/main/sentence-practice-ipc.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F46-integrated-sentence-practice.md`
- `documents/modules/learning-library.md`
- `documents/modules/sentence-practice.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 1. 可用數與 2–10 設定 | Pass | repository、controller、Workspace tests |
| 2. 只抽 active reviewed English | Pass | mixed eligibility repository test |
| 3. 必要用詞與簡義 | Pass | Meaning unit test、Workspace rendering test |
| 4. 唯讀學習項目詳情 | Pass | Workspace + existing LearningItemDialog read-only test path |
| 5. 單一可編輯短文與空白防護 | Pass | Workspace、controller、IPC tests |
| 6. 遺漏／誤用先要求修稿 | Pass | skill contract、artifact、controller、Workspace tests |
| 7. 保留原意的正式批改 | Pass | skill contract、artifact、Workspace feedback tests |
| 8. AI 失敗安全重試 | Pass | malformed controller + artifact tests |
| 9. 同次 App 跨頁恢復 | Pass | mounted active rerender test、controller snapshot lifecycle |
| 10. 新一輪與無持久副作用 | Pass | confirmation test、repository no-mutation assertion |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `selects only active reviewed English items...` |
| TC2 | Pass | `blocks setup below two eligible items` |
| TC3 | Pass | controller invalid count、Workspace count controls、IPC invalid count |
| TC4 | Pass | repository random bounded selection assertions |
| TC5 | Pass | `uses the first Meaning paragraph and falls back...` |
| TC6 | Pass | Workspace opens `LearningItemDialog` with no Edit control |
| TC7 | Pass | Workspace disabled submit + controller empty rejection |
| TC8 | Pass | artifact revision、controller revision lifecycle |
| TC9 | Pass | artifact full feedback、Workspace four feedback sections |
| TC10 | Pass | artifact unknown／duplicate／missing／mixed cases |
| TC11 | Pass | controller prompt assertions for language and sense |
| TC12 | Pass | Workspace active false／true rerender preserves draft |
| TC13 | Pass | named alertdialog keep／confirm paths and second start call |
| TC14 | Pass | review detail deep equality before／after selection、no review writer dependency |
| TC15 | Pass | complete root tests、typecheck and Desktop build |

### Commands Executed

```bash
npm test -w @reader/desktop -- ../main/learning-library-service.test.ts -t "selects only active reviewed English items"
npm test -w @reader/desktop -- ../main/sentence-practice-artifacts.test.ts
npm test -w @reader/desktop -- ../main/sentence-practice-controller.test.ts
npm test -w @reader/desktop -- ../main/sentence-practice-ipc.test.ts
npm test -w @reader/desktop -- SentencePracticeWorkspace.test.tsx
npm test -w @reader/desktop -- App.test.tsx -t "opens the independent multi-item Sentence Practice workspace"
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm test
npm run typecheck
```

### Hypotheses and Decisions

- 第一次 target test command 使用 repository-root 路徑，但 Desktop Vitest root 已設定為
  `apps/desktop/src/renderer`，因此測試 filter 找不到檔案。依 diagnose 先列出三個可驗證
  假說；改用 `../main/learning-library-service.test.ts` 後立刻得到預期 Red，確認原因只是
  Vitest relative-root filter，而非 include 規則或 `--run` 解析問題。
- `Meaning` 不額外呼叫 AI；只讀既有 Markdown 並 fallback `sense`，避免開始練習前增加
  latency／用量，也保持提示與生詞庫一致。
- 詳情不新增 sentence-practice 專用資料查詢；Renderer 重用已受限的 `learning:get` 與
  `review:item-detail`，並以既有 `LearningItemDialog readOnly` capability 呈現。
- 沒有新增 state-change subscription；Workspace 保持 mounted，submit Promise 與 Main-owned
  controller state 足以在同一次 App 開啟期間跨頁保留，避免增加不必要的 IPC event surface。

### Known Limitations and Follow-up

- 第一版刻意不保存作文歷史、AI 詳細回饋、完成數、分數或成就。
- 不提供手動 item selection、主題、情境、deck、tag 或書籍來源篩選。
- 詞形與目標語義 coverage 由 bounded AI 判斷；本機不含英文 morphology parser。
- 既有 Meaning 使用項目建立／編輯時保存的語言，不依目前講解語言即時翻譯。

### Architectural Observations

- `SpacedReviewController` 與 `SentencePracticeController` 現在各自包含一份相近的 bounded
  Codex thread lifecycle（initialize、thread/start、turn/start、notification、timeout、close）。
  目前分開可避免 F46 擴大既有複習風險，但若再新增第三個 bounded AI workflow，應考慮
  以 RXX 抽出共用且可測的 runtime runner，保留每個 workflow 自己的 prompt 與 parser。
