---
author: Codex
date: 2026-08-08
title: 在學習項目詳情以暫態 AI 對話補充內容與注意事項
uuid: b49ba244-c51c-46cb-9495-d974433a6748
version: 1.0.0
status: implemented
---

# Feature Specification - AI 輔助學習項目編修

## 1. Feature Overview

目前使用者可以在生詞庫的**學習項目詳情**中人工修改結構化欄位與 Markdown
學習內容，但無法直接描述個人的誤解或易混淆處，再由 AI 針對目前項目補充。
例如使用者常將 `impair` 誤解為 `repair`，需要的不是再建立一個學習項目，而是在
現有 `impair` 項目中加入具體差異、對比例句與醒目提醒。

本功能在生詞庫可編輯的學習項目詳情新增「使用 AI 編修」入口。進入後不開啟
左右雙欄、完整聊天氣泡或另一個預覽視窗；現有學習內容本身就是草稿預覽，只在詳情
底部展開一個簡單的 AI 需求輸入區。AI 每次完成後直接更新同一份畫面草稿，使用者
可繼續輸入下一個調整要求；只有最後明確執行「套用編修」才寫入生詞庫。

學習項目同時新增可留空的**學習注意事項**欄位。它獨立於一般 Markdown 學習內容，
在完整詳情頂部以「注意」標示、紅色文字與紅色底線呈現，用來保留使用者特別容易誤解、
混淆或忽略的關鍵差異。

## 2. Requirements (User Story)

- **As a** 使用生詞庫長期複習、並知道自己會混淆哪些用法的學習者
- **I want** 從目前學習項目內以簡單多輪需求請 AI 直接調整草稿
- **So that** 我可以把個人易錯點、相似詞差異與辨別方法沉澱到正式學習內容，而不必手動重寫 Markdown

## 3. Acceptance Criteria

- **Scenario 1：只在可編輯的生詞庫詳情提供入口**
  - **Given** 使用者從生詞庫開啟一個使用中的學習項目
  - **When** 詳情以可編輯 capability 呈現
  - **Then** 操作區顯示可辨識的「使用 AI 編修」入口
  - **And** 從尚未完成的間隔複習、整合造句練習或其他唯讀入口開啟詳情時不顯示此入口
  - **And** 垃圾桶項目不能開啟 AI 編修，還原為使用中後才可使用

- **Scenario 2：以目前項目開啟極簡編修模式**
  - **Given** 使用者正在查看一個可編輯學習項目
  - **When** 使用者點擊「使用 AI 編修」
  - **Then** 原詳情內容保持在同一個 modal 中，並成為目前編修草稿的即時預覽
  - **And** 詳情底部只展開一個多行需求輸入區、送出控制、簡短狀態、取消與套用編修
  - **And** 不顯示左右雙欄、完整對話氣泡、對話清單、模型選擇或另一個預覽視窗
  - **And** 草稿尚未有有效變更時，「套用編修」維持停用

- **Scenario 3：第一個需求更新相同畫面草稿**
  - **Given** 使用者已進入 `impair` 的 AI 編修模式
  - **When** 使用者輸入「我常把 impair 誤解成 repair，請補充兩者差異」並送出
  - **Then** AI 只取得目前項目的 id、標題、語義識別、一般學習內容、注意事項與本次編修對話
  - **And** 有效結果直接在原詳情中更新一般學習內容與注意事項草稿
  - **And** 畫面只顯示「已更新草稿，可繼續提出調整」之類的簡短狀態，不顯示或解析 AI 聊天文字作為學習內容
  - **And** 此時正式生詞庫資料尚未改變

- **Scenario 4：多輪調整永遠作用於最新草稿**
  - **Given** AI 已根據第一個需求更新草稿
  - **When** 使用者再要求「說明再簡短一點」、「加一組對比例句」或其他調整
  - **Then** AI 以目前最新草稿為底稿完成修訂
  - **And** 每一輪有效結果取代上一版畫面草稿，但不寫入正式資料
  - **And** AI 只能修改一般學習內容與注意事項，不能修改標題、類型、學習項目語言、CEFR 或語義識別
  - **And** 一次工作階段永遠只綁定開啟它的一個學習項目

- **Scenario 5：沿用現有學習內容的主要語言**
  - **Given** 學習項目標題是英文，但現有解釋內容主要是繁體中文
  - **When** AI 補充差異說明、用法或注意事項
  - **Then** 新增的學習說明預設使用繁體中文，不因結構化的學習項目語言是英文而改成英文
  - **And** 原文單字、IPA、英文例句與其他應保留原貌的內容不被強制翻譯
  - **And** 只有使用者在本次編修對話中明確要求時，AI 才切換新增說明的語言
  - **And** 此流程不沿用全域講解語言設定

- **Scenario 6：易混淆需求自動更新注意事項**
  - **Given** 使用者表示經常把目前學習項目誤解為另一個字、希望辨別多個易混淆字，或明確要求補充差異
  - **When** AI 完成本輪編修
  - **Then** 完整比較、例句與解釋放入一般學習內容
  - **And** 最重要的辨別方法或誤解提醒自動濃縮為學習注意事項，不要求使用者另外說「放進注意事項」
  - **And** 單純補充例句、潤飾或其他與易錯點無關的需求，保留現有注意事項不變
  - **And** AI 不確定時保留現有注意事項，不自行製造警告

- **Scenario 7：注意事項以獨立醒目欄位呈現**
  - **Given** 一個學習項目具有非空注意事項
  - **When** 使用者從生詞庫、可開啟完整詳情的複習結果，或整合造句練習查看完整詳情
  - **Then** 注意事項固定顯示在一般學習內容之前
  - **And** 以可辨識的「注意」標示、紅色文字與紅色底線呈現，且不只依賴色彩傳達語意
  - **And** 空注意事項不顯示空區塊
  - **And** 生詞庫縮略卡片與尚未作答的間隔複習題面不直接顯示注意事項
  - **And** 人工編輯狀態提供可留空的注意事項欄位與同樣的即時預覽

- **Scenario 8：明確套用後才原子更新正式項目**
  - **Given** AI 編修草稿至少已有一次有效變更
  - **When** 使用者點擊「套用編修」
  - **Then** Main process 以單一受限操作把草稿的一般學習內容與注意事項一起寫入目前學習項目
  - **And** 標題、類型、學習項目語言、CEFR、語義識別、狀態、複習排程與複習歷史保持不變
  - **And** 詳情立即顯示已儲存內容，重新啟動 App 後仍保留
  - **And** 若目前項目在工作階段開啟後已被其他操作修改或移入垃圾桶，套用必須拒絕覆寫並要求重新開啟 AI 編修

- **Scenario 9：取消、關閉與放棄不改變正式資料**
  - **Given** 使用者正在 AI 編修模式
  - **When** 尚無有效變更時取消或關閉
  - **Then** 直接結束這個暫態工作階段，不寫入任何資料
  - **And** 已有未套用變更時，取消、Escape 或關閉 modal 先顯示「放棄 AI 編修？」確認
  - **And** 在確認視窗選擇不放棄會回到目前草稿；確認放棄才清除對話與草稿並保留正式項目不變

- **Scenario 10：回覆中、停止或失敗時保留最後有效草稿**
  - **Given** AI 正處理一個編修需求
  - **When** 回覆尚未完成、使用者停止、Codex 連線失敗、artifact 無效或逾時
  - **Then** 「套用編修」在回覆中停用，且同一工作階段不接受第二個並行需求
  - **And** 停止、失敗或無效結果不得以半份內容覆寫畫面草稿
  - **And** 畫面保留上一版有效草稿及使用者當前輸入，並提供可理解的狀態與重試路徑

- **Scenario 11：使用固定 artifact 與最小 AI 資料邊界**
  - **Given** App 已將目前學習項目與用戶需求交給受限 AI 編修流程
  - **When** App 接收 AI 串流輸出
  - **Then** 只有完整且通過固定 schema 驗證的學習項目編修 artifact 能取代畫面草稿
  - **And** artifact 只接受目前工作階段 id、目前學習項目 id、非空 Markdown 學習內容與可留空注意事項
  - **And** 錯誤 id、缺失欄位、空學習內容、額外可編輯結構欄位或半份串流 artifact 均不改變草稿
  - **And** Renderer 不能指定任意 skill、prompt、檔案、工作目錄、Codex method、工具、網路或權限
  - **And** AI 無法直接取得 SQLite 或執行寫入，只有 App-owned 的套用操作可以修改正式項目

- **Scenario 12：編修工作階段不進入全域對話與長期資料**
  - **Given** 使用者開啟、多輪調整、套用或放棄 AI 輔助編修
  - **When** 工作階段結束或 App 關閉
  - **Then** 編修對話、未套用草稿與底層 Codex thread 不加入全域 AI 對話清單或 `LocalChatConversationStore`
  - **And** 不新增編修歷史、版本回滾、跨啟動草稿或獨立對話資料表
  - **And** 成功套用只改變學習項目的一般學習內容、注意事項與更新時間，不建立複習事件或改變 FSRS

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 可編輯詳情入口 | 從生詞庫開啟 active 項目 | 查看詳情操作 | 顯示「使用 AI 編修」 | Critical |
| TC2 | 唯讀與垃圾桶邊界 | 從複習、造句或垃圾桶開啟 | 查看詳情 | 不顯示、不可呼叫 AI 編修 | Critical |
| TC3 | 極簡編修模式 | 可編輯詳情 | 點擊 AI 編修 | 原內容為預覽，底部只展開單一需求輸入與簡短狀態 | Critical |
| TC4 | 首輪草稿更新 | `impair` 編修階段 | 要求區分 `repair` | 一般內容加入差異，注意事項濃縮易錯點，正式資料不變 | Critical |
| TC5 | 多輪調整 | 已有一版草稿 | 再要求縮短或加對比例句 | 最新草稿被完整取代，只改內容與注意事項 | Critical |
| TC6 | 學習內容主要語言 | 英文標題與繁中解釋 | AI 補充內容 | 新說明沿用繁中，不受全域講解語言覆蓋 | High |
| TC7 | 明確切換語言 | 現有內容為繁中 | 使用者要求改用英文補充 | 本輪新說明使用英文，原文內容保留 | Medium |
| TC8 | 注意事項自動判斷 | 已有或沒有注意事項 | 分別送出易混淆與一般例句需求 | 前者新增／更新注意事項，後者保留既有值 | Critical |
| TC9 | 注意事項呈現 | 項目含非空注意事項 | 從各種完整詳情查看 | 內容前顯示紅字、紅底線與文字標示；空值不顯示 | Critical |
| TC10 | 清單與題面不洩漏 | 項目含注意事項 | 查看生詞庫縮略卡片或未作答複習題 | 不顯示注意事項 | High |
| TC11 | 人工編輯注意事項 | 可編輯詳情 | 輸入、清空、預覽並儲存注意事項 | 預覽與重開結果一致，空值合法 | High |
| TC12 | 明確套用 | 草稿已變更 | 點擊套用 | 內容與注意事項一起持久化，其他欄位與排程不變 | Critical |
| TC13 | 過期工作階段 | 工作階段開啟後項目已改變或移入垃圾桶 | 套用草稿 | 拒絕覆寫並要求重開 | Critical |
| TC14 | 放棄確認 | 已有未套用變更 | 取消、Escape 或關閉 | 先確認；確認後清除暫態工作階段而不寫入 | Critical |
| TC15 | 停止與失敗保留 | 回覆中或已有上一版草稿 | 停止、逾時、失敗或 artifact 無效 | 保留上一版有效草稿與輸入，不寫入半份結果 | Critical |
| TC16 | Artifact 受信任邊界 | 各種錯誤 id、schema、額外欄位與半份輸出 | 解析 AI 結果 | 無效輸出不改草稿，AI 不可直接寫入 SQLite | Critical |
| TC17 | 暫態工作階隔離 | 完成或放棄 AI 編修 | 查看全域對話、重啟 App 與複習資料 | 無全域對話或草稿歷史，只有已套用項目內容持久保留 | High |
| TC18 | Schema migration 與資料備份 | schema 5 與新 schema 資料庫 | 啟動、備份及還原 | 舊項目注意事項為空，新值完整往返，不破壞排程或歷史 | Critical |

## 5. Implementation Notes

- 建議新增 App bundled skill `.agents/skills/edit-learning-item/SKILL.md`，只處理一個已由 App
  選定的學習項目。Skill 必須把項目內容與使用者需求視為不可信任資料，禁止工具、檔案、
  網路、plugins、apps、memories 與 skill discovery，並只輸出固定 fenced
  `learning-item-edit-result` artifact。
- Artifact 建議至少包含 `version`、`kind`、`sessionId`、`itemId`、
  `markdownContent` 與 `cautionNote`。Parser 必須拒絕 partial stream、錯誤 id、空
  Markdown、缺失欄位與額外可編輯結構欄位；只有完整驗證後才取代上一版草稿。
- 建議新增獨立暫態 `LearningItemEditController`，沿用 `CodexAppServerClient` 的登入與
  transport pattern，但不使用 `ChatController`、`LocalChatConversationStore` 或全域 AI 對話
  snapshot。Controller 只保留一個目前工作階段、最新有效草稿、底層 thread/turn id、
  原項目 `updatedAt` 與必要狀態；套用或放棄後關閉客戶端並清除工作階段。
- Renderer 只應透過型別化能力啟動目前項目、送出非空需求、停止回覆、套用與放棄。
  不得由 Renderer 傳入學習項目內容、注意事項、固定 prompt、skill 路徑或 AI 權限；
  Main process 以 item id 從 repository 讀取受信任原始內容。
- 套用時用 `itemId + baseUpdatedAt` 確認正式項目未被另一操作改變且仍為 active；
  repository 在同一資料庫更新中只寫入 `markdown_content`、`caution_note` 與
  `updated_at`，並在條件不符時回報 stale edit，避免用 Renderer 所持結構欄位覆寫最新值。
- SQLite schema 建議由 5 升為 6，在 `learning_items` 加入
  `caution_note TEXT NOT NULL DEFAULT ''`。既有項目回填空字串；新建立項目在本功能
  之前沒有注意事項資料來源，因此預設為空。`LearningItem` 與人工更新輸入新增
  `cautionNote`，但不把它加入 `LearningItemSummary` 或清單 query，避免清單空間、預載內容與
  未作答題面洩漏。
- **學習注意事項**是可留空的簡短純文字欄位，不解析為 Markdown 或 HTML。具體長篇
  比較、清單、例句與格式化內容仍屬於 `markdownContent`。顯示時使用現有詳情字體縮放、
  主題色對比與焦點規則，同時以文字標示確保不只依賴紅色傳達警示語意。
- 學習內容主要語言不另外持久化；AI 每輪以最新 `markdownContent` 與
  `cautionNote` 判斷。固定 skill 要求保留目前主要語言與原文片段，只在使用者
  明確說明目標語言時改變。
- UI 沿用現有 `LearningItemDetailDialog` 及 Markdown 安全渲染。AI 模式只在原詳情底部
  增加 composer 與狀態，不複製人工 Markdown editor 的左右預覽排版。回覆完成時若
  注意事項位於畫面上方，不強制搖回頂部；簡短狀態留在 composer 附近，避免
  流式回覆造成持續搶捲。

## 6. Assumptions, Non-goals, and Open Questions

### Assumptions

- 一次 AI 輔助編修只有一個目前學習項目；使用者在需求中提到的其他單字或片語只是
  比較對象，即使生詞庫中也有同名項目，本次工作階段也不讀取或修改它們。
- AI 可以根據通用語言知識說明易混淆字，比較字不必先存在生詞庫。
- 「直接編修」代表 AI 每輪直接更新畫面草稿，不代表 AI 可繞過使用者確認寫入正式資料。
- 對話不顯示完整訊息歷史，但底層同一暫態 thread 可保留本次工作階段的必要多輪上下文。
- App 介面控制文案沿用現有 GUI 語言；AI 補充的學習內容語言與 GUI 語言彼此獨立。

### Non-goals

- 不支援一次編修多個學習項目，不批次更新易混淆字的其他學習項目。
- 不讓 AI 修改標題、類型、學習項目語言、CEFR、語義識別、狀態或複習排程。
- 不將 AI 輔助編修加入全域 AI 對話面板、對話清單、建立意圖路由或學習項目草稿清單。
- 不保存 AI 編修需求、AI 聊天文字、未套用草稿、工作階段或學習項目版本歷史。
- 不在生詞庫縮略卡片或未作答複習題面顯示注意事項。
- 不新增 AI 編修專用的語言、模型、推理強度、字數或格式設定。
- 不進行網路字典搜尋，不向 AI 開放整個生詞庫、SQLite、EPUB 內容或任意檔案。

### Open Questions

- 無阻擋實作的未決問題。

## 7. Affected Modules and Files

### Production code

- `.agents/skills/edit-learning-item/SKILL.md`（新增）
- `.agents/skills/edit-learning-item/agents/openai.yaml`（新增）
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-item-edit-controller.ts`（新增）
- `apps/desktop/src/main/learning-item-edit-ipc.ts`（新增）
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `apps/desktop/src/main/learning-item-edit-controller.test.ts`（新增）
- `apps/desktop/src/main/learning-item-edit-ipc.test.ts`（新增）
- `apps/desktop/src/main/learning-item-edit-skill.test.ts`（新增）
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documentation

- `CONTEXT.md`
- `documents/implements/F51-ai-assisted-learning-item-editing.md`
- `documents/modules/learning-item-editing.md`（實作後新增）
- `documents/modules/learning-library.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/skill-management.md`

## 8. Implementation Record

### Status

Implemented and verified on 2026-08-08.

### Implementation Summary

- SQLite schema 6 adds non-null `caution_note` with empty backfill. Manual editing, complete-detail
  rendering and full backup now round-trip the field, while list summaries continue to omit it.
- Active editable details expose one compact `Edit with AI` composer. The existing Markdown and caution
  display become the only live draft preview; no split view, visible transcript, model selector or global
  conversation is created.
- `LearningItemEditController` owns one isolated transient Codex client/thread, sends only the selected
  item's trusted bounded fields plus the current request, supports multi-turn latest-draft editing and
  handles stop-before-turn-id races without accepting a late result.
- `edit-learning-item` preserves the learning content's primary explanation language, updates caution for
  confusion requests and preserves it for unrelated or uncertain changes.
- Strict `learning-item-edit-result` parsing accepts only the current session/item ids, non-empty complete
  Markdown and a string caution. Extra editable fields and malformed output are rejected before state changes.
- Explicit Apply delegates to a repository-owned conditional update that writes only Markdown, caution and
  `updated_at`; stale or trashed items are rejected. Discard and failure never persist the draft.
- Unsaved AI changes are protected by one alertdialog across Cancel, Close, Escape and backdrop exits.
  Read-only review/sentence details and Trash do not expose the edit entry.

### Test Coverage

| Coverage | Evidence |
|---|---|
| Schema, migration, manual edit, stale/Trash Apply | `learning-library-service.test.ts`, `learning-library-ipc.test.ts` |
| Skill behavior and runtime installation | `learning-item-edit-skill.test.ts`, `bundled-skill.test.ts` |
| Artifact trust boundary | `learning-item-artifacts.test.ts` |
| Transient scope, explicit Apply and stop race | `learning-item-edit-controller.test.ts` |
| Renderer-to-Main whitelist | `learning-item-edit-ipc.test.ts` |
| Compact UI, caution, read-only boundary, stop and discard confirmation | `learning-library-workspace.test.tsx` |
| Backup compatibility | `data-backup-service.test.ts` |
| Production bundle, runtime skill and preload keys | `desktop.spec.ts` |

### Changed Files

- Added `.agents/skills/edit-learning-item/SKILL.md` and `agents/openai.yaml`.
- Added `learning-item-edit-controller.ts`, `learning-item-edit-ipc.ts` and their tests.
- Added `learning-item-edit-skill.test.ts`; extended the shared artifact parser and tests.
- Updated learning contracts, repository/schema, general learning IPC, bundled skill installation,
  Electron Main wiring and preload bridge.
- Updated `LearningLibraryWorkspace.tsx`, its tests and shared styles.
- Updated backup/E2E expectations, `CONTEXT.md`, three existing module documents and added
  `documents/modules/learning-item-editing.md`.

### Acceptance Criteria Verification

| Scenario / TC | Result |
|---|---|
| TC1–TC3 editable boundary and minimal UI | Passed: active detail entry and single in-place composer; read-only and Trash hidden |
| TC4–TC5 first and subsequent draft updates | Passed: latest complete draft replaces only transient Markdown/caution |
| TC6–TC8 language and caution behavior | Passed by fixed skill contract: primary content language by default, explicit override only, confusion updates caution, unrelated/uncertain preserves |
| TC9–TC11 caution presentation and manual editing | Passed: labeled red underlined detail, empty omission, summary exclusion and manual preview/save |
| TC12–TC13 explicit guarded Apply | Passed: content/caution-only conditional write; stale and trashed cards rejected |
| TC14 discard confirmation | Passed: Cancel/Close/Escape/backdrop share unsaved-change guard |
| TC15 stop and failure preservation | Passed: Apply disabled while responding, stop handles pending turn id and retains last valid draft |
| TC16 artifact and IPC trust boundaries | Passed: exact schema/id/key validation and Renderer string/id whitelist |
| TC17 transient isolation | Passed: independent controller/client with no `ChatController` or conversation store writes |
| TC18 migration and backup | Passed: schema 5→6 empty backfill and supported schema 6 backup; schema 7 rejected |

### Commands Executed

- `npm test` — passed: server 3/3, desktop 394/394.
- `npm run typecheck` — passed for server and desktop.
- `npm run build` — passed for Electron Main/preload and Vite renderer.
- `npm run test:e2e` — passed 2/2 after running Electron outside the filesystem sandbox.
- Focused red→green commands covered repository migration, artifact/skill, controller/IPC and Renderer UI
  slices before the full suite.

### Hypotheses and Decisions

- Requirement validation used the existing learning-library, learning-item-creation, AI-conversation,
  skill-management and read-only detail boundaries. The approved UI direction keeps the current detail
  content as the only draft preview and adds one compact request composer instead of a second pane or
  visible chat transcript.
- The repository uses optimistic concurrency instead of trusting Renderer-held structured fields. The AI
  controller stores the original `updatedAt`; Apply conditionally updates one active row and advances the
  timestamp by at least one millisecond so a same-tick edit cannot accidentally reuse the stale version.
- Stop uses a generation token as well as `turn/interrupt`. This closes the race where the user can stop
  after `turn/start` begins but before Codex returns the turn id; the late id is interrupted and its result
  cannot become the current draft.
- Architectural review found no blocking debt introduced by F51. The existing repeated bundled-skill
  installer/Main wiring becomes more noticeable with a seventh skill and is recorded in
  `skill-management.md` as a possible future registry refactor; it did not justify expanding this feature
  into a new RXX.

### Deferred Items

- Multi-item AI editing, saved edit history and AI editing from read-only practice details are deferred.

### Notes

- Module documents synchronized: `learning-library.md`, `ai-conversation.md`, `skill-management.md` and
  the new `learning-item-editing.md`.
