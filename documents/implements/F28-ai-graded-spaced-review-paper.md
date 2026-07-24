---
author: Codex
date: 2026-07-24
title: 新增 AI 批改試卷與 FSRS 間隔複習
uuid: aec9c319072f4819bdb21ef7d36b2efd
version: 1.0.0
status: implemented
---

# Feature Specification - AI 批改試卷與 FSRS 間隔複習

## 1. Feature Overview

目前**生詞庫**已能保存、查詢、編輯及刪除單字與片語形式的**學習項目**，但沒有
到期判定、複習試卷、評級、間隔排程或複習歷史。使用者雖然能累積學習內容，仍無法把
這些內容轉化為跨時間的主動回想練習。

本功能新增獨立於章節閱讀及**區段練習**的**間隔複習**工作區。本機程式先選取最多
10 個已到期或尚未首次複習的學習項目，由受限的 Codex AI workflow 依每個項目的特定
語義生成一份暫態**複習試卷**。每題以自然例句呈現並劃線目標單字或片語，使用者輸入
該詞在例句中的意思；整卷提交後，AI 提供逐題回饋並依語意正確度與完整度建議
「忘記、困難、順利、簡單」四級**複習評級**。

使用者可一次接受全部 AI 評級或修改個別題目。只有按下「確認評級並更新排程」後，
本機程式才以固定 90% 目標記憶率的 FSRS 計算精確到期時間，並以單一 SQLite 交易
保存精簡複習歷史。AI 題目、答案與詳細回饋不持久化；離開複習頁或重開產品後即重新
選題與生成。

## 2. Requirements (User Story)

- **As a** 已在生詞庫累積單字與片語的語言學習者
- **I want** 透過一次 10 題以內、由 AI 出題及批改的語意試卷複習到期內容
- **So that** 我可以用低操作負擔持續練習主動回想，並讓系統依實際表現安排下次複習

## 3. Confirmed Product Rules

### 3.1 Review availability and ordering

- 每個使用中的學習項目都有獨立排程；新建立且沒有複習歷史的項目立即可複習。
- 已複習且再次到期的項目優先，依到期時間由早到晚排列。
- 回合不足 10 個時，再以尚未首次複習的新項目補足；新項目依 CEFR
  `A1 → A2 → B1 → B2 → C1 → C2`，同級依建立時間由舊到新排列。
- CEFR 只決定新項目的首次引入順序，不可延後已複習項目的到期複習。
- 每個回合最多 10 個；不足 10 個時使用全部可複習項目。完成後可繼續下一回合，
  不設每日回合數上限。
- 編輯項目內容不重設排程；移入垃圾桶後不參與複習；還原時沿用既有排程，已逾期者
  立即恢復為到期項目。沒有歷史的新項目還原後仍是可複習的新項目。

### 3.2 Ephemeral review paper

- 側欄提供與生詞庫平行的「間隔複習」入口及目前可複習數量。
- 進入後先顯示本回合「既有到期項目＋新項目」摘要；只有使用者明確點擊
  「生成本回合試卷」才呼叫 AI。
- 一份試卷對每個選中項目恰有一題。AI 根據 `title`、`itemType`、`cefr`、`sense`
  與 `markdownContent` 判斷項目語言，並生成一個明確使用目標語義的自然例句。
- 例句以結構化文字片段標示目標單字或片語；Renderer 劃線呈現，不接受 AI 原始 HTML。
  目標在例句中的詞形可以因自然文法產生屈折變化，但必須仍可明確對應原學習項目。
- 所有語言的使用中單字與片語都能複習；例句使用項目語言，答案預期語言沿用全域
  **講解語言**。AI 依語意而非逐字比對答案，接受等義表達、不影響語意的小錯字，
  以及偶爾以其他語言寫出的正確意思。
- 試卷、答案、AI 詳細回饋及未確認評級只存在於目前 Renderer 工作階段。切換離開
  複習工作區、重整或關閉產品會丟棄；再次進入時依當下資料重新選題及生成。
- 丟棄試卷不得建立複習歷史、更新 FSRS 狀態或改變到期時間。

### 3.3 Submission, AI feedback and ratings

- 每題提供意思輸入區；答案可以留白。
- 有空白答案時，提交操作顯示未作答題數並提醒空白題將評為「忘記」。
- 整份試卷一次提交。AI 必須恰好回傳每個試卷項目一筆逐題回饋及建議評級：
  - **忘記**：空白、錯誤、無關，或答成其他語義。
  - **困難**：部分正確，但遺漏或混淆影響目標語義的關鍵部分。
  - **順利**：核心語義正確，只有次要遺漏或不影響理解的小錯字。
  - **簡單**：答案正確、明確、完整，並準確對應例句中的特定語義。
- AI 不使用作答時間評級，也不得更新排程。
- 結果頁預先選中全部 AI 建議評級。使用者可以直接接受全部建議，或修改任一題的
  最終評級；修改不是完成回合的必要操作。
- 只有使用者按下「確認評級並更新排程」後才完成回合。

### 3.4 FSRS scheduling and history

- **複習排程**使用 FSRS、固定 90% 目標記憶率及預設參數；第一版不提供參數最佳化、
  目標記憶率或排程演算法設定。
- 四級最終評級分別映射至 FSRS 的 Again／Hard／Good／Easy。
- 排程保存精確到期時間並依裝置目前時區判定是否到期。完成後只有到達 FSRS 指定時間
  的項目才會再次出現；「忘記」可以安排在同一天稍後複習。
- 一次確認以單一 SQLite 交易寫入該回合所有項目；任一輸入、項目狀態或資料庫操作
  無效時，整回合不得部分更新。
- 每筆精簡複習歷史只保存：學習項目 id、回合 id、複習時間、AI 建議評級、使用者
  最終評級、FSRS 計算前後狀態、間隔及下次到期時間。
- 不保存 AI 例句、使用者答案或逐題詳細回饋。
- 學習項目詳情顯示目前複習狀態、上次複習時間與最終評級、下次到期時間、累計次數，
  以及可展開的精簡歷史列表。

### 3.5 AI and failure boundaries

- AI 每次只接收本回合選出的最多 10 個學習項目，不接收整個生詞庫、任意 SQL、
  資料庫路徑或其他書籍內容。
- 生成與批改使用 App 內建受信任 workflow、read-only sandbox、無工具、無網路及
  固定結構化輸出；Renderer 不可指定 skill 內容、路徑或 Codex method。
- 生成結果必須恰好覆蓋受信任項目集合，且每個 id、標題及目標語義均可回溯至輸入。
  批改結果必須與目前試卷 id 相符並恰好覆蓋每題。
- 無法可靠判斷語言、無法產生明確目標語義例句、結構不完整、id 不符、AI 中斷或
  Codex 不可用時，介面顯示可重試錯誤，不進入下一狀態，也不更新任何排程。
- 批改失敗時保留目前 Renderer 內的題目與答案，允許重試；一旦離開複習頁，仍依
  暫態規則全部丟棄。

## 4. Acceptance Criteria

- **Scenario 1：側欄顯示可複習數量**
  - **Given** 生詞庫含未複習新項目、已到期項目、未到期項目及垃圾桶項目
  - **When** App 載入或完成一個複習回合
  - **Then** 「間隔複習」側欄數量只包含未複習新項目及目前已到期的使用中項目
  - **And** 生詞庫入口仍獨立顯示使用中項目總數

- **Scenario 2：依既有到期與新項目規則選出最多 10 個**
  - **Given** 同時存在不同到期時間的既有項目及不同 CEFR 的新項目
  - **When** 使用者進入間隔複習頁
  - **Then** 本回合先選最早到期的既有項目
  - **And** 剩餘名額依 CEFR 及建立時間填入新項目
  - **And** 總數不超過 10

- **Scenario 3：使用者明確要求後才生成試卷**
  - **Given** 本回合有可複習項目
  - **When** 使用者只進入複習頁
  - **Then** 顯示既有到期及新項目數量，但不呼叫 AI
  - **When** 使用者點擊「生成本回合試卷」
  - **Then** 才開始生成並顯示清楚的處理狀態

- **Scenario 4：生成多語例句試卷**
  - **Given** 本回合包含一至十個不同語言、不同語義的單字或片語
  - **When** AI 回傳合法試卷
  - **Then** 每個項目恰有一道符合特定語義的例句題
  - **And** 例句使用項目語言並劃線目標詞形
  - **And** 每題有使用講解語言作答的意思輸入區

- **Scenario 5：拒絕越界或不完整的生成結果**
  - **Given** AI 回傳缺題、重複題、未知 item id、不符目標語義或無法辨識的資料
  - **When** Main 驗證生成結果
  - **Then** 整份結果被拒絕並顯示可重試錯誤
  - **And** 不顯示部分試卷或改變排程

- **Scenario 6：允許空白答案提交**
  - **Given** 試卷有一題或多題答案留白
  - **When** 使用者準備提交
  - **Then** 介面顯示未作答數量及空白視為忘記的提醒
  - **And** 使用者仍可提交整份試卷

- **Scenario 7：AI 逐題回饋並建議全部四級評級**
  - **Given** 使用者提交含錯誤、部分正確、核心正確及完整正確答案的試卷
  - **When** AI 回傳合法批改
  - **Then** 每題顯示回饋並分別依 rubric 建議忘記、困難、順利或簡單
  - **And** 空白題建議忘記
  - **And** 不使用作答時間判斷

- **Scenario 8：使用者接受或修改 AI 建議**
  - **Given** 批改結果完整
  - **When** 結果頁首次顯示
  - **Then** 每題預選 AI 建議評級
  - **And** 使用者可修改任一題或不修改直接接受全部
  - **And** 尚未確認前不寫入複習歷史或排程

- **Scenario 9：原子確認並以 FSRS 更新排程**
  - **Given** 結果頁有十題合法最終評級
  - **When** 使用者按下「確認評級並更新排程」
  - **Then** 四級評級以 Again／Hard／Good／Easy 交給 90% FSRS
  - **And** 十筆複習事件及排程狀態在同一交易中完成
  - **And** 回傳每題的新間隔及精確到期時間

- **Scenario 10：確認失敗不產生部分更新**
  - **Given** 任一項目已不再可用、payload 遭竄改或資料庫寫入失敗
  - **When** 使用者確認整份評級
  - **Then** 所有事件與排程更新均回滾
  - **And** 顯示可重試錯誤，不把試卷標為已完成

- **Scenario 11：完成後可繼續下一回合**
  - **Given** 一個回合已成功確認且仍有可複習項目
  - **When** 結果摘要顯示
  - **Then** 顯示剩餘可複習數量與「繼續下一回合」
  - **And** 下一回合重新套用相同選題規則

- **Scenario 12：沒有可複習項目的空狀態**
  - **Given** 沒有新項目且所有已複習項目尚未到期
  - **When** 使用者進入間隔複習頁
  - **Then** 不呼叫 AI
  - **And** 顯示下一個預計到期時間；完全沒有排程項目時顯示目前無可複習內容

- **Scenario 13：離開頁面丟棄暫態試卷**
  - **Given** 試卷處於生成、作答、批改或未確認結果狀態
  - **When** 使用者切換到書籍、生詞庫或重開 App
  - **Then** 題目、答案、回饋及未確認評級被丟棄
  - **And** 再次進入時重新選題及生成
  - **And** 原排程與歷史不變

- **Scenario 14：編輯、垃圾桶與還原保留正確排程語意**
  - **Given** 學習項目已有或尚無複習歷史
  - **When** 使用者編輯、移入垃圾桶或還原
  - **Then** 編輯不重設排程、垃圾桶項目不被選入、還原項目沿用原狀態
  - **And** 已逾期還原項目立即可複習

- **Scenario 15：學習項目詳情顯示精簡歷史**
  - **Given** 學習項目已有一筆以上確認完成的複習事件
  - **When** 使用者開啟學習項目詳情
  - **Then** 顯示狀態、上次複習與最終評級、下次到期、累計次數及可展開歷史
  - **And** 不顯示或保存舊試卷的例句、答案及詳細回饋

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 可複習統計 | 新、到期、未到期及垃圾桶項目並存 | 查詢摘要 | 數量只含使用中的新項目與到期項目，並提供下一到期時間 | Critical |
| TC2 | 10 題選取順序 | 多筆逾期及 A1–C2 新項目 | 建立回合摘要 | 逾期先依 due，剩餘依 CEFR／createdAt，最多 10 筆 | Critical |
| TC3 | 少於 10 題 | 只有 4 個可複習項目 | 建立摘要 | 回合包含全部 4 筆 | High |
| TC4 | 明確生成 | 摘要已顯示 | 進入頁面但未按按鈕，再按生成 | 前者無 AI call；後者開始生成 | Critical |
| TC5 | 生成 artifact 驗證 | 受信任 item scope | 回傳合法及缺題／未知 id／重複 id 結果 | 只接受恰好覆蓋 scope 的合法試卷 | Critical |
| TC6 | 安全劃線 | 合法結構化例句片段 | Renderer 呈現 | 只劃線目標文字，不插入 AI HTML | Critical |
| TC7 | 多語與講解語言 | 英／中／日項目及四種語言設定 | 生成並作答 | 例句使用項目語言，答案要求使用映射後講解語言 | High |
| TC8 | 空白答案 | 10 題中 2 題空白 | 提交 | 顯示提醒、允許送出、兩題 AI 建議忘記 | Critical |
| TC9 | 四級 rubric | 四種答案品質 | 批改 | 分別產生忘記／困難／順利／簡單及逐題回饋 | Critical |
| TC10 | 批改 artifact 驗證 | 固定 paper id／question ids | 回傳錯 paper、缺題或未知題 | 結果被拒絕，答案留在暫態畫面供重試 | Critical |
| TC11 | 使用者覆寫 | AI 建議與使用者選擇不同 | 確認 | 歷史同時保存兩者，FSRS 只使用最終評級 | Critical |
| TC12 | FSRS 初次排程 | 無 schedule 的新項目 | 以四級各確認一次 | 使用固定 0.9 retention 計算並保存不同精確 due | Critical |
| TC13 | FSRS 後續排程 | 已有 schedule／history 的項目 | 在指定 now 再次確認 | 以既有狀態計算可重現的新狀態及到期時間 | Critical |
| TC14 | 原子回合 | 10 筆評級中一筆無效或 DB 失敗 | 確認 | 0 筆事件與 0 筆 schedule 被部分提交 | Critical |
| TC15 | 試卷暫態 | 作答或結果未確認 | 切換工作區／重建元件 | 試卷消失且資料庫完全不變 | Critical |
| TC16 | 連續回合 | 第一回合完成且仍有 backlog | 點繼續 | 重查摘要並選下一批，不沿用舊題 | High |
| TC17 | 垃圾桶生命週期 | 已排程及新項目 | trash／restore | trash 排除；restore 保留原 schedule 或新項目狀態 | Critical |
| TC18 | 精簡歷史詳情 | 一項目有多筆事件 | 開啟詳情 | 顯示狀態、最後評級、due、次數及歷史，不含試卷內容 | High |
| TC19 | AI／連線失敗 | 生成或批改中斷 | 重試或離開 | 不更新排程；同頁批改可保留答案重試，離開後丟棄 | Critical |
| TC20 | Production Electron flow | 真實 bridge、SQLite 與可用 Codex | 生成、作答、批改、覆寫、確認、重啟 | 排程／歷史保留，完整試卷不保留，due count 正確 | High |

## 6. Implementation Notes

### 6.1 Local review domain

- 延伸 `LocalLearningLibrary` 的既有 SQLite migration，加入一對一排程資料與 append-only
  複習事件。正式 schema 可拆成 `learning_review_schedules` 與
  `learning_review_events`；兩者都以 foreign key 關聯 `learning_items`，永久清空
  垃圾桶時一併刪除對應排程及事件。
- 沒有 schedule row 的 active 項目視為新項目且立即可複習，避免要求所有既有建立
  路徑同步建立初始 row，也讓現有十筆 seed 自動進入首次複習。
- 以單一可注入 `now` 的 domain service 負責摘要、選題、是否到期、FSRS wrapper、
  評級映射及交易確認。Renderer、AI workflow 與 IPC 不自行計算排程。
- 將第三方 FSRS 實作包在專案自有 adapter 後；套件版本由 lockfile 固定。測試使用
  固定時間與正式演算法，不以手寫倍數模擬 FSRS。
- review event 保留可重現計算所需的前後狀態；結構化欄位或版本化 JSON 皆可，但讀取
  時必須嚴格驗證，未來更換參數或演算法時不得悄悄改寫既有歷史。

### 6.2 Typed review API and AI workflow

- 建議新增獨立 `ReviewDesktopApi` 或在 learning bridge 下加入具名 review operations：
  `getReviewSummary`、`generateReviewPaper`、`gradeReviewPaper`、
  `confirmReviewRatings`、`getReviewHistory`。Preload 只暴露必要 typed payload。
- 試卷與批改不可寫入 `LocalChatConversationStore` 或顯示成一般 AI 對話。可由 Main
  建立專用暫態 review controller，沿用既有 Codex 登入、模型及安全設定；離開工作區
  時中斷／忽略仍在進行的結果。
- 新增 App 內建 `practice-spaced-review` skill，清楚分隔「生成」與「批改」兩種
  marker／payload。它只收到本回合 item scope 與本次答案，不得查詢生詞庫、檔案或網路。
- Main 驗證 `review-paper` 與 `review-grade` 結構。例句採
  `beforeTarget / targetText / afterTarget` 或等價結構，避免渲染任意 HTML；item id、
  question id 與 paper id 都必須屬於當前暫態 scope。
- 批改只產生人類可讀回饋及四級建議，不要求或保存模型內部推理。

### 6.3 Renderer

- `WorkspaceMode` 新增 review 模式，使用獨立 `SpacedReviewWorkspace`，避免把完整試卷
  狀態繼續堆入現有 `App.tsx` 或右側 AI 對話訊息。
- 工作區至少包含：摘要／空狀態、生成中、作答、批改中、結果確認、完成摘要及錯誤
  重試狀態。切換模式時卸載工作區並清除暫態資料。
- 作答頁以單欄題目卡呈現；每題顯示編號、CEFR、例句、劃線目標及多行意思輸入。
  結果頁在原題附近顯示 AI 回饋與四級評級控制，並提供一次接受及確認操作。
- 既有 `ReadingPracticePaper` 的可及性、進度、提交鎖定及錯誤呈現可作為視覺與互動
  參考，但兩種試卷是不同領域元件，不共用持久 AI 對話 artifact。
- 學習項目詳情以既有 modal 增加複習摘要及懶載入歷史；讀取失敗不得阻止查看或編輯
  原有 Markdown 內容。

### 6.4 Concurrency and failure safety

- 同一 review workspace 同時只允許一個生成或批改 request；重複點擊必須停用。
- `confirmReviewRatings` 必須帶回合 scope 與所有 item／AI rating／final rating，
  Main 重新驗證 active 狀態、唯一性及完整覆蓋後才開始交易。
- 確認成功後同一暫態回合不得再次提交。Renderer 重複 request、延遲 AI response 或
  舊 paper id 都不能建立第二組事件。
- AI 失敗、使用者離開或 App 關閉不需要保存恢復資料；已成功確認的 SQLite transaction
  則必須在重啟後完整可見。

## 7. Assumptions, Open Questions and Non-goals

### Assumptions

- 第一版固定使用 FSRS 90% 目標記憶率及預設參數；累積歷史後才可能另開功能提供
  optimizer 或個人設定。
- CEFR 是現有資料中可用的難度近似值，不宣稱等同真實詞頻；「優先常用基礎詞」在
  第一版具體落實為新項目 A1 至 C2 的首次引入順序。
- `source` 講解語言沿用既有建立流程語意，依各學習項目本身語言決定預期作答語言。
- 完成結果可在目前工作區停留期間查看；離開後只從學習項目詳情查看精簡歷史。
- 使用者修改 AI 建議評級時不要求填寫理由。

### Open Questions

- 無。

### Non-goals

- 不建立 deck、subdeck、標籤式自訂牌組、每日硬上限或手動挑選本回合項目。
- 不提供 SM-2、自訂艾賓浩斯曲線、FSRS 參數最佳化、目標記憶率設定或重新排程全部項目。
- 不保存、搜尋、匯出或重播完整複習試卷、答案及詳細 AI 回饋。
- 不提供跨裝置同步、帳號雲端備份、Anki 匯入／匯出或與 Anki 資料格式相容。
- 不以答案速度、鍵盤輸入時間或 AI 隱藏推理作為評級依據。
- 不讓 AI 直接寫入 SQLite、確認最終評級或自行更新排程。
- 不改變區段練習題型、章節閱讀進度、標記、學習項目去重或草稿提交流程。

## 8. Affected Modules and Files

### Module documents to create or update

- 新增 `documents/modules/spaced-review.md`
- 更新 `documents/modules/learning-library.md`
- 更新 `documents/modules/skill-management.md`
- 更新 `documents/modules/ai-conversation.md`
- 更新 `documents/modules/learning-item-creation.md`

### Expected new production files

- `.agents/skills/practice-spaced-review/SKILL.md`
- `.agents/skills/practice-spaced-review/agents/openai.yaml`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-service.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`

### Existing production files likely to change

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

### Expected test files

- `apps/desktop/src/main/spaced-review-service.test.ts`
- `apps/desktop/src/main/spaced-review-artifacts.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/spaced-review-ipc.test.ts`
- `apps/desktop/src/main/spaced-review-skill.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

## 9. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- Added a Main-owned review domain on the existing learning-library SQLite database, including
  schedule/event migrations, due/new queue selection, fixed 0.9 retention FSRS calculation,
  exact timestamps, compact history and atomic whole-session confirmation.
- Added a dedicated ephemeral `SpacedReviewController`, strict `review-paper`／`review-grade`
  validation, six-operation typed IPC/preload bridge and the bundled `practice-spaced-review`
  skill. Renderer cannot provide item scope, current time, FSRS state, skill path or Codex method.
- Added an independent review workspace with explicit generation, structured target underlining,
  blank-answer warning, whole-paper grading, AI defaults, per-question overrides, confirmation,
  completion summary and consecutive rounds.
- Added review availability to the sidebar and compact schedule/history to learning-item details.
  Navigation discards the active paper and cancels an in-flight review AI request.

### Test Coverage

- TC1–TC3, TC11–TC14, TC16–TC18: `learning-library-service.test.ts` covers total/selected queue
  semantics, due priority, CEFR introduction, all four FSRS mappings, exact due boundaries,
  user override persistence, mid-transaction rollback, duplicate confirmation and trash/restore.
- TC4, TC6, TC8, TC11, TC15–TC16, TC19: `SpacedReviewWorkspace.test.tsx` and `App.test.tsx`
  cover explicit generation, safe structured `<u>` rendering, blank submission, override,
  confirmation, updated counts and discard on unmount.
- TC5, TC9–TC10: `spaced-review-artifacts.test.ts`, `spaced-review-controller.test.ts` and the
  validated bundled skill cover exact item/question scope, four-level rubric, malformed output,
  trusted confirmation and non-reusable completed scope.
- TC7: generation/grading prompts carry the existing explanation-language enum and the review
  skill requires item-language sentences plus semantic grading across equivalent answer wording.
- TC20: Electron Playwright verifies the production-bundled skill, six-method review bridge,
  seeded ten-item summary, independent workspace and explicit generation control. Automated E2E
  deliberately does not spend a live Codex turn; the Codex protocol path is exercised with a
  deterministic app-server client in the Controller test.

### Changed Files

- `CONTEXT.md`
- `.agents/skills/practice-spaced-review/SKILL.md`
- `.agents/skills/practice-spaced-review/agents/openai.yaml`
- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/spaced-review-artifacts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- Corresponding Main, Renderer and Electron E2E test files.
- `documents/implements/F28-ai-graded-spaced-review-paper.md`
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`
- `documents/modules/skill-management.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`

### Acceptance Criteria Verification

- AC1–AC3: Sidebar count, due/new summary and user-triggered generation verified in Renderer and
  Electron tests.
- AC4–AC8: Bounded multilingual paper contract, safe underlining, blank answers, semantic feedback,
  AI defaults and optional user override implemented and verified at artifact/Controller/UI seams.
- AC9–AC10: 90% FSRS mapping and all-or-nothing SQLite transaction verified, including a forced
  unique-event collision after an earlier row was inserted in the same transaction.
- AC11–AC13: Consecutive rounds, empty state/next due and navigation discard are implemented; no
  paper content is written to SQLite or the conversation store.
- AC14–AC15: Edit/trash/restore schedule semantics and compact detail history are implemented and
  covered by repository/UI tests.

### Test Scenario Verification

TC1–TC19 are covered by deterministic automated tests at their owning boundary. TC20's production
installation, preload security and navigation portion is covered by Electron Playwright; the live
AI turn is represented by the deterministic Controller integration test as noted above.

### Commands Executed

- `npm test` — Server 3/3 and Desktop 215/215 passed.
- `npm run typecheck` — passed.
- `npm run build` — Server and Desktop production builds passed.
- `python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-spaced-review`
  — `Skill is valid!`
- `npm run test:e2e -w @reader/desktop` — 2/2 passed after rerunning with permission to launch
  Electron; the sandboxed attempt could not launch the GUI process.
- `git diff --check` — passed.
- DDD completion email was not attempted because `documents/ddd-email-notify.md` still contains
  placeholder sender/recipient values rather than configured addresses.

### Hypotheses and Decisions

- Requirement exploration confirmed that AI supplies all four default ratings for a consistent low-friction
  experience, while users retain an optional override before the local scheduler commits.
- Full paper persistence was deliberately rejected. Only compact confirmed review events and FSRS state
  survive navigation or restart.
- Existing reviewed due items outrank new items; CEFR ordering applies only to new-item introduction so
  high-level items already in the spacing cycle cannot starve behind a low-level backlog.
- A dedicated review workspace and controller are preferred over storing review artifacts in ordinary
  AI conversations, because the product requires paper data to be ephemeral.
- The first selection green test returned the correct ten-item queue and correct first four CEFR-ordered
  items, but the assertion still failed. Hypotheses were: Vitest array `toMatchObject` length semantics,
  incorrect item ordering, or an incorrect ten-item selection rule. The observed first four items ruled
  out ordering, and F28 requires filling the ten-item batch. Projecting the first four items confirmed the
  root cause was the test matcher; only the assertion was corrected.
- The first full-suite run exposed a timing-sensitive existing Escape assertion in the learning-item
  modal while 212 other tests passed. Ranked hypotheses covered effect timing, focus restoration,
  review-detail async work and modal substate. Focused 20× and full 5× reruns did not reproduce, but
  the event-listener lifecycle showed a real DOM-visible-before-passive-effect window. Moving only
  the keyboard listener to `useLayoutEffect` closes that window; the full suite then passed.

### Deferred Items

- FSRS parameter optimization, word-frequency metadata, complete paper history, sync, deck management
  and Anki import/export remain deferred.

### Architectural Notes

- `LocalLearningLibrary` remains the Main-owned transaction boundary for both item lifecycle and
  schedule persistence. Keeping queue/FSRS confirmation beside the SQLite repository avoids splitting
  the all-or-nothing transaction across services; AI workflow state remains isolated in
  `SpacedReviewController`.
- `App.tsx` already coordinates several workspaces and AI workflows. F28 should add a dedicated
  `SpacedReviewWorkspace` rather than embed review state directly in the root component.
- The App skill registry currently has repeated edits per bundled skill; F28 adds a fourth skill but does
  not include a registry refactor. If implementation reveals significant coupling, record a separate RXX.

## Appendix: TDD Implementation Checklist

1. Add failing service tests for due selection, new-item CEFR ordering, exact-time FSRS calculations,
   lifecycle rules, compact history and atomic rollback.
2. Add failing artifact, controller and skill-contract tests for bounded multilingual generation,
   structured underlining, semantic grading, all four ratings and malformed output rejection.
3. Add failing IPC／preload tests for strict review payloads and forbidden arbitrary AI／database access.
4. Add failing Renderer tests for sidebar counts, explicit generation, blank-answer warning, ephemeral
   navigation, feedback, optional overrides, confirmation and history detail.
5. Implement the minimum Main domain, migration, FSRS adapter, AI workflow and Renderer behavior required
   to turn the focused tests green.
6. Run focused tests, complete desktop tests, server tests, typecheck, production build, skill validation,
   Electron E2E and `git diff --check`.
7. Update this implementation record and synchronize `spaced-review`, `learning-library`,
   `skill-management`, `ai-conversation` and `learning-item-creation` module documents.
