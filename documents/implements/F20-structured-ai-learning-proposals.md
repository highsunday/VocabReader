---
author: Codex
date: 2026-07-22
title: 產生結構化 AI 學習項目提案
uuid: 3f43560e9e1047729599ce02ca6e42c1
version: 1.0.0
status: approved
source_plan: documents/planning/P01-ai-learning-items-and-learning-library.md
source_queue_item: Q01-03
---

# Feature Specification – 結構化 AI 學習項目提案

## 1. Goal

在 **AI 對話面板**提供獨立的「產生學習卡」背景 workflow。它只讀取目前非空
**閱讀區段**內、可判定為 word 或 phrase 的 **標記**，先以 Codex App Server
`turn/start.outputSchema` 取得受限的候選，再由程式查詢有限的 **生詞庫**候選，最後以第二個
schema-constrained turn 產生可審閱的提案。這個 workflow 不建立或恢復一般 **AI 對話**、不會
對生詞庫執行任何寫入，且 pending proposals 只存在於目前 Renderer state。

## 2. User Story

- **As a** 完成一段英文閱讀並建立標記的使用者
- **I want** 取得每個單字或片語標記的新增／更新建議與欄位差異
- **So that** 我能先審閱 AI 整理結果，再在後續獨立流程決定是否保存為學習項目

## 3. Confirmed Rules and Boundaries

- 入口僅在 reading segment 非空且至少有可接受的短 word／phrase 標記時啟用；不得回退為整章。
- 句子型標記不會送入候選或提案；AI 回傳的任何 sentence／未知 type 一律拒絕。
- 使用執行當下的 **講解語言**；不讀取或修改既有學習卡的翻譯內容。
- Main process 擁有 workflow、schema validation 與候選 lookup。Renderer 只能以窄化 IPC 請求
  產生與接收可顯示提案，不能查詢 SQLite 或傳入任意 prompt／schema／skill path。
- 兩個 AI turns 都使用一個獨立且 ephemeral App Server thread：空 environments、無 dynamic tools、
  關閉 plugins/apps/memories/web search，`approvalPolicy: never` 及 read-only sandbox。AI 不取得
  資料庫、檔案或任意工具權限；App-provided bundled skill 是唯一固定指令輸入。
- 程式對每個初始候選以精確 annotation source、canonical form + type 與正規化 aliases 查詢最多
  六筆既有項目；只有這些 item id 可提供給第二 turn。
- 可接受 action 僅有 `create`、`update`、`unchanged`、`create-distinct-sense`。update／unchanged
  必須指向本次提供的 item id；create actions 不可指定 item id。所有欄位、來源 id 與 action 必須
  通過 schema 與 runtime validation。程式自行由已有限候選產生每欄 `from` / `to` diff。
- 本項不實作 apply、merge transaction、proposal persistence、version/audit、排程、舊卡翻譯或 AI
  直接寫入；這些是 Q01-04 或後續工作。

## 4. Acceptance Criteria

1. **有效區段與來源追溯**
   - Given 一個非空閱讀區段包含多個 word／phrase 標記與一個句子標記
   - When 使用者選擇「產生學習卡」
   - Then 只有區段內的合格來源可進入提案，提案顯示原始 annotation id／文字，區段外及句子來源不存在。
2. **受限查重與動作**
   - Given 生詞庫同時有相同來源、同 canonical/type、alias 相符與不同語義的項目
   - When workflow 取得第一階段候選
   - Then 第二階段只接收每筆至多六筆程式查得候選，並可回傳四種合法 action 與可審閱欄位 diff。
3. **無持久化提案**
   - Given workflow 回傳 create 或 update proposal
   - When Renderer 顯示提案
   - Then 生詞庫筆數、內容與來源皆保持不變，且一般 AI 對話沒有新增訊息或 thread。
4. **拒絕不可信結果**
   - Given AI result 缺少必要欄位、使用未知 action／item id、宣稱區段外 annotation 或不符合 schema
   - When Main process 驗證結果
   - Then workflow 拒絕結果並回傳可理解錯誤，且不產生資料庫 mutation。
5. **入口邊界**
   - Given 空閱讀區段、沒有可接受標記，或只含句子標記
   - When 使用者開啟閱讀頁
   - Then 「產生學習卡」保持 disabled，且不送出 App Server turn。

## 5. Test Scenarios

| ID | Given | When | Then | Priority |
|---|---|---|---|---|
| TC1 | 非空區段有兩個合格標記與句子／區段外標記 | 呼叫 workflow | 只有合格且區段內 sources 進入兩個 schema turns | High |
| TC2 | 生詞庫有 source、canonical/type、alias 和不同義候選 | 建立 proposal | query 有上限，第二 turn 只見候選清單，合法四種 action 與 diff 被正規化 | High |
| TC3 | create/update proposals | Renderer 顯示結果 | learning repository state 不變，沒有一般 chat turn | High |
| TC4 | 缺欄位／未知 action／未知 item／區段外 source／壞 JSON | 驗證 AI 回覆 | throw/reject，無任何 repository write | High |
| TC5 | 空區段、無 annotation 或僅句子 annotation | 渲染 preset | 按鈕 disabled 且不呼叫 proposal IPC | Medium |
| TC6 | 正常 workflow 與 bundled runtime | 啟動 App Server turn | 使用固定 learning-card skill、`outputSchema`、隔離 thread settings | High |

## 6. Anticipated Files

- `apps/desktop/src/shared/learning-proposal-contracts.ts`
- `apps/desktop/src/main/learning-proposal-controller.ts`
- `apps/desktop/src/main/learning-proposal-ipc.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`
- `apps/desktop/src/main/bundled-skill.ts`, `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`, `apps/desktop/src/renderer/env.d.ts`, `apps/desktop/src/renderer/App.tsx`
- `.agents/skills/generate-learning-cards/SKILL.md` and `agents/openai.yaml`
- focused Main/Renderer tests and relevant module documents

## 7. Stop Conditions and Non-goals

- Block if the installed App Server cannot support an actual `turn/start.outputSchema` result; it was verified locally before implementation with generated protocol schema from codex-cli 0.144.4.
- Do not introduce database writes, proposal apply/transactions, pending proposal persistence, aliases schema migration, review scheduling, old-card translation, a remote API, broad tool access, or whole-chapter fallback.

## Implementation Record

### Status

Implemented.

### Implementation Summary

`LearningProposalController` starts an independent ephemeral App Server thread and runs two output-schema turns. The first produces validated word/phrase candidates; `LocalLearningLibrary.findProposalCandidates()` performs bounded source/canonical/type/alias lookup; the second emits only allowed review actions. Structured completion is awaited from the matching App Server notification, with a two-minute timeout and best-effort `turn/interrupt` before the client closes; it does not poll. Runtime validation rejects malformed JSON, missing fields, unknown actions, out-of-segment sources and unknown item ids before returning display-only proposals. No method in this flow writes the learning database.

### Test Coverage

- TC1–TC4 and TC6: `learning-proposal-controller.test.ts` exercises two schema turns, bounded candidates, diffs, isolation, malformed output, unchanged SQLite state, and a valid completion delayed 1.5 seconds for each turn.
- TC5: direct `App.test.tsx` cases prove the Renderer preset is disabled without proposal IPC for an empty range and sentence-only annotations; an in-range word-only input passes the current explanation language and renders its unsaved source, action and field diffs.

### Changed Files

- Main: proposal controller, narrow proposal IPC, bounded repository lookup, bundled-skill registration and fake App Server structured replies.
- Renderer: typed preload proposal bridge, Generate Learning Cards control and read-only proposal display.
- Skill: `.agents/skills/generate-learning-cards/`.

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Valid sources remain in the current segment | Pass | TC1 source validation and direct Renderer in-range filtering |
| Bounded candidates and four actions | Pass | TC1 controller request/result assertions |
| Proposals do not persist | Pass | TC1 and invalid-output tests compare SQLite state |
| Invalid schema/action/item/source is rejected | Pass | TC4 parameterized tests |
| Empty/no eligible source disables entry | Pass | Direct empty-range and sentence-only Renderer regressions |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/learning-proposal-controller.test.ts
# Correction RED: a valid 1.5-second App Server completion rejected at the previous ~1-second polling boundary.

npm run test -w @reader/desktop -- src/main/learning-proposal-controller.test.ts src/renderer/App.test.tsx
# Correction GREEN: 59 tests passed.

npm test && npm run typecheck && npm run build
# GREEN: server 3 + desktop 147 tests, typechecks and production build passed.
```

### Decisions and Deferred Items

- Local codex-cli 0.144.4 generated protocol schema verified `turn/start.outputSchema`; no web source was used.
- The workflow uses `environments: []`, `dynamicTools: []`, disabled plugins/apps/memories/web and a fixed bundled skill; it gives AI no database, arbitrary-file or arbitrary-tool capability.
- Completion is event-driven with a fixed two-minute timeout; a timeout requests `turn/interrupt` and the enclosing `finally` unsubscribes then closes the client. This is a latency boundary, not a persistence or apply path.
- Q01-04 alone owns applying proposals, merge/transaction/version/audit behavior and pending-proposal persistence.
