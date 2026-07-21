---
author: Codex
date: 2026-07-22
title: 依 P01 建立 AI 學習項目與生詞庫
uuid: ec8c9d89f8074d309825154d9bb108ef
version: 1.0
status: completed
source_plan: documents/planning/P01-ai-learning-items-and-learning-library.md
batch_limit: 4
mode: sequential
intake_grill_status: completed
ready_for_execution: true
communication_format_version: 1
context_policy: compact
ledger_retention: latest_active_entries
ledger_archive_dir: documents/queue/logs
notify_email_from:
notify_email_to:
notify_on_queue_blocked: true
notify_on_queue_completed: true
---

# Queue - AI 學習項目與生詞庫

## 1. Purpose and execution boundary

本 queue 將 `P01-ai-learning-items-and-learning-library.md` 的四個階段轉成四個依序執行的 DDD 項目。每個項目必須由新的 worker session 完整執行 `ddd-start → ddd-doc → ddd-tdd`，產生獨立 F/R 文件、red／green 測試與 git commit。

集中式 intake grill 已完成，四個項目的需求與停止條件均已確認。Queue 已可進入執行前檢查；但工作樹乾淨以前仍不得啟動 worker。

## 2. Queue Intake Review (centralized grill-me)

intake_grill_status: completed
ready_for_execution: true
reviewed_by: codex
reviewed_at: 2026-07-22 00:41 CST

### Clarification Matrix

| Item | Clarification | Key Decisions | Remaining Questions |
|---|---|---|---|
| Q01-01 | clarified | 純 Renderer 重構、既有行為與視覺不變；完整回歸既有閱讀與 AI 流程 | — |
| Q01-02 | clarified | 本機 SQLite／IPC、生詞庫入口、fallback 草稿、編輯／封存、來源快照 | — |
| Q01-03 | clarified | 獨立背景 AI workflow、word／phrase、空狀態停用、只產生提案 | — |
| Q01-04 | clarified | 保護人工內容、允許不同語義、pending 不跨重啟、逐項／欄位確認 | — |

### Queue Intake Questions

> 可直接回答「全部採建議」，或只列出要改的題號與選項。所有答案會在 queue ready 前寫回本節、各 item 與 ledger。

#### Q01-01 — 桌面工作區重構

**User answer：** Yes；兩項均採建議。

1. 是否同意此項只拆分 `App.tsx` 的導覽、閱讀工作區、生詞庫／複習工作區及 AI 面板協調責任，不改視覺、不新增功能？
   - **建議：同意。** 新功能從 Q01-02 開始，避免重構與產品變更混在同一 commit。
2. 是否接受「書籍總覽、標記與 START／END、AI 一般問答／兩個既有 preset、現有複習占位頁」全部保持可操作，作為本項的人工回歸邊界？
   - **建議：接受。** 任一流程需要產品行為改動時停止，而不是在重構項目中順手改。

#### Q01-02 — 本機生詞庫與來源卡片

**User answer：** OK；五項均採建議，並明確授權本機 SQLite schema／migration 與既定刪書語意。

1. 是否明確授權新增本機資料庫 schema 與 migration，採 Electron 內建 `node:sqlite`，資料放在 `userData`，Renderer 只經由窄化 IPC 存取；第一版不做 Fastify HTTP API、帳號或跨裝置同步？
   - **建議：授權。** 本機 Node 26 與 Electron 43.1.1 可使用 `node:sqlite`，且符合目前桌面 App 邊界。
2. 現有左側「Anki 複習」占位入口要如何處理？
   - **建議：本次改名為「生詞庫」。** 未來實作真正複習回合時，再新增獨立的「開始複習」入口，不把兩個領域混在同一頁。
3. 是否保留「把單一標記加入生詞庫成為待 AI 整理項目」的非 AI fallback，並允許使用者編輯與封存，但不提供永久刪除？
   - **建議：保留 fallback、允許編輯／封存、暫不永久刪除。** 這使資料路徑可獨立驗證，也避免誤刪未來複習歷史。
4. 第一版卡片欄位是否採：顯示詞形、canonical form、類型（word／phrase）、詞性（可空）、本文語義、簡明解釋、CEFR（可空）、發音文字（可空）、搭配／用法筆記（可空）、狀態、建立／更新時間，以及一至多筆來源？
   - **建議：採用。** 不加入音檔、字典供應商資料或複習演算法欄位；只預留最小 review state。
5. 如果來源書籍日後被永久刪除，學習項目應如何處理？
   - **建議：保留學習項目與來源快照。** 來源保存書名、章節名、標記文字與原句；畫面標示原書已刪除，不連帶刪除卡片。

#### Q01-03 — 結構化 AI 學習項目提案

**User answer：** OK；五項均採建議。

1. 「產生學習卡」應沿用目前可見 AI 對話，還是使用獨立的背景 AI workflow？
   - **建議：獨立背景 workflow。** 入口仍位於 AI 面板，但內部抽取／比對 turn 不寫入一般 AI 對話，避免 JSON 與第二階段合併上下文污染日常問答。
2. 第一版哪些標記可產生學習項目？
   - **建議：只接受 AI 判斷為 word 或 phrase 的標記。** 句子型標記在提案中顯示「本版不支援」，不從整句自行挑出未被使用者另行標記的詞。
3. 沒有任何標記或閱讀區段為空時，preset 應如何表現？
   - **建議：按鈕停用並說明需要先建立非空閱讀區段及標記。** 不送 AI turn，也不把整章當 fallback。
4. AI 產生的解釋使用哪種語言？設定日後變更是否重寫舊卡？
   - **建議：使用執行當下的講解語言；既有卡片不自動重翻。** 使用者可日後手動編輯或重新產生更新提案。
5. 是否確認 AI 只產生提案、程式查詢既有資料，任何提案在 Q01-04 確認前都不得改變生詞庫？
   - **建議：確認。** AI 維持無資料庫與工具存取權。

#### Q01-04 — 安全套用新增／更新

**User answer：** OK；五項均採建議，並明確授權交易、版本、audit 與相關 migration。

1. AI 建議更新既有項目時，如何處理使用者手動編輯過的欄位？
   - **建議：預設保留使用者內容。** AI 可補空欄位、追加來源與提出欄位差異；覆寫非空人工內容必須在預覽中被使用者明確勾選。
2. 是否允許相同 canonical form 存在多個不同語義項目？
   - **建議：允許。** 詞形／類型／alias 只用來找候選；相同來源是確定匹配，同詞不同義可選 `create-distinct-sense`。
3. 未套用的提案是否需要跨重啟保存？
   - **建議：不保存 pending 提案。** 離開、取消、來源改變或重新啟動後必須重產；只保存已套用 batch 的摘要與來源／版本稽核資料。
4. 使用者確認的粒度為何？
   - **建議：逐項選擇 create／update／unchanged／create-distinct-sense，可勾選多項一次套用；update 顯示欄位差異並允許取消特定覆寫。** 不提供 AI 自動全量保存。
5. 是否授權此項新增交易、版本欄位、proposal batch 稽核資料與 schema migration，並以版本衝突、未知 item id、重複套用或無效 AI schema 作為必須停止／拒絕寫入的條件？
   - **建議：授權。** 這是避免舊提案覆蓋新資料及維持冪等性的必要保護。

#### Cross-item execution decisions

**User answer：** OK；三項均採建議。所有 item 可在條件滿足時 auto-approve，`batch_limit` 設為 4，通知僅回報目前 Codex 對話。

1. 四個項目是否都可在 F/R 文件清楚、測試可推導且沒有新疑義時 `auto_approve: true`，由 worker 自動建立文件、TDD、更新 queue 並各自提交？
   - **建議：是。** 若遇到新產品取捨、資料遷移風險或無法穩定測試，整個 queue 立即停止。
2. 一次 queue run 的上限要維持預設 3，還是設為 4 以完成整份 P01？
   - **建議：4。** 四項有明確依賴且不超過 skill 上限 5；任一失敗仍會立即停止。
3. 未設定寄件與收件地址時，blocked／completed 通知是否只回報目前 Codex 對話？
   - **建議：是。** 不設定 email，不儲存任何憑證。

### Cross-item Decisions

- 執行順序固定為 Q01-01 → Q01-02 → Q01-03 → Q01-04；每項依賴前項完成、具有 commit 且 unlock condition 可從文件與測試驗證。
- 程式負責資料查詢、驗證、交易與寫入；AI 只處理有限閱讀上下文及程式提供的候選。
- 閱讀區段外內容不得傳給 AI；空區段不得回退為整章。
- 生詞庫與間隔複習是不同機制；本 queue 不實作排程、到期項目、複習回合、AI 複習題或回答評估。
- 四個 item 均為 `auto_approve: true`；只有文件清楚、風險受控且 red／green 測試可推導時才能自動實作與 commit。
- `batch_limit: 4`；未設定 email，blocked／completed 只在目前 Codex 對話回報。
- 工作樹目前非乾淨；這不影響 queue 成為 ready，但在任何 worker 啟動前必須由使用者處理既有變更。

### Execution Readiness

- [x] 所有 intake questions 已由使用者回答並寫回 queue
- [x] 所有四個項目皆為 `clarification_status: clarified`
- [x] 本機資料庫、migration 與資料刪除語意已獲明確授權
- [x] 所有依賴與 unlock condition 已確認
- [x] batch limit、auto-approve 與通知方式已確認
- [x] 執行前 `git status --short` 為空（baseline commit `9885440` 後確認）
- [x] `ready_for_execution` 已改為 `true`

## 3. Overview

| Item | Name | Type | Agent | Depends On | Status | Related doc | Commit |
|---|---|---|---|---|---|---|---|
| Q01-01 | 拆分可擴充的桌面工作區邊界 | RXX | codex | — | completed | documents/implements/R01-desktop-workspace-boundaries.md | 0701a3b |
| Q01-02 | 建立本機生詞庫與來源卡片基礎 | FXX | codex | Q01-01 | in_progress | — | — |
| Q01-03 | 產生結構化 AI 學習項目提案 | FXX | auto | Q01-02 | pending | — | — |
| Q01-04 | 確認並安全套用新增／更新提案 | FXX | auto | Q01-03 | pending | — | — |

## 4. Queue Items

## Q01-01 拆分可擴充的桌面工作區邊界

id: Q01-01
type: RXX
agent: codex
status: completed
blocker_reason: — (resolved by user authorization and baseline commit 9885440)
questions: []
need_user_decision: []
clarification_status: clarified
depends_on: []
unlock_condition: none
auto_approve: true
commit_required: true
implemented_doc: documents/implements/R01-desktop-workspace-boundaries.md
commit: 0701a3b
worker_session: codex 2026-07-22 01:02 CST
worker_log: R01 auto-approved; TC1 RED due to missing modules, then GREEN. Focused 61 tests, full desktop 129 tests, typecheck and production build passed. No IPC, data, CSS, visual or Codex protocol changes.
handoff_summary: Q01-01 completed; four named Renderer workspace boundaries are composed by App. R01 records RED/GREEN evidence. Commit field is pending-orchestrator by circular-hash protocol; do not begin Q01-02 in this worker session.
communication_entries: [L001, L005, L006, L007, L008, L009, L010, L011, L012, L013, L014, L015, L016, L017, L018, L019, L020, L021, L022]
archive_refs: []

### Requirements

在不改變產品行為與視覺的前提下，從 `App.tsx` 拆出可獨立維護的導覽、閱讀工作區、生詞庫／複習工作區與 AI 面板協調邊界。既有資料契約、Electron bridge、Codex protocol 與 CSS 呈現維持相容。

### Clarification results

- Clarification status: clarified
- Design notes: 純結構重構；不改視覺、資料格式、IPC、Codex protocol 或使用者行為。
- Open questions: —
- User decisions: 接受 P01 回歸範圍與停止條件。

### Acceptance criteria

- [ ] 依序操作書籍總覽、章節閱讀與現有複習占位頁，確認導覽、中央內容及左右欄行為一致。
- [ ] 建立／移除標記、拖曳 START／END、切章及重啟後，確認閱讀資料仍能保存與恢復。
- [ ] 執行一般 AI 提問、「講解標記內容」與「閱讀測驗」，確認對話、串流與停止功能維持正常。

### Stop conditions

- 重構需要改變使用者行為、資料格式、IPC 或 Codex protocol 才能完成。
- 既有關鍵流程缺少可建立的回歸測試，或測試無法穩定重現基線。

### Blocker log

- 2026-07-22 00:47 CST：執行前 `git status --short` 顯示 2 個 modified 與 5 個 untracked paths。依 queue guardrail 停止；未啟動 worker、未建立 F/R 文件、未修改 production code、未 commit 或 stash。

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: [L001, L005, L006, L007, L008, L009, L010, L011, L012, L013, L014, L015, L016, L017, L018, L019, L020, L021, L022]
archive_refs: []

### Agent Handoff Summary

- Current state: completed; actual item commit is `0701a3b`
- Documents: `documents/implements/R01-desktop-workspace-boundaries.md`
- Decisions: pure Renderer composition; `App` retains all state, bridge, persistence and protocol ownership
- Tests: TC1 RED then GREEN; focused 61, full desktop 129, typecheck and production build passed
- Risks: no known regressions; do not start Q01-02 from this worker session

## Q01-02 建立本機生詞庫與來源卡片基礎

id: Q01-02
type: FXX
agent: codex
status: in_progress
clarification_status: clarified
depends_on: [Q01-01]
unlock_condition: Q01-01 completed with a commit, and renderer regression tests plus production build pass
auto_approve: true
commit_required: true
implemented_doc: documents/implements/F19-local-learning-library.md
commit: pending-orchestrator
worker_session: codex 2026-07-22 01:07 CST
worker_log: F19 auto-approved; RED confirmed missing repository and hard-coded Anki placeholder. GREEN: focused 75 tests, desktop 138 tests, full project 141 tests, typecheck and production build passed. SQLite migration, typed IPC, fallback, edit/archive and deleted-book snapshots are complete; no Q01-03 work started.
handoff_summary: Q01-02 completed pending commit hash. F19 implements `node:sqlite` under userData with migration 1; sources retain snapshots after book deletion and expose availability. Renderer renamed Anki placeholder to 生詞庫 and supports real zero/list/detail/edit/archive plus annotation fallback. Full project test/typecheck/build green. Q01-03 can start only in a fresh worker after this commit is verified.
communication_entries: [L002, L005, L006, L007, L023, L024, L025, L026, L027, L028, L029, L030]
archive_refs: []

### Requirements

新增本機生詞庫 repository、schema migration、型別化 Main／Preload／Renderer contracts 與卡片頁。學習項目與來源快照分離；支援從一個現有標記建立「待 AI 整理」項目、列出／查看／編輯／封存，以及相同來源冪等。不得實作間隔複習流程。

### Clarification results

- Clarification status: clarified
- Design notes: `node:sqlite` under `userData`; narrow IPC;「生詞庫」入口；edit／archive but no hard delete.
- Open questions: —
- User decisions: 授權 schema／migration；刪書後保留項目與來源快照並標示原書已刪除。

### Acceptance criteria

- [x] 生詞庫第一次開啟顯示真實 0 筆，不再顯示硬編碼的 10。
- [x] 從一個標記加入待整理項目後，卡片顯示正確書名、章節、標記文字與原句；同一標記再加入不增加筆數。
- [x] 編輯與封存能保存；重啟後項目、來源及封存狀態仍存在。
- [x] 刪除來源書籍後，依 intake 決策驗證學習項目與來源呈現。

### Stop conditions

- 本機 SQLite 在 Electron 打包環境不可用，且需要引入原生第三方依賴或改變部署方式。
- 資料欄位、migration、刪書連動或永久刪除語意未獲明確授權。
- Q01-01 未完成、缺少 commit，或 unlock condition 無法驗證。

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: [L002, L005, L006, L007, L023, L024, L025, L026, L027, L028, L029, L030]
archive_refs: []

### Agent Handoff Summary

- Current state: completed; actual item commit is pending orchestrator verification
- Documents: `documents/implements/F19-local-learning-library.md`
- Decisions: local SQLite migration, source snapshots, fallback draft, edit/archive, no hard delete
- Tests: RED then focused 75 / desktop 138 / full project 141, typecheck and build green
- Risks: no known blocker; future AI proposals and scheduling remain Q01-03/Q01-04 scope

## Q01-03 產生結構化 AI 學習項目提案

id: Q01-03
type: FXX
agent: auto
status: pending
clarification_status: clarified
depends_on: [Q01-02]
unlock_condition: Q01-02 completed with a commit, and a persisted source-linked learning item can be created and listed
auto_approve: true
commit_required: true
implemented_doc: —
commit: —
worker_session: —
worker_log: —
handoff_summary: —
communication_entries: [L003, L005, L006, L007]
archive_refs: []

### Requirements

新增受信任的「產生學習卡」preset、bundled skill 與固定 intent。用 Codex App Server `turn/start.outputSchema` 先取得結構化 word／phrase 候選；程式以來源、canonical form、類型及 alias 查詢有限既有候選；AI 再提出 create／update／unchanged／create-distinct-sense 建議。只顯示可驗證提案，本項不得寫入生詞庫。

### Clarification results

- Clarification status: clarified
- Design notes: independent background workflow; only word／phrase; empty range or no annotations disables preset.
- Open questions: —
- User decisions: use current explanation language; old cards do not auto-translate; AI proposes but never writes.

### Acceptance criteria

- [ ] 含多個合格標記的非空閱讀區段可產生逐項提案，且提案均可追溯到區段內標記。
- [ ] 新詞顯示 create；相同來源或同義既有項目顯示 update／unchanged；同詞不同義可顯示 create-distinct-sense。
- [ ] 提案顯示既有內容與欄位差異，但產生後生詞庫筆數與內容不變。
- [ ] 缺欄位、未知 action、未知 item id、區段外來源或無效 schema 被拒絕且不寫資料。

### Stop conditions

- 實際安裝的 Codex App Server 不支援或無法可靠取得 `outputSchema` 結果。
- 必須給 AI 資料庫、檔案或任意工具權限才能完成查重。
- AI thread 邊界、句子型標記或無標記行為未獲確認。
- Q01-02 未完成、缺少 commit，或 unlock condition 無法驗證。

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: [L003, L005, L006, L007]
archive_refs: []

### Agent Handoff Summary

- Current state: pending and clarified
- Decisions: background structured workflow, programmatic lookup, proposal-only phase
- Tests: schema validation, context boundary, action matching and zero persistence
- Risks: installed App Server structured-output compatibility

## Q01-04 確認並安全套用新增／更新提案

id: Q01-04
type: FXX
agent: auto
status: pending
clarification_status: clarified
depends_on: [Q01-03]
unlock_condition: Q01-03 completed with a commit, and valid create/update/unchanged/distinct-sense proposals can be previewed without persistence
auto_approve: true
commit_required: true
implemented_doc: —
commit: —
worker_session: —
worker_log: —
handoff_summary: —
communication_entries: [L004, L005, L006, L007]
archive_refs: []

### Requirements

讓使用者逐項調整並確認有效提案；Electron Main 在單一交易中重新驗證 batch、item id、版本、允許欄位及來源，再新增、更新、附加來源或維持不變。更新不得暗中覆蓋人工內容；AI 不得刪除或封存項目；套用必須冪等、可追溯且能拒絕 stale proposal。

### Clarification results

- Clarification status: clarified
- Design notes: preserve manual fields by default; distinct senses allowed; pending proposals are session-only.
- Open questions: —
- User decisions: per-item action and per-field overwrite confirmation; authorize transaction, version, audit and migration.

### Acceptance criteria

- [ ] 混合提案可逐項取消或改 action，再一次套用選取項目；結果摘要與生詞庫變化一致。
- [ ] 更新後保留舊來源並追加本次來源；未選取欄位與人工內容依 intake 決策保留。
- [ ] 同一區段重跑不建立重複項目或來源，unchanged 不無故改變版本或 `updatedAt`。
- [ ] 目標項目在提案後被編輯時，舊提案因版本衝突被拒絕並要求重新產生。
- [ ] 重啟後已套用項目、不同語義與來源仍可查看，既有閱讀與 AI 流程無回歸。

### Stop conditions

- 更新優先順序、人工欄位保護、同詞不同義或 pending proposal 保存政策未獲確認。
- 交易、版本、audit 或 schema migration 未獲明確授權。
- 無法建立可靠的 red test 驗證重複套用、版本衝突或交易回滾。
- Q01-03 未完成、缺少 commit，或 unlock condition 無法驗證。

### Blocker log

None.

### Worker session communication

questions: []
need_user_decision: []
ledger_entries: [L004, L005, L006, L007]
archive_refs: []

### Agent Handoff Summary

- Current state: pending and clarified
- Decisions: explicit confirmation, manual-content protection, version conflict rejection, idempotent transaction
- Tests: mixed apply, source append, duplicate replay, stale proposal and rollback
- Risks: field-level merge and transaction/audit consistency

## 5. Agent Communication Ledger (Append-only)

### Log Index

| Entry | Time | Item | From -> To | Type | Summary | Archive Ref |
|---|---|---|---|---|---|---|
| L001 | 2026-07-22 00:28 | Q01-01 | orchestrator -> user | intake-question | 確認重構邊界與回歸行為 | — |
| L002 | 2026-07-22 00:28 | Q01-02 | orchestrator -> user | intake-question | 確認 SQLite、卡片欄位、導覽與刪書語意 | — |
| L003 | 2026-07-22 00:28 | Q01-03 | orchestrator -> user | intake-question | 確認 AI workflow、適用標記與語言 | — |
| L004 | 2026-07-22 00:28 | Q01-04 | orchestrator -> user | intake-question | 確認更新、提案期限與套用粒度 | — |
| L005 | 2026-07-22 00:28 | ALL | orchestrator -> user | intake-question | 確認 auto-approve、batch limit 與通知方式 | — |
| L006 | 2026-07-22 00:41 | ALL | user -> orchestrator | answer | 使用者回答 1 yes、2–5 ok，接受全部建議 | — |
| L007 | 2026-07-22 00:41 | ALL | orchestrator -> workers | decision | Intake 完成；四項 clarified，batch 4，auto-approve，conversation-only notifications | — |
| L008 | 2026-07-22 00:47 | Q01-01 | orchestrator -> queue | blocked | Clean-worktree pre-flight failed; worker not started | — |
| L009 | 2026-07-22 00:47 | Q01-01 | orchestrator -> user | notification | Blocked reported in Codex conversation; email not configured | — |
| L010 | 2026-07-22 00:52 | Q01-01 | user -> orchestrator | answer | Authorized handling Git changes and automatic queue start | — |
| L011 | 2026-07-22 00:52 | Q01-01 | orchestrator -> queue | decision | Reviewed and committed seven documentation paths as baseline 9885440 | — |
| L012 | 2026-07-22 00:52 | Q01-01 | orchestrator -> codex | dispatch | Dispatch Q01-01 through ddd-start, ddd-doc and ddd-tdd | — |
| L013 | 2026-07-22 00:54 | Q01-01 | codex -> orchestrator | status | Worker pre-flight passed; starting ddd-start | — |
| L014 | 2026-07-22 00:56 | Q01-01 | codex -> queue | compaction | Archived resolved L001–L009 entry bodies after context threshold | `documents/queue/logs/Q01-ai-learning-items-and-learning-library-L001-L009.md` |
| L015 | 2026-07-22 00:57 | Q01-01 | codex -> orchestrator | ddd-start | Classified as RXX; Renderer boundary map confirmed from centralized intake | — |
| L016 | 2026-07-22 01:02 | Q01-01 | codex -> queue | status | Fresh worker resumed authorized partial R01 and queue state; Q01-02 remains untouched | — |
| L017 | 2026-07-22 01:02 | Q01-01 | codex -> queue | ddd-doc | R01 approval reconfirmed from the clarified intake; scope is pure Renderer extraction | — |
| L018 | 2026-07-22 01:02 | Q01-01 | codex -> queue | tdd-red | Boundary test failed because all four workspace modules were absent | — |
| L019 | 2026-07-22 01:04 | Q01-01 | codex -> queue | tdd-green | Four boundaries composed; focused and full Renderer regressions, typecheck and build passed | — |
| L020 | 2026-07-22 01:04 | Q01-01 | codex -> queue | handoff | Q01-01 ready for scoped commit; Q01-02 not started | — |
| L021 | 2026-07-22 01:04 | Q01-01 | codex -> queue | completed | R01 updated and Q01-01 marked completed with pending-orchestrator commit field | — |
| L022 | 2026-07-22 01:07 | Q01-01 | orchestrator -> queue | acceptance | Verified item commit 0701a3b and Q01-02 unlock evidence | — |
| L023 | 2026-07-22 01:07 | Q01-02 | orchestrator -> codex | dispatch | Dispatch Q01-02 through ddd-start, ddd-doc and ddd-tdd | — |
| L024 | 2026-07-22 01:09 | Q01-02 | codex -> queue | status | Worker start: preflight and dependency unlock verified | — |
| L025 | 2026-07-22 01:09 | Q01-02 | codex -> queue | ddd-start | Classified as clear FXX; intake resolves architecture scope | — |
| L026 | 2026-07-22 01:09 | Q01-02 | codex -> queue | ddd-doc | F19 auto-approved: explicit, low-risk and testable | — |
| L027 | 2026-07-22 01:12 | Q01-02 | codex -> queue | tdd-red | F19 tests correctly failed for the missing repository and Anki placeholder | — |
| L028 | 2026-07-22 01:20 | Q01-02 | codex -> queue | tdd-green | SQLite, IPC and renderer implementation passed focused and full verification | — |
| L029 | 2026-07-22 01:20 | Q01-02 | codex -> queue | handoff | F19, P01 and module docs updated; ready for scoped item commit | — |
| L030 | 2026-07-22 01:20 | Q01-02 | codex -> queue | completed | Q01-02 complete pending orchestrator commit-hash substitution; notification suppressed | — |

### Active Entries

#### L010 — 2026-07-22 00:52 — Q01-01 — user -> orchestrator — answer

**Message**
使用者要求：「幫我處理 git 問題後 自動開始」。此為處理既有文件變更、建立 baseline commit 並在 clean pre-flight 後自動恢復 Q01 的明確授權。

**Follow-up**
- Review all dirty paths, commit only verified project documents, then resume without another confirmation.

#### L011 — 2026-07-22 00:52 — Q01-01 — orchestrator -> queue — decision

**Message**
Seven dirty paths were reviewed as coherent project documentation with no detected credentials. They were explicitly staged and committed as baseline `9885440` (`docs: add learning items queue baseline`). `git status --short` was empty afterward.

**Artifacts**
- Baseline commit: `9885440`
- Tests: documentation diff check passed; no production tests required

**Follow-up**
- Clear the resolved pre-flight blocker and dispatch Q01-01.

#### L012 — 2026-07-22 00:52 — Q01-01 — orchestrator -> codex — dispatch

**Message**
Handle only Q01-01. Execute `ddd-start → ddd-doc → ddd-tdd`, create one RXX document, record red／green evidence, update P01 and Q01, and commit only files related to Q01-01. Suppress per-item ddd-tdd completion notification.

**Context**
- Queue file: `documents/queue/Q01-ai-learning-items-and-learning-library.md`
- Source plan: `documents/planning/P01-ai-learning-items-and-learning-library.md`
- Depends on: []
- Unlock condition: none
- Intake: completed; Q01-01 clarified

**Expected Response**
- Completed item with RXX path, commit hash, test commands, ledger entries and handoff; or blocked state with a concrete question

**Follow-up**
- Do not start Q01-02.

#### L013 — 2026-07-22 00:54 — Q01-01 — codex -> orchestrator — status

**Message**
Worker pre-flight passed at dispatch commit `220a704`: queue readiness and centralized intake are complete, Q01-01 is clarified and already in progress, `depends_on` is empty, and `git status --short` was empty before this ledger update.

**Artifacts**
- Queue: `documents/queue/Q01-ai-learning-items-and-learning-library.md`
- Source plan: `documents/planning/P01-ai-learning-items-and-learning-library.md`

**Follow-up**
- Execute Q01-01 only through `ddd-start → ddd-doc → ddd-tdd`; suppress the per-item completion notification.

#### L014 — 2026-07-22 00:56 — Q01-01 — codex -> queue — compaction

**Message**
Archived the resolved L001–L009 entry bodies after the queue master document exceeded the compact-context threshold. Their log-index rows remain authoritative; L010 onward remains active in the master document.

**Artifacts**
- `documents/queue/logs/Q01-ai-learning-items-and-learning-library-L001-L009.md`

**Follow-up**
- Read the archive only when a later worker needs those historical intake or blocker details.

#### L015 — 2026-07-22 00:57 — Q01-01 — codex -> orchestrator — ddd-start

**Message**
ddd-start classified Q01-01 as an RXX because it improves Renderer structure without changing external behavior. `CONTEXT.md` is loaded. The zoom-out map found one application caller (`main.tsx → App`) and four presentational seams beneath App orchestration: primary navigation, book/reader content, the review placeholder, and the AI conversation panel. Existing reading-range helpers, Electron bridges, persistence, shared contracts, Codex protocol and CSS remain outside the refactor.

**Context**
- Domain terms retained: 書庫、書籍總覽、閱讀區段、範圍標籤、標記、AI 對話面板、生詞庫、複習回合。
- Scope confirmation is already recorded in the centralized intake and L001/L006/L007; no interactive grill or duplicate confirmation is required.

**Follow-up**
- Create the next refactor specification as R01 and evaluate it for queue auto-approval.

#### L016 — 2026-07-22 01:02 — Q01-01 — codex -> queue — status

**Message**
Fresh queue worker resumed only Q01-01 after the prior worker’s capacity interruption. The inherited dirty paths are authorized continuation artifacts: partial `R01`, Q01 updates, and its archive. No production code was present or changed. R01 is reviewed as approved under the completed intake; the worker will create and run the required workspace-boundary RED test before any Renderer implementation.

**Follow-up**
- Preserve the partial document and append-only ledger; do not start Q01-02.

#### L017 — 2026-07-22 01:02 — Q01-01 — codex -> queue — ddd-doc

**Message**
The worker reviewed R01 against the completed intake, Renderer modules, contracts, tests, and package scripts. R01 is clear, low-risk, testable and auto-approved: `App` remains the owner of bridge calls, effects, persistence and cross-workspace state; the extracted components stay pure Renderer presentation boundaries. No unresolved requirement or scope contradiction was found.

**Follow-up**
- Begin strict RED with TC1 before any production change.

#### L018 — 2026-07-22 01:02 — Q01-01 — codex -> queue — tdd-red

**Message**
Created `apps/desktop/src/renderer/workspace-boundaries.test.tsx` and ran `npm test -- workspace-boundaries.test.tsx` from `apps/desktop`. Vitest failed before executing tests because Vite could not resolve `./workspace/AiConversationPanel`; the other three requested workspace modules also did not exist. This is the expected unimplemented-boundary failure, not an environment or regression failure.

**Follow-up**
- Create the four Renderer workspace modules, then rerun TC1 and focused regressions.

#### L019 — 2026-07-22 01:04 — Q01-01 — codex -> queue — tdd-green

**Message**
Implemented four named Renderer boundaries and composed them in `App`: `PrimaryNavigation`, `ReadingWorkspace`, `LearningLibraryWorkspace` and `AiConversationPanel`. TC1 passed after implementation. Focused `App.test.tsx` plus `reading-range.test.ts` passed 61 tests; the full desktop suite passed 12 files / 129 tests; `npm run typecheck` and `npm run build` passed. No data, IPC, persistence, CSS, visible text, ARIA or Codex protocol file changed.

**Follow-up**
- Update R01/P01/Q01 completion records and create the one scoped Q01-01 commit.

#### L020 — 2026-07-22 01:04 — Q01-01 — codex -> queue — handoff

**Message**
Q01-01 is ready for closeout. The implementation document is `documents/implements/R01-desktop-workspace-boundaries.md`; the queue item uses `commit: pending-orchestrator` to avoid the circular commit-hash update. Q01-02 remains pending and must be handled by a later fresh worker only after its dependency is independently verified.

**Follow-up**
- Stage only Q01-01 files and commit once with the required message.

#### L021 — 2026-07-22 01:04 — Q01-01 — codex -> queue — completed

**Message**
R01 implementation record and P01 Phase 1 are updated. Q01-01 is marked completed with its approved handoff and `pending-orchestrator` commit field. Per-item ddd-tdd completion notification is suppressed by Q01; no email was sent and Q01-02 was not started.

#### L022 — 2026-07-22 01:07 — Q01-01 — orchestrator -> queue — acceptance

**Message**
Orchestrator verified the scoped item commit `0701a3b` (`refactor: complete Q01-01 workspace boundaries`) and replaced the circular placeholder. The worktree was clean. Unlock evidence for Q01-02 is satisfied: Q01-01 is completed with R01, the full desktop suite passed 12 files / 129 tests, desktop typecheck passed, and the production build passed.

**Follow-up**
- Dispatch Q01-02 to a fresh worker session; do not reuse the Q01-01 worker.

#### L023 — 2026-07-22 01:07 — Q01-02 — orchestrator -> codex — dispatch

**Message**
Handle only Q01-02. Execute `ddd-start → ddd-doc → ddd-tdd`, create one FXX document, record strict red／green evidence, implement the authorized local SQLite learning library and source-linked fallback workflow, update P01 and Q01, and create one scoped item commit. Suppress per-item completion notification.

**Context**
- Q01-01 dependency commit: `0701a3b`
- Unlock condition: verified by 129 desktop tests, typecheck and production build
- Intake: completed; Q01-02 clarified
- Persistence: Electron `node:sqlite` under `userData`, narrow IPC only
- Product boundary: 生詞庫 list/detail/edit/archive, source snapshot, same-source idempotency; no hard delete or spaced-review flow

**Expected Response**
- Completed item with FXX path, actual commit hash, migration/schema and test evidence, ledger entries and handoff; or blocked state with a concrete question

**Follow-up**
- Do not start Q01-03.

#### L024 — 2026-07-22 01:09 — Q01-02 — codex -> queue — status

**Message**
Worker start preflight passed. `git status --short` was empty before this worker's
first document update. Q01 has `intake_grill_status: completed` and
`ready_for_execution: true`; Q01-02 is `in_progress` and `clarified`. Dependency
Q01-01 is completed at `0701a3b`; L022 records its 129 desktop tests, desktop
typecheck and production build, satisfying the declared unlock condition.

**Follow-up**
- Execute only Q01-02 through ddd-start, ddd-doc and strict RED/GREEN.

#### L025 — 2026-07-22 01:09 — Q01-02 — codex -> queue — ddd-start

**Message**
ddd-start classifies Q01-02 as FXX: it adds a new persisted Learning Library while
integrating existing Electron, book-library and annotation boundaries. `CONTEXT.md`,
the completed centralized intake, relevant module documents, contracts, IPC, service,
Renderer code and tests were reviewed. The intake already resolves the required
architecture decisions (local `node:sqlite`, explicit migration, narrow IPC, snapshot
retention after book deletion, edit/archive only), so no further grill-with-docs is
needed. The next document is F19.

**Follow-up**
- Review F19 for low-risk, testable auto-approval before adding production code.

#### L026 — 2026-07-22 01:09 — Q01-02 — codex -> queue — ddd-doc

**Message**
Created `documents/implements/F19-local-learning-library.md`. It specifies the
authorized `node:sqlite` migration, typed Main/Preload/Renderer contract, separated
item/source snapshot model, annotation fallback, list/detail/edit/archive behavior,
idempotency and deleted-book availability. All six acceptance rules map to TC1–TC6.
The completed intake explicitly authorizes the data model and migration; F19 has no
open product decision, is low-risk within the desktop boundary and can be tested
without AI or external services. It is therefore auto-approved under Q01-02.

**Follow-up**
- Add the TC1–TC6 RED tests before any production implementation.

#### L027 — 2026-07-22 01:12 — Q01-02 — codex -> queue — tdd-red

**Message**
Added F19 tests before production implementation and ran:
`npm test -- learning-library-service.test.ts learning-library-workspace.test.tsx`.
The repository suite failed because `./learning-library-service` did not exist; the
workspace test failed because the page still exposed 「Anki 式間隔複習」 and hard-coded
「今日待複習 10」 instead of 生詞庫 zero state. Both failures directly evidenced missing
authorized behavior, not an environment error.

**Follow-up**
- Implement F19 repository, bridge and Renderer behavior, then run the focused suite.

#### L028 — 2026-07-22 01:20 — Q01-02 — codex -> queue — tdd-green

**Message**
F19 GREEN verification passed. `node:sqlite` migration 1 provides separated items and
sources with unique annotation provenance; Main/Preload/Renderer expose only the five
typed learning operations. The renderer has real 生詞庫 zero/list/detail/edit/archive
behavior and annotation fallback. Source snapshots survive book deletion and read as
unavailable. Focused verification passed 6 files / 75 tests; desktop passed 15 files /
138 tests; the full project passed server 3 + desktop 138 tests, typecheck and production
build. No native dependency, remote API, AI proposal, merge or scheduling work was added.

**Follow-up**
- Update F19/P01/module docs and close Q01-02 with the scoped commit.

#### L029 — 2026-07-22 01:20 — Q01-02 — codex -> queue — handoff

**Message**
F19 implementation record, P01 Phase 2 and learning-library/book-library module documents
are aligned. Q01-02 is completed with `commit: pending-orchestrator` to avoid the circular
hash update. The next item remains Q01-03 and requires a new worker after this commit is
verified.

**Follow-up**
- Stage only Q01-02 artifacts and create its one required commit.

#### L030 — 2026-07-22 01:20 — Q01-02 — codex -> queue — completed

**Message**
Q01-02 is complete and ready for scoped commit verification. Per-item ddd-tdd completion
notification is suppressed by Q01; no email was sent because the queue has no configured
sender or recipient. Q01-03 was not started.

## 6. Queue execution rules

1. 每個 item 使用新的 Codex 或 Claude Code session，只處理該 item。
2. Worker 必須完整執行 `ddd-start → ddd-doc → ddd-tdd`，並在 item 完成後建立一個只含該 item 相關檔案的 commit。
3. `intake_grill_status: completed`、`ready_for_execution: true`、assigned item 為 `clarified` 且工作樹乾淨以前，不得啟動 worker。
4. 後項只有在所有 `depends_on` 均 completed、具有 commit 且 unlock condition 可驗證時才能開始。
5. 任一 blocker 立即停止整個 queue；不得跳到下一項。
6. Queue worker 內部的 `ddd-tdd` 不發送單項完成通知；只有 orchestrator 在整批完成時依設定通知。
7. 所有 dispatch、問題、回答、決策、red／green、handoff、commit 與通知都必須 append 到 ledger；不得改寫舊 entry。
8. 執行前若工作樹仍含使用者既有變更，必須停止並請使用者處理，不得自動提交、stash 或混入 queue commit。
