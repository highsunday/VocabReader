# MANIFEST — Codex AI 對話範例

> 本檔由 ddd-export-example 產生，是這份最小可跑範例的說明書。
> 匯入端（ddd-import-example）應先讀這份檔案，再讀程式碼。

## 1. 功能摘要

這是一個最小 Electron 對話程式，示範如何使用本機既有的 Codex／ChatGPT 登入狀態啟動 `codex app-server`、在連線帳號旁顯示帳戶共用的迷你五小時／每週 AI 使用額度、選取對話模型與推理強度、建立單一對話、傳送多輪訊息，並把 AI 回覆串流顯示在受隔離的 Renderer。對話與設定只保存在記憶體，關閉程式後不會恢復。

- 來源專案：AI Learning Reader（`ai_learing`）
- 原始技術棧：TypeScript、Node.js、Electron、Codex app-server stdio JSONL／JSON-RPC
- 導出日期：2026-07-20

## 2. 入口

從這裡開始讀：

- `src/main/chat-controller.ts`：最小對話流程入口；負責連線、建立 Codex thread、送出 turn，以及把通知投影成可顯示的聊天狀態。
- `src/main/codex-app-server-client.ts`：若要理解 Codex 整合底層，從這裡查看 process 啟動、initialize handshake、request/response 與 notification 傳輸。
- `src/main/index.ts`：Electron 組裝入口；建立安全視窗、註冊有限 IPC，並將 Controller 狀態送到 Renderer。

## 3. 檔案地圖

| 檔案 | 職責 |
|------|------|
| `src/main/codex-app-server-client.ts` | 啟動 `codex app-server`，處理逐行 JSON 訊息、請求期限、通知與 process exit |
| `src/main/chat-controller.ts` | 管理連線、額度正規化、模型目錄、記憶體內設定、單一 thread、多輪 turn 與串流訊息 |
| `src/main/index.ts` | 建立 Electron 視窗，註冊 allow-listed IPC 並管理應用程式生命週期 |
| `src/main/window-manager.ts` | 持有 Main Window 強參考，關閉前避免被垃圾回收，並處理 macOS 再啟用 |
| `src/preload/index.cts` | 用 `contextBridge` 只暴露連線、傳送訊息及接收狀態的型別化 API |
| `src/shared/chat-contracts.ts` | Main、Preload 與 Renderer 共用的最小聊天資料契約 |
| `src/renderer/index.html` | 最小對話畫面結構與 Content Security Policy |
| `src/renderer/renderer.js` | 顯示狀態與訊息、處理輸入，不接觸 Node.js 或 raw Codex protocol |
| `src/renderer/styles.css` | 單視窗聊天介面的最小樣式 |
| `tests/fake-codex-app-server.ts` | 取代真實外部服務的可控制 fake app-server process |
| `tests/smoke.test.ts` | 驗證連線、串流與同一 thread 上的兩輪對話 |
| `tests/allowance-and-models.test.ts` | 驗證額度、模型目錄、設定相容性與 Codex request 參數 |
| `tests/renderer-contract.test.ts` | 驗證額度／模型／推理強度介面與有限 Preload boundary |
| `tests/window-lifecycle.test.ts` | 驗證 Main Window 在關閉前持續被持有，關閉後能重新建立 |
| `package.json` | 最小相依清單，以及 build、start、test 單行命令 |
| `package-lock.json` | 鎖定已通過驗證的套件版本 |
| `tsconfig.json` | TypeScript 建置設定 |

## 4. 依賴與執行

- 需要的環境：Node.js 22+、npm，以及可執行且已登入的 Codex CLI
- 安裝依賴：`npm install`
- 啟動程式：`npm start`
- 執行 smoke test：`npm test`

真實執行前請先在終端確認 `codex` 命令存在，並已使用預定帳戶完成 Codex／ChatGPT 登入。本範例不讀取 OpenAI API key，也不提供內嵌登入畫面。

外部依賴的處理方式：

- 正常啟動時，`SpawnedCodexAppServerClient` 會執行真實的 `codex app-server`。
- smoke test 以 `tests/fake-codex-app-server.ts` 注入假的 child process；它會回覆 initialize、account/read、account/rateLimits/read、分頁 model/list、thread/start、turn/start，並送出額度更新、AI delta 與完成通知。
- smoke test 不需要網路、真實帳戶或 AI 使用額度，因此能穩定驗證產品端協定流程。

## 5. 核心概念（語言無關）

> 這是跨棧匯入時的主要參考。即使目標專案使用不同語言，也能依這段流程重做。

本質流程：

1. 由受信任的後端程序啟動 Codex app-server，並以標準輸入／輸出交換一行一個 JSON 訊息。
2. 送出 initialize request，收到成功 response 後再送 initialized notification；接著讀取帳戶狀態。只有已登入帳戶能進入 ready。
3. 帳戶可用後讀取 rate limits，按 300／10,080 分鐘辨識五小時與每週視窗，顯示剩餘百分比與重置時間；live update 與手動重新整理不需要建立 AI turn。
4. 分頁讀取非隱藏 model catalog，以 server default 建立模型／推理強度 pair；改模型時保留相容 effort，否則使用新模型預設值。
5. 第一次提問時以選定模型呼叫 thread/start，保存回傳的 thread id；後續提問不能重新建立 thread。
6. 每次提問都以相同 thread id 與當下 model／effort 呼叫 turn/start，保存回傳的 turn id，並避免同一 thread 同時有兩個 active turn。
7. 收到 assistant delta 時，依 item id 累加文字；收到 item completed 時以最終文字校正內容；收到 turn completed 時結束 busy 狀態。
8. 只把型別化聊天狀態送到不受信任的畫面層。畫面層不能啟動 process，也不能傳送任意 app-server method。
9. 關閉應用程式時解除 listeners、拒絕未完成 request，並終止子程序。

關鍵決策與容易踩雷的點：

- request response 和 server notification 都經過同一條 stdout；必須先按 envelope 形狀分類，不能把 notification 當成 response。
- initialize 成功後仍要送出 initialized notification，不能只完成 request。
- thread/start 可能比一般狀態請求慢，因此使用獨立且有上限的 30 秒期限；其他 request 使用較短期限。
- 串流 delta 可能在 turn/start 的呼叫端恢復執行前抵達，所以送出 request 前就要建立 busy 狀態。
- item/completed 是 canonical 最終文字；應以它修正已累加的 delta，避免重複或遺漏。
- 相同對話的後續問題必須重用 thread id，否則 Codex 不會保有先前輪次的上下文。
- 額度是 account-wide state，不是 token、金額、模型額度或單一 thread 額度；缺值不能顯示為 0%。
- 模型只能來自 validated catalog，設定只能在 idle turn 修改，並從下一個 turn 生效。
- Renderer 只接收完整 snapshot，不持有 raw protocol client，也不能偽造 approval、sandbox 或工具設定。
- 最小範例固定使用 `approvalPolicy: "never"`、read-only sandbox，並停用 skills、plugins、apps、memories 與 web search。

## 6. 改寫指引（匯入到別專案時）

| 部分 | 保留或替換 | 說明 |
|------|------------|------|
| JSONL request/response/notification 分流 | 保留 | 這是 Codex app-server transport 的核心 |
| initialize → initialized → account/read 順序 | 保留 | 連線就緒前的必要握手 |
| thread id 與 turn id 分開管理 | 保留 | thread 代表多輪上下文，turn 代表單次回答 |
| delta → item completed → turn completed 投影 | 保留 | 確保串流畫面與最終文字一致 |
| 五小時／每週額度正規化 | 保留 | 依 window duration 辨識，不依 primary／secondary 順序 |
| validated model／effort pair | 保留 | 防止 Renderer 傳入任意 model id 或不相容 effort |
| Renderer 的有限 IPC 邊界 | 保留 | 不讓 UI 取得 process 或 raw JSON-RPC 權限 |
| `tests/fake-codex-app-server.ts` | 測試中保留 | 可延伸失敗、逾時、未登入等測試案例 |
| 記憶體內訊息與 thread id | 替換 | 目標專案若需要恢復對話，改接 append-only JSONL 或其他持久化儲存 |
| 記憶體內模型設定 | 替換 | 需要跨重啟時可加入 Recent Conversation Settings，但不可覆寫既有對話自己的設定 |
| `workingDirectory` | 替換 | 改成目標產品管理的安全資料目錄，不要直接接受 Renderer 任意路徑 |
| developer instructions | 替換 | 加入目標專案的領域語言與上下文規則；不要在此無限制塞入整本書 |
| 單一文字參數 | 替換 | 閱讀器可改為「問題＋目前章節＋選取內容＋標記」的結構化 context assembler |
| vanilla Renderer | 替換 | 可接到目標專案既有 React AI Conversation Panel，但保留 Preload 安全邊界 |
| auth-required 提示 | 替換 | 可依產品決策加入登入引導；不要假設 app-server 登入協定 |

針對附件所述的 AI 輔助英文學習閱讀器，第一個合理的改寫點是：讓產品層從目前章節與使用者明確選取的內容組裝 context，再傳入 `sendMessage`；Codex transport 和 thread/turn 狀態機不需要知道 EPUB、標記、生詞庫或複習排程。

## 7. smoke test 摘要

這條測試驗證了：

- **Given** 一個假的 Codex app-server，能完成 initialize、帳戶讀取及對話協定
- **When** 程式連線後連續送出第一個問題與一個追問
- **Then** 程式只建立一次 thread、兩次 turn 都使用同一 thread id，兩個 AI 回覆都經由多段 delta 串流組合並完成

已驗證命令：

```text
npm test
```

預期結果為 10 個測試通過、0 個測試失敗。匯入端應把 Codex 對話、額度與模型設定測試轉成目標專案的 AI Conversation Panel 驗收條件。

本次已完成 TypeScript 建置、10 項自動測試與 `npm start` 真實 Codex 啟動驗證；實際啟動時已確認 Electron Main、GPU、Network、Renderer 與 `codex app-server` 正常建立。
