---
author: Codex
date: 2026-07-22
title: 依 P01 建立 AI 學習項目與生詞庫
uuid: ec8c9d89f8074d309825154d9bb108ef
version: 1.0
status: completed_pending_orchestrator_closeout
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
orchestrator_closeout: ready
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
| Q01-02 | 建立本機生詞庫與來源卡片基礎 | FXX | codex | Q01-01 | completed | documents/implements/F19-local-learning-library.md | ab7b12e |
| Q01-03 | 產生結構化 AI 學習項目提案 | FXX | codex | Q01-02 | completed | documents/implements/F20-structured-ai-learning-proposals.md | 5766ba8 |
| Q01-04 | 確認並安全套用新增／更新提案 | FXX | codex | Q01-03 | completed | F21-safe-learning-proposal-apply | pending-orchestrator |

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
handoff_summary: Q01-01 completed at 0701a3b; four named Renderer workspace boundaries are composed by App. R01 records RED/GREEN evidence. Q01-02 was subsequently unlocked and completed.
communication_entries: [L001, L005, L006, L007, L008, L009, L010, L011, L012, L013, L014, L015, L016, L017, L018, L019, L020, L021, L022]
archive_refs: [documents/queue/logs/Q01-ai-learning-items-and-learning-library-L010-L048.md]

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
status: completed
clarification_status: clarified
depends_on: [Q01-01]
unlock_condition: Q01-01 completed with a commit, and renderer regression tests plus production build pass
auto_approve: true
commit_required: true
implemented_doc: documents/implements/F19-local-learning-library.md
commit: ab7b12e
worker_session: codex 2026-07-22 01:07 CST
worker_log: F19 auto-approved; RED confirmed missing repository and hard-coded Anki placeholder. GREEN: focused 75 tests, desktop 138 tests, full project 141 tests, typecheck and production build passed. SQLite migration, typed IPC, fallback, edit/archive and deleted-book snapshots are complete; no Q01-03 work started.
handoff_summary: Q01-02 completed at ab7b12e. F19 implements `node:sqlite` under userData with migration 1; sources retain snapshots after book deletion and expose availability. Renderer renamed Anki placeholder to 生詞庫 and supports real zero/list/detail/edit/archive plus annotation fallback. Full project test/typecheck/build green. Q01-03 is unlocked for a fresh worker.
communication_entries: [L002, L005, L006, L007, L023, L024, L025, L026, L027, L028, L029, L030, L031]
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
agent: codex
status: completed
clarification_status: clarified
depends_on: [Q01-02]
unlock_condition: Q01-02 completed with a commit, and a persisted source-linked learning item can be created and listed
auto_approve: true
commit_required: true
implemented_doc: documents/implements/F20-structured-ai-learning-proposals.md
commit: 5766ba8
worker_session: codex correction 2026-07-22 01:43 CST
worker_log: F20 acceptance correction complete. RED reproduced a valid 1.5-second App Server completion failing at the prior ~1-second polling cap. GREEN replaces it with notification-driven two-minute waiting plus timeout interrupt/close cleanup. Direct Renderer tests prove empty/sentence-only disablement/no IPC and visible unsaved review proposals. Focused 59 desktop, full server 3 + desktop 147, typecheck and build passed. No apply/persistence; Q01-04 remains untouched.
handoff_summary: Q01-03 accepted at 5766ba8. F20 waits event-driven for each App Server turn (two-minute timeout; interrupt/close cleanup). Direct UI tests cover empty/no-eligible disablement and source/action/diff preview. No DB writes, whole-chapter fallback, sentence sources, or proposal persistence. Q01-04 is unlocked for a fresh worker.
communication_entries: [L003, L005, L006, L007, L032, L033, L034, L035, L036, L037, L038, L039, L040, L041, L042, L043, L044, L045, L046, L047, L048]
archive_refs: []

### Requirements

新增受信任的「產生學習卡」preset、bundled skill 與固定 intent。用 Codex App Server `turn/start.outputSchema` 先取得結構化 word／phrase 候選；程式以來源、canonical form、類型及 alias 查詢有限既有候選；AI 再提出 create／update／unchanged／create-distinct-sense 建議。只顯示可驗證提案，本項不得寫入生詞庫。

### Clarification results

- Clarification status: clarified
- Design notes: independent background workflow; only word／phrase; empty range or no annotations disables preset.
- Open questions: —
- User decisions: use current explanation language; old cards do not auto-translate; AI proposes but never writes.

### Acceptance criteria

- [x] 含多個合格標記的非空閱讀區段可產生逐項提案，且提案均可追溯到區段內標記。
- [x] 新詞顯示 create；相同來源或同義既有項目顯示 update／unchanged；同詞不同義可顯示 create-distinct-sense。
- [x] 提案顯示既有內容與欄位差異，但產生後生詞庫筆數與內容不變。
- [x] 缺欄位、未知 action、未知 item id、區段外來源或無效 schema 被拒絕且不寫資料。

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

- Current state: completed at 5766ba8
- Decisions: background structured workflow, programmatic lookup, proposal-only phase
- Tests: schema validation, context boundary, action matching and zero persistence
- Risks: installed App Server structured-output compatibility

## Q01-04 確認並安全套用新增／更新提案

id: Q01-04
type: FXX
agent: codex
status: completed
clarification_status: clarified
depends_on: [Q01-03]
unlock_condition: Q01-03 completed with a commit, and valid create/update/unchanged/distinct-sense proposals can be previewed without persistence
auto_approve: true
commit_required: true
implemented_doc: documents/implements/F21-safe-learning-proposal-apply.md
commit: pending-orchestrator
worker_session: codex acceptance correction 2026-07-22 02:05 CST
worker_log: F21 correction RED: 3 expected failures for retained navigation proposals and unchanged count 0. GREEN: explicit Renderer context disposal/late guard and no-op update summary consistency. Focused 64; full server 3 + desktop 156; typecheck, build and E2E 2/2 passed. No boundary expansion.
handoff_summary: Q01-04 acceptance correction complete, commit remains pending-orchestrator. Session-only review is discarded on reader/source-context changes and late responses are ignored. No-op updates count unchanged while source/content/version stability holds. All required verification is green; no scheduling or AI writes/delete/archive added.
communication_entries: [L004, L005, L006, L007, L049, L051, L052, L053, L054, L055, L056, L057, L058, L059, L060, L061, L062, L063, L064, L065]
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

- Current state: acceptance correction complete; `commit: pending-orchestrator`
- Decisions: explicit confirmation and transaction guards retained; session-only review drops on source context changes
- Tests: correction RED 3/61; focused GREEN 64/64; full 159, typecheck, build and E2E 2/2 green
- Risks: no known regression; queue closeout and notification remain orchestrator-only

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
| L031 | 2026-07-22 01:22 | Q01-02 | orchestrator -> queue | acceptance | Verified item commit ab7b12e and Q01-03 unlock evidence | — |
| L032 | 2026-07-22 01:22 | Q01-03 | orchestrator -> codex | dispatch | Dispatch Q01-03 through ddd-start, ddd-doc and ddd-tdd | — |
| L033 | 2026-07-22 01:31 | Q01-03 | codex -> queue | status | Worker preflight and Q01-02 unlock verified | — |
| L034 | 2026-07-22 01:31 | Q01-03 | codex -> queue | ddd-start | Classified as FXX for isolated bounded proposal workflow | — |
| L035 | 2026-07-22 01:32 | Q01-03 | codex -> queue | ddd-doc | F20 auto-approved after local outputSchema verification | — |
| L036 | 2026-07-22 01:33 | Q01-03 | codex -> queue | tdd-red | Controller test failed because proposal workflow module was absent | — |
| L037 | 2026-07-22 01:34 | Q01-03 | codex -> queue | tdd-green | Focused 5 and full 146 tests, typecheck and build passed | — |
| L038 | 2026-07-22 01:34 | Q01-03 | codex -> queue | handoff | F20 and module docs aligned; Q01-04 retained as apply owner | — |
| L039 | 2026-07-22 01:34 | Q01-03 | codex -> queue | completed | Initial Q01-03 implementation committed pending acceptance | — |
| L040 | 2026-07-22 01:39 | Q01-03 | orchestrator -> queue | correction | Acceptance rejected one-second AI wait and missing direct Renderer regression | — |
| L041 | 2026-07-22 01:39 | Q01-03 | orchestrator -> codex | dispatch | Fresh correction worker must add reliable completion wait and UI tests, then amend Q01-03 commit | — |
| L042 | 2026-07-22 01:43 | Q01-03 | codex -> queue | status | Correction preflight confirmed clean tree, completed intake, clarified item and Q01-02 at ab7b12e | — |
| L043 | 2026-07-22 01:43 | Q01-03 | codex -> queue | tdd-red | Valid 1.5-second completion failed at the prior polling boundary | — |
| L044 | 2026-07-22 01:43 | Q01-03 | codex -> queue | tdd-green | Event-driven wait and direct Renderer regressions passed focused verification | — |
| L045 | 2026-07-22 01:43 | Q01-03 | codex -> queue | acceptance | Full root tests, typecheck and build passed; F20 criteria accepted | — |
| L046 | 2026-07-22 01:43 | Q01-03 | codex -> queue | handoff | Event-driven completion and proposal-only UI evidence recorded; Q01-04 remains locked | — |
| L047 | 2026-07-22 01:43 | Q01-03 | codex -> queue | completed | Q01-03 corrected and completed pending orchestrator hash substitution; notification suppressed | — |
| L048 | 2026-07-22 01:45 | Q01-03 | orchestrator -> queue | acceptance | Verified amended item commit 5766ba8 and Q01-04 unlock evidence | — |
| L049 | 2026-07-22 01:45 | Q01-04 | orchestrator -> codex | dispatch | Dispatch Q01-04 through ddd-start, ddd-doc and ddd-tdd | — |
| L050 | 2026-07-22 01:47 | ALL | codex -> queue | compaction | Archived resolved active L010–L048 bodies before Q01-04 | `documents/queue/logs/Q01-ai-learning-items-and-learning-library-L010-L048.md` |
| L051 | 2026-07-22 01:48 | Q01-04 | codex -> queue | status | Pre-flight, dependency and Q01-03 unlock evidence reconfirmed; starting ddd-start | — |
| L052 | 2026-07-22 01:48 | Q01-04 | codex -> queue | ddd-start | Classified as a clear FXX; centralized intake resolves apply/transaction/version/audit boundaries | — |
| L053 | 2026-07-22 01:49 | Q01-04 | codex -> queue | ddd-doc | F21 created and auto-approved as explicit, low-risk and testable | — |
| L054 | 2026-07-22 01:51 | Q01-04 | codex -> queue | tdd-red | Four repository tests failed because applyProposalBatch was absent | — |
| L055 | 2026-07-22 01:58 | Q01-04 | codex -> queue | tdd-green | Transaction/version/audit/Renderer apply flow passed focused and full verification | — |
| L056 | 2026-07-22 01:58 | Q01-04 | codex -> queue | handoff | F21/P01/module docs aligned; ready for scoped commit and orchestrator closeout | — |
| L057 | 2026-07-22 01:58 | Q01-04 | codex -> queue | completed | Q01-04 completed with pending-orchestrator commit field; per-item notification suppressed | — |
| L058 | 2026-07-22 02:05 | Q01-04 | orchestrator -> codex | correction | Acceptance rejected missing context cleanup and no-op update summary consistency; amend only fc4dbc9 | — |
| L059 | 2026-07-22 02:05 | Q01-04 | codex -> queue | ddd-start | Classified as a known F21 acceptance correction with no scope or authority expansion | — |
| L060 | 2026-07-22 02:05 | Q01-04 | codex -> queue | ddd-doc | F21 adds testable context-disposal and no-op update summary/source-stability scenarios | — |
| L061 | 2026-07-22 02:06 | Q01-04 | codex -> queue | tdd-red | Three focused failures reproduced both rejected acceptance gaps for the expected reasons | — |
| L062 | 2026-07-22 02:12 | Q01-04 | codex -> queue | tdd-green | Explicit context disposal/late guard and no-op summary consistency passed 64 focused tests | — |
| L063 | 2026-07-22 02:12 | Q01-04 | codex -> queue | acceptance | Full server 3 + desktop 156, typecheck, build and Electron E2E 2/2 passed | — |
| L064 | 2026-07-22 02:12 | Q01-04 | codex -> queue | handoff | Correction complete pending amended commit verification; notification suppressed | — |
| L065 | 2026-07-22 02:17 | Q01-04 | codex -> queue | acceptance | Final snapshot rerun passed focused/full/typecheck/build/E2E after range-drag review | — |

### Active Entries

#### L049 — 2026-07-22 01:45 — Q01-04 — orchestrator -> codex — dispatch

**Message**
Handle only Q01-04 through `ddd-start → ddd-doc → ddd-tdd`. Add the review-and-apply
workflow for selected proposals with per-item action and per-field overwrite confirmation.
Main must revalidate the batch in one transaction, protect manual fields by default,
append sources, allow distinct senses, use version/audit/idempotency safeguards, reject
stale proposals, and never allow AI to write/delete/archive directly. Pending proposals
remain Renderer-session-only. Update FXX/P01/Q01/module docs, create one scoped commit,
suppress the per-item completion notification, and do not implement review scheduling.

**Context**
- Dependency: Q01-03 at `5766ba8`
- Unlock evidence: all four actions previewed without persistence; full tests/typecheck/build green
- Explicit authorization: transaction, version, audit and schema migration are approved in intake

**Expected Response**
- Completed Q01-04 with FXX path, commit hash, tests, ledger entries and final queue handoff;
  or a blocked state with one concrete user decision.

#### L050 — 2026-07-22 01:47 — ALL — codex -> queue — compaction

**Message**
Archived resolved active-ledger bodies L010–L048 before Q01-04 implementation. The main
queue retains the complete Log Index, all item requirements/decisions/handoffs, and only
the current Q01-04 dispatch as active context.

**Artifacts**
- `documents/queue/logs/Q01-ai-learning-items-and-learning-library-L010-L048.md`

**Follow-up**
- Q01-04 workers read L049; open the archive only if a historical contradiction requires it.

#### L051 — 2026-07-22 01:48 — Q01-04 — codex -> queue — status

**Message**
Pre-flight evidence is valid: the worktree was clean at dispatch, Q01 has completed
centralized intake and is ready, Q01-04 is clarified/in progress, and Q01-01–03 have
accepted commits. Q01-03 at `5766ba8` proves all four proposal actions preview without
persistence, with server 3 + desktop 147 tests, typecheck and build green.

**Follow-up**
- Run ddd-start, create one FXX only, then begin strict RED before production edits.

#### L052 — 2026-07-22 01:48 — Q01-04 — codex -> queue — ddd-start

**Message**
ddd-start classifies Q01-04 as an FXX: it adds a user-confirmed apply workflow across
the existing proposal, Learning Library, narrow IPC and Renderer boundaries. `CONTEXT.md`,
the clarified intake, P01, F19, F20, learning-library and proposal module documents,
contracts, services and direct tests were reviewed. The intake explicitly authorizes
transactions, versioning, audit records and migrations; it also resolves manual-content
protection, distinct senses, session-only pending proposals and out-of-scope scheduling.
No additional grill-with-docs is required.

**Follow-up**
- Draft the next FXX and confirm it is explicit, low-risk and testable before code.

#### L053 — 2026-07-22 01:49 — Q01-04 — codex -> queue — ddd-doc

**Message**
Created `documents/implements/F21-safe-learning-proposal-apply.md`. F21 maps mixed
review, field protection, source append, distinct sense, unchanged stability, idempotent
restart, stale conflict, rollback and direct Renderer review to TC1–TC9. The intake grants
all required migration/transaction/version/audit authority, so F21 is explicit, low-risk
and testable under Q01 auto-approval.

#### L054 — 2026-07-22 01:51 — Q01-04 — codex -> queue — tdd-red

**Message**
Added `learning-proposal-apply.test.ts` before Main implementation and ran its four
tests. Each failed for the correct missing-feature reason: `applyProposalBatch is not a
function`. No environment or pre-existing regression was involved.

#### L055 — 2026-07-22 01:58 — Q01-04 — codex -> queue — tdd-green

**Message**
Migration 2 adds versions plus completed batch/audit records. Main validates/rechecks the
batch in one transaction, protects unconfirmed fields, preserves/appends sources, supports
distinct senses, rejects stale/invalid requests atomically and returns stored retry results.
Renderer review/apply controls and direct test are green. Focused 60 tests and root server
3 + desktop 152 tests, typecheck and build passed.

#### L056 — 2026-07-22 01:58 — Q01-04 — codex -> queue — handoff

**Message**
F21, P01 Phase 4 and learning-library/proposal module documents are synchronized. The
scope intentionally excludes review scheduling, AI writes/delete/archive, hard delete,
implicit merge and old-card auto-translation. Queue is ready for orchestrator final closeout.

#### L057 — 2026-07-22 01:58 — Q01-04 — codex -> queue — completed

**Message**
Q01-04 is completed with `commit: pending-orchestrator` for the circular hash protocol.
ddd-tdd completion notification is suppressed by Q01; no email was sent. The orchestrator
alone owns final queue notification/closeout.

#### L058 — 2026-07-22 02:05 — Q01-04 — orchestrator -> codex — correction

**Message**
Final acceptance rejected two concrete gaps in Q01-04: session-only proposals survive reader
navigation/context changes, and a selected update with no actual confirmed-field change returns an
unchanged result without incrementing the batch unchanged count. Add direct Renderer/repository RED
tests, implement minimal fixes, update F21/P01/Q01/module evidence, run all required verification,
then amend only `fc4dbc9` with its existing message. Keep the queue commit pending-orchestrator and
do not close the queue or send notifications.

#### L059 — 2026-07-22 02:05 — Q01-04 — codex -> queue — ddd-start

**Message**
The correction belongs to the existing clear F21 rather than a new queue item or BXX: both root
causes and expected behaviors are specified, the existing transaction/migration/typed-API authority
is sufficient, and no new product decision is required. `CONTEXT.md` terminology and Q01-04 safety
boundaries remain unchanged.

#### L060 — 2026-07-22 02:05 — Q01-04 — codex -> queue — ddd-doc

**Message**
F21 now explicitly requires discarding proposals when leaving the reader or changing their source
book/chapter/range/annotations/explanation language, including suppression of late stale generation
responses. It also requires no-op updates to increment the batch unchanged count while appending a
new source once and preserving content/version/`updatedAt`. These map to TC10 and TC11.

**Follow-up**
- Add the focused tests and record strict RED before production changes.

#### L061 — 2026-07-22 02:06 — Q01-04 — codex -> queue — tdd-red

**Message**
The focused Renderer/repository run produced exactly three expected failures before production
changes. Both direct Renderer tests still found the proposal review after returning to overview or
switching chapters. The repository test received per-result `outcome: unchanged`, stable content,
and one appended source, but the batch summary reported `unchanged: 0` instead of `1`.

**Evidence**
- `npm run test -w @reader/desktop -- src/renderer/App.test.tsx src/main/learning-proposal-apply.test.ts`
- RED: 3 failed, 58 passed (61 total).

#### L062 — 2026-07-22 02:12 — Q01-04 — codex -> queue — tdd-green

**Message**
Renderer now discards session-only proposal/review/batch state at the actual book, chapter, range,
annotation, explanation-language and leave-reader mutation boundaries. A generation context key
also ignores a response completed after navigation without perturbing normal generation. Main's
existing transaction increments unchanged when an update has no effective confirmed-field change;
the source still appends once and content/version/`updatedAt` remain stable.

**Evidence**
- Focused Renderer/repository/IPC: 64 passed.

#### L063 — 2026-07-22 02:12 — Q01-04 — codex -> queue — acceptance

**Message**
All required verification passed: `npm test` (server 3 + desktop 156), `npm run typecheck`,
`npm run build`, and `npm run test:e2e` (2/2). Safety review confirms one typed Main transaction,
manual-field protection, version/candidate/source validation, audit/idempotency and AI no-write/
delete/archive boundaries remain intact. Review scheduling remains out of scope.

#### L064 — 2026-07-22 02:12 — Q01-04 — codex -> queue — handoff

**Message**
F21, P01, Q01 and both relevant module documents contain correction RED/GREEN evidence. Amend only
the latest Q01-04 commit with its existing message, keep `commit: pending-orchestrator`, do not close
the queue and do not send notifications. ddd-tdd completion notification remains suppressed by Q01.

#### L065 — 2026-07-22 02:17 — Q01-04 — codex -> queue — acceptance

**Message**
After final behavior review added disposal on the first actual range-marker drag and made the source
assertion independent of same-millisecond row ordering, the complete final snapshot was rerun:
focused 64/64, `npm test` server 3 + desktop 156, typecheck, production build and Electron E2E 2/2
all passed. No queue closeout or notification was performed.

## 6. Queue execution rules

1. 每個 item 使用新的 Codex 或 Claude Code session，只處理該 item。
2. Worker 必須完整執行 `ddd-start → ddd-doc → ddd-tdd`，並在 item 完成後建立一個只含該 item 相關檔案的 commit。
3. `intake_grill_status: completed`、`ready_for_execution: true`、assigned item 為 `clarified` 且工作樹乾淨以前，不得啟動 worker。
4. 後項只有在所有 `depends_on` 均 completed、具有 commit 且 unlock condition 可驗證時才能開始。
5. 任一 blocker 立即停止整個 queue；不得跳到下一項。
6. Queue worker 內部的 `ddd-tdd` 不發送單項完成通知；只有 orchestrator 在整批完成時依設定通知。
7. 所有 dispatch、問題、回答、決策、red／green、handoff、commit 與通知都必須 append 到 ledger；不得改寫舊 entry。
8. 執行前若工作樹仍含使用者既有變更，必須停止並請使用者處理，不得自動提交、stash 或混入 queue commit。
