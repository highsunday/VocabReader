---
title: Codex AI 對話與帳戶狀態模組
module: ai-conversation
status: active
last_updated: 2026-07-21
related_implements:
  - F05-ai-reading-range-markers
  - F07-codex-ai-conversation
  - F08-compact-markdown-chat-messages
---

# Codex AI 對話與帳戶狀態模組

## 1. Purpose

本模組以使用者本機既有的 Codex／ChatGPT 登入狀態提供 **Codex AI 執行層**，讓右側 **AI 對話面板**進行單一 session 內的多輪串流對話，並在左側窄欄顯示真實連線、帳戶與五小時／每週帳戶共用額度。

閱讀頁的 AI 上下文只包含產品層明確組裝的書籍名稱、章節名稱與目前 **閱讀區段**；本模組不讀取整章、整本 EPUB 或 Renderer 任意指定的檔案。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- Electron Main 啟動 `codex app-server`，完成 initialize／initialized／account/read 握手。
- 自動沿用本機 Codex／ChatGPT 登入狀態，不讀取 OpenAI API key。
- 顯示 disconnected、connecting、ready、auth-required 與 error 連線階段。
- 依 300 與 10,080 分鐘視窗辨識五小時與每週額度；缺值、載入中與確實 0% 保持不同語意。
- 合併 `account/rateLimits/updated` 的 partial live update，不建立 AI turn。
- 第一次提問建立一個 thread，後續追問在相同 thread 建立新 turn。
- assistant delta 即時累加，item completed 校正最終文字，turn completed 解除 busy。
- 同一 thread 不允許並行 turn，包含第一次 thread 尚在建立的時間窗。
- 右側 AI 對話面板顯示 session 內訊息；關閉應用程式後不保存對話。
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

- 連線階段、帳戶、額度、thread、active turn 與訊息的記憶體狀態。
- Codex thread／turn 生命週期與串流 notification 投影。
- 把產品層提供的結構化 context 組成單次 Codex 文字 input。
- 以完整、可複製的 `ChatSnapshot` 通知上層。
- 關閉時解除 listeners、拒絕 pending request 並終止子程序。

Controller 不解析 EPUB，也不決定閱讀區段邊界。

### Electron IPC and Preload

- `chat:get-state`、`chat:connect` 與 `chat:send` 是唯一 Renderer 可呼叫的 AI IPC。
- `chat:state-changed` 只向 Renderer 發送完整型別化 snapshot。
- Preload 將這些能力收斂於 `window.readerDesktop.chat`。
- Renderer 不能指定任意 Codex method、工作目錄、approval、sandbox、process 或工具設定。

### Renderer

- 訂閱並呈現 `ChatSnapshot`，不自行模擬已連線、帳戶或額度資料。
- 從目前模式、選取書籍、章節與 `extractReadingSegment()` 組裝 `SendChatMessageInput`。
- 空閱讀區段只送出一般問題，不使用整章 fallback。
- 顯示處理中、需要登入、連線失敗與額度不可用狀態。
- 以安全的 Markdown 元件呈現 user／assistant 訊息，並在串流尚無文字時保留「…」占位。
- AI 回覆與範圍標籤狀態分離；送出或完成訊息不推進 START／END。

## 4. Shared Data

### ChatSnapshot

| Field | Meaning |
|---|---|
| `connection` | Codex 連線階段 |
| `connectionDetail` | 可供 UI 顯示或提示的狀態細節 |
| `account` | 真實帳戶 type 與可選 email；未登入或失敗時為 null |
| `allowance` | 五小時／每週額度、載入階段與細節 |
| `threadId` | 本 session 多輪對話識別碼；尚未提問時為 null |
| `activeTurnId` | 目前回答識別碼；建立中使用內部 starting 狀態，閒置時為 null |
| `messages` | session 內 user／assistant 訊息及 streaming／completed／failed 狀態 |

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
2. 閱讀模式以 `extractReadingSegment()` 取得目前非空區段；其他模式或空區段不附 EPUB 原文。
3. Controller 在任何 await 前先進入 starting，封鎖第二個並行 send。
4. 尚無 thread 時以固定的唯讀、無工具設定建立 thread。
5. Controller 保存畫面用的純使用者問題，另把有限閱讀 context 組成 Codex input。
6. `turn/start` 回傳 turn id；後續 delta／completed notification 更新同一 assistant 訊息。
7. turn completed 後解除 busy，使用者才能追問；thread id 保持不變。

## 7. Runtime and Safety Constraints

- Codex 子程序只由 Electron Main 管理，Renderer 不可直接存取。
- thread 使用 `approvalPolicy: never`、read-only sandbox，停用 skills、plugins、apps、memories 與 web search。
- working directory 固定為 Electron user data 下的 `codex-runtime`，Renderer 不能指定。
- account allowance 是帳戶共用狀態，不代表 token、金額、模型或單一 thread 額度。
- notification 必須先驗證 thread id；其他 thread 的訊息不得進入目前對話。
- item completed 是 canonical 最終文字，必須取代而非重複附加 delta。
- 對話、thread id 與訊息只存記憶體；重啟應用程式後清空。
- `apps/server` 的 Fastify `AiGateway` 仍維持 unconfigured；本機 Codex 生命週期不由桌面與 HTTP server 重複管理。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/chat-contracts.ts` | Main／Preload／Renderer 共用的帳戶、額度、訊息、snapshot 與 context 型別 |
| `apps/desktop/src/main/codex-app-server-client.ts` | Codex 子程序、JSONL transport、request timeout 與 account 解析 |
| `apps/desktop/src/main/chat-controller.ts` | 連線、額度、thread／turn、串流訊息與 context 組裝 |
| `apps/desktop/src/main/chat-ipc.ts` | chat IPC 白名單與輸入驗證 |
| `apps/desktop/src/main/main.ts` | 建立 Controller、發布 snapshot、管理 app 關閉清理 |
| `apps/desktop/src/preload/preload.ts` | 暴露窄化的 `readerDesktop.chat` |
| `apps/desktop/src/renderer/App.tsx` | AI 對話面板、閱讀區段 context 與左側狀態卡 |
| `apps/desktop/src/renderer/styles.css` | 對話與窄欄狀態卡樣式 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/main/chat-controller.test.ts` | initialize 順序、帳戶、額度、loading、partial update、0%／缺值、多輪串流、thread 重用、錯誤、登入、並行保護與 process close |
| `apps/desktop/src/main/chat-ipc.test.ts` | chat IPC 白名單、結構化 context 與惡意格式拒絕 |
| `apps/desktop/src/renderer/App.test.tsx` | 真實 snapshot 狀態卡、窄欄帳戶呈現、空設定按鈕、bridge send、閱讀區段裁切、一般對話 fallback、精簡角色排版、安全 Markdown／GFM 與串流占位 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | Electron 啟動、狀態卡、設定按鈕、四項 chat bridge 白名單與 Node 隔離 |

最近驗證（2026-07-21）：

- Server Vitest：3/3 passed。
- Desktop Vitest：67/67 passed。
- Electron Playwright：2/2 passed。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。
- 真實本機 Codex：帳戶連線成功；使用者手動確認五小時與每週額度可取得。

## 10. Known Limitations and Follow-up

- 不保存或恢復跨次啟動對話。
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

變更 Codex protocol、snapshot、上下文邊界、Renderer bridge、狀態卡、訊息呈現或對話生命週期時，必須同步更新本文件與相關 FXX 實作紀錄。
