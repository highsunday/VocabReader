---
title: AI 輔助學習項目建立模組
module: learning-item-creation
status: active
last_updated: 2026-09-01
related_implements:
  - F21-ai-assisted-learning-item-creation
  - F22-read-only-learning-item-draft-preview
  - B06-use-explanation-language-for-learning-cards
  - B19-use-learning-item-language-for-examples
  - B07-preserve-clarified-learning-item-targets
  - B34-exclude-japanese-clauses-from-learning-items
  - F27-trigger-learning-card-creation-from-natural-language
  - F28-ai-graded-spaced-review-paper
  - F34-route-multilingual-learning-item-intent-with-ai
  - F45-classify-and-filter-learning-items-by-language
  - F53-open-existing-learning-item-from-card-review
  - F65-standardize-learning-item-example-support
  - F70-preserve-useful-detail-in-learning-items
  - F78-add-imaginative-memory-tips
  - F68-calibrate-learning-item-frequency-levels
  - F69-isolate-learning-language-workspaces
  - B36-require-retrieval-hooks-in-memory-tips
  - B37-render-memory-tip-inline-markdown
---

# AI 輔助學習項目建立模組

## 1. Purpose

本模組讓讀者從閱讀頁或生詞庫頁的 AI 對話面板，透過「新增卡片」快捷操作或明確的
自然語言請求，建立單字與片語的
**學習項目草稿批次**。本機程式先用完整標題查出有限候選，AI 只比較這些候選的語義，
再產生可唯讀預覽、排除、恢復及明確提交的草稿。正式資料只有在使用者按下提交後，才以
單一 SQLite 交易寫入生詞庫。

狀態：**已實作，可在本機使用**

## 2. Product Flow

1. 使用者點「新增學習卡片」，可在提問框以逗號或換行提供多個單字／片語；也可以
   以任何語言提出明確自然語言請求。Renderer 不做固定文字配對；一般 AI turn 依本輪、
   同一對話與有限閱讀區段判斷 intent／targets。
2. targets 明確時，Controller 隱藏第一階段的 `learning-item-intent` artifact 與內部
   assistant message，自動進入後續準備；使用者只看見「正在準備卡片…」與一次最終
   creation 結果，不必回答 `yes`。目標不明確時才顯示一個聚焦問題。
3. AI route 與 `create-learning-items` 先依各目標語言把屈折變化還原成字典原型
   （lemma／citation form），不翻譯、不以英文尾碼規則套用其他語言，也不合併不同的
   衍生詞。skill 以 `requestedTitles` 保留原始輸入與原型 title 的可驗證對應。
4. `LocalLearningLibrary.findDuplicateCandidates()` 以 trim、英文大小寫不敏感、
   完整標題相等查詢 active 與 trashed 候選。
5. `create-learning-items` 只收到請求目標、有限閱讀區段及候選的
   id／title／sense／status／Markdown，先重新驗證每個 target 是可獨立學習的單字或
   可重複使用片語，再負責原型化、語義去重、必要澄清及草稿內容。
6. Main 驗證 fenced `learning-item-result`；每筆新草稿必須具有非空 `memoryTip`，每個
   結果的 `requestedTitles` 必須落在該 turn 的受信任目標，並具有
   `en | ja | zh-TW | ko | other` 其中一個學習項目語言；match id 仍必須來自 App
   提供的候選。
7. AI 訊息下方顯示批次按鈕。中央 modal 的清單區可捲動，只顯示結構化摘要、拼寫導向的
   Memory tip 與安全渲染的 Markdown 預覽；使用者可把草稿排除／恢復，但不可編輯
   草稿內容。active
   已存在項目可以點擊開啟共用唯讀詳情，關閉詳情後保留原草稿清單。
8. 提交時重新以原型草稿標題查候選。若有候選，以一次隔離 Codex turn 執行
   `learning-item-recheck` 語義分類；不逐卡啟動 AI，也不提供完整生詞庫。
9. 新發現的 active／trashed 重複分別顯示為已存在／垃圾桶；其他 included 草稿由
   `createItemsAtomically()` 在單一 `BEGIN IMMEDIATE` 交易中新增。
10. pending 批次可明確二次確認後放棄；abandoned 與 submitted 都是唯讀 terminal
   state，不能再排除、恢復、還原 match 或提交。關閉 modal 不等於放棄。
11. 提交結果保留在原 AI 訊息，不能再次提交；垃圾桶 match 在提交前後都可明確還原。
12. 成功新增的 active 項目沒有 schedule row，因此立即進入間隔複習的新項目 queue；
   首次引入順序由複習模組按 CEFR A1→C2 決定。

AI 逐筆依 canonical title 與目標語義判定**學習項目語言**；它不沿用請求、閱讀區段、
介面或講解語言。同批草稿限於目前工作區的學習語言；舊資料無法可靠歸入英文、日文、繁體中文或韓文時使用
其他語言。提交 recheck 只判斷語義重複，並保留草稿原語言。

AI 也逐筆依 `學習項目語言 + canonical title + 目標語義`判定**使用頻率
難度級別**。基準為該語言一般成年使用者的現代日常口語與一般書面內容；A1
表示核心高頻用詞，依常見度降低排至 C2 的極罕見、古舊、高度專業或限定語域用法。
同標題不同語義獨立評估；請求、講解、介面或閱讀區段語言不得覆蓋該基準。
詞形複雜度、長度或抽象程度本身不能單獨提高級別。這是產品共用的跨語言頻率標籤，
不宣稱為各語言官方 CEFR 詞表。

## 3. Clarification and Annotation Integration

- AI 路由確認建立意圖但沒有可靠 target 時，只詢問要加入什麼；建立狀態保存在 user
  message。使用者的下一個直接回答會延續 creation intent，先查候選後再呼叫 skill。
- 已知標題但語義不明時，下一個回答作為該標題的 `senseHint`，同樣重新查候選。
- target、拼字或單字／片語邊界需要澄清時，skill 在問題後附上
  `learning-item-request` typed targets。附件不顯示原始 JSON，並保存在最後一個
  assistant message；使用者回答「都加」「是」等上下文式內容時，Controller 優先沿用
  這組 targets，再把回答附加為 `senseHint`。
- 自然語言路由與 creation skill 是兩個受信任階段：前者只輸出
  `learning-item-intent` 與最多 50 個 targets，後者只在 App 查完候選後生成草稿。
- 快捷「新增卡片」、非空 invitation 與既有 workflow 澄清回答維持 typed fast path，
  不增加自然語言 routing turn。
- structured targets 缺席或為空時，使用者直接回答的逗號／換行清單仍作為新標題；
  程式不從 AI 可見文字猜測 targets，也不把含空格的片語任意拆成多個單字。
- `explain-reader-annotations` 在複習表後輸出 `learning-item-invitation`。
  Renderer 顯示「加入生詞庫」，預設一次加入全部 word／phrase targets。
- 解析與建立兩個 skill 共用同一個適格性邊界：phrase 必須是可在其他句子中
  重複使用的詞彙、固定表達、搭配或文法單位；帶自身述語且表達命題的
  完整句、從屬子句或連接子句都不適格。這個邊界顯式套用於英文、日文、
  繁體中文與韓文，並是其他語言的預設原則。日文選取即使缺少 `。`，以
  `〜ですが` 等連接形或 `〜ありません` 等有限述語完成命題時仍不是 phrase；
  韓文已有述語的 `-지만`、`-는데`、`-니까` 等連接子句也不是 phrase。
- creation skill 不信任上游已正確分類 target；混合批次只對適格 word／phrase
  產生 draft／existing／trashed，不適格句子／子句不轉成整句標題也不自動拆詞。
- 接受 invitation 後的建立 turn 沿用同一 AI 對話，因此 creation skill 可把該次解析與
  有限閱讀區段作為受限學習上下文；它優先整理與個別標題及目標語義直接相關、值得長期
  複習的細節，而不是只依 invitation 的簡短 `senseHint` 重新壓縮內容。
- 草稿不逐字複製整份解析，也不混入其他標記、完整句子專屬分析、整段摘要、複習表或
  來源 metadata；沒有額外學習價值時只產生固定核心內容。
- sentence annotation 不加入，也不拆成句中所有單字；空 targets 接受後進入上述澄清。
- 閱讀區段只供即時判斷，不保存到草稿或正式學習項目。

## 4. Explanation Language

- 建立流程沿用目前學習語言工作區的**講解語言**設定，不新增卡片專用設定。
- 設定為 `source` 時，以每個 requested target title 本身的語言為準：英文使用英文、
  繁體中文使用繁體中文、日文使用日文、韓文使用韓文。閱讀區段的
  語言不得覆蓋這項判斷。
- 設定為 `zh-TW`、`en`、`ja` 或 `ko` 時，批次內每張草稿分別固定使用繁體中文、英文、日文或韓文。
- 每句例句本體使用該筆學習項目語言；英文、日文、繁體中文與韓文項目分別使用自然的
  英文、日文、繁體中文與韓文例句。
- 每句例句以有序清單呈現、粗體標出目標詞，並固定緊接一個以 `→` 開頭的縮排行作為
  **例句輔助說明**。講解語言與學習項目語言相同時，該行以較簡單的同語言換句話說
  解開目標詞在句中的意思；兩者不同時，該行使用講解語言自然翻譯。每句只使用其中
  一種，不同時顯示改寫與翻譯。
- `Meaning`、詞性／IPA、`Common collocations`、`Examples` 使用固定 Markdown 層級；
  輔助說明不使用粗體、巢狀清單或語言化文字標籤。title 與 IPA 維持原貌。
- `Meaning` 先保留可快速複習的簡明意思；AI 判斷有長期價值時，可在固定核心之外選擇
  `Context and nuance`、`Grammar and usage`、`Synonyms and distinctions`、
  `Common mistakes` 或 `Pronunciation notes` 等補充小節。詳細程度不設固定字數上限，
  但不得機械加入所有小節、填充簡單項目或重複核心內容。
- 結構化 `sense` 維持簡短英文語義識別，確保既有候選查詢與語義去重契約不變。
- 結構化 `memoryTip` 使用同一講解語言，首要幫助學習者按順序重建目標詞的
  正確拼寫或字形，再連回目標語義。方法不設限：可使用其他簡單字詞、片語、短句、
  押韻／諧音、共用字母、拆字、字母替換、詞素／漢字結構、頭字句、節奏、小故事、
  誇張畫面或任何其他準確且有效的聯想；列舉方法只是靈感，不是白名單，也不機械套用
  單一模板。
- AI 交付前檢查記憶提示是否有可重建拼寫的具體路徑、是否只剩一般釋義場景、
  是否能原封不動套用至多個近義詞，以及字形、發音、詞素或詞源關係是否準確。
  只展示意思的 `Picture/Imagine ...` 句不是完成的記憶提示。
- `memoryTip` 可使用粗體、斜體、刪除線與行內 code 等輕量行內 Markdown
  強調拼寫區塊；不產生標題、清單、引用、連結、圖片、表格或原始 HTML。

## 5. Trust Boundaries

- Renderer 的普通訊息不判斷建立意圖；只有產品快捷可傳 typed intent 與最多 50 個
  title／senseHint，且不能指定 SQL、資料庫路徑、skill 路徑、Codex method 或任意查詢。
- AI 路由最多回傳 50 個 targets；第一階段不得輸出可提交 batch、查詢資料或寫入生詞庫。
- 初次 AI 回傳的每個 draft／match 都必須以 `requestedTitles` 對應 requested targets；
  canonical title 可因跨語言詞形還原而不同。existing／trashed id、標題、語義與狀態
  仍必須逐一等於程式提供的候選。
- 提交 recheck 必須恰好為每個 included draft 回傳一個 decision；match id 必須來自
  同標題且狀態相符的候選。
- 對話 store、IPC、Controller 與 repository 都重新驗證 enum、必要文字及批次 id。
- 缺少或偽造學習項目語言的 AI result 不會產生可提交草稿；提交時語言隨其他欄位在
  同一交易寫入。
- 缺少、空白或非字串的 `memoryTip` 會使整份 creation artifact 失效；正式提交時
  Memory tip 隨其他草稿欄位在同一交易寫入。
- 一般問答、假設、引用與否定句不會啟用 creation skill；任何語言的自然語言請求由
  AI 依語義決定，不依 Renderer 關鍵字或動詞清單。
  隔離 turn 禁用工具、網路、plugins、apps、memories 與 skill discovery。

## 6. Persistence and UI

對話 store 使用 version 2 保存 message attachments：

- `learningItemPreparation`
- `learningItemRequest`
- `learningItemInvitation`
- `learningItemBatch`
- `artifactError`

version 1 對話可讀取並在下次保存時遷移。準備狀態保存 targets、講解語言與錯誤；
重啟時殘留 `preparing` 會正規化為可重試的 `failed`，不自動啟動 AI。草稿內容、
Memory tip、included／excluded、候選 match、submitted／abandoned 時間及 created item ids 都附著
於對話訊息。移除整筆對話會移除草稿，但不影響已提交的正式項目。

中央 `LearningItemDraftDialog` 固定 header／footer，只有卡片區垂直捲動；Memory tip
固定在 Markdown 前，以 Brain 圖示、標籤與低彩度藍紫面板呈現，並由共用
`LearningMemoryTip` 安全渲染受限行內 Markdown；一般學習內容則使用
`react-markdown`、GFM 與 `skipHtml`。確認浮層沒有標題、語言、類型、CEFR、語義或原始
Markdown 的編輯控制；沒有 included 草稿時提交停用。Escape、遮罩及明確關閉按鈕只
關閉 modal，不改變草稿狀態。pending 批次另提供「放棄這批草稿」與二次確認；
abandoned 批次只顯示唯讀摘要。已存在列以可對焦按鈕呼叫現有
`learning:get`，並把共用詳情疊在草稿 modal 上；Escape 只關閉最上層詳情。

## 7. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/create-learning-items/SKILL.md` | 澄清、語義去重、拼寫導向 Memory tip、草稿與提交 recheck 契約 |
| `.agents/skills/explain-reader-annotations/SKILL.md` | word／phrase invitation 契約 |
| `apps/desktop/src/main/learning-library-service.ts` | exact-title 候選查詢、atomic create、restore |
| `apps/desktop/src/main/learning-item-artifacts.ts` | intent、result、invitation、recheck JSON 驗證 |
| `apps/desktop/src/main/learning-item-duplicate-classifier.ts` | 有限候選的單次隔離 AI recheck |
| `apps/desktop/src/main/chat-controller.ts` | AI routing、內部 continuation、重試、turn scope 與批次 lifecycle |
| `apps/desktop/src/main/chat-conversation-store.ts` | version 1→2、準備狀態與 batch attachments 持久化 |
| `apps/desktop/src/main/chat-ipc.ts` | typed intent、重試、放棄與草稿操作 IPC 驗證 |
| `apps/desktop/src/renderer/LearningItemDraftDialog.tsx` | 唯讀預覽、已存在詳情、排除／還原／提交／放棄 modal |
| `apps/desktop/src/renderer/App.tsx` | 普通 AI 送出、快捷／invitation、重試與 modal 整合 |

## 8. Tests

- `learning-library-service.test.ts`：exact normalized query 與交易新增。
- `learning-item-artifacts.test.ts`：intent、result、invitation、request 與 recheck
  fenced artifact 的嚴格驗證、必填語言、非空 Memory tip 及 50-target 邊界。
- `learning-item-duplicate-classifier.test.ts`：單次有限候選 AI recheck。
- `chat-controller.test.ts`：skill routing、候選範圍、持久澄清、草稿生命週期、重查、
  還原、不可重複提交、多語 AI route、自動 continuation、原 target 重試、放棄，
  source／固定講解語言映射，以及每句例句輔助說明的固定格式與語言分支。
  同時固定跨語言、特定語義的 A1–C2 使用頻率 rubric，以及選擇性詳細內容、區段解析
  銜接與無關內容排除契約；並固定 Memory tip 的拼寫回想優先級、自由聯想方法、
  反例、正例與交付前自檢。
- `chat-conversation-store.test.ts`：version 1→2、批次與 interrupted preparation 持久化。
- `chat-ipc.test.ts`：intent、targets、retry、abandon 與 mutation 邊界。
- `learning-item-draft-dialog.test.tsx`、`App.test.tsx`：批次 UI、Memory tip 受限行內 Markdown 預覽、
  快捷／邀請入口、已存在項目唯讀詳情與錯誤重試，以及普通訊息不做 Renderer 文字配對、
  重試 UI 與明確放棄流程。
- `desktop.spec.ts`：production skill 安裝與 preload bridge 白名單。

`chat-controller.test.ts` 另驗證日文完整命題、連接子句與真正可重複使用片語的
分類邊界，以及 creation skill 對上游誤分 target 的二次防護；同組契約測試
也以英文、繁體中文與韓文正反例驗證跨語言一致性。
`learning-item-artifacts.test.ts` 驗證 `language: ko` 草稿可通過 Main artifact 邊界並保留韓文標題。

## 9. Non-goals

不支援 sentence 卡片、來源追溯、完整生詞庫 AI 搜尋、任意 AI 資料庫工具、自動提交、
匯入／匯出、同步或跨裝置資料。間隔複習由獨立模組承接已提交項目，不改變本模組的
草稿與交易規則。任意語言只適用於建立意圖與 targets 的語義辨識；草稿內容仍只使用
現有 `source | zh-TW | en | ja | ko` 講解語言契約。

## 10. Related Documents

- `CONTEXT.md`
- `documents/modules/learning-library.md`
- `documents/modules/skill-management.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-language-workspace.md`
- `documents/implements/F21-ai-assisted-learning-item-creation.md`
- `documents/implements/F27-trigger-learning-card-creation-from-natural-language.md`
- `documents/implements/F34-route-multilingual-learning-item-intent-with-ai.md`
- `documents/implements/F68-calibrate-learning-item-frequency-levels.md`
- `documents/implements/F69-isolate-learning-language-workspaces.md`
- `documents/implements/F70-preserve-useful-detail-in-learning-items.md`
- `documents/implements/F78-add-imaginative-memory-tips.md`
