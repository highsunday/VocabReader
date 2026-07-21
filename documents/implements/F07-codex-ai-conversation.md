---
author: Codex
date: 2026-07-21
title: 導入 Codex AI 對話與帳戶狀態顯示
uuid: e543d4aed4954ee99aa6fd7d459a5a7c
version: 1.0.0
status: implemented
---

# Feature Specification - Codex AI 對話與狀態卡

## 1. Feature Overview

把目前僅在畫面內加入使用者訊息的假對話，替換為可實際連線的 **Codex AI 執行層**。應用程式沿用本機既有的 Codex／ChatGPT 登入狀態，讓右側 **AI 對話面板**能建立單一多輪對話、串流顯示回答，並在閱讀章節時只把目前 **閱讀區段**作為書籍上下文。

左側欄底部新增一個「設定」按鈕與 Codex 狀態卡。設定按鈕在本階段只提供可辨識的按鈕外觀，不開啟頁面或變更設定；狀態卡必須連動真實 Codex 連線，顯示連線狀態、帳戶識別資訊、五小時與每週帳戶共用額度，以及可取得的重置時間。

本功能參考同技術棧範例：`reference-examples/import/codex-ai-chat/`。範例的 Codex transport、連線與串流狀態機是主要實作參考，目標專案既有的 React 閱讀器、Preload 安全邊界及閱讀區段模型則是整合目標。

## 2. Requirements (User Story)

- **As a** 使用 LingoShelf 閱讀英文 EPUB 的使用者
- **I want** 在閱讀器內直接向 Codex 詢問目前閱讀區段，並看見實際帳戶與使用額度狀態
- **So that** 我不需要離開閱讀流程就能獲得有上下文的英文學習協助，也能知道 AI 是否可用

## 3. Acceptance Criteria

- **Scenario 1：啟動後連線本機 Codex 帳戶**
  - **Given** 裝置已安裝可執行的 Codex CLI，且本機已有有效登入狀態
  - **When** 桌面應用程式啟動
  - **Then** 受信任的桌面主程序完成 Codex 初始化與帳戶讀取，AI 對話面板可送出訊息，左側狀態卡顯示「已連線」及真實帳戶識別資訊

- **Scenario 2：建立並延續多輪 AI 對話**
  - **Given** Codex 已連線，且目前沒有進行中的回答
  - **When** 使用者送出第一個問題，再於回答完成後送出追問
  - **Then** 系統只建立一個 Codex thread，兩次提問建立各自的 turn 並使用相同 thread id，右側 AI 對話面板保留兩輪內容

- **Scenario 3：串流呈現 AI 回答**
  - **Given** 使用者已成功送出問題
  - **When** Codex 逐段回傳 assistant delta、最終訊息與 turn 完成通知
  - **Then** AI 對話面板逐步累加回答、以最終訊息校正顯示內容，並在 turn 完成後解除處理中狀態

- **Scenario 4：限制閱讀上下文範圍**
  - **Given** 使用者正在閱讀章節，且目前閱讀區段只涵蓋章節的一部分
  - **When** 使用者從 AI 對話面板送出問題
  - **Then** 傳給 Codex 的內容包含使用者問題、目前書籍與章節識別資訊，以及 `extractReadingSegment()` 取得的區段原文；不得包含起點之前、終點之後或其他章節的 EPUB 原文

- **Scenario 5：沒有可用閱讀區段時仍可對話**
  - **Given** 使用者位於書籍總覽、Anki 複習畫面，或目前閱讀區段沒有文字
  - **When** 使用者送出一般問題
  - **Then** 系統只傳送使用者問題及可用的畫面識別資訊，不自行加入整章或整本書內容，且 AI 對話仍可進行

- **Scenario 6：顯示真實 Codex 帳戶狀態**
  - **Given** Codex 帳戶讀取成功
  - **When** 左側欄顯示 Codex 狀態卡
  - **Then** 狀態卡顯示 Codex 名稱、連線狀態及可取得的登入信箱；窄欄以單行省略信箱呈現，完整信箱與帳戶類型保留於提示文字及無障礙名稱，不得使用固定示意帳戶資料

- **Scenario 7：顯示五小時與每週額度**
  - **Given** Codex 已連線且回傳帳戶 rate limits
  - **When** 初次取得額度或收到 live rate-limit update
  - **Then** 狀態卡依 300 分鐘與 10,080 分鐘視窗，以上下兩列分別顯示五小時及每週剩餘百分比；重置時間保留於提示文字與無障礙名稱，不依 primary／secondary 欄位順序判定視窗

- **Scenario 8：區分額度缺值與用盡**
  - **Given** 某個額度視窗不存在、暫時無法讀取，或剩餘額度確實為 0%
  - **When** 狀態卡顯示該額度
  - **Then** 缺值顯示「無法取得」，載入中顯示載入狀態，確實用盡則顯示 0%；缺值不得偽裝成 0%

- **Scenario 9：顯示登入與連線失敗狀態**
  - **Given** Codex CLI 不存在、尚未登入、程序退出、初始化逾時或回傳錯誤
  - **When** 應用程式嘗試連線或既有連線中斷
  - **Then** AI 對話面板與左側狀態卡顯示可理解的「需要登入」或「連線失敗」狀態，停用無法完成的送出操作，且不顯示假連線或假額度資料

- **Scenario 10：避免同一對話同時執行兩個 turn**
  - **Given** AI 正在回覆上一個問題
  - **When** 使用者嘗試再次送出訊息
  - **Then** 送出操作保持停用或被安全拒絕，不建立第二個並行 turn；上一個回答完成後才可再次送出

- **Scenario 11：設定按鈕保持空操作**
  - **Given** 左側欄已展開
  - **When** 使用者檢視或點擊「設定」按鈕
  - **Then** 按鈕具有可辨識名稱與按鈕語意，但不開啟設定畫面、不變更模型、不改變推理強度，也不影響 AI 對話與狀態卡

- **Scenario 12：保持安全的 Renderer 邊界**
  - **Given** Renderer 需要取得 AI 狀態或送出訊息
  - **When** Renderer 經由 Preload 與桌面主程序溝通
  - **Then** Renderer 只能呼叫允許的型別化 AI 方法及接收完整狀態快照，不能啟動程序、指定任意 Codex method、工作目錄、approval、sandbox 或工具設定

- **Scenario 13：關閉應用程式時釋放 AI 執行層**
  - **Given** Codex app-server 已啟動，可能仍有等待中的 request
  - **When** 桌面應用程式結束
  - **Then** 系統解除通知監聽、拒絕未完成 request 並終止子程序，不留下由本次應用程式啟動的孤立程序

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 本機帳戶連線 | fake Codex app-server 可完成 initialize 與 account/read | Controller 連線 | 狀態成為 ready，帳戶資料進入 snapshot | Critical |
| TC2 | 多輪 thread 重用 | 已連線且 fake server 可串流回答 | 連續送出問題與追問 | 只呼叫一次 thread/start，兩次 turn/start 共用 thread id | Critical |
| TC3 | 串流與最終文字 | fake server 回傳多段 delta、item completed、turn completed | 送出問題 | 畫面先累加 delta，再以 canonical 最終文字完成回答 | Critical |
| TC4 | 閱讀區段裁切 | 章節起點前、區段內與終點後都有文字 | 在閱讀頁送出問題 | Codex input 只包含 `extractReadingSegment()` 的區段文字 | Critical |
| TC5 | 無區段一般對話 | 位於總覽或區段為空 | 送出問題 | 只傳送問題與可用識別資訊，不傳整章 | High |
| TC6 | 帳戶狀態卡 | fake account/read 回傳 email 與 type | Renderer 收到 snapshot | 顯示真實已連線與窄欄信箱，完整 email／type 可由提示及無障礙名稱取得 | High |
| TC7 | 額度正規化 | primary／secondary 以任意順序回傳 300 與 10,080 分鐘視窗 | 讀取 rate limits | 五小時與每週欄位顯示正確剩餘比例及重置時間 | Critical |
| TC8 | 額度 live update | 初始兩個視窗可用 | 只收到其中一個視窗的更新 | 更新該視窗並保留另一個既有視窗，不建立 AI turn | High |
| TC9 | 缺值與 0% | 一個視窗不存在，另一個 usedPercent 為 100 | 顯示狀態卡 | 不存在者顯示無法取得，用盡者顯示 0% | High |
| TC10 | 需要登入 | account/read 回傳無帳戶且 requiresOpenaiAuth | Controller 連線 | 顯示需要登入，送出不可用 | High |
| TC11 | 程序／協定失敗 | app-server 啟動、逾時或 response 格式失敗 | 嘗試連線 | 顯示連線失敗並保留明確錯誤狀態 | High |
| TC12 | 禁止並行 turn | 第一個 turn 尚未完成 | 再次送出訊息 | 不呼叫第二次 turn/start | High |
| TC13 | 設定空按鈕 | 左側欄已展開 | 點擊設定 | 無設定面板、模型或 effort 狀態變更 | Medium |
| TC14 | 有限 Preload API | 桌面應用程式完成建置 | 檢查 `window.readerDesktop` | 只有 chat snapshot、connect、send 與狀態訂閱等白名單能力，無 raw protocol／process API | Critical |
| TC15 | 關閉清理 | Controller 已連線且有監聽／pending request | 關閉 Controller 或應用程式 | listeners、pending request 與 child process 全部被清理 | High |
| TC16 | 側欄既有行為 | 左右側欄均展開 | 分別摺疊與展開 | 書庫、設定狀態卡與 AI 對話面板維持各自原有摺疊行為 | Medium |

## 5. Implementation Notes

### Reference example alignment

Alignment approach: **same-stack**（TypeScript／Node.js／Electron）。

保留的功能本質：

- 一行一個 JSON 的 request／response／notification 分流。
- `initialize` 成功後送出 `initialized`，再執行 `account/read`。
- request timeout、獨立的 `thread/start` timeout 及 process exit 清理。
- thread id 與 turn id 分開管理；同一對話重用 thread id。
- `item/agentMessage/delta`、`item/completed`、`turn/completed` 的串流投影。
- 依 `windowDurationMins` 正規化五小時與每週額度，並合併 partial live updates。
- Main／Preload／Renderer 之間的有限、型別化 snapshot 邊界。
- fake app-server 測試接縫；驗收先以假程序穩定覆蓋協定流程，不依賴真實帳戶或網路。

依目前專案替換的部分：

- 範例的 vanilla Renderer → 目前 `apps/desktop/src/renderer/App.tsx` 右側 AI 對話面板與左側欄。
- 範例的獨立 `window.codexChat` → 合併到既有 `window.readerDesktop` 的窄化 `chat` 能力。
- 範例的單一文字輸入 → 使用者問題加上產品層組裝的書籍／章節／閱讀區段上下文。
- 範例的任意 working directory → 應用程式管理的 `userData` 子目錄，Renderer 不可指定路徑。
- 範例的模型目錄與推理強度 UI → 本階段移除，使用 Codex server default；左側「設定」按鈕保持空操作。
- 範例的獨立視窗生命週期 → 整合現有主視窗建立與 `before-quit` 清理。

### Context assembly

- 產品層負責組裝 AI context；Codex transport 與 thread/turn 狀態機不能依賴 EPUB 或閱讀區段資料結構。
- 閱讀區段原文必須由既有 `extractReadingSegment(text, range)` 取得，不能在聊天路徑自行重做另一套裁切。
- 傳入的上下文須清楚標示哪些文字是使用者問題、哪些是書籍／章節識別、哪些是目前閱讀區段原文，避免 Codex 把 metadata 當成使用者問題。
- 若區段為空，省略 EPUB 原文；不得以整章作為 fallback。
- AI 對話、回答完成或額度更新都不得移動範圍標籤。

### Runtime and safety

- Codex app-server 只能由 Electron Main 啟動；Renderer 不直接使用 Node.js、child process 或 raw JSON-RPC。
- 本階段不需要 Codex 使用外部工具。應沿用範例的非互動 approval、唯讀 sandbox，以及停用 skills、plugins、apps、memories 與 web search 的隔離設定。
- 同一 Controller 的 `connect()` 應可安全重入，不重複啟動多個 Codex 子程序。
- 首次訊息建立 thread 前先進入 busy，避免 delta 早於 `thread/start` promise 返回時遺失。
- `item/completed` 是 assistant 訊息的 canonical 最終文字，應取代而非重複附加既有 delta。
- 額度屬於帳戶共用狀態，不是 token、金額、模型額度或單一 thread 額度；UI 文案不得誤導。
- Reset timestamp 依使用者本機語系與時區顯示；無有效 timestamp 時不顯示虛構時間。

### Architecture alignment

- 此 MVP 以本機 Electron 桌面主程序承接 Codex app-server，因為登入狀態與 CLI 都位於本機受信任環境。
- `apps/server` 目前的 `UnconfiguredAiGateway` 與 HTTP AI routes 不作為本次桌面對話傳輸路徑；完整跨平台／遠端 AI gateway 留待另案設計，避免同一個本機 Codex process 被桌面與 Fastify 重複管理。
- 對話與 thread id 只存記憶體；應用程式重啟後建立新對話。

### Common pitfalls carried from the example

- 不能把 notification 誤判為 request response。
- 不能漏送 `initialized` notification。
- 不能為每次追問重新建立 thread。
- 不能依 primary／secondary 欄位順序猜測五小時與每週視窗。
- 不能把缺少的額度視窗顯示成 0%。
- 不能讓 Renderer 偽造 approval、sandbox、working directory 或任意 method。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 目標執行平台是目前的 Electron 桌面應用程式。
- 使用者已在本機安裝並登入 Codex CLI；本功能不讀取 OpenAI API key。
- 右側 AI 對話面板是本功能唯一的對話介面。
- 使用者已確認第一階段不保存對話，且不提供模型／推理強度設定。
- 左側狀態卡可依現有側欄寬度做響應式調整，不要求逐像素複製參考圖片。

### Open Questions

- 無。本功能的執行層、MVP 範圍、對話保存、上下文限制與設定按鈕行為已於 2026-07-21 確認。

### Non-goals

- 不實作 Codex／ChatGPT 內嵌登入流程或帳戶切換。
- 不保存或恢復跨次啟動的對話、thread id 或訊息歷史。
- 不提供模型選擇、推理強度、API key、prompt 或其他進階設定。
- 不在本功能內完成區段解析工作流、標記建立、生詞庫、區段練習或 Anki 式間隔複習。
- 不把整章、整本 EPUB 或閱讀區段外原文傳給 AI。
- 不把帳戶額度解讀為單一對話、模型、token 或金額額度。
- 不把本機 Codex app-server 暴露為網路服務。
- 不在本功能中把 Fastify `AiGateway` 從 unconfigured 改為遠端可用服務。

## 7. Affected Modules and Files

預計新增：

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/codex-app-server-client.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/codex-app-server-client.test.ts` 或等價協定測試
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts` 或等價測試 fixture
- `documents/modules/ai-conversation.md`

預計更新：

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/reading-range.md`
- `CONTEXT.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 以同技術棧範例為基礎加入 `codex app-server` JSONL transport，完成 initialize／initialized／account、request timeout、notification 分流與 child process 清理。
- 建立 `ChatController`，管理真實帳戶、五小時／每週額度、partial live update、單一 thread、多輪 turn、串流 delta、canonical completed 訊息與錯誤狀態。
- 第一次訊息在建立 thread 前即進入 busy，避免使用者快速操作建立兩個並行 thread／turn。
- 新增白名單 chat IPC 與 `window.readerDesktop.chat` Preload bridge；Renderer 不能取得 raw protocol、process、工作目錄、approval 或 sandbox 能力。
- 右側 AI 對話面板改接真實 snapshot 與 send；使用者追問沿用同一 thread，訊息只保存在目前應用程式 session。
- 閱讀頁使用既有 `extractReadingSegment()` 組裝有限 context；空區段與非閱讀畫面不傳 EPUB 原文，也不以整章 fallback。
- 左側新增無副作用的設定按鈕，以及連動真實帳戶的 Codex 狀態卡；窄欄版面將連線狀態收斂為右上角標籤、信箱單行省略，五小時與每週額度改為上下兩列，完整 email／type 與重置時間保留於提示及無障礙名稱。
- 帳戶 ready、額度尚未完成的短暫狀態明確顯示「取得中…」，不誤顯示「無法取得」。

### Test Coverage

- `chat-controller.test.ts`：TC1–TC3、TC7–TC12、TC15；另覆蓋 allowance loading、malformed account response 與第一次 thread 建立期間的並行保護。
- `chat-ipc.test.ts`：TC14；覆蓋 IPC 白名單與結構化 context 輸入驗證。
- `App.test.tsx`：TC4–TC6、TC8–TC13、TC16；覆蓋閱讀區段裁切、一般對話、窄欄狀態卡、空設定按鈕與 bridge send。
- `desktop.spec.ts`：TC14、TC16；驗證正式 Electron bridge 只有四個 chat 方法、無 Node require，狀態卡與三欄版面可見。

### Changed Files

#### Production Code

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/codex-app-server-client.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/fake-codex-app-server.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F07-codex-ai-conversation.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/reading-range.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 啟動後連線本機 Codex 帳戶 | Pass | Controller initialize／account 測試、Electron E2E、真實本機連線確認 |
| 建立並延續多輪 AI 對話 | Pass | `streams two answers on one thread...` |
| 串流呈現 AI 回答 | Pass | delta 分段、item completed 校正及 completed status 測試 |
| 限制閱讀上下文範圍 | Pass | `sends only the current reading segment as EPUB context` |
| 沒有可用閱讀區段時仍可對話 | Pass | `composeCodexInput` fallback 與 Renderer 無 context send 測試 |
| 顯示真實 Codex 帳戶狀態 | Pass | live account card 測試與真實本機 Codex 連線 |
| 顯示五小時與每週額度 | Pass | allowance 正規化、live update 測試；使用者手動確認真實額度 |
| 區分額度缺值與用盡 | Pass | unavailable／0% 測試及 loading 回歸測試 |
| 顯示登入與連線失敗狀態 | Pass | auth-required、malformed response 與 UI phase mapping |
| 避免同一對話同時執行兩個 turn | Pass | 第一次 thread 建立期間的 parallel send 測試 |
| 設定按鈕保持空操作 | Pass | Renderer 點擊後無 dialog／狀態變更測試 |
| 保持安全的 Renderer 邊界 | Pass | IPC 驗證與 Electron chatKeys E2E |
| 關閉應用程式時釋放 AI 執行層 | Pass | SIGTERM 測試與 before-quit 組裝 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | initialize → initialized → account/read → allowance request 順序 |
| TC2 | Pass | one thread、two turns、same thread id |
| TC3 | Pass | 兩段 delta、canonical completed、turn completed |
| TC4 | Pass | Renderer 擷取 `Content`，未傳送區段外 `for one-1` |
| TC5 | Pass | 無書籍時 send input 只有使用者問題 |
| TC6 | Pass | ready snapshot、email 窄欄呈現與完整 email／type title |
| TC7 | Pass | 300／10,080 分鐘反序視窗正規化 |
| TC8 | Pass | partial live update 保留 weekly 且沒有 turn/start |
| TC9 | Pass | 0% 與 null 視窗不同結果 |
| TC10 | Pass | no account → auth-required → send rejected |
| TC11 | Pass | malformed account → error；transport timeout／exit 由 client 邊界處理 |
| TC12 | Pass | thread/start 延遲期間第二次 send 被拒絕 |
| TC13 | Pass | 設定按鈕無副作用 |
| TC14 | Pass | chat IPC test 與 E2E 精確四方法 bridge |
| TC15 | Pass | Controller close 呼叫 child SIGTERM，client 拒絕 pending request |
| TC16 | Pass | 既有左右側欄摺疊測試與 E2E 三欄 viewport 回歸 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t "renders the live Codex account card"
npm run test -w @reader/desktop -- ../main/chat-controller.test.ts
npm run test -w @reader/desktop -- src/renderer/App.test.tsx ../main/chat-controller.test.ts ../main/chat-ipc.test.ts
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：Server 3/3、Desktop 65/65、Electron E2E 2/2 通過；全專案型別檢查與 production build 通過。Electron E2E 首次在檔案沙箱內無法啟動 GUI，改在允許桌面程序的環境後 2/2 通過。

### Hypotheses and Decisions

- 真實畫面第一次自動取樣時已顯示 ready，但額度仍短暫顯示 unavailable。假說依序為取樣競態、協定包裝不同、缺少 resetsAt、帳戶不提供額度；使用者手動測試確認稍後可取得額度，證實是 ready 早於 allowance request 完成的競態。修正為 ready 階段先發布 allowance loading，並加入回歸測試。
- 第一次 send 原先可能在 `thread/start` await 前尚未進入 busy；將 starting 提前到所有非同步操作之前，並以延遲 fake thread response 驗證第二次 send 被拒絕。
- 視覺快照發現窄欄長信箱與帳戶類型互相擠壓、右側長連線文字使送出按鈕換行。依使用者提供的窄欄參考圖，改為只在卡片可視區顯示單行信箱，完整 email／type 保留於 title／aria，並讓送出按鈕固定不換行。
- 桌面本機 Codex 直接由 Electron Main 管理；Fastify `AiGateway` 保持 unconfigured，避免兩個 process owner。

### Deferred Items

- 對話跨次啟動保存與恢復。
- 模型／推理強度設定；目前設定按鈕無副作用。
- 內嵌登入與帳戶切換。
- 區段解析、標記說明、區段練習、生詞庫與 Anki 式複習的 AI 流程。

### Notes

- 真實本機 Codex 帳戶連線已驗證成功；使用者手動確認五小時與每週額度可正常取得。
- 本機 GUI 執行環境必須能找到 `codex` 可執行檔。
- AI 對話使用 read-only、never approval 並停用工具與擴充能力，不會從 Renderer 接受任意執行設定。

### Reference Example

- Bundle: `reference-examples/import/codex-ai-chat/`
- Alignment: same-stack，直接參考 transport／controller／fake server 核心程式，再適配目前 Electron Main、Preload 與 React Renderer。
- Acceptance source: 範例 smoke test 的 initialize → account → one thread → two turns → streamed replies，已轉譯為 TC1–TC3；額度與 Renderer boundary 測試已轉譯為 TC6–TC9、TC14。

### Documentation Follow-up

- 已新增 `documents/modules/ai-conversation.md`，記錄 AI 執行層責任、狀態流、安全邊界及測試接縫。
- 已更新 `documents/modules/reading-range.md`，記錄 AI 對話共用閱讀區段裁切入口。

## Appendix: TDD Implementation Checklist

1. Write and refine requirements

   Use User Story and Acceptance Criteria format to clearly describe the scenario and expected outcomes.
   All criteria should map to verifiable, automatable test cases.

2. Write tests

   Write failing tests (red) based on the acceptance criteria.
   Each Scenario should have at least one corresponding test case (including boundary conditions and exception handling).

3. Write minimal implementation

   Write only the minimum logic required to pass the tests. Avoid over-engineering.

4. Tests pass (green)

   All test cases pass with no errors in the automated test suite.

5. Refactor

   With tests green, improve code structure and readability while keeping functional behavior consistent.

6. Sync documentation and version

   Verify that documentation matches the implementation outcome. Update requirement version and test records.
   Update this document with an implementation note.
