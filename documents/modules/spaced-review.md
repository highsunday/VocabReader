---
title: AI 批改與 FSRS 間隔複習模組
module: spaced-review
status: active
last_updated: 2026-08-09
related_implements:
  - F28-ai-graded-spaced-review-paper
  - F29-stream-spaced-review-generation-and-scroll-paper
  - B09-clarify-spaced-review-generation-status
  - B10-use-fast-model-for-spaced-review
  - F30-show-completed-review-exercise-count
  - F31-resumable-background-spaced-review
  - F32-add-expression-feedback-to-spaced-review
  - F36-show-spaced-review-daily-status
  - F37-configurable-daily-review-limits-and-paper-size
  - F38-export-and-restore-data-backup
  - F41-persist-review-answers-in-history
  - F42-show-solid-recall-growth
  - F48-diversify-spaced-review-sentences
  - F52-edit-learning-items-from-completed-review
  - F55-edit-learning-items-from-graded-review
---

# AI 批改與 FSRS 間隔複習模組

## 1. Purpose

本模組把生詞庫中的單字與片語轉成可持續的主動回想練習。每回合由本機程式依使用者
設定選出 1 至 20 個到期或新項目，使用者明確要求後，AI 才生成以特定語義為準的例句試卷。使用者
輸入劃線詞在該句中的意思，AI 提供逐題意思回饋與四級評級建議；答案實際使用學習
項目的語言時，AI 另提供不影響評級的表達建議。使用者確認或覆寫評級後，本機 FSRS
才更新排程。

未確認的試卷、作答、詳細回饋、表達建議與評級只在同一次 App 開啟期間保留。使用者
切換工作區時可以返回同一個未完成回合；只有確認整份試卷時，SQLite 才把逐題原始
複習作答隨排程狀態及精簡確認歷史保存。關閉 App 後不恢復未完成試卷。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 側欄獨立「間隔複習」入口及今日仍可排入後續試卷的即時數量。
- 設定提供每日新項目完成上限（預設 10）、每日到期複習完成上限（預設 50）與每份
  試卷題數（預設 10）；兩類上限為 0–999 且彼此獨立，題數為 1–20。
- 間隔複習頁固定顯示兩類今日完成數／上限、學習中數、完整 backlog 與可再引入名額；
  確認試卷或保存設定後會重新查詢摘要並立即更新。
- 間隔複習首頁以獨立成果卡顯示目前穩定掌握、正在鞏固、30 天淨成長、30 天回想
  成功率及 90 天穩定掌握折線；既有 30 天複習活動方格另外保留為較低權重的投入
  資訊，不把完成次數稱為記憶成果。
- 每類可再引入名額只扣除今日已完成數；學習中項目不預先占用完成名額，抵達精確
  到期時間後仍維持原類別並優先繼續學習。
- 尚未完成且再次到期的學習中項目優先，其次是其他既有到期項目，最後由新項目依
  CEFR A1→C2、同級建立時間補到設定題數；額度不足時允許較少題。
- 進入頁面只顯示摘要，不自動使用 AI；明確按下按鈕後才生成試卷。
- 生成期間以整合式 AI 狀態卡顯示「已完成 X／N 題例句」與確定比例進度；全部例句
  到達後切換為「組裝並檢查試卷」，並保留等待秒數及取消操作。卡片不顯示原始模型
  文字或未驗證 artifact。
- AI 依項目語言與特定 `sense` 生成例句，Renderer 以安全結構化片段劃線目標詞。
  學習項目 Markdown 中的 Examples 用來確認語義與典型用法，同時作為不得複製或表面
  改寫的參考；新題句在自然、準確與典型用法優先的前提下適度改變具體事件、視角、
  溝通目的或句型，減少固定上下文成為額外記憶線索。
- 生成與批改優先使用帳號可用的 `gpt-5.6-luna` low，其次
  `gpt-5.6-terra` low；兩者不可用時沿用 Codex 預設模型，不影響一般 AI 對話選擇。
- 整卷作答與批改；空白答案可提交，提示會被判為「忘記」，批改後直接顯示目前
  語境的簡短建議回答。
- AI 只依語義正確度與完整度建議忘記／困難／順利／簡單，不使用作答速度。
- AI 同一次批改會判斷答案是否實際使用學習項目的語言；適用時另提供自然度肯定，
  或一個學習項目語言改寫及講解語言原因。答案長度不是表達品質，也不得成為要求
  完整句或更多說明的理由；表達品質不影響四級評級。
- 空白或非學習項目語言答案不顯示表達建議；缺少或 malformed 的選用建議欄位會安全
  降級，不阻擋合法意思回饋及評級確認。
- 結果頁預選 AI 建議，使用者可逐題覆寫後一次確認。
- 批改後每題可開啟共用學習項目詳情並人工或透過 AI 編修，但尚未確認排程時不可
  移入垃圾桶；排程確認後的完成頁逐筆顯示學習項目標題、最終評級與下次複習時間，
  且每列沿用可編修或移入垃圾桶的同一個詳情。後續 mutation 不重跑出題、批改或
  複習確認，關閉後仍保留結果與下一步操作。
- 使用 `ts-fsrs`、固定 90% 目標記憶率及預設參數計算精確到期時間。
- 同一回合在單一 SQLite 交易寫入所有事件與排程；成功後可連續開始下一回合。
- 生詞庫詳情懶載入目前狀態、最後評級、下次到期、次數，以及逐筆顯示原始複習
  作答的精簡歷史；舊事件標示未保存作答，留白則標示未作答。
- 編輯不重設排程；垃圾桶項目排除；還原保留原排程，逾期者立即重新可用。
- 間隔複習中央工作區使用自己的垂直捲動容器，十題內容可完整捲動；生詞庫仍保留
  固定工具列及內部結果 scroll region。
- 生成中、作答中及批改後尚未確認的回合可跨工作區保留；切換頁面不取消生成，
  返回後沿用同一份進度、試卷、答案、回饋及評級選擇。
- 間隔複習側欄入口在 AI 生成期間顯示旋轉狀態 icon；試卷生成完成且尚未確認回合時
  顯示可繼續 icon。可存取名稱分別說明「試卷生成中」與「試卷已生成，可繼續」。
- 作答中或檢視批改時可「先離開」並收合試卷內容；間隔複習首頁仍保留本回合摘要，
  並在同一頁下方顯示「當前試卷」卡，可查看原試卷且保留題目、答案、回饋及評級。
- 未完成試卷卡提供「放棄試卷」；確認視窗會說明資料不可復原。只有確認後才清除
  題目、答案、AI 回饋與未確認評級，且不寫入複習歷史或更新排程。

## 3. Queue and Scheduling Rules

`LocalLearningLibrary.getReviewSummary()` 以 Main process 的裝置時間建立摘要：

1. 依每個項目的確認事件順序推導穩定的「新項目學習路徑」或「到期複習路徑」。
   `next_due_at` 的本地日期仍是確認當天時維持學習中；跨日也保留原始路徑。
2. 只有 `next_due_at` 的本地日期進入隔天或更晚才算完成，並依事件所屬路徑增加今日
   新項目或到期複習完成數。
3. 每類剩餘完成額度為設定上限減去今日已完成數；目前學習中數保留作為狀態資訊與
   排序依據，但不預先占用完成名額。今日已完成數達到獨立上限後不再引入同類其他
   項目，已進入學習路徑的項目再次到期後仍可繼續。上限為 0 時暫停該類別，但不
   改動已生成試卷。
4. 先選已再次到期的學習中項目，再依精確逾期時間選其他既有到期項目，最後以沒有
   schedule 的 active 新項目依 CEFR 與建立時間補足。
5. `selectedItems` 最多為 `reviewPaperSize`；`totalAvailable` 是目前受額度限制後可排入
   後續試卷的數量，`backlogTotal` 另保留完整待處理量。
6. 沒有目前可用項目時回傳最近一筆尚未到期的 `nextDueAt`；存在學習中項目時，
   Renderer 顯示最近到期時間，並以單次 timer 在抵達後重新查詢摘要與更新側欄
   可複習數。沒有等待中的學習路徑時，Renderer 才依 backlog 判斷今日額度已用完。

### 3.1 穩定掌握成果與複習活動

`getReviewSummary()` 另依 active 學習項目的 append-only 複習事件重建兩組語意分離
的統計：

- `learningProgress` 是結果：項目至少在兩個不同本地日期取得 Good／Easy、目前
  FSRS stability 至少 30 天、最新評級仍為 Good／Easy，且查詢時間的 retrievability
  至少 85% 才屬於穩定掌握。具有排程但未達標或已衰退者屬於正在鞏固。90 天每日點
  依當日結束前最後事件重建，今天只算到查詢時間；30 天淨成長可以為負。
- 生詞庫頁的 Strong 直接復用同一次 `reviewProgress()` 產生的 Solid recall 項目集合；
  因此相同查詢時點的 Library Strong 必須等於 `learningProgress.solidItemCount`，不另
  維護近似門檻或第二套熟悉度規則。
- `reviewActivity` 是投入：沿用「下一次到期日期進入隔天或更晚才算完成」規則，
  彙整最近 30 個本地日期的新項目與到期複習完成次數。它只驅動活動方格，不影響
  穩定掌握判定。
- 30 天回想成功率排除每個項目的首次複習，只以後續事件的 Good／Easy 為成功；
  沒有後續樣本時回傳 null，Renderer 顯示破折號而不是 0%。
- 垃圾桶項目由摘要查詢排除；還原後沿用既有事件重新進入成果與活動統計。

最終評級映射：

| 產品評級 | FSRS rating |
|---|---|
| 忘記 `forgotten` | Again |
| 困難 `hard` | Hard |
| 順利 `good` | Good |
| 簡單 `easy` | Easy |

初次複習以 `createEmptyCard(now)` 建立卡片，後續從已保存並嚴格驗證的 card JSON
繼續計算。到期時間保存為 ISO timestamp；Renderer 不可提供或覆寫排程用的目前時間。

## 4. AI Workflow and App-session Scope

`SpacedReviewController` 在 Main process 擁有目前試卷及批改 scope：

1. 生成時重新查詢本回合摘要，只把最多 20 個、且不超過每份試卷題數設定的選中項目
   必要欄位交給 AI。完整 `markdownContent` 保留在 bounded payload，使 skill 能把其中
   Examples 當作需避免複製或表面改寫的參考，而不是出題模板。
2. 每次生成或批改建立獨立的一次性 Codex thread，使用 read-only sandbox、
   `approvalPolicy: never`，並停用工具、網路、一般 skills、plugins、apps 與 memories。
   初始化後讀取分頁 model catalog，優先選擇支援 low 的 Luna，再選 Terra；目錄失敗、
   格式錯誤或無候選時省略 model／effort，安全使用 Codex 預設值。
3. `practice-spaced-review` skill 依 generation／grading mode 直接回傳唯一 fenced
   artifact，不額外生成 `Preparing` 進度文字。grading artifact 把語意回饋、四級
   評級與結構化 `expressionFeedback` 分開；skill 明定表達品質不得改變語意評級。
4. `spaced-review-artifacts.ts` 驗證 paper id、question id、item id、標題、語義、CEFR、
   完整覆蓋及唯一性；不接受原始 HTML。表達建議只接受 natural／improvable／
   not-applicable 三態及對應欄位組合，缺少、malformed、舊 `insufficient` 或未知
   狀態時正規化為 not-applicable，保留核心意思批改。
5. 批改只接受目前試卷的完整答案集合；確認前只保存於 Main 記憶體。
6. Renderer 確認時只送 question id 與最終評級；Controller 以受信任批改結果還原
   item id、AI 評級及批改時已驗證的原始複習作答，再交給 repository 原子寫入。
   若試卷建立後有項目被移入垃圾桶或永久刪除，repository 會略過該失效項目並確認
   其餘 active 項目；若全數失效則成功回傳零筆事件，不建立排程或歷史。
7. generation turn 的 `item/agentMessage/delta` 由 Controller 累積；Main 的字串狀態機
   只計算 `questions` 陣列內完整閉合的頂層題目物件，並透過 invoke event 向發起視窗
   傳送 `phase`、`completedCount`、`totalCount`。Renderer 不接收模型文字、JSON、
   例句內容或未驗證題目。
8. `SpacedReviewWorkspace` 在 App Renderer 生命週期內保持掛載；切換工作區只暫停
   輸出複習畫面，不解除 progress subscription、不呼叫 discard，也不中斷進行中的
   AI request。使用者明確取消或 App Renderer 真正卸載時才清除 Main／Renderer
   暫態 scope。

試卷不進入 `LocalChatConversationStore`，也不顯示成一般 AI 對話訊息。
複習專用模型策略只存在於 `SpacedReviewController`，不讀寫
`ChatController.#selectedModelId`，也不改變右側 AI 對話面板的模型目錄或使用者選擇。

## 5. Persistence

學習資料庫新增：

- `learning_review_schedules`：每個項目一筆目前 `due_at`、完整 FSRS card JSON、
  累計次數、最後複習時間與最後最終評級。
- `learning_review_events`：append-only 精簡事件，保存 session／item／reviewed time、
  原始複習作答、AI 與最終評級、FSRS 前後 card JSON、間隔秒數及下次到期。

兩表以 foreign key 關聯 `learning_items` 並 `ON DELETE CASCADE`。永久清空垃圾桶時，
對應排程與歷史一併刪除。事件不保存 AI 例句、建議回答、詳細回饋或表達建議。
schema 4 的 nullable `answer` 讓 migration 前事件可保持 null，並與新版留白字串區分。

完整資料備份保存整份 SQLite，因此已確認的 schedules、精簡 events 與複習作答會
跨裝置還原；只在 `SpacedReviewController` 記憶體中的未確認試卷、作答、回饋與評級
不會備份。

## 6. Typed Boundary

Renderer 只能透過 `ReviewDesktopApi` 使用：

- `getSummary()`
- `generatePaper({ explanationLanguage })`
- `gradePaper({ paperId, answers })`
- `confirmPaper({ paperId, ratings })`
- `discardPaper()`
- `getItemDetail(itemId)`
- `onGenerationProgress(listener)`

IPC 驗證所有 enum、id、陣列與答案文字。Renderer 不能傳入 item scope、目前時間、
skill 路徑、Codex method、SQLite 路徑或 FSRS 狀態。

`ReviewGradeResult.expressionFeedback` 使用 discriminated union：natural
具有講解語言訊息但沒有改寫，improvable 同時具有訊息與學習項目語言改寫，
not-applicable 不帶內容。舊回覆或不可靠結構可省略欄位並在 Main 安全降級。
`ReviewGradeResult.recommendedAnswer` 是非阻斷的簡短建議回答；skill 要求每題產生，
Main 只接受非空字串，舊 artifact 缺少時仍保留核心批改結果。

## 7. Renderer States

`SpacedReviewWorkspace` 具有 loading、ready、generating、answering、grading、reviewing、
confirming、completed 狀態。generating 內另顯示 preparing／assembling 階段；狀態卡
以已完整收到的題目數呈現 determinate progressbar、等待秒數、`aria-busy`／live
status 及取消操作，並以 attempt token 忽略取消後的晚到結果。題目採單欄卡片，使用
真正的 `<u>` 呈現受驗證 `targetText`；答案是多行輸入。批改後在原題下顯示可存取的
「意思判斷」，並在其中以「下次可以這樣回答」呈現簡短 `recommendedAnswer`；答案
含有正確內容時沿用其易懂表達往前補完整一步，答案錯誤或留白時則依目標語義重新
產生，不寫成鉅細靡遺的字典定義。improvable 的 `suggestedAnswer` 只在原作答框下方
顯示為「口語修正」，不另顯示表達建議區塊。結果區接著顯示四個 radio 選項，並依目前選中的
評級顯示 forgotten 紅、hard 橘、good 藍綠、easy 綠；radio 覆寫會立即更新
`data-rating` 與顏色，並保留具名評級狀態、AI 建議文字及 radio，顏色不是唯一訊號。
工作區另外持有只控制顯示的 paused view；它不改變 review phase，也不清除任何
回合作答狀態。
工作區在 ready 與 completed 顯示一張主要成果卡、一張次要複習活動卡及今日完成
狀態列。成果卡只有穩定掌握大型主數字、正在鞏固、30 天回想成功率與單一 90 天
SVG 折線；活動卡以 30 天方格顯示完成次數與活動日，不重複成果指標，也不提供時間
範圍或粒度控制器。確認成功後完成頁保持不變，Renderer 另重新呼叫 `getSummary()`
更新成果、活動、今日狀態與側欄可複習數；若非關鍵刷新失敗，不把已成功寫入的確認
降回未確認狀態。
保存設定後 `App` 也要求重新查詢摘要；若已有進行中試卷，只更新額度與側欄數字並
保留原 `selectedItems`，避免調低上限破壞作答內容。
ready 空狀態具有未來 `nextDueAt` 時，Renderer 以單次 timer 等到精確到期時間再
呼叫 `getSummary()`；摘要或到期時間改變時會清除舊 timer。超過瀏覽器單次 timer
安全範圍的等待時間會分段刷新，不要求使用者重新啟動 App 或修改設定。
paused view 可開啟放棄確認 alert dialog；取消只關閉 dialog，確認才呼叫
`discardPaper()`、重新載入摘要並回到 ready。本回合摘要在 ready、作答、批改及確認
階段持續顯示；已有試卷時不再顯示生成按鈕。試卷收合時，同頁下方顯示當前試卷卡；
展開時，同一位置顯示完整試卷。

只有整份試卷完成 AI 批改後，每題才顯示帶有卡片圖示的「打開學習卡」。入口以受信任
`question.itemId` 呼叫既有 `learning:get`，並用生詞庫共用的詳情 modal 顯示安全
Markdown、發音、複習排程與精簡歷史。reviewing 與 completed 都傳入 editable
capability 及 mutation callback，沿用既有人工 Save 與 AI Apply；只有 completed 另外
允許 Delete 與移入垃圾桶。刪除後重查生詞庫 counts，但完成事件列仍保留；所有詳情
操作都不重跑生成、批改或確認。關閉按鈕、Escape 與 backdrop 會把焦點還給原觸發
按鈕。
精簡歷史逐筆顯示「Your answer」與原始換行文字；留白顯示 `Not answered`，schema 4
以前的事件顯示 `Answer wasn't saved`。

完成摘要顯示新間隔／到期資訊與剩餘數量；仍有 backlog 時可開始下一回合。
`SpacedReviewWorkspace` 由 `App` 常駐掛載，非 review mode 時回傳空畫面，因此生成
Promise、輸入、生成進度與未確認畫面狀態會跨工作區保留；App 真正卸載時 cleanup
仍會 discard。`App` 為 review mode 指定 `spaced-review-content`，由中央 main
element 自己 `overflow-y: auto`；不再沿用生詞庫刻意鎖住外層捲動的 class。工作區
只向 `App` 回報 idle／generating／resumable 顯示狀態，側欄不接收試卷內容。

## 8. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/practice-spaced-review/SKILL.md` | 例句生成、語義批改、表達建議、四級 rubric 與 artifact 契約 |
| `apps/desktop/src/shared/review-contracts.ts` | Main／Preload／Renderer 共用 review 型別 |
| `apps/desktop/src/main/learning-library-service.ts` | queue、SQLite migration、FSRS 與原子確認 |
| `apps/desktop/src/main/spaced-review-artifacts.ts` | paper／grade artifact 嚴格驗證 |
| `apps/desktop/src/main/spaced-review-controller.ts` | 暫態 scope、隔離 AI turn 與確認信任邊界 |
| `apps/desktop/src/main/spaced-review-ipc.ts` | review IPC 白名單及 payload 驗證 |
| `apps/desktop/src/preload/preload.ts` | `window.readerDesktop.review` typed bridge |
| `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx` | 摘要、作答、批改、先離開／繼續、放棄確認、覆寫、確認與連續回合 UI |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx` | 學習項目複習摘要與精簡歷史 |
| `apps/desktop/src/renderer/App.tsx` | 獨立工作區入口、可用數量及生成／可繼續狀態同步 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `learning-library-service.test.ts` | 學習路徑、完成判定、學習中項目不預占完成額度、跨日分類、穩定掌握／衰退、90 天成果、30 天活動與回想率、獨立額度、零值暫停、可設定題數、三層排序、精確到期、FSRS、覆寫歷史、試卷確認期間刪除、垃圾桶與重複確認 |
| `spaced-review-skill.test.ts` | 新語境與 Examples 避重規則、自然度優先、評級獨立、表達建議三態、長度獨立、留白答案、語言分工及改寫契約 |
| `spaced-review-artifacts.test.ts` | 合法 artifact、安全片段、表達建議正規化、缺題、未知／重複 id 與錯 scope 拒絕 |
| `spaced-review-controller.test.ts` | 暫態 paper／expression feedback、完整題目串流計數、字串括號邊界、Luna／Terra／default 模型選擇、分頁、隔離 turn、受信任確認及 discard |
| `spaced-review-ipc.test.ts` | 六個操作、安全 typed generation count payload 與惡意 payload 拒絕 |
| `SpacedReviewWorkspace.test.tsx` | 穩定掌握成果卡、90 天可存取折線、30 天活動卡、零資料、完成後刷新、整合式狀態卡、等待到期文案與自動刷新、完成數與確定進度、意思／表達分區、四級結果色彩、批改後人工／AI 編修但禁止移入垃圾桶、完成頁編修與垃圾桶及 counts 刷新、焦點回復、短答案與不適用建議、先離開／繼續、放棄二次確認、取消／晚到結果、空白提醒、覆寫、確認與真正卸載清除 |
| `learning-library-workspace.test.tsx` | 詳情摘要、可展開精簡歷史、作答文字與新舊留白狀態 |
| `App.test.tsx` | 側欄數量與狀態 icon、獨立工作區、進入時不呼叫生成，以及生成／作答／批改狀態跨工作區保留 |
| `bundled-skill.test.ts` | 第四份內建 skill 安裝／更新 |
| `desktop.spec.ts` | production skill、七項 review bridge、工作區入口及實際垂直捲動 |

## 10. Known Limitations and Follow-up

- 未完成回合不寫入 SQLite；關閉視窗、重新載入 Renderer、App 當機或重新啟動後
  不恢復。
- 目前沒有 deck、手動選題、FSRS optimizer、retention 設定或自訂學習日開始時間。
- 沒有重播、搜尋或匯出完整試卷與作答，也不持久保存詳細回饋及表達建議；已確認的
  原始複習作答只存在於各學習項目的精簡歷史。
- 不持久保存 AI 複習題句，因此 prompt 可以避免沿用目前學習項目的 Examples，但不
  保證不同複習回合之間永遠不會出現相似句子。
- 已確認排程與精簡歷史可隨整份資料備份還原；沒有自動同步、Anki 匯入／匯出，
  也不備份未完成試卷。
- CEFR 是首次引入順序的近似，尚未結合獨立詞頻資料。
- AI 生成與批改需要本機 Codex 可用；排程查詢與已確認歷史不依賴 AI。
- 快速複習模型依帳號實際可用 model catalog 決定；Luna／Terra 不可用時效能仍取決於
  Codex 預設模型。
- 完成數取決於 Codex delta 的分段粒度；單一 delta 同時包含多題時，數字會一次跳升，
  但不會以計時器製造假進度。
- 摘要目前會依完整複習事件序列推導學習路徑；資料量大幅成長後可能需要持久化索引
  或快取，以避免每次摘要都掃描全部 active 項目的事件。

## 11. Related Documents

- `CONTEXT.md`
- `documents/implements/F28-ai-graded-spaced-review-paper.md`
- `documents/implements/F37-configurable-daily-review-limits-and-paper-size.md`
- `documents/implements/F29-stream-spaced-review-generation-and-scroll-paper.md`
- `documents/implements/B09-clarify-spaced-review-generation-status.md`
- `documents/implements/B10-use-fast-model-for-spaced-review.md`
- `documents/implements/F30-show-completed-review-exercise-count.md`
- `documents/implements/F31-resumable-background-spaced-review.md`
- `documents/implements/F32-add-expression-feedback-to-spaced-review.md`
- `documents/implements/F36-show-spaced-review-daily-status.md`
- `documents/implements/F52-edit-learning-items-from-completed-review.md`
- `documents/implements/F55-edit-learning-items-from-graded-review.md`
- `documents/modules/learning-library.md`
- `documents/modules/skill-management.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/data-backup.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/implements/F41-persist-review-answers-in-history.md`
- `documents/implements/F48-diversify-spaced-review-sentences.md`
- `documents/implements/B15-do-not-reserve-completion-capacity-for-learning-items.md`
