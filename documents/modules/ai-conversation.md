---
title: Codex AI 對話與帳戶狀態模組
module: ai-conversation
status: active
last_updated: 2026-07-21
related_implements:
  - F05-ai-reading-range-markers
  - F07-codex-ai-conversation
  - F08-compact-markdown-chat-messages
  - F09-send-reading-segment-on-range-change
  - F10-ai-conversation-management
---

# Codex AI 對話與帳戶狀態模組

## 1. Purpose

本模組以使用者本機既有的 Codex／ChatGPT 登入狀態提供 **Codex AI 執行層**，讓右側 **AI 對話面板**建立、保存、切換及移除全域 **AI 對話**，並進行多輪串流互動；左側窄欄顯示真實連線、帳戶與五小時／每週帳戶共用額度。

閱讀頁的 AI 上下文只包含產品層明確組裝的書籍名稱、章節名稱與目前 **閱讀區段**；本模組不讀取整章、整本 EPUB 或 Renderer 任意指定的檔案。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- Electron Main 啟動 `codex app-server`，完成 initialize／initialized／account/read 握手。
- 自動沿用本機 Codex／ChatGPT 登入狀態，不讀取 OpenAI API key。
- 顯示 disconnected、connecting、ready、auth-required 與 error 連線階段。
- 依 300 與 10,080 分鐘視窗辨識五小時與每週額度；缺值、載入中與確實 0% 保持不同語意。
- 合併 `account/rateLimits/updated` 的 partial live update，不建立 AI turn。
- 空白新對話送出第一個問題後才建立產品對話與 Codex thread；後續追問在相同 thread 建立新 turn。
- 右側面板可開啟跨書籍共用的全域對話清單、建立新對話、切換過去對話及確認移除。
- 每筆對話保存產品對話 id、Codex thread id、標題、時間、來源摘要及顯示訊息；重啟恢復上次查看的對話。
- 延續過去對話時使用 `thread/resume` 恢復相同 thread；移除時使用 `thread/archive`，本機保存失敗會嘗試 `thread/unarchive` 回滾。
- 第一次針對非空閱讀區段提問時提供原文；書籍、章節與 START／END 均未改變的後續追問不重傳相同原文，來源或範圍改變後才重新提供一次。
- assistant delta 即時累加，item completed 校正最終文字，turn completed 解除 busy。
- 同一 thread 不允許並行 turn，包含第一次 thread 尚在建立的時間窗。
- 對話清單與訊息以原子檔案替換方式保存在 Electron user data；損壞資料不會被空資料覆寫，殘留 streaming 訊息重啟後正規化為 failed。
- 對話訊息不顯示占寬的「你／AI」角色標籤；使用者訊息以靠右淡色氣泡呈現，AI 回覆以滿寬正文呈現，並保留輔助技術可辨識的角色語意。
- 使用安全的 Markdown Renderer 呈現 CommonMark 與 GitHub Flavored Markdown；原始 HTML 不會插入 DOM，表格與程式碼在窄側欄中可水平捲動。
- 左側窄欄狀態卡顯示 Codex、右上角連線標籤、單行省略信箱，以及上下排列的五小時／每週額度；完整信箱、帳戶類型與重置時間保留於提示文字及無障礙名稱。
- 「設定」目前是無副作用的空按鈕，不提供模型或推理強度設定。

## 3. Module Boundary

### Codex transport

`SpawnedCodexAppServerClient` 只負責：

- 啟動與終止 `codex app-server` 子程序。
- 一行一個 JSON 的 stdin／stdout 傳輸。
- 區分 request response 與 server notification。
- 管理 request id、一般逾時、thread/start 獨立逾時及程序 exit。
- 解析最小 account/read 契約。

它不理解 EPUB、閱讀區段、畫面狀態或對話呈現。

### Conversation controller

`ChatController` 負責：

- 連線階段、帳戶、額度、全域對話集合、目前對話、thread、active turn 與訊息投影。
- Codex thread／turn 生命週期與串流 notification 投影。
- 新對話、切換、恢復、封存與管理操作互斥。
- 把產品層提供的結構化 context 組成單次 Codex 文字 input。
- 以完整、可複製的 `ChatSnapshot` 通知上層。
- 關閉時解除 listeners、拒絕 pending request 並終止子程序。

Controller 不解析 EPUB，也不決定閱讀區段邊界。

### Conversation store

`LocalChatConversationStore` 負責：

- 驗證並載入 LingoShelf 自有的全域對話資料，不匯入其他 Codex／ChatGPT 對話。
- 以暫存檔加原子替換保存對話集合與上次選取狀態。
- 讀取時把未完成的 streaming 訊息正規化為 failed。
- 遇到損壞資料時保留原檔並回報錯誤，不自動覆寫。

### Electron IPC and Preload

- `chat:get-state`、`chat:connect`、`chat:send`、`chat:new`、`chat:select` 與 `chat:remove` 是唯一 Renderer 可呼叫的 AI IPC。
- `chat:state-changed` 只向 Renderer 發送完整型別化 snapshot。
- Preload 將這些能力收斂於 `window.readerDesktop.chat`。
- Renderer 不能指定任意 Codex method、工作目錄、approval、sandbox、process 或工具設定。

### Renderer

- 訂閱並呈現 `ChatSnapshot`，不自行模擬已連線、帳戶或額度資料。
- 從目前模式、選取書籍、章節與 `extractReadingSegment()` 組裝 `SendChatMessageInput`。
- 以 `bookId + chapterId + start + end` 辨識目前 AI 對話最近成功提供的閱讀區段；bridge 拒絕送出時不更新此識別。
- 空閱讀區段只送出一般問題，不使用整章 fallback。
- 顯示處理中、需要登入、連線失敗與額度不可用狀態。
- 以安全的 Markdown 元件呈現 user／assistant 訊息，並在串流尚無文字時保留「…」占位。
- 在右側面板的對話內容與全域清單之間切換，顯示對話標題、最近來源及更新時間。
- AI 回覆與範圍標籤狀態分離；送出或完成訊息不推進 START／END。

## 4. Shared Data

### ChatSnapshot

| Field | Meaning |
|---|---|
| `connection` | Codex 連線階段 |
| `connectionDetail` | 可供 UI 顯示或提示的狀態細節 |
| `account` | 真實帳戶 type 與可選 email；未登入或失敗時為 null |
| `allowance` | 五小時／每週額度、載入階段與細節 |
| `threadId` | 目前 AI 對話對應的 Codex thread id；空白新對話時為 null |
| `activeTurnId` | 目前回答識別碼；建立中使用內部 starting 狀態，閒置時為 null |
| `messages` | 目前 AI 對話的 user／assistant 訊息及 streaming／completed／failed 狀態 |
| `conversations` | 依最近更新排序的全域對話摘要，不包含完整訊息複本 |
| `activeConversationId` | 目前選取的產品對話 id；空白新對話時為 null |
| `managementBusy` | 封存等管理操作是否進行中 |
| `conversationError` | 本機保存、恢復或移除對話的可顯示錯誤 |

### SendChatMessageInput

- `text`：使用者在 AI 對話面板輸入的問題。
- `context.bookTitle`：可選，目前書籍名稱。
- `context.chapterTitle`：可選，目前章節名稱。
- `context.readingSegment`：可選，只能來自 `extractReadingSegment()` 的非空輸出。

## 5. Connection and Allowance Flow

```text
App ready
  → Electron Main 建立 ChatController
  → SpawnedCodexAppServerClient 啟動 codex app-server
  → initialize request
  → initialized notification
  → account/read
  → 無帳戶：auth-required
  → 有帳戶：ready + allowance loading
  → account/rateLimits/read
  → 依 windowDurationMins 正規化五小時／每週
  → ChatSnapshot 經 IPC 推送 Renderer
```

Controller 在帳戶成功、額度仍讀取的短暫時間明確發布 loading，UI 顯示「取得中…」，不會把未完成讀取誤顯示成「無法取得」。

## 6. Conversation Flow

1. Renderer 驗證 Codex ready、輸入非空且沒有 active turn。
2. 閱讀模式以 `extractReadingSegment()` 取得目前非空區段，並以書籍、章節及 START／END 組成區段識別。
3. 該識別尚未成功提供時附上書籍、章節與區段原文；與最近成功提供的識別相同時只送使用者問題。其他模式或空區段不附 EPUB 原文。
4. Controller 在任何 await 前先進入 starting，封鎖第二個並行 send 及對話管理操作。
5. 空白新對話以固定的唯讀、無工具設定建立 thread，再建立本機產品對話；過去對話則以 `thread/resume` 恢復既有 thread。
6. Controller 保存畫面用的純使用者問題，另把本次實際收到的有限閱讀 context 組成 Codex input，並更新該對話的最近來源摘要。
7. `turn/start` 成功後 Renderer 才把本次區段識別記為已提供；bridge 拒絕時保留待提供狀態。
8. 後續 delta／completed notification 更新同一 assistant 訊息並持久保存；turn completed 後解除 busy，使用者才能追問、切換、新建或移除對話。

## 7. Runtime and Safety Constraints

- Codex 子程序只由 Electron Main 管理，Renderer 不可直接存取。
- thread 使用 `approvalPolicy: never`、read-only sandbox，停用 skills、plugins、apps、memories 與 web search。
- working directory 固定為 Electron user data 下的 `codex-runtime`，Renderer 不能指定。
- account allowance 是帳戶共用狀態，不代表 token、金額、模型或單一 thread 額度。
- notification 必須先驗證 thread id；其他 thread 的訊息不得進入目前對話。
- item completed 是 canonical 最終文字，必須取代而非重複附加 delta。
- LingoShelf 對話索引只收錄本產品建立的 thread；不把使用者帳戶中的其他 Codex 對話混入清單。
- 對話資料只存本機，不提供跨裝置同步；空白新對話在第一則訊息前不持久化。
- `apps/server` 的 Fastify `AiGateway` 仍維持 unconfigured；本機 Codex 生命週期不由桌面與 HTTP server 重複管理。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/chat-contracts.ts` | Main／Preload／Renderer 共用的帳戶、額度、訊息、snapshot 與 context 型別 |
| `apps/desktop/src/main/codex-app-server-client.ts` | Codex 子程序、JSONL transport、request timeout 與 account 解析 |
| `apps/desktop/src/main/chat-controller.ts` | 連線、額度、thread／turn、串流訊息與 context 組裝 |
| `apps/desktop/src/main/chat-conversation-store.ts` | 全域對話資料驗證、載入、原子保存與重啟正規化 |
| `apps/desktop/src/main/chat-ipc.ts` | chat IPC 白名單與輸入驗證 |
| `apps/desktop/src/main/main.ts` | 建立 Controller、發布 snapshot、管理 app 關閉清理 |
| `apps/desktop/src/preload/preload.ts` | 暴露窄化的 `readerDesktop.chat` |
| `apps/desktop/src/renderer/App.tsx` | AI 對話面板、閱讀區段 context 與左側狀態卡 |
| `apps/desktop/src/renderer/styles.css` | 對話與窄欄狀態卡樣式 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/main/chat-conversation-store.test.ts` | 原子保存、重啟 streaming 正規化與損壞資料隔離 |
| `apps/desktop/src/main/chat-controller.test.ts` | initialize、帳戶／額度、多輪串流、全域對話建立／切換／恢復／移除、失敗回滾、並行保護與 process close |
| `apps/desktop/src/main/chat-ipc.test.ts` | chat IPC 白名單、對話 id、結構化 context 與惡意格式拒絕 |
| `apps/desktop/src/renderer/App.test.tsx` | 狀態卡、bridge send、閱讀區段裁切與去重、全域對話清單／切換／確認移除、安全 Markdown／GFM 與串流占位 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | Electron 啟動、對話管理入口、七項 chat bridge 白名單與 Node 隔離 |

最近驗證（2026-07-21）：

- Server Vitest：3/3 passed。
- Desktop Vitest：81/81 passed。
- Electron Playwright：2/2 passed。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。
- 真實本機 Codex：帳戶連線成功；使用者手動確認五小時與每週額度可取得。

## 10. Known Limitations and Follow-up

- 不提供對話搜尋、篩選、釘選、重新命名、匯出、垃圾桶或復原。
- 對話只保存在本機，不提供帳戶或跨裝置同步。
- 不提供模型、推理強度或 API key 設定；「設定」按鈕目前無副作用。
- 不提供內嵌 Codex／ChatGPT 登入或帳戶切換。
- Markdown 程式碼區塊目前不提供語法高亮。
- 尚未實作區段解析、標記說明、區段練習、生詞庫與 Anki 式複習的 AI 流程。
- 本機 GUI 環境必須能找到已安裝的 `codex` 可執行檔。

## 11. Related Documents

- `CONTEXT.md`
- `documents/modules/reading-range.md`
- `documents/implements/F05-ai-reading-range-markers.md`
- `documents/implements/F07-codex-ai-conversation.md`
- `documents/implements/F08-compact-markdown-chat-messages.md`
- `documents/implements/F09-send-reading-segment-on-range-change.md`
- `documents/implements/F10-ai-conversation-management.md`

變更 Codex protocol、snapshot、上下文邊界、Renderer bridge、狀態卡、訊息呈現或對話生命週期時，必須同步更新本文件與相關 FXX 實作紀錄。
