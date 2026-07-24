---
author: Codex
date: 2026-07-24
title: 在間隔複習批改中加入學習語言表達建議
uuid: c5d86dce-3e3c-4cc6-9cbb-a3063cd50e95
version: 1.2.0
status: implemented
---

# Feature Specification - 在間隔複習批改中加入學習語言表達建議

## 1. Feature Overview

目前**複習試卷**提交後，AI 只判斷每題答案是否正確表達例句中的目標語義，並依
語意正確度與完整度提出**複習評級**。當使用者主動以學習項目的語言解釋詞義時，
現有回饋不會進一步指出遣詞、搭配、文法、自然度或描述精確度上的改善空間。

本功能在既有意思判斷之外新增逐題**表達建議**。AI 依使用者實際答案語言判斷是否
適用；答案使用學習項目的語言時，肯定自然表達或提供更精確自然的改寫，並以全域
**講解語言**說明改善原因。這讓使用者不只回想翻譯，也能練習直接使用正在學習的
語言組織概念。

表達建議是自動、非阻斷且暫態的輔助內容。它不得影響忘記、困難、順利、簡單四級
評級，不得改變 FSRS 排程，也不寫入複習歷史。

## 2. Requirements (User Story)

- **As a** 主動使用學習語言回答間隔複習題的語言學習者
- **I want** 在確認詞義正確性之外，獲得遣詞用句與自然度建議
- **So that** 我可以更準確地描述概念，逐步建立以學習語言直接思考的能力

## 3. Confirmed Product Rules

### 3.1 Separation from semantic grading

- **複習評級**只依答案的語意正確度與完整度產生；表達自然度不得提高或降低評級。
- 兩個答案若表達相同且同樣完整的目標語義，即使其中一個文法或搭配較不自然，AI
  應提出相同評級，並只在表達建議中呈現差異。
- 使用者覆寫及確認評級、FSRS 映射、排程更新與複習歷史格式維持不變。

### 3.2 Applicability

- AI 依「使用者實際答案語言是否為學習項目的語言」判斷表達建議是否適用，不以
  全域講解語言作為觸發條件。
- 即使講解語言是繁體中文，只要英文學習項目的答案實際使用英文，仍應提供英文
  表達建議。
- 答案使用其他語言時仍照常判斷意思，但不顯示學習語言表達建議。
- 空白答案沿用既有規則建議「忘記」，意思判斷直接提供目前語境的正確意思／參考
  答案，且不提供表達建議。

### 3.3 Advice content

- 改善後的表達範例使用學習項目的語言；改善原因使用全域講解語言。
- 原答案自然、精確且完整時，只需簡短肯定，不為了產生內容而強行改寫。
- 原答案有足夠語言資訊且可以改善時，建議應指出最重要的遣詞、搭配、文法、自然度
  或描述精確度問題，並提供一個保留原意、符合目標語義的自然改寫。
- 原答案語意錯誤時，表達建議不得只是潤飾錯誤意思；若提供改寫，改寫必須表達題目
  所要求的正確目標語義。
- 正確且自然的單字、同義詞或片語仍是合法答案，也可依語意完整度獲得「簡單」，
  表達建議應簡短肯定。簡短但不自然或不精確的描述應直接提供更好的說法；答案長度
  本身不是表達品質，不得要求使用者改用完整句、更多句子或更長說明。
- 回饋保持精簡且面向學習者，不暴露 AI 隱藏推理。

### 3.4 Workflow and lifetime

- 表達建議與既有意思批改在同一次「提交試卷」操作及同一個 AI grading turn 中產生，
  不新增第二個按鈕、第二次 AI 呼叫或全域開關。
- 表達建議缺少、不適用或無法可靠判斷時，不得阻擋意思回饋、評級覆寫、確認回合或
  更新排程。
- 表達建議跟隨既有暫態試卷生命週期：同一次 App 開啟期間跨頁保留，放棄試卷、
  完成後清除暫態回合或關閉 App 時一併清除。
- 不保存使用者答案、改善後表達或改善原因至 SQLite；學習項目詳情及精簡複習歷史
  不顯示表達建議。

## 4. Acceptance Criteria

- **Scenario 1：自動產生適用的表達建議**
  - **Given** 英文學習項目的使用者答案是一段可評估的英文描述
  - **When** 使用者提交複習試卷
  - **Then** 同一次 AI 批改同時回傳意思回饋、複習評級與表達建議
  - **And** 不需要另一個操作或 AI turn

- **Scenario 2：改善不自然但語意正確的英文**
  - **Given** 使用者以英文正確且完整地表達目標語義，但遣詞、搭配或文法不自然
  - **When** AI 完成批改
  - **Then** 意思回饋確認核心語義正確
  - **And** 表達建議以英文提供一個自然且語義正確的改寫
  - **And** 以目前講解語言簡短說明最重要的改善原因

- **Scenario 3：自然答案不強行改寫**
  - **Given** 使用者以學習項目的語言自然、精確且完整地回答
  - **When** AI 完成批改
  - **Then** 表達建議簡短肯定答案
  - **And** 不為了填滿欄位而提供沒有實質改善的替代句

- **Scenario 4：短答案維持合法**
  - **Given** 使用者以學習項目的語言輸入正確的單字、同義詞或短片語
  - **When** AI 完成批改
  - **Then** 意思判斷與複習評級不因答案不是完整句而自動降低
  - **And** 自然精確時以簡短訊息肯定該詞或片語
  - **And** 不自然或不精確時直接提供更好的說法
  - **And** 不要求完整句、更多句子或更長說明

- **Scenario 5：其他語言答案只批改意思**
  - **Given** 英文學習項目的使用者答案實際使用繁體中文或其他非英文語言
  - **When** AI 完成批改
  - **Then** 仍依語意正確度與完整度提供意思回饋及複習評級
  - **And** 該題不顯示英文表達建議區塊

- **Scenario 6：講解語言不限制觸發**
  - **Given** 全域講解語言是繁體中文，且英文學習項目的答案實際使用英文
  - **When** AI 完成批改
  - **Then** 改寫範例使用英文
  - **And** 改善原因使用繁體中文

- **Scenario 7：空白答案不提供表達建議**
  - **Given** 使用者將一題答案留白後提交
  - **When** AI 完成批改
  - **Then** 該題沿用既有規則建議「忘記」
  - **And** 意思判斷直接顯示目前語境的正確意思／參考答案
  - **And** 不顯示表達建議區塊

- **Scenario 8：表達品質不影響複習評級**
  - **Given** 兩個答案都正確且同樣完整地表達目標語義，但只有一個答案自然
  - **When** AI 分別批改兩個答案
  - **Then** 兩者得到相同的複習評級
  - **And** 不自然答案的差異只出現在表達建議

- **Scenario 9：錯誤語義不被原樣潤飾**
  - **Given** 使用者以學習項目的語言流暢地描述了錯誤語義
  - **When** AI 完成批改
  - **Then** 意思回饋及複習評級指出語義錯誤
  - **And** 表達建議若提供改寫，必須改成符合題目目標語義的表達

- **Scenario 10：逐題回饋分區呈現**
  - **Given** 一題同時具有意思回饋及適用的表達建議
  - **When** Renderer 顯示批改結果
  - **Then** 「意思判斷」與「表達建議」以可辨識的不同區域顯示
  - **And** 改善後表達與改善原因可清楚區分
  - **And** 原有四級評級控制與覆寫操作維持可用

- **Scenario 11：建議不適用時不顯示空殼**
  - **Given** 某題答案為空白或實際使用其他語言
  - **When** Renderer 顯示批改結果
  - **Then** 不顯示空白的表達建議標題、容器或佔位內容
  - **And** 意思回饋及評級仍可正常顯示與確認

- **Scenario 12：表達建議維持暫態**
  - **Given** AI 已產生逐題表達建議
  - **When** 使用者在同一次 App 開啟期間先離開再返回試卷
  - **Then** 原表達建議與其他批改結果一起保留
  - **When** 使用者確認回合後重新開啟學習項目詳情，或關閉再開啟 App
  - **Then** 複習歷史中不包含答案或表達建議

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 同 turn 自動建議 | 可評估的目標語言答案 | 提交整份試卷 | 單次 grade 回傳意思回饋、評級與表達建議 | Critical |
| TC2 | 不自然但語意正確 | 正確完整、搭配不自然的英文 | 批改 | 評級只按語意；英文改寫；講解語言原因 | Critical |
| TC3 | 自然答案 | 自然、精確且完整的目標語言答案 | 批改 | 肯定答案；無強行替代句 | High |
| TC4 | 短答案 | 自然或可改善的單字、同義詞或短片語 | 批改 | 不因非完整句降級；自然則肯定，可改善則直接改寫；不要求擴寫 | Critical |
| TC5 | 非目標語言答案 | 英文項目以中文正確作答 | 批改 | 正常意思評級；無表達建議 UI | Critical |
| TC6 | 講解語言不同 | 講解語言繁中、答案英文 | 批改 | 改寫英文、原因繁中 | Critical |
| TC7 | 空白答案 | 一題答案留白 | 批改 | forgotten；意思判斷顯示正確意思；無表達建議 | Critical |
| TC8 | 評級獨立性 | 兩個語意同樣完整、自然度不同的答案 | 批改 | 相同評級；只有表達建議不同 | Critical |
| TC9 | 錯誤語義 | 以流暢目標語言描述其他語義 | 批改 | 錯誤評級；不把錯誤意思原樣潤飾 | Critical |
| TC10 | Artifact 完整性 | 每題合法的結構化表達建議狀態 | 解析 AI artifact | 保留受信任 question/item scope 及合法欄位 | Critical |
| TC11 | Artifact 降級 | 核心意思回饋合法，但建議不適用或無法可靠判斷 | 解析及顯示 | 意思批改可用；不適用時省略建議；不阻擋確認 | Critical |
| TC12 | 回饋分區 | 一題含意思及表達內容 | 顯示 reviewing 狀態 | 分區、改寫與原因清楚；rating radios 仍可操作 | High |
| TC13 | 無空殼 | 表達建議不適用 | 顯示 reviewing 狀態 | DOM 無空白表達建議區塊 | High |
| TC14 | 跨頁暫存 | 已批改且有表達建議 | 先離開再繼續 | 原建議保留且不再次 grade | High |
| TC15 | 不持久化 | 已確認含表達建議的回合 | 查詢學習項目歷史或重開 App | 歷史 schema 與內容不含答案及建議 | Critical |

## 6. Implementation Notes

- 擴充 `practice-spaced-review` grading 契約，使每題在既有意思回饋及評級之外回傳
  結構化表達建議狀態：
  - `natural`：目標語言表達自然，只需肯定；
  - `improvable`：可指出原因並提供學習項目語言改寫；
  - `not-applicable`：空白或實際答案不是學習項目語言。
- `improvable` 必須包含非空的改善原因與改寫；`natural` 必須包含對應的精簡學習
  訊息；其他狀態不應以假的替代句填補。
  改善原因使用 grading turn 已知的講解語言，改寫使用 AI 從題目及項目資料判斷的
  學習項目語言。
- `ReviewGradeResult`、artifact parser 與 Renderer 使用明確欄位區分既有意思回饋、
  表達建議狀態、改善原因及建議改寫，不依單一自由文字欄位反向解析 UI。
- `parseReviewGrade()` 繼續嚴格驗證 paper、question 及 item scope。表達建議是
  非阻斷內容：`not-applicable` 是合法結果；無法可靠判斷、舊 `insufficient` 或未知
  狀態應安全降級為不顯示建議，而不是阻止合法的意思評級進入 reviewing 狀態。
- `SpacedReviewWorkspace` 在既有逐題回饋內分開呈現意思判斷與表達建議。`natural`、
  `improvable` 有內容時渲染表達建議區塊；`not-applicable` 不渲染空白區塊。現有
  評級 radio、覆寫及確認流程不變。
- 沿用 `SpacedReviewController` 的同一個受限 grading turn、快速模型策略與暫態
  scope；不新增 IPC 方法、SQLite migration、排程欄位或第二個 AI request。
- 保留現有跨工作區暫態 state，因此不需新增表達建議專用的恢復機制。

## 7. Affected Modules and Files

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`
- `apps/desktop/src/main/spaced-review-artifacts.test.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `documents/modules/spaced-review.md`
- `CONTEXT.md`

## 8. Assumptions, Open Questions, and Non-goals

### Assumptions

- AI 可從學習項目、例句及答案可靠判斷學習項目語言與答案語言；無法可靠判斷時安全
  省略表達建議。
- 本功能優先提供一個最有教學價值的改寫，不列出多個風格版本或完整寫作講義。
- 既有 `feedback` 可繼續代表意思判斷，或在不破壞信任邊界的前提下改名為更明確的
  typed field；最終命名由 TDD 實作時確認。

### Resolved Design Question

- `expressionFeedback` 採 natural／improvable／not-applicable
  discriminated union。Main parser 對缺少或 malformed 的選用建議欄位正規化為
  not-applicable，但仍嚴格拒絕缺少核心意思回饋、評級或錯誤 question／item scope
  的 artifact。

### Non-goals

- 不新增獨立的英文寫作分數、表達等級或第二套間隔排程。
- 不要求所有使用者以學習項目語言或完整句作答。
- 不新增表達建議開關、手動重批、追問對話或多版本改寫。
- 不持久保存答案、表達建議或改寫歷程，也不建立可搜尋或匯出的寫作紀錄。
- 不改變出題方式、到期項目排序、四級評級 rubric、FSRS 參數或確認交易。
- 不把本功能擴展到區段練習或一般 AI 對話；本文件只涵蓋間隔複習。

## 9. Implementation Record

### Status

Implemented through version 1.2.0 on 2026-07-25.

### Implementation Summary

- `practice-spaced-review` grading mode 先依既有 rubric 產生只反映語意正確度與
  完整度的評級，再獨立判斷三態表達建議。skill 明定表達品質不得提高或降低評級，
  答案長度不得成為改善理由，改寫使用學習項目語言，原因使用講解語言，錯誤語義
  不得被原樣潤飾。空白答案的意思回饋直接揭示目前語境的正確意思。
- 共用 review contract 新增 `ReviewExpressionFeedback` discriminated union。
  `ReviewGradeResult` 以選用 typed field 維持舊暫態回覆相容性；Main parser 對每筆
  合法 grading result 都產生可信任的三態資料；舊 `insufficient` 安全降級。
- `parseReviewGrade()` 保留 paper／question／item／rating 的嚴格驗證；缺少、
  未知或欄位組合錯誤的 expression feedback 安全降級成 not-applicable，不阻擋合法
  意思批改或評級確認。
- `SpacedReviewWorkspace` 將逐題結果分成具可存取名稱的「意思判斷」與「表達建議」。
  improvable 顯示建議表達及改善原因，natural 顯示精簡肯定，
  not-applicable 不渲染空白區塊；四級 radio 與確認排程流程不變。
- grading 狀態文字同步說明系統會在適用時提供遣詞用句建議。表達建議沿用既有
  Renderer／Main 暫態 scope，沒有新增 IPC、SQLite schema、第二個 AI turn 或設定。

### Test Coverage

- TC1／TC2／TC3／TC6／TC8／TC9：`spaced-review-skill.test.ts` 鎖定同一 grading
  artifact、評級獨立性、natural／improvable 行為、語言分工及錯誤語義改寫邊界。
- TC4／TC5／TC7／TC12／TC13：`SpacedReviewWorkspace.test.tsx` 驗證
  簡短自然片語獲得肯定、留白意思回饋顯示正確答案、not-applicable 不顯示空殼、
  意思／表達分區、建議改寫、改善原因及評級 radio 保留。
- TC10／TC11：`spaced-review-artifacts.test.ts` 驗證結構化 improvable 資料保留，
  malformed 建議安全正規化，同時維持 trusted scope 驗證。
- TC1／TC14：`spaced-review-controller.test.ts` 驗證表達建議由既有單次 grading
  workflow 回傳並保留在暫態 grade；既有 Workspace 跨頁測試涵蓋 grade 不重跑。
- TC15：既有 repository／controller 測試與本次 contract 邊界共同驗證確認 payload
  仍只有 question id／final rating，學習歷史 schema 未新增答案或表達建議。

### Changed Files

#### Production Code

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/main/spaced-review-artifacts.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `CONTEXT.md`
- `documents/implements/F32-add-expression-feedback-to-spaced-review.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 自動產生適用的表達建議 | Pass | Skill contract、controller grade result、單次 grade workflow |
| 改善不自然但語意正確的英文 | Pass | Artifact improvable test、Renderer 分區與改寫 test |
| 自然答案不強行改寫 | Pass | Skill natural contract、nullable suggestedAnswer union |
| 短答案維持合法 | Pass | Renderer natural parameterized test、skill length-independent rubric |
| 其他語言答案只批改意思 | Pass | Renderer not-applicable parameterized test |
| 講解語言不限制觸發 | Pass | Skill 將實際目標語言判斷與 answerLanguage 訊息分離 |
| 空白答案不提供表達建議 | Pass | Skill correct-answer／not-applicable contract、Renderer 正確答案及無空殼 test |
| 表達品質不影響複習評級 | Pass | Skill explicit invariant、rating controls regression |
| 錯誤語義不被原樣潤飾 | Pass | Skill explicit correct-target-sense rewrite invariant |
| 逐題回饋分區呈現 | Pass | `separates meaning feedback from target-language expression advice` |
| 建議不適用時不顯示空殼 | Pass | `handles other-language answer without inventing a rewrite` |
| 表達建議維持暫態 | Pass | Controller ephemeral scope、既有跨頁／history tests、無 schema 變更 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Skill contract、controller single grading flow |
| TC2 | Pass | Structured improvable artifact 與 Renderer suggested expression |
| TC3 | Pass | Skill natural status 及 nullable rewrite contract |
| TC4 | Pass | Renderer natural parameterized test |
| TC5 | Pass | Renderer not-applicable parameterized test |
| TC6 | Pass | Skill target-language rewrite／answerLanguage message assertions |
| TC7 | Pass | Skill blank→forgotten＋correct answer＋not-applicable、Renderer correct-answer behavior |
| TC8 | Pass | Skill rating-independence assertion、既有 rating regression |
| TC9 | Pass | Skill wrong-meaning rewrite invariant |
| TC10 | Pass | `preserves structured expression feedback...` |
| TC11 | Pass | malformed advice normalization test |
| TC12 | Pass | Renderer meaning／expression regions and checked rating |
| TC13 | Pass | Renderer queryByRole negative assertion |
| TC14 | Pass | Existing resumable grade state、controller ephemeral result |
| TC15 | Pass | Existing confirmation/history tests、unchanged persistence boundary |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts src/main/spaced-review-artifacts.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm test -w @reader/desktop -- --run src/main/spaced-review-skill.test.ts src/main/spaced-review-artifacts.test.ts src/main/spaced-review-controller.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "shows an accessible status card while AI grades the paper"
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm test
npm run typecheck
git diff --check
```

### Hypotheses and Decisions

1. Red phase 如預期分別觀察到 skill 缺少 expression contract、artifact parser 丟棄
   `expressionFeedback`，以及 Renderer 沒有「意思判斷」／「表達建議」region；
   失敗原因都是功能尚未實作，沒有觸發 diagnose。
2. `ReviewExpressionFeedback` 採三態 union，讓 Renderer 不需解析 AI 自由文字。
   `suggestedAnswer` 只在 improvable 非空，natural 為 null，
   not-applicable 的 message 與 rewrite 都為 null。
3. `ReviewGradeResult.expressionFeedback` 在 shared type 保持 optional，以容納舊暫態
   mock／回覆；Main parser 對外回傳前一律正規化，Renderer 同時安全處理 undefined。
4. 表達建議屬於非阻斷輔助內容，因此 malformed optional advice 不應讓整份合法語意
   grading 失敗；paper scope、核心 feedback 及 rating 仍維持原本嚴格驗證。
5. 現有 `SpacedReviewController` 已把整份答案放在單次 grading turn，無需新增第二次
   AI 呼叫。既有 confirm payload 也不帶 feedback，因此不需修改 IPC 或 persistence。
6. 實作沒有暴露新的模組耦合或責任不清；typed artifact parser 與 Renderer 分工足以
   承接功能，不需另開 RXX。

### Deferred Items

- 表達建議的持久化、搜尋、匯出或寫作歷程。
- 將相同表達建議機制擴展到區段練習或一般 AI 對話。
- 獨立寫作分數、表達程度追蹤、多版本改寫及手動重批。

### Notes

- Focused suite：4 files、20 tests，全數通過。
- 完整 desktop suite：24 files、236 tests，全數通過。
- 專案完整測試：server 3 tests、desktop 236 tests，全數通過。
- 專案 typecheck、desktop production build 與 `git diff --check` 全數通過。
- 工作樹中既有 B08／reading-comprehension／App 變更與本功能無關，本次未回退。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC11 新增 skill、artifact parser 與 controller failing tests。
2. 擴充結構化 grading artifact，驗證評級與表達建議彼此獨立。
3. 依 TC12–TC14 新增 Renderer failing tests，再完成分區與暫態顯示。
4. 執行 focused tests、完整 desktop tests、typecheck、build 與 `git diff --check`。
5. 實作完成後更新 Implementation Record 及 `documents/modules/spaced-review.md`。
