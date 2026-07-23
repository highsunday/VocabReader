---
author: Codex
date: 2026-07-23
title: 透過 AI 對話建立、去重並整批提交學習項目草稿
uuid: b7470492810e4db38dfa1820ed353df5
version: 1.2.0
status: implemented
---

# Feature Specification - AI 輔助建立學習項目

## 1. Feature Overview

在閱讀頁與生詞庫頁的 **AI 對話面板**加入「新增學習卡片」預設操作，並新增 App
內建 `create-learning-items` skill。使用者可以提供一個或多個單字／片語，讓本機程式
先從生詞庫查出同標題候選項目，再由 AI 只針對候選內容判斷語義是否重複、補齊結構化
資料及 Markdown 學習內容，產生可唯讀預覽、排除及恢復的
**學習項目草稿清單（Learning Item Draft List）**。

每次執行建立獨立草稿批次。AI 回覆下方顯示該批次的狀態元件；使用者點擊後，在畫面
中央開啟可捲動的草稿浮層。只有使用者明確提交時，仍包含在批次中的非重複草稿才會
在同一個資料庫交易內新增為正式**學習項目（Learning Item）**。未提交批次、排除狀態
及提交結果都隨 AI 對話保存在本機，切換對話或重新啟動後仍可恢復。

既有 `explain-reader-annotations` skill 也要在完成**區段解析（Segment Analysis）**後，
詢問使用者是否要把本次解析中的全部單字與片語加入生詞庫，並提供明確的「加入生詞庫」
操作。完整句子不建立卡片，也不拆成句中所有單字。

## 2. Requirements (User Story)

- **As a** 在閱讀中累積生詞與片語的讀者
- **I want** 從 AI 對話或標記解析結果建立一批可確認的學習卡片
- **So that** 我能避免重複內容、檢視 AI 草稿，並在明確確認後一次加入生詞庫

## 3. Confirmed Product Rules

### 3.1 Entry points and skill activation

- App 內建 skill 名稱為 `create-learning-items`，使用者可見操作名稱為「新增學習卡片」。
- 閱讀頁及生詞庫頁都提供「新增學習卡片」預設操作；一般自由問答不得自行啟用此
  workflow。
- 一次操作可接收一個或多個單字／片語；同一操作只建立一份獨立草稿清單。
- 如果使用者輸入、既有對話與目前閱讀區段都沒有可辨識的單字或片語，skill 只詢問
  「要加入什麼內容」，不得建立空白草稿或自行猜測。
- 多義詞優先依使用者提供的意思或例句判斷；其次可暫時使用目前閱讀區段。仍無法確定
  時必須追問。只有使用者明確要求多個語義時，才為同標題建立多張草稿。
- 從閱讀頁執行時可以暫時使用目前閱讀區段協助判斷語義，但不得把書籍、章節、標記或
  原句保存到學習項目。

### 3.2 Integration with annotation explanation

- `explain-reader-annotations` 完成解析後，以目前講解語言詢問是否要將內容加入生詞庫。
- AI 回覆同時提供明確的「加入生詞庫」操作；不得只依賴自由文字「是」作為唯一入口。
- 使用者接受時，預設取用該次解析中的全部單字與片語，放入同一建立批次。
- 完整句子標記不建立學習項目，也不自動拆解成其中所有單字。
- 如果該次解析沒有單字或片語，接受操作後由 `create-learning-items` 詢問使用者想加入
  的內容。
- 邀請本身不查詢資料庫、不建立草稿，也不寫入生詞庫。

### 3.3 Deterministic candidate lookup and AI boundary

- App 程式接收一個或多個標題後，先以「去除首尾空白、不分英文字母大小寫、完整標題
  相等」查詢候選項目；部分字串搜尋不參與去重。
- 候選查詢同時涵蓋使用中項目與垃圾桶項目。
- 只有候選項目的必要欄位可以交給 AI：不可變 id、標題、語義、狀態及判斷語義所需的
  學習內容。不得把整個生詞庫、資料庫路徑、SQL 或任意查詢能力交給 AI。
- AI 負責比較本次目標語義與候選語義；即使解釋、搭配或例句文字不同，只要同標題且
  同語義就視為已存在。
- 同標題但不同語義可以各自建立，例如 `bank` 的「金融機構」與「河岸」。
- 使用中重複項目不進入草稿清單，對話元件要顯示「已存在」及對應標題／語義。
- 垃圾桶中的重複項目不建立第二筆；對話元件顯示「已在垃圾桶」並提供明確的還原操作。
- 所有 App、IPC、Main 及持久化邊界都必須驗證 AI 產生的結構化結果；不合法 enum、
  缺少必要欄位或無法解析的輸出不得寫入資料庫。

### 3.4 Draft content and lifecycle

每筆學習項目草稿包含：

- 草稿識別碼及所屬批次識別碼。
- 標題。
- 類型：`word | phrase`。
- CEFR：`A1 | A2 | B1 | B2 | C1 | C2`。
- 語義識別。
- Markdown 內容：詞性、發音、簡明解釋、常用搭配，以及三至五句英文例句與目前
  講解語言的翻譯。
- 狀態：包含於提交或已排除。

每份草稿清單：

- 屬於產生它的單一 AI 對話回合，不與其他執行批次混合。
- 在 AI 回覆下方顯示「N 張學習卡片待確認」等可辨識元件。
- 未提交內容及排除狀態隨 AI 對話持久保存。
- 切換 AI 對話、離開目前工作區或重新啟動 App 後仍可重新開啟。
- 成功提交後保留「已新增 N 張、已存在 M 張」的完成狀態，並禁止重複提交。
- AI 回覆失敗、停止或結構化草稿驗證失敗時不得建立可提交批次。

### 3.5 Centered draft review

- 點擊 AI 回覆中的批次元件後，在整個工作區中央開啟具有 modal 語意的浮層。
- 浮層包含固定標題與批次摘要，只有卡片清單區垂直捲動；大量草稿不得把提交控制推離
  可視範圍。
- 每張草稿顯示標題、類型、CEFR、語義及安全渲染的 Markdown。
- 確認浮層只顯示標題、類型、CEFR、提交狀態及安全渲染的 Markdown 預覽，不提供
  標題、類型、CEFR、語義或原始 Markdown 的編輯控制。
- 使用者可把草稿標示為「已排除」；已排除草稿不參與提交，但保留在清單中並可恢復。
- 「排除草稿」不是把既有學習項目移到垃圾桶，也不建立任何持久學習項目。
- 沒有任何仍包含的草稿時，提交操作必須停用。
- 浮層支援明確關閉、Escape、焦點管理及可辨識的錯誤／處理中狀態；關閉不等同於
  排除或放棄批次。

### 3.6 Recheck and transactional submission

- 按下提交後，App 程式以目前草稿標題重新查詢候選項目，再讓 AI 只比較這些候選
  的語義，避免草稿建立後其他批次先提交造成重複。
- 新發現的使用中重複項目標示為「已存在」並略過；新發現的垃圾桶重複項目標示為
  「已在垃圾桶」並提供還原，不建立第二筆。
- 其餘仍包含且非重複的草稿，在 Main process 驗證後以單一 SQLite 交易新增。
- 任一資料庫寫入失敗時，該次預定新增的全部項目回滾，不得只留下部分新增結果。
- 成功後立即更新生詞庫使用中數量及目前可見清單。
- 提交完成元件顯示新增、已存在及在垃圾桶中的數量；成功新增的批次不可再次提交。
- 重複提交、竄改批次 id、跨對話提交、提交空批次或提交不合法草稿都必須在 Main
  邊界被拒絕。

### 3.7 Restore from trash

- 「已在垃圾桶」項目只有使用者明確點擊還原後才執行 `trashed → active`。
- 還原沿用原項目的 id、內容及時間資料，不建立新項目。
- 還原成功後更新對話元件、生詞庫數量及清單；失敗時保留原狀並顯示錯誤。

## 4. Acceptance Criteria

- **Scenario 1：從右側面板建立多筆草稿**
  - **Given** 使用者位於閱讀頁或生詞庫頁，Codex 已連線
  - **When** 使用者明確執行「新增學習卡片」並提供一個或多個單字／片語
  - **Then** App 程式先批次查詢同標題候選，再只把候選必要內容交給
    `create-learning-items`
  - **And** 每個非重複語義產生一筆合法草稿，同一次操作只形成一份批次

- **Scenario 2：缺少內容或語義不明**
  - **Given** 使用者執行「新增學習卡片」
  - **When** 上下文沒有可辨識內容，或多義詞無法確認目標語義
  - **Then** AI 在同一對話追問必要資訊
  - **And** 追問完成前不查寫學習項目，也不建立空白草稿批次

- **Scenario 3：使用中重複與不同語義**
  - **Given** 生詞庫已有一筆 `bank = financial institution`
  - **When** 使用者分別要求相同語義及 `bank = side of a river`
  - **Then** 相同語義顯示已存在且不建立草稿
  - **And** 不同語義建立新的學習項目草稿

- **Scenario 4：垃圾桶重複**
  - **Given** 同標題且同語義的學習項目位於垃圾桶
  - **When** 使用者要求建立相同項目
  - **Then** 系統不建立第二筆，顯示「已在垃圾桶」及還原操作
  - **And** 只有使用者明確還原後才使原項目回到使用中狀態

- **Scenario 5：從標記解析加入全部單字與片語**
  - **Given** 最新區段解析包含單字、片語及完整句子
  - **When** AI 完成解析並顯示問句，使用者點擊「加入生詞庫」
  - **Then** 同一批次取用該次解析中的全部單字與片語
  - **And** 完整句子不建立草稿、不拆解為句中所有單字，也不自動寫入生詞庫

- **Scenario 6：標記解析沒有可建立內容**
  - **Given** 最新區段解析沒有單字或片語
  - **When** 使用者仍點擊「加入生詞庫」
  - **Then** `create-learning-items` 詢問使用者要加入什麼內容
  - **And** 使用者回答前沒有草稿批次

- **Scenario 7：預覽、排除與恢復草稿**
  - **Given** AI 回覆下方顯示待確認批次元件
  - **When** 使用者打開中央浮層，檢視預覽並排除後再恢復其中一筆
  - **Then** 浮層安全顯示草稿內容及每筆目前狀態，且不提供內容編輯控制
  - **And** 只有仍包含的草稿會參與提交

- **Scenario 8：草稿批次持久恢復**
  - **Given** 對話中有尚未提交且包含排除狀態的草稿批次
  - **When** 使用者切換對話或重新啟動 App 後返回
  - **Then** 原 AI 回覆仍顯示批次元件
  - **And** 開啟後內容與狀態和離開前一致

- **Scenario 9：提交前重查並略過新重複**
  - **Given** 草稿建立後，生詞庫已出現同標題且同語義項目
  - **When** 使用者提交批次
  - **Then** App 重新查詢候選並由 AI 判斷該草稿已存在
  - **And** 略過該草稿，將其餘非重複草稿整批新增

- **Scenario 10：交易失敗完整回滾**
  - **Given** 一批包含多筆合法且非重複的草稿
  - **When** SQLite 在寫入其中一筆時失敗
  - **Then** 本次預定新增的全部項目都不會留在生詞庫
  - **And** 批次保持可重試，畫面顯示可理解錯誤

- **Scenario 11：提交完成且不可重複**
  - **Given** 草稿批次成功提交
  - **When** 使用者重新開啟對話、浮層或嘗試再次提交
  - **Then** 元件持續顯示新增／重複結果
  - **And** Main process 拒絕再次提交，不產生第二組學習項目

- **Scenario 12：安全與有限資料**
  - **Given** Renderer 或 AI 回傳無效型別、缺少欄位、竄改批次或任意查詢內容
  - **When** 跨越 IPC、Main 或持久化邊界
  - **Then** 輸入被拒絕且不寫入生詞庫
  - **And** AI 永遠不取得整個生詞庫、SQLite 路徑、SQL 或任意資料庫操作能力

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Install third bundled skill | Clean and previously installed runtime | App starts with `create-learning-items` | Skill is installed, unchanged or atomically updated at the fixed path | Critical |
| TC2 | Intent allowlist and routing | General, explanation, quiz and creation turns | Send each typed intent | Only the requested fixed skill item and marker are attached; ordinary chat gets none | Critical |
| TC3 | Exact normalized candidate query | Titles differing by case, whitespace, substring and status | Query several requested titles | Only exact normalized active/trash candidates return, grouped by requested title | Critical |
| TC4 | Minimal AI candidate payload | Database contains many unrelated items | Create cards for two titles | Only those titles' candidate id/title/sense/status/content reach the AI turn | Critical |
| TC5 | Missing or ambiguous target | No usable term or ambiguous sense | Invoke creation | AI asks a focused question and no batch is created | High |
| TC6 | Semantic duplicate | Same title/sense with different wording exists | Generate drafts | Existing item is reported; no duplicate draft is stored | Critical |
| TC7 | Distinct sense | Same title with a different sense exists | Generate drafts | A separate valid draft is stored | Critical |
| TC8 | Trash duplicate and restore | Matching item is trashed | Generate then click Restore | No new draft; original id becomes active only after explicit action | Critical |
| TC9 | Explanation invitation | Explanation has word, phrase and sentence annotations | Complete explanation and accept invitation | Question/action appear; all words and phrases enter one batch; sentence is excluded | Critical |
| TC10 | Empty explanation candidates | Explanation has no word/phrase candidate | Accept invitation | Creation skill asks what to add; no empty batch exists | High |
| TC11 | Draft result validation | AI emits valid and malformed structured results | Complete a turn | Only valid drafts attach to the message; malformed result shows error and cannot submit | Critical |
| TC12 | Center modal and scrolling | Batch has more cards than viewport | Open and scroll | Header/actions remain reachable; card region scrolls; modal/Escape/focus behavior is correct | High |
| TC13 | Preview, exclude and restore | Batch has multiple drafts | Preview cards, exclude one, then restore it | No content editing control is present; latest states persist and control submission | Critical |
| TC14 | Persist batch with conversation | Pending and completed batches exist | Switch conversations and restart | Each batch remains attached to its original message with correct state | Critical |
| TC15 | Recheck after concurrent submit | Another batch wins after this draft is created | Submit | Candidates are re-queried; new duplicates are skipped and reported | Critical |
| TC16 | Atomic batch create | Several unique included drafts | One insert fails | Entire planned insert set rolls back and remains retryable | Critical |
| TC17 | Successful commit and refresh | Unique, duplicate and trashed matches coexist | Submit | Unique items insert once; counts/list and result summary update; resubmit is rejected | Critical |
| TC18 | Trust boundary | Malformed/forged IPC and untrusted EPUB text | Attempt query, mutation or skill injection | Request is rejected; no arbitrary DB access, skill path or instructions are accepted | Critical |
| TC19 | Existing behavior regression | Existing chat, explanation, quiz and library suites | Run full tests | All prior behavior remains valid outside the new explicit workflow | Critical |
| TC20 | Production Electron flow | Built desktop App with local database | Explain annotations, create/preview/exclude/submit cards, restart | Runtime skill, persisted component, modal and resulting library items work end to end | High |

## 6. Anticipated Impact

### New files

- `.agents/skills/create-learning-items/SKILL.md`
- `.agents/skills/create-learning-items/agents/openai.yaml`
- Focused skill contract and learning-item creation workflow tests
- A focused Renderer component for the draft batch summary and centered review modal
- `documents/modules/learning-item-creation.md`

### Existing files likely to change

- `.agents/skills/explain-reader-annotations/SKILL.md`
- `.agents/skills/explain-reader-annotations/agents/openai.yaml`
- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- Main, IPC, store, Renderer and Electron E2E test files covering these modules
- `documents/modules/skill-management.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/learning-library.md`
- `CONTEXT.md`

### Required boundaries

- `LocalLearningLibrary` owns exact candidate query, validation, trash restoration and atomic creation.
- The App-owned orchestration layer decides when to query and which validated candidate subset reaches AI.
- `create-learning-items` owns semantic comparison, clarification and draft-content generation, not SQLite
  access or final mutation.
- The AI conversation store owns the message-to-batch relationship and persistent batch state; old
  version-1 conversation records must remain readable through an explicit backward-compatible migration.
- Renderer receives only typed batch/query/mutation capabilities, never SQL, filesystem paths, arbitrary
  skill names, skill instructions or generic Codex methods.

## 7. Assumptions and Non-goals

- UI 可以使用「學習卡片」描述視覺呈現；資料與規格仍使用「學習項目」。
- 只支援 `word | phrase`，不新增 `sentence`、句型、文法概念或任意卡片類型。
- 不保存來源書籍、章節、標記、閱讀區段或原句。
- 不從完整句子標記自動抽取所有可能單字。
- 不自動提交，也不在使用者只接受標記解析邀請時直接寫入生詞庫。
- 不讓 AI 掃描、搜尋或取得完整生詞庫；不開啟網路、一般工具、任意檔案或第三方 skill。
- 不實作間隔排程、到期項目、複習回合、自評、翻卡、匯入、匯出、同步或跨裝置資料。
- 不把草稿的「已排除」狀態映射到正式生詞庫垃圾桶。
- 草稿批次隨所屬 AI 對話保存；移除整段 AI 對話時，其尚未提交草稿也一併移除，不影響
  已經提交的正式學習項目。
- 本功能不要求把現有十筆 mock data 移除或轉換。

## 8. Implementation Record

### Status

Implemented on 2026-07-23.

### Implementation Summary

- 新增並內建 `create-learning-items` skill；建立與提交重查都只接收程式以完整標題
  篩出的候選，不讓 AI 掃描生詞庫。
- 新增 `learning-item-result`、`learning-item-invitation` 與
  `learning-item-recheck` 的嚴格結構驗證。首次結果還會驗證 draft title 與 match id
  必須落在該 turn 的受信任目標／候選範圍。
- `LocalLearningLibrary` 新增 exact normalized candidate query 與單一交易批次新增。
- 對話 store 升級為 version 2，向後讀取 version 1，保存 invitation、建立請求、
  草稿內容／排除狀態、垃圾桶 match 及提交結果。
- 閱讀頁與生詞庫頁加入「新增學習卡片」；解釋標記完成後顯示「加入生詞庫」。
  空目標與歧義澄清可跨重新啟動延續，下一個直接回答仍會先查候選。
- AI 訊息下方顯示批次按鈕；中央可捲動 modal 支援安全 Markdown 唯讀預覽、
  排除／恢復、垃圾桶還原及明確提交。
- 提交前重新查候選，並用一次獨立、read-only、無工具／網路的 Codex turn 做整批語義
  分類；其餘 included 草稿才在同一 SQLite 交易新增。提交完成後不可再次提交。

### Test Coverage

- Desktop Vitest：159/159 passed。
- Server Vitest：3/3 passed。
- 全專案 TypeScript typecheck：passed。
- Server、Electron Main／Preload 及 Renderer production build：passed。
- `skill-creator` validator：`create-learning-items` 與更新後
  `explain-reader-annotations` 均 valid。
- Electron Playwright 已更新第三份 runtime skill 與 13 項 chat bridge 驗證；本次執行
  受工作環境阻擋 Electron process launch，未進入測試斷言。

### Acceptance Criteria Verification

| Scenario | Status | Basis |
|---|---|---|
| 1 多筆草稿 | Pass | App、Controller routing 與 artifact 測試 |
| 2 缺少／歧義 | Pass | skill 契約及跨重啟 clarification 測試 |
| 3 使用中重複／不同語義 | Pass | exact query、AI result 與 recheck 測試 |
| 4 垃圾桶重複 | Pass | Controller restore 與 dialog 測試 |
| 5 標記加入 words／phrases | Pass | explanation skill 契約及 invitation UI 測試 |
| 6 空 invitation | Pass | App 直接進入 creation clarification 測試 |
| 7 預覽／排除／恢復 | Pass | Controller 與 dialog 測試；F22 移除確認浮層的內容編輯入口 |
| 8 批次持久化 | Pass | store version 1→2、Controller restart 測試 |
| 9 提交前重查 | Pass | batch classifier 與 Controller semantic decision 測試 |
| 10 交易回滾 | Pass | repository transaction failure 測試 |
| 11 完成且不可重複 | Pass | Controller resubmit rejection 與 completed UI |
| 12 安全與有限資料 | Pass | IPC、turn scope、classifier candidate validation 測試 |

### Architectural Observations

- `App.tsx` 仍同時協調閱讀、對話、設定與學習卡片入口；若後續再增加對話 artifact，
  應抽出 message attachment renderer 與 creation workflow hook。
- 三份 bundled skills 目前仍以 installer／option 明確列舉；再新增 skill 時可評估
  typed registry，集中名稱、marker、path 與 turn routing。
- 提交語義 recheck 刻意使用獨立 Codex process／thread，確保不把內部檢查訊息混入
  使用者對話；代價是提交含候選時會多一次 AI round trip。

### Changed Areas

- `.agents/skills/create-learning-items/`
- `.agents/skills/explain-reader-annotations/`
- `apps/desktop/src/main/` 的 skill 安裝、Controller、store、IPC、repository、
  artifacts 與 duplicate classifier
- `apps/desktop/src/preload/` 與 `apps/desktop/src/shared/` typed contracts
- `apps/desktop/src/renderer/` 的 App、草稿 dialog、樣式與測試
- `documents/modules/` 與 `CONTEXT.md`

### Deferred Verification

- TC20 的 Electron Playwright runtime execution 需在允許啟動桌面程序的環境重跑；
  本次兩次權限核准都逾時。production build 與所有非 GUI 驗證已通過。

### Changed Files

待實作後補充。

### Commands Executed

待實作後補充。

### Architectural Observations

待實作後補充。

## Appendix: TDD Implementation Checklist

1. 先為 `create-learning-items` skill、固定安裝與 intent routing 建立失敗測試。
2. 為 exact normalized candidate query、垃圾桶候選、原子批次新增與重複提交建立
   repository／IPC 失敗測試。
3. 為結構化 AI 結果驗證、訊息附件及 conversation store migration 建立失敗測試。
4. 為解析後邀請、批次元件、置中浮層、預覽、排除／恢復及狀態恢復建立 Renderer
   失敗測試。
5. 完成最小實作並逐層通過目標測試。
6. 執行 Desktop 完整測試、全專案 typecheck、production build 及 Electron E2E。
7. 同步 F21 implementation record、`learning-item-creation` 新模組文件及受影響的四份
   既有模組文件。
