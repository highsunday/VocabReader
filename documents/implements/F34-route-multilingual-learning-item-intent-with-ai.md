---
author: Codex
date: 2026-07-25
title: 由 AI 辨識多語言學習項目建立意圖並直接準備草稿
uuid: 5839e964-8fdb-4dd2-b6b4-8e8e45f163dc
version: 1.1.0
status: implemented
---

# Feature Specification - 由 AI 辨識多語言學習項目建立意圖並直接準備草稿

## 1. Feature Overview

目前 **AI 對話面板**由 Renderer 使用固定英文與繁體中文正則表達式，判斷一般輸入
是否要啟動 **AI 輔助建立**。這使建立意圖受限於程式事先列出的語言、動詞與目的地
同義詞；例如「新增這張卡片」會進入建立流程，「增加這張卡片」卻維持一般問答。
AI 雖能從同一對話正確理解後者並提出結構化 target，Controller 仍因原始 user message
沒有 typed creation intent 而拒絕延續，造成使用者回答 `yes` 後再次被要求確認。

本功能移除一般對話文字的固定詞語配對，改由 **Codex AI 執行層**依本輪輸入、既有
**AI 對話**及有限**閱讀區段**，判斷任何語言中的明確建立意圖並提出結構化 targets。
targets 明確時，系統自動完成「AI 路由與 target 辨識 → App exact-title 候選查詢 →
建立 skill 準備草稿」兩階段流程，中間不再要求聊天式 `yes`。使用者只看見一次處理
狀態與一次最終結果；只有最後明確提交**學習項目草稿清單**時才寫入生詞庫。

快捷「新增卡片」與區段解析 invitation 已由 App 提供明確 intent／targets，維持既有
typed fast path，不經過 AI 意圖路由。任意語言支援只擴充建立意圖與 target 辨識，
不新增講解語言選項。

## 2. Requirements (User Story)

- **As a** 使用任何語言與 AI 對話的語言學習者
- **I want** 讓 AI 理解我建立學習項目的自然語言請求並直接準備待確認草稿
- **So that** 我不必使用產品預先列出的特定動詞，也不必在目標明確時重複確認

## 3. Confirmed Product Rules

### 3.1 AI owns natural-language intent routing

- 一般對話文字是否明確要求建立學習項目，由 AI 依語義判斷，不由 Renderer 的固定
  語言、關鍵字、同義詞或正則表達式判斷。
- AI 可以辨識任何語言的建立請求；不得只列出一組支援語言或建立動詞。
- AI 只能使用本輪輸入、同一 AI 對話前文及 App 明確提供的有限閱讀區段。
- 明確要求新增、保存或建立學習項目時才啟動 AI 輔助建立。
- 詢問內容是否適合建立、假設性敘述、引用、否定句或其他意圖不明確內容，維持一般
  AI 對話，不產生建立 artifact 或草稿。
- 建立意圖明確但 target、拼字、語義或單字／片語邊界不明確時，只提出一個聚焦的
  澄清問題；不得猜測或把完整命令句當作標題。

### 3.2 Clear targets skip conversational confirmation

- 建立意圖與 targets 都明確時，直接準備學習項目草稿清單。
- 不顯示「要新增這張卡片嗎？」之類的聊天式確認，也不等待 `yes`、`是` 或 `都加`。
- 草稿仍是唯讀、可排除、可恢復及待提交狀態；不得因略過聊天確認而自動寫入生詞庫。
- 使用者明確提交草稿清單仍是唯一建立正式學習項目的動作。

### 3.3 Automatic two-stage preparation

- 一般對話中的明確建立請求依序執行：
  1. AI 判斷建立意圖並回傳最多 50 個結構化 targets；
  2. App 以 targets 的完整標題查詢 active 與 trashed 候選；
  3. App 自動啟動受信任的 `create-learning-items` turn，提供 targets、候選及講解語言；
  4. 建立 skill 比較語義並產生 draft／existing／trashed 結果。
- 兩階段屬於同一次使用者操作，中間不要求使用者輸入或點擊。
- 第一階段只建立路由與 target scope，不得直接回傳可提交 batch、查詢任意資料或寫入
  生詞庫。
- 第二階段沿用既有 exact-title 候選、turn scope 與 artifact 驗證；超出 targets 或
  候選範圍的結果必須拒絕。
- 普通問答不啟動第二階段，因此維持一次 AI turn。

### 3.4 One visible reply

- 對話保留使用者原始自然語言請求。
- 第一階段的路由 artifact、內部訊息與技術 JSON 不顯示為獨立 AI 回覆。
- 路由與草稿準備期間顯示單一「正在準備卡片…」狀態。
- 第二階段完成後只顯示一次人類可讀結果與草稿清單操作。
- 若第一階段判定不是建立請求，正常顯示該輪一般 AI 回覆。
- 內部仍保存結構化 intent、targets、階段及錯誤狀態，支援持久化與重試。

### 3.5 Typed fast paths remain direct

- 使用者在輸入框提供逗號或換行 targets 後點「新增卡片」，直接查候選並呼叫建立
  skill，不經 AI 意圖路由。
- 使用者接受區段解析的「加入生詞庫」invitation 時，直接使用 invitation targets。
- 既有建立 workflow 的必要澄清回答直接沿用已保存 targets。
- fast path 不因本功能增加額外 AI 路由 turn或聊天式確認。

### 3.6 Retry without reconfirmation

- 第一階段已產生結構化 targets 後，候選查詢、第二階段啟動、AI 回覆或 artifact 驗證
  失敗時，保留 targets 與失敗階段。
- UI 顯示可理解的錯誤與「重試準備卡片」。
- 重試從失敗的候選查詢／草稿準備階段繼續，不重新判斷意圖或要求確認 targets。
- App 在兩階段之間關閉或重新啟動後，未完成狀態轉成可重試，不自動寫入或產生
  虛假的完成結果。

### 3.7 Explicitly abandon a draft list

- pending 學習項目草稿清單提供「放棄這批草稿」操作。
- 放棄後保留簡短對話紀錄，但該批次不可再排除、恢復、還原 match 或提交。
- 放棄不建立、刪除、還原或修改任何正式學習項目。
- 之後若要建立相同內容，必須重新啟動一份 AI 輔助建立流程。
- 關閉草稿 modal 只代表稍後處理，不等同於放棄。
- submitted 與 abandoned 批次都是 terminal state，不得互相轉換或再次提交。

### 3.8 Language scope

- 任意語言能力只適用於建立意圖與 targets 的語義辨識。
- 草稿的解釋、學習者提示與例句翻譯仍遵守目前講解語言設定。
- 本功能不新增講解語言選項，不改變 source／繁體中文／English／日本語的既有契約。

## 4. Acceptance Criteria

- **Scenario 1：未列入詞表的中文請求直接產生草稿**
  - **Given** 前文正在解釋 `in advance`
  - **When** 使用者輸入「增加這張卡片」
  - **Then** AI 判斷為明確建立請求並提出 target `in advance`
  - **And** App 自動查詢候選並準備待確認草稿
  - **And** 不詢問是否要新增，也不等待 `yes`

- **Scenario 2：其他語言建立請求走相同流程**
  - **Given** AI 對話前文包含一個可辨識的單字或片語
  - **When** 使用者以非英文、非繁體中文的語言明確要求建立卡片
  - **Then** 使用相同結構化 AI 路由與自動兩階段流程
  - **And** 不需要該語言的 Renderer 關鍵字或正則表達式

- **Scenario 3：目標明確時只有一次可見回覆**
  - **Given** AI 路由回傳一個非空 target
  - **When** 候選查詢及建立 skill 成功
  - **Then** 對話只顯示原始 user message 與一次最終 assistant 結果
  - **And** 不顯示路由 artifact、內部 turn 或中間確認文字

- **Scenario 4：普通問答維持普通回答**
  - **Given** 使用者詢問某個片語的意思，沒有要求建立學習項目
  - **When** AI 完成路由與回答
  - **Then** 顯示一般 AI 回覆
  - **And** 不查詢 learning candidates、不啟動建立 skill、不產生草稿

- **Scenario 5：模糊、假設、引用與否定句不建立**
  - **Given** 使用者詢問「這適合做卡片嗎？」、引用建立命令或明確否定建立
  - **When** AI 判斷建立意圖
  - **Then** 維持一般對話
  - **And** 不啟動自動第二階段

- **Scenario 6：明確意圖但無 target 時才澄清**
  - **Given** 使用者明確要求建立卡片，但本輪、前文及閱讀區段都沒有可靠 target
  - **When** AI 完成第一階段
  - **Then** 顯示一個聚焦的 target 澄清問題
  - **And** 保存可延續的結構化建立狀態
  - **And** 在使用者提供 target 前不查候選或產生草稿

- **Scenario 7：候選與草稿維持可信任範圍**
  - **Given** 第一階段只回傳 target `in advance`
  - **When** 第二階段產生結果
  - **Then** App 只查詢完整標題 `in advance`
  - **And** draft／existing／trashed 必須完全落在該 target 與 supplied candidates
  - **And** 越界結果不會成為可提交草稿

- **Scenario 8：typed fast path 不增加路由階段**
  - **Given** 使用者點「新增卡片」並提供 targets，或接受非空 invitation
  - **When** App 啟動 AI 輔助建立
  - **Then** 直接查候選並呼叫建立 skill
  - **And** 不執行自然語言意圖路由、不要求聊天式確認

- **Scenario 9：第二階段失敗可以原 target 重試**
  - **Given** AI 已辨識 `in advance`，但候選查詢或草稿生成失敗
  - **When** 使用者選擇「重試準備卡片」
  - **Then** App 沿用 `in advance` 從失敗階段繼續
  - **And** 不重跑意圖判斷、不詢問是否新增、不把錯誤狀態當成 batch

- **Scenario 10：重新啟動後可安全重試**
  - **Given** App 在已取得 targets、尚未完成草稿的階段關閉
  - **When** 使用者重新開啟同一 AI 對話
  - **Then** 未完成建立顯示為可重試
  - **And** targets 保留，沒有正式學習項目被建立

- **Scenario 11：放棄 pending 草稿**
  - **Given** 一份 pending 草稿清單
  - **When** 使用者確認「放棄這批草稿」
  - **Then** 批次成為 abandoned 並保留簡短紀錄
  - **And** 不得再提交或執行任何 batch mutation
  - **And** 生詞庫內容維持不變

- **Scenario 12：關閉不等於放棄**
  - **Given** 一份 pending 草稿清單
  - **When** 使用者以關閉、Escape 或 backdrop 關閉 modal
  - **Then** 批次維持 pending
  - **And** 稍後仍可重新開啟、排除、恢復或提交

- **Scenario 13：講解語言契約維持不變**
  - **Given** 使用者以任何語言提出建立請求
  - **When** 建立 skill 準備草稿
  - **Then** 草稿內容使用目前講解語言
  - **And** 請求語言不會新增或切換講解語言選項

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 中文同義詞不受詞表限制 | 前文為 `in advance` | 輸入「增加這張卡片」並模擬 AI route artifact | 查 `in advance`；自動產生 batch；無 `yes` turn | Critical |
| TC2 | 非英中建立請求 | 前文有 target | 模擬其他語言的明確 route artifact | 走相同兩階段；Renderer 無語言詞表 | Critical |
| TC3 | 單一可見結果 | 路由與建立各完成一個內部 turn | 檢查 ChatSnapshot | 無內部 route message／JSON；只有最終結果與 batch | Critical |
| TC4 | 一般問答 | AI 回傳普通回答且無 route artifact | 完成 turn | 顯示回答；candidate／creation 呼叫皆為 0 | Critical |
| TC5 | 模糊或否定內容 | AI 回傳普通回答 | 完成 turn | 無建立 workflow state 或 batch | Critical |
| TC6 | target 澄清 | route artifact targets 為空 | 完成 turn並直接回答 target | 顯示一個問題；下一輪沿用 workflow 並查新 target | Critical |
| TC7 | 最大 targets 邊界 | route artifact 含 50／51 targets | 解析 | 50 合法；51 拒絕且無第二階段 | Critical |
| TC8 | 自動候選查詢 | route targets 已知 | 第一階段完成 | exact-title query 後自動注入固定 creation skill | Critical |
| TC9 | Scope 越界 | 只信任 `in advance` | creation result 回傳另一標題或未知 match id | artifact error；無可提交 batch | Critical |
| TC10 | 按鈕 fast path | Renderer 提供 typed targets | 點「新增卡片」 | 無 routing turn；直接 creation turn | Critical |
| TC11 | Invitation fast path | invitation targets 非空 | 點「加入生詞庫」 | 無 routing turn；直接 creation turn | Critical |
| TC12 | 候選查詢失敗重試 | targets 已持久化 | query reject 後重試 | 沿用 targets；不重跑 route | High |
| TC13 | creation turn 失敗重試 | candidates 已取得或可重查 | turn／artifact 失敗後重試 | 無聊天確認；成功後產生 batch | High |
| TC14 | 重啟恢復 | 持久狀態停在 preparing／failed | 重新載入對話 | 正規化為可重試；targets 保留 | High |
| TC15 | 放棄批次 | pending batch | 確認放棄 | status abandoned；mutation／submit 拒絕；library 不變 | Critical |
| TC16 | 關閉批次 | pending batch | close／Escape／backdrop | status 仍 pending；可重新開啟 | High |
| TC17 | Terminal state | submitted 或 abandoned batch | 再提交／放棄／mutation | Controller 拒絕，不改變正式資料 | Critical |
| TC18 | 講解語言回歸 | 任意語言 request、固定或 source 設定 | creation turn | prompt 與草稿仍使用既有語言契約 | Critical |
| TC19 | Conversation persistence | 路由、failed、pending、abandoned 狀態 | save／reload | typed state 完整且 internal output 不變成可見訊息 | Critical |

## 6. Implementation Notes

### 6.1 Structured AI routing

- 移除 `App.tsx` 的 `isExplicitLearningItemCreationRequest()` 及其自然語言正則路由。
  Renderer 的一般送出只傳原始文字與既有有限 context。
- 在一般 AI 對話 developer instructions 中加入語言無關的建立意圖契約。AI 只有在
  判定為明確建立請求時回傳一個固定、可驗證的 routing artifact；普通回答不輸出該
  artifact。
- 建議新增獨立 `learning-item-intent` artifact，而不是把第一階段路由與
  `create-learning-items` 的 `learning-item-request` 澄清 artifact 混為同一概念。
  artifact 至少包含建立 decision 與最多 50 個 title／senseHint targets；target 不明時
  targets 為空並搭配一個可見的聚焦問題。
- 第一階段不得輸出 `learning-item-result`。Controller 現有 turn scope 驗證仍必須
  阻止任何未經候選查詢的 batch。

### 6.2 Controller orchestration

- `ChatController` 新增持久化的 creation preparation state，至少能表達
  routing／preparing／failed／completed、targets 及錯誤階段；狀態應附著於原始 user
  request 或等價的產品 workflow entity，不依人類可讀 assistant 文字反向解析。
- route artifact 含非空 targets 時，Controller 在原 turn 完成後自動查詢候選並啟動
  固定 marker＋typed skill item 的 creation turn。這是內部 continuation，不新增可見
  fake user message。
- 內部 routing agent message 不加入可見 `ChatSnapshot.messages`，或以明確 internal
  visibility 過濾；持久化資料只保存續接所需的 typed state。
- 自動第二階段必須沿用 active-turn／conversation-management 鎖，直到整個使用者操作
  成功、失敗或等待澄清，避免中途切換模型、對話或啟動並行 turn。
- 重試 API 只接受受信任 conversation／request id，不能由 Renderer 指定 skill path、
  Codex method、候選或任意 targets。

### 6.3 Batch lifecycle

- `LearningItemDraftBatch.status` 擴充 `abandoned`，並可保存 `abandonedAt`。
- 新增 typed `abandonLearningItemBatch(batchId)` IPC／preload／Controller capability；
  Main 驗證 pending 狀態後才允許轉換。
- `LearningItemDraftDialog` 對 pending batch 提供需要明確確認的「放棄這批草稿」；
  abandoned 顯示唯讀摘要，不顯示 submit、exclude、restore 或 match restore 操作。
- 既有 submitted 不可重送；abandoned 同樣不可重送或恢復為 pending。

### 6.4 Persistence and UI

- 對話 store schema 需驗證並保存 creation preparation 與 abandoned batch；若資料版號
  升級，既有 version 1／2 對話必須無損遷移。
- interrupted routing／preparing 在 reload 時正規化為 failed／retriable，不自動啟動
  AI 或寫入資料。
- UI 在自動兩階段期間保持單一 busy 狀態「正在準備卡片…」；failed 顯示階段無關、
  可理解的訊息與「重試準備卡片」。
- 第一階段的 raw artifact 永不渲染；普通 AI 回覆維持現有 streaming 顯示。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/shared/learning-contracts.ts`
- `.agents/skills/create-learning-items/SKILL.md`

### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-conversation-store.test.ts`
- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documents

- `CONTEXT.md`
- `documents/implements/F34-route-multilingual-learning-item-intent-with-ai.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/skill-management.md`

## 8. Assumptions, Open Questions, and Non-goals

### Assumptions

- Codex AI 執行層可依語義判斷建立意圖與 targets；產品測試以受控 fake responses
  驗證 artifact、orchestration 及安全邊界，不宣稱能窮舉自然語言模型的所有表達。
- 第一階段與第二階段使用目前 AI 對話選定的模型及既有隔離設定。
- 「直接產生草稿」代表不要求聊天式確認；最終提交草稿清單仍由使用者控制。
- AI 誤判造成的 pending batch 不會修改正式資料，使用者可明確放棄。

### Open Questions

- 無。

### Non-goals

- 不新增或列舉「支援的建立命令語言」。
- 不新增講解語言選項或自動依請求語言切換講解語言。
- 不讓 AI 直接查詢完整生詞庫、執行 SQL、呼叫任意 App 工具或寫入正式資料。
- 不移除 exact-title candidate lookup、semantic duplicate decision、submission recheck
  或 atomic create。
- 不改變 sentence 卡片、來源追溯、草稿內容欄位、CEFR 或 Markdown 契約。
- 不讓詢問、假設、引用或否定內容自動產生草稿。
- 不移除「新增卡片」快捷操作或區段解析 invitation。

## 9. Architectural Decision Note

這項功能選擇「AI 語意路由＋App 受信任兩階段 orchestration」，而不是 Renderer
關鍵字、每種語言的詞表，或讓 AI 直接存取生詞庫。此決策同時影響 AI 對話 turn
生命週期、artifact 信任邊界、對話持久化與失敗恢復，具有長期架構影響；實作前建議
補一份 ADR，記錄以下取捨：

- 多語言語意覆蓋優先於 deterministic 關鍵字判斷；
- positive creation request 多一個內部 AI stage，換取 exact-title scope 與無聊天確認；
- AI 只決定 intent／targets，App 保留候選、驗證、提交與資料寫入權限；
- 誤判以可放棄 pending batch 復原，不以自動寫入承擔風險。

## 10. Implementation Record

### Status

Implemented on 2026-07-25.

### Final behavior

- Renderer 已移除固定英文／繁體中文建立命令正則。一般訊息只傳原始文字、有限閱讀
  context 與目前講解語言；是否建立卡片及 targets 由 AI 語義路由判斷。
- `learning-item-intent` 只接受精確的 `createLearningItems` decision 與最多 50 個
  targets。非空 targets 會啟動 Controller 內部 continuation：exact-title 候選查詢後，
  自動呼叫固定 `create-learning-items` skill。
- 第一階段 assistant message 與 raw artifact 不進入可見訊息；成功時只保留原始 user
  request 與一次最終 creation 回覆。目標不明確時才顯示聚焦問題。
- 候選查詢或第二階段失敗時，原 user message 保存 targets、講解語言及 failed 狀態；
  typed retry API 直接從保存 targets 重試，不重新路由。重啟時 interrupted preparing
  正規化為 failed。
- batch lifecycle 已加入 `abandoned`／`abandonedAt`。pending modal 需二次確認才能
  放棄；abandoned 為唯讀 terminal state，關閉 modal 仍保持 pending。
- 快捷按鈕、非空 invitation 與既有澄清 continuation 保持 direct typed fast path。
- 核准後唯一細化：普通訊息也攜帶目前 `explanationLanguage`，讓 AI 路由後的內部
  creation turn 能沿用既有語言設定；沒有增加新的語言選項。

### Changed modules

- AI 對話與 orchestration：`chat-controller.ts`、`chat-conversation-store.ts`、
  `learning-item-artifacts.ts`、shared contracts、IPC 與 preload。
- Renderer：`App.tsx` 與 `LearningItemDraftDialog.tsx`。
- 文件：`CONTEXT.md`、AI 對話／學習項目建立／skill 管理模組文件，以及
  `docs/adr/0001-use-ai-routing-with-app-controlled-learning-item-creation.md`。
- `create-learning-items/SKILL.md` 的既有候選、草稿及 submission 契約不需修改；新的
  intent routing 契約由一般 thread developer instructions 擁有。

### Acceptance and test mapping

- TC1–TC3、TC8：`chat-controller.test.ts` 以「增加這張卡片」驗證多語 route、
  `in advance` exact-title query、自動 internal creation 及單一可見結果。
- TC2、TC4–TC6：developer-instruction 契約與普通 turn／continuation 測試驗證 AI
  owns multilingual semantics、無 artifact 不啟動 creation，以及空 targets 的聚焦澄清。
- TC7：`learning-item-artifacts.test.ts` 驗證 intent 50 個 targets 合法、51 個拒絕。
- TC9：既有 Controller turn-scope 測試驗證未知標題、候選及 match id 不產生 batch。
- TC10–TC11：`App.test.tsx` 與 Controller skill routing 測試保護 button／invitation
  direct fast paths。
- TC12–TC14、TC19：Controller retry 與 conversation-store 測試驗證 query failure
  沿用 targets、不中途重路由，以及 preparing reload 正規化為可重試 failed。
- TC15、TC17：Controller、IPC 與 dialog 測試驗證 explicit abandon、terminal mutation
  拒絕及不呼叫 learning-library write。
- TC16：既有 modal close 行為與新增 abandon 二次確認測試共同驗證 close 保持 pending。
- TC18：App 普通送出與 Controller 內部 continuation 測試驗證目前講解語言傳遞。

### Verification

- Targeted Desktop Vitest：6 files、130 tests passed。
- Full test suite：Server 3 tests、Desktop 248 tests passed。
- Full TypeScript typecheck：passed。
- Full production build：passed。
- Electron Playwright：2 tests passed。
- `create-learning-items` skill validator：passed。
- `git diff --check`：passed。

### Limits and architecture

- 自然語言辨識品質取決於目前選定的 AI 模型；測試驗證 deterministic artifact、
  orchestration 與信任邊界，不宣稱窮舉人類語言表達。
- positive natural-language request 會多使用一個內部 AI turn；普通問答與 typed fast
  paths 不增加 turn。
- 已建立 ADR 0001，記錄 AI semantic routing 與 App-controlled candidate／write
  boundary 的取捨。
- 實作進一步凸顯 `ChatController` 同時承擔 transport projection、workflow
  orchestration、artifact scope 與 persistence coordination；若未來再增加多階段 AI
  workflow，建議另立 RXX 抽出可持久化的 workflow orchestrator。
