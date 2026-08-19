---
title: AI 輔助學習項目編修模組
module: learning-item-editing
status: active
last_updated: 2026-08-19
related_implements:
  - F51-ai-assisted-learning-item-editing
  - F52-edit-learning-items-from-completed-review
  - F55-edit-learning-items-from-graded-review
  - F59-add-learning-item-representative-image
  - F65-standardize-learning-item-example-support
---

# AI 輔助學習項目編修模組

## 1. Purpose

本模組讓使用者在具備編修能力的 active **學習項目詳情**中，以簡單多輪需求請 AI
補充或調整目前項目的 Markdown 與**學習注意事項**；入口包含生詞庫、已批改的複習
試卷與複習完成頁。例如「我常把 `impair` 誤解成 `repair`」會讓 AI 在原內容中加入
差異說明，並把最關鍵的辨別方法濃縮為醒目的注意事項。

編修過程只更新畫面中的暫態草稿。使用者必須明確按下「Apply edit」後，Main process
才會把 Markdown 與注意事項一起寫入 SQLite；取消、關閉、停止、失敗或無效 artifact
都不會保存半成品。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- active 生詞庫、已批改複習試卷及複習完成頁詳情顯示「Edit with AI」；垃圾桶與
  整合造句的唯讀詳情不顯示。
- 詳情內容本身就是草稿預覽，底部只展開一個多行需求欄、簡短狀態、Send、Stop、
  Cancel 與 Apply edit，不建立第二個預覽或可見聊天紀錄。
- 同一暫態 Codex thread 可多輪編修，每輪都以最新有效草稿為基礎。
- AI 只能回傳完整 `markdownContent` 與 `cautionNote`；標題、類型、語言、CEFR、
  sense、代表圖片、狀態與複習資料不在 artifact schema 中。
- 新說明預設沿用目前 Markdown 的主要解釋語言；只有使用者明確要求才切換語言。
- 每次有效 AI 編修都會把完整 `Examples` 小節正規化：例句使用學習項目語言、粗體
  目標詞，並在每句後固定加入一行以 `→` 開頭、不含文字標籤的例句輔助說明；主要
  解釋語言與項目語言相同時使用簡單同語言改寫，不同時使用主要解釋語言翻譯。
- 易混淆、誤解或辨別需求會更新注意事項；一般補例句／潤飾與不確定情況保留原值。
- 注意事項為可留空純文字，在完整詳情中以 `Note`、紅字與紅色底線顯示；清單摘要
  與未作答題面不載入或顯示。
- 已變更草稿在 Cancel、Escape、關閉鈕或遮罩關閉前顯示放棄確認。
- 回覆中可停止；即使停止發生於 `turn/start` 尚未回傳 id 前，也會在 id 到達後補送
  `turn/interrupt`，且不覆蓋上一版有效草稿。
- 套用使用 `itemId + baseUpdatedAt + active` optimistic guard；正式項目已改變或進入
  垃圾桶時拒絕覆寫。

## 3. Module Boundary

### LearningItemEditController

`LearningItemEditController` 是 Electron Main 擁有的單工作階段暫態邊界，負責：

- 由 repository 依 item id 讀取目前 active 項目；Renderer 不提供正式內容。
- 建立獨立 `SpawnedCodexAppServerClient`、唯讀 thread 與固定 skill instructions。
- 只保留 session id、原始 item／`updatedAt`、最新有效草稿、thread／turn id 與狀態。
- 每輪把目前標題、sense、受信任的學習項目語言、最新 Markdown、注意事項及本次需求
  組成 bounded payload。
- 聚合完成訊息後，使用固定 parser 驗證完整 artifact，通過後才原子取代畫面草稿。
- 協調停止競態、120 秒逾時、Codex exit、套用與放棄清理。

它不使用 `ChatController` 或 `LocalChatConversationStore`，不發布 `ChatSnapshot`，也不把
編修 thread 加入全域 AI 對話清單。

### Artifact Boundary

`parseLearningItemEditResult()` 只接受一個完整 fenced
`learning-item-edit-result` JSON block，且 key 必須精確為：

- `version`
- `kind`
- `sessionId`
- `itemId`
- `markdownContent`
- `cautionNote`

Parser 會拒絕錯誤 session／item id、空 Markdown、缺失或額外 key、錯誤版本、非字串
注意事項與 block 外的尾隨輸出。串流文字不直接進入學習項目。

### Repository Apply Boundary

`LocalLearningLibrary.applyAiEdit()` 只執行受限的 conditional update：

```text
UPDATE learning_items
SET markdown_content, caution_note, updated_at
WHERE id = itemId
  AND status = active
  AND updated_at = baseUpdatedAt
```

它不接收或寫入其他學習項目欄位，也不新增 review event 或修改 FSRS schedule。
代表圖片由獨立立即 mutation 管理；人工 Save 與 AI Apply 都保留既有 BLOB。AI 編修中
不顯示圖片 Add／Replace／Remove，以避免 `updatedAt` guard 與並行 mutation 衝突。

### Electron IPC and Preload

Renderer 只能使用 `window.readerDesktop.learning.aiEdit` 的五個操作：

- `start(itemId)`
- `send(sessionId, request)`
- `stop(sessionId)`
- `apply(sessionId)`
- `discard(sessionId)`

IPC 只接受非空 id 與需求字串。Renderer 不能傳入 item 內容、artifact、skill 名稱／路徑、
prompt、Codex method、working directory、sandbox、工具或權限。

### Renderer

`LearningItemDialog` 負責：

- 依 editable／read-only capability 顯示編修入口，並把是否可移入垃圾桶當作獨立能力；
  已批改但尚未確認排程的試卷可編修、不可移入垃圾桶。
- 用 Controller snapshot 的 draft 覆蓋原詳情 Markdown 與注意事項顯示。
- 在底部呈現單一 composer、狀態與必要操作。
- 回覆中停用並行送出與 Apply，Stop 後忽略已失效的舊 send promise。
- 有效變更離開前開啟具名 `alertdialog`；選擇 Keep editing 時保留全部草稿。
- Apply 成功後使用正式 repository 回傳值刷新詳情與清單。

## 4. Shared Data

| Type / Field | Meaning |
|---|---|
| `LearningItem.cautionNote` | 可留空的學習注意事項純文字 |
| `UpdateLearningItemInput.cautionNote` | 人工編輯時一併保存的注意事項 |
| `LearningItemEditSnapshot` | session／item id、phase、最新草稿、是否有變更與簡短狀態 |
| `LearningItemEditDesktopApi` | start／send／stop／apply／discard 的窄 bridge |
| `learning-item-edit-result` | AI 可回傳的唯一完整編修 artifact |

`LearningItemSummary` 刻意不含 `markdownContent` 或 `cautionNote`，避免清單批次預載完整
內容及醒目提醒；它也不含代表圖片。

## 5. Persistence and Lifecycle

- SQLite schema 6 在 `learning_items` 新增
  `caution_note TEXT NOT NULL DEFAULT ''`；既有項目 migration 後為空字串。
- 人工編輯與 AI Apply 都能保存注意事項；新建立項目仍以空字串起始。
- schema 7 的 nullable 代表圖片 BLOB 不在 edit artifact 或 `UpdateLearningItemInput` 中；
  人工 Save／AI Apply 不覆寫它，獨立圖片 mutation 更新 `updatedAt` 後會讓過期 AI Apply
  依既有 optimistic guard 安全失敗。
- AI session、需求、Codex thread id、未套用草稿與編修歷史不寫入資料庫或 JSON store。
- Apply、Discard、詳情無變更關閉、啟動另一項編修或 App quit 都會關閉目前 edit client。
- 完整資料備份保存 SQLite 內已套用的注意事項；暫態編修資料不進入備份。

## 6. AI Isolation and Language Rules

- Thread 使用 `approvalPolicy: never`、read-only sandbox，並停用 skill catalog、Codex
  bundled skills、plugins、apps、memories 與 web search。
- 唯一注入的 App skill 是 `edit-learning-item`，其安裝路徑與 instructions 由 Main 固定。
- 學習項目與需求都標示為不可信任資料，不能覆蓋 developer contract。
- AI 不執行工具、不讀寫檔案、不存取網路或 SQLite。
- Main 依最新 Markdown 判定 English／Traditional Chinese／Japanese，並以
  `primaryExplanationLanguage` 明確交給 AI；需求本身使用的語言不構成切換指令。
- Main 另以 `learningItemLanguage` 傳入正式項目的語言 enum，讓 skill 可靠決定例句本體
  與例句輔助說明應走同語言改寫或跨語言翻譯分支。
- 原文詞彙、IPA、例句等需要保留的片段不因主要解釋語言而被強制翻譯。

## 7. UI and Accessibility

- 注意事項固定出現在一般 Markdown 前，並同時使用文字標示、紅色與底線，不只依賴色彩。
- 空注意事項不建立空白區塊；人工 editor 提供可留空 textarea 與即時預覽。
- AI composer 留在同一詳情底部，避免 split view、對話氣泡與模型控制增加認知負擔。
- 放棄確認使用 `role="alertdialog"`、具名標題與 Keep editing／Discard changes 控制。
- Close、Escape 與 backdrop 都走同一離開守衛；最上層確認可先用 Escape 關閉。
- 狀態使用 `role="status"`，錯誤使用既有 `role="alert"`。

## 8. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/edit-learning-item/SKILL.md` | bounded 編修、語言、注意事項與 artifact 契約 |
| `apps/desktop/src/shared/learning-contracts.ts` | 注意事項、snapshot 與 desktop API 型別 |
| `apps/desktop/src/main/learning-item-artifacts.ts` | 嚴格 artifact parser |
| `apps/desktop/src/main/learning-item-edit-controller.ts` | 暫態 thread／turn、草稿、停止、套用與清理 |
| `apps/desktop/src/main/learning-item-edit-ipc.ts` | 五個 IPC 白名單與輸入驗證 |
| `apps/desktop/src/main/learning-library-service.ts` | schema 7、圖片獨立 mutation 與 guarded AI apply |
| `apps/desktop/src/main/bundled-skill.ts` | runtime skill 安裝 |
| `apps/desktop/src/preload/preload.ts` | `learning.aiEdit` bridge |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx` | 精簡 AI composer、草稿預覽、停止與放棄確認 |
| `apps/desktop/src/renderer/styles.css` | 注意事項與 composer 樣式 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `learning-item-edit-skill.test.ts` | bounded、語言、注意事項與固定結果契約 |
| `learning-item-artifacts.test.ts` | 成功解析、錯誤 id 與額外欄位拒絕 |
| `learning-item-edit-controller.test.ts` | 最小 AI scope、暫態草稿、明確 Apply 與停止競態 |
| `learning-item-edit-ipc.test.ts` | id／需求白名單及 forged payload 拒絕 |
| `learning-library-service.test.ts` | schema 7 migration、圖片保存、注意事項保存、guarded Apply／stale／trash 拒絕 |
| `learning-library-workspace.test.tsx` | 顯示、人工編輯、精簡 AI 草稿、明確 Apply、停止、放棄確認與唯讀邊界 |
| `SpacedReviewWorkspace.test.tsx` | 已批改試卷與完成頁的 AI 編修、狀態保留及垃圾桶能力邊界 |
| `data-backup-service.test.ts` | schema 7 圖片 backup 相容與未來版本拒絕 |
| `desktop.spec.ts` | production skill 安裝與 preload 子 API 白名單 |

最近驗證（2026-08-10）：

- Server Vitest：3/3 passed。
- Desktop Vitest：489/489 passed。
- TypeScript typecheck：passed。
- Production build：passed。
- Electron Playwright E2E：3/3 passed。

## 10. Known Limitations and Follow-up

- 一次只編修一個 active 項目；比較詞不會連帶修改其他卡片。
- 不保存 prompt、草稿版本或 AI 編修歷史，也不提供 undo／rollback。
- 不讓使用者選擇模型、推理強度、輸出長度或專用語言設定。
- App 內建 skill 數量增加後，installer 與 Main wiring 的重複修改點可另以 RXX 評估 registry；
  本次未擴張 F51 範圍。

## 11. Related Documents

- `CONTEXT.md`
- `documents/implements/F51-ai-assisted-learning-item-editing.md`
- `documents/implements/F59-add-learning-item-representative-image.md`
- `documents/modules/learning-library.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/skill-management.md`
- `documents/modules/data-backup.md`
