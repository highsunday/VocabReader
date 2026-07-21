---
author: Codex
date: 2026-07-22
title: 由 AI 產生可去重更新的學習項目並建立生詞庫卡片頁
uuid: 14be58aca7b04c1aa76dd7197eba4017
version: 1.0
status: draft
---

# Planning Document – AI 學習項目與生詞庫卡片

## 1. Background & Motivation

目前使用者已能在**閱讀區段（Reading Segment）**內建立持久**標記（Annotation）**，並透過「講解標記內容」取得 AI 產生的 Markdown 說明；但 AI 的單字／片語分類與複習表只存在於對話文字中，無法成為可查詢、可去重、可更新並能在重新啟動後保留的**學習項目（Learning Item）**。既有「Anki 式間隔複習」頁面也只是靜態占位，尚未連接真正的**生詞庫（Learning Library）**。

這項變更同時涉及 Renderer 協調邊界、本機結構化資料、Electron Main 的窄化 API、Codex App Server 的結構化 AI 輸出、重複候選查詢、更新決策與使用者確認。後續 AI 流程必須依賴前面已建立的資料模型與查詢介面，且目前 `App.tsx` 已被模組文件列為持續擴充前應先拆分的技術債，因此不適合用一份 FXX 一次完成。

本規畫採用以下責任分工：程式負責查詢、驗證、交易與寫入；AI 只負責從標記與有限上下文整理候選內容，以及針對程式提供的既有候選建議「新增、更新、維持不變或另建不同語義項目」。AI 不直接存取資料庫，也不能自行指定任意既有項目進行更新。

## 2. Overall Goal

使用者在閱讀頁點擊「產生學習卡」後，可以先檢視 AI 根據目前閱讀區段內標記提出的新增／更新建議，確認後將單字或片語安全保存為可追溯來源的學習項目，並在重新啟動應用程式後仍能於生詞庫卡片頁查看與管理。

## 3. Scope & Impact

| Affected module / feature | Expected change type | Notes |
|---|---|---|
| Renderer 應用程式協調邊界 | Refactor | 從 `App.tsx` 拆出導覽、閱讀工作區、生詞庫工作區及 AI 提案狀態邊界；維持既有行為 |
| 生詞與複習領域 | New feature | 建立學習項目、來源紀錄、候選查詢、版本與狀態模型；本規畫不實作間隔複習演算法 |
| 本機持久化與 Electron API | New feature | Electron Main 擁有資料庫／repository，Preload 暴露窄化且型別化的 learning API，Renderer 不直接操作資料庫 |
| 生詞庫卡片頁 | New feature | 顯示學習項目、來源、狀態與基本管理操作；取代目前硬編碼的待複習數字 |
| 標記與章節學習 | New feature | 以 annotation id、offset、原句、書籍與章節建立可追溯來源；不修改 EPUB 原文或既有標記 |
| Codex AI 執行層 | New feature | 新增受信任的學習項目產生 preset／bundled skill，使用 `turn/start.outputSchema` 取得結構化候選與合併建議 |
| AI 對話面板 | New feature | 顯示學習項目提案、既有內容差異及使用者確認狀態；內部結構化結果不得當成一般 Markdown 解析 |
| `apps/server` Fastify API | No change in this plan | 第一版沿用桌面 App 本機資料與 Codex 生命週期，不建立第二套 HTTP 後端；未來 Web／同步需求再以相同 application service 補 HTTP adapter |
| 模組文件與 `CONTEXT.md` | New feature / Documentation | 新增生詞庫模組文件，落實本次確認的收錄與去重規則並更新既有模組邊界 |

## 4. Phase Plan

### Overview

| Phase | Name | Suggested doc type | Related doc | Status |
|---|---|---|---|---|
| P1 | 拆分可擴充的桌面工作區邊界 | RXX | R01-desktop-workspace-boundaries | [x] Completed |
| P2 | 建立本機生詞庫與來源卡片基礎 | FXX | F19-local-learning-library | [x] Completed |
| P3 | 產生結構化 AI 學習項目提案 | FXX | F20-structured-ai-learning-proposals | [x] Completed |
| P4 | 確認並安全套用新增／更新提案 | FXX | — | [ ] Not started |

---

### Phase 1 — 拆分可擴充的桌面工作區邊界

**Description**

在不改變產品行為的前提下，將目前集中於 `App.tsx` 的導覽、閱讀工作區、既有複習占位頁與 AI 對話面板協調責任拆成可獨立擴充的邊界。這一階段只處理 Renderer 結構與狀態所有權，不新增學習項目資料、不改變 Codex protocol，也不重做既有視覺設計；其目的在於讓後續生詞庫與 AI 提案不再繼續堆疊於單一元件。

**User acceptance actions**

- [ ] 啟動應用程式並依序開啟書籍總覽、章節閱讀與現有 Anki 複習占位頁，確認導覽、中央內容與左右側欄的外觀及操作與重構前一致。
- [ ] 在章節閱讀頁建立／移除標記、拖曳 START／END、切換章節後重新開啟，確認標記與閱讀區段仍能保存及恢復。
- [ ] 在 AI 對話面板分別執行一般提問、「講解標記內容」與「閱讀測驗」，確認既有對話、串流、停止與 preset 行為維持不變。

**Suggested doc type**: `RXX` (refactor spec)

**Related doc**: `R01-desktop-workspace-boundaries.md`

**Status**: `[x] Completed`

**Completion evidence**: TC1 workspace boundary test, full desktop Vitest suite (129 tests),
desktop typecheck and production build all passed. Q01-02 remains the next pending queue item.

---

### Phase 2 — 建立本機生詞庫與來源卡片基礎

**Description**

建立獨立於 EPUB 書庫索引的本機學習項目 repository、schema migration 與型別化 Electron API，並把現有複習占位頁調整為可讀取真實資料的**生詞庫**卡片頁。資料模型至少區分學習項目本體與一對多來源紀錄；來源保留 book id、chapter id、annotation id、原標記文字、原句／必要上下文及位置。學習項目預留未來複習狀態，但本階段不實作到期計算或複習回合。

為了在 AI 尚未接入前驗證完整保存路徑，閱讀頁提供一個範圍受限的 fallback：使用者可把單一現有標記加入生詞庫成為「待 AI 整理」項目。同一來源重複操作不得建立第二筆資料。Renderer 只能呼叫 list、get、create-draft、update 與 archive 等明確 API；資料庫檔案、SQL 與任意 IPC channel 不可暴露給 Renderer。

**User acceptance actions**

- [ ] 開啟生詞庫頁，確認第一次使用時顯示真實的 0 筆空狀態，而不是目前硬編碼的「今日待複習 10」。
- [ ] 在閱讀頁對一個現有標記選擇「加入生詞庫」，再回到生詞庫，確認出現一張「待 AI 整理」卡片，且能看到正確的書名、章節與來源文字。
- [ ] 對同一標記再次執行加入，確認卡片數量不增加；重新啟動應用程式後，該卡片與來源仍存在。
- [ ] 編輯卡片可編輯欄位並保存，再封存該項目，確認它不再出現在預設的使用中清單，但可從封存篩選中找到。

**Suggested doc type**: `FXX` (feature spec)

**Related doc**: —

**Status**: `[x] Completed`

**Completion evidence**: F19 delivers the userData SQLite migration, narrow Electron
contracts, idempotent annotation fallback, persisted list/detail/edit/archive UI and
retained deleted-book source snapshots. Full project tests, typecheck and production
build passed.

---

### Phase 3 — 產生結構化 AI 學習項目提案

**Description**

在 AI 對話面板新增受信任的 preset「產生學習卡」，只讀取目前 START／END 內的原文與區段內標記。新增 App bundled skill 與固定 intent，利用 Codex App Server 單次 turn 的 `outputSchema` 產生經程式驗證的單字／片語候選，不以自由格式 Markdown、正規表示式或可見對話文字作為寫入資料來源。

流程分為受控的兩段：AI 先從標記整理 canonical form、類型、本文語義、簡明解釋、CEFR 與有用欄位；程式再以「相同來源、正規化詞形、類型及既有 alias」批次查詢可能重複的學習項目；最後只把命中的有限既有候選交給 AI，產生 `create | update | unchanged | create-distinct-sense` 提案。既有候選查詢由程式完成，AI 無資料庫或工具存取權；任何 update 提案只能引用本次程式提供的既有 item id。

本階段只建立並顯示提案，不寫入學習項目。介面需顯示每個候選的建議動作、將新增或變更的欄位、既有卡片摘要、來源與「同詞不同義」判斷，並允許使用者把 AI 的 update 改成維持不變或另建不同語義項目。

**User acceptance actions**

- [ ] 在含多個單字／片語標記的閱讀區段點擊「產生學習卡」，確認畫面顯示逐項提案，且每項皆能追溯到目前區段內的標記；區段外文字不出現在提案中。
- [ ] 對一個生詞庫中不存在的詞執行 preset，確認提案顯示「新增」及將建立的卡片內容，但尚未改變生詞庫筆數。
- [ ] 對一個已由相同標記建立為「待 AI 整理」或已有相同語義的詞執行 preset，確認畫面顯示既有卡片及「更新」或「維持不變」差異，而不是再建一張相同卡片。
- [ ] 對相同詞形但上下文明顯為不同語義的標記執行 preset，確認可得到「另建不同語義項目」建議，且使用者能在套用前改選其他動作。
- [ ] 模擬 AI 回傳缺欄位、未知動作或不存在的 item id，確認畫面顯示提案無法使用且生詞庫沒有任何變更。

**Suggested doc type**: `FXX` (feature spec)

**Related doc**: —

**Status**: `[x] Completed`

**Completion evidence**: F20 provides the isolated two-turn App Server outputSchema workflow, bounded local candidate lookup, validated review-only proposals and no data writes. Focused 5 tests, full project 146 tests, typecheck and production build passed.

---

### Phase 4 — 確認並安全套用新增／更新提案

**Description**

把 Phase 3 的有效提案接上使用者確認與交易式套用。使用者可逐項選擇或一次確認；程式在 Electron Main 重新驗證 proposal batch、允許更新的欄位、既有 item id、資料版本與來源範圍後，於單一交易內新增項目、套用 patch、附加來源或維持不變。AI 不得刪除或封存既有項目；更新不得覆蓋既有來源，新的書籍／章節／原句以來源紀錄追加。

去重採分層保護：相同 annotation 來源是確定匹配；正規化詞形／類型／alias 只用來找候選，不作為唯一鍵，以容許同詞不同義；AI 決定語義關係後仍需使用者確認；套用時以 item version 做併發檢查。已套用或過期的 proposal batch 不得重複執行。成功後回傳新增、更新、維持不變與失敗數量，生詞庫立即反映結果並保留可追溯的 proposal／來源資訊。

**User acceptance actions**

- [ ] 產生同時包含新增、更新與維持不變的提案，取消其中一項後確認其餘項目，確認結果摘要與生詞庫實際變化一致，取消項目沒有被寫入。
- [ ] 開啟更新後的卡片，確認新內容已套用、舊來源仍保留，且本次書籍、章節、標記與原句成為新的來源紀錄。
- [ ] 對同一閱讀區段再次產生並套用提案，確認不會建立重複卡片或重複來源；維持不變項目不會無故改寫 `updatedAt` 或內容版本。
- [ ] 在提案產生後先從另一個畫面編輯目標卡片，再回來套用舊提案，確認系統要求重新檢視而不是覆蓋較新的內容。
- [ ] 重新啟動應用程式並打開生詞庫，確認已新增／更新的卡片、不同語義項目與所有來源仍可查看；既有閱讀、標記、AI 對話與閱讀測驗仍可正常使用。

**Suggested doc type**: `FXX` (feature spec)

**Related doc**: —

**Status**: `[ ] Not started`

---

## 5. Handoff Instructions (AI guidance)

> This section is execution guidance for the handoff AI.

Before starting work, the handoff AI must:

1. Read "Overall Goal" and "Phase Plan" to understand the overall direction.
2. Identify the current phase to execute: prioritize any phase with status `[~] In progress`; if none, select the earliest `[ ] Not started` phase.
3. Change that phase's status to `[~] In progress` and update the overview table.
4. Based on the "Suggested doc type", call `ddd-doc` to draft the corresponding FXX / RXX / BXX document.
5. After the user reviews and approves, run `ddd-tdd` to implement.
6. After implementation is complete:
   - Fill in the "Related doc" field with the actual document number (e.g. `F01-auth-login.md`)
   - Change phase status to `[x] Completed` and update the overview table
7. Identify the next unstarted phase and repeat the above; when all phases are done, change this document's `status` to `completed`.

> If a phase's scope is not clear enough, run `grill-me` to elicit requirements before drafting FXX / RXX / BXX.

## 6. Additional Notes

### Recommended architecture for the first version

- Keep data local, consistent with the current desktop-only and no-sync product boundary.
- Prefer a dedicated SQLite database under Electron `userData` for learning items, sources, aliases, proposal batches and future review history. The existing EPUB `index.json` remains responsible for books, reading state, ranges and annotations.
- Treat Electron Main application services plus narrow IPC as the first-version backend API. Do not add Fastify HTTP routes or a second Codex lifecycle until a Web, account sync or remote client requirement exists.
- Use Codex App Server `turn/start.outputSchema` for machine-readable candidate and merge-decision results. Validate every result at the application boundary before display or persistence.
- Keep card presentation separate from the domain object: the persisted entity is a **學習項目**;「學習卡」只代表它的 UI 呈現與 preset 名稱。

### Identity and update guardrails

- A normalized term is a lookup key, not a database uniqueness rule. Same spelling with a different meaning may become a separate learning item.
- Exact source provenance can prove that an annotation was already handled; semantic equivalence still requires an AI recommendation and user confirmation.
- AI can update only an item id supplied by the program in the current candidate set, and only through an allowlisted patch schema.
- Applying a proposal is transactional, idempotent and version-checked. AI never performs direct writes and never deletes data.
- Adding a new occurrence appends a source record instead of replacing the original book, chapter, annotation or sentence.

### Assumptions requiring confirmation

1. **Collection policy**: recommended first version is review-before-save. The preset generates proposals but never automatically writes all AI output.
2. **Persistence boundary**: recommended first version is local SQLite plus Electron IPC, without cross-device sync or a Fastify HTTP API.
3. **Item types**: first version generated by this preset is limited to `word` and `phrase`; sentence patterns and grammar concepts remain valid future Learning Item types but are outside these four phases.
4. **Same term, different meaning**: multiple active learning items with the same normalized form are allowed when senses differ; the program must not enforce a global unique term key.
5. **Fallback draft action**: Phase 2 includes adding one annotation as a source-linked「待 AI 整理」item so persistence can be used without AI and independently verified.

### Out of scope for this planning document

- SM-2／FSRS or another review scheduling algorithm, due-item calculation and review history updates.
- AI-generated spaced review exercises, answer evaluation and review-session UI.
- Cloud accounts, cross-device sync, collaboration and a remote HTTP API.
- Automatic background collection without an explicit user action.
- Bulk import/export, dictionary-provider integration and pronunciation audio files.

### Technical reference verified during planning

- The Codex App Server documentation states that `turn/start` accepts a per-turn `outputSchema`, which is the planned boundary for structured candidate and merge-decision results: <https://learn.chatgpt.com/docs/app-server#turns>.
