---
title: Codex AI 對話與帳戶狀態模組
module: ai-conversation
status: active
last_updated: 2026-07-23
related_implements:
  - F05-ai-reading-range-markers
  - F07-codex-ai-conversation
  - F08-compact-markdown-chat-messages
  - F09-send-reading-segment-on-range-change
  - F10-ai-conversation-management
  - F11-improve-ai-conversation-composer
  - F12-resizable-ai-conversation-panel
  - F13-persistent-annotations-and-ai-analysis
  - F16-invoke-annotation-explanation-skill
  - F17-reading-segment-comprehension-quiz
  - B03-load-only-bundled-annotation-skill
  - B04-use-language-setting-for-reading-quiz
  - F18-use-reading-comprehension-skill
  - B05-use-quiz-language-for-open-ended-answers
  - F19-local-learning-library-page
  - F21-ai-assisted-learning-item-creation
---

# Codex AI 對話與帳戶狀態模組

## 1. Purpose

本模組以使用者本機既有的 Codex／ChatGPT 登入狀態提供 **Codex AI 執行層**，讓右側 **AI 對話面板**建立、保存、切換及移除全域 **AI 對話**，選擇可用 AI 模型，並進行可停止的多輪串流互動；左側窄欄只顯示連線階段與五小時／每週帳戶共用額度，不呈現登入信箱。

閱讀頁的 AI 上下文只包含產品層明確組裝的書籍名稱、章節名稱與目前 **閱讀區段**；本模組不讀取整章、整本 EPUB 或 Renderer 任意指定的檔案。

本文件聚焦 AI 對話與 Codex transport 生命週期；App skills 的安裝與隔離、解釋標記 workflow、閱讀測驗 workflow 分別由 `skill-management.md`、`annotation-explanation.md` 與 `reading-comprehension-quiz.md` 詳述。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- Electron Main 啟動 `codex app-server`，完成 initialize／initialized／account/read 握手。
- 自動沿用本機 Codex／ChatGPT 登入狀態，不讀取 OpenAI API key。
- 顯示 disconnected、connecting、ready、auth-required 與 error 連線階段。
- 依 300 與 10,080 分鐘視窗辨識五小時與每週額度；缺值、載入中與確實 0% 保持不同語意。
- 合併 `account/rateLimits/updated` 的 partial live update，不建立 AI turn。
- 分頁讀取 `model/list` 的可見模型，以 server default 作為初始選擇；目錄失敗時仍可使用 Codex 預設模型對話。
- 使用者可在 AI 未回覆時切換模型；新 thread 與後續 turn 都使用目前模型及該模型的預設推理強度。
- 空白新對話送出第一個問題後才建立產品對話與 Codex thread；後續追問在相同 thread 建立新 turn。
- 右側面板可開啟跨書籍共用的全域對話清單、建立新對話、切換過去對話及直接移除；移除時不顯示確認視窗。
- 每筆對話保存產品對話 id、Codex thread id、標題、時間、來源摘要及顯示訊息；重啟恢復上次查看的對話。
- 延續過去對話時使用 `thread/resume` 恢復相同 thread；移除時使用 `thread/archive`，本機保存失敗會嘗試 `thread/unarchive` 回滾。
- 第一次針對非空閱讀區段提問時提供原文；書籍、章節與 START／END 均未改變的後續追問不重傳相同原文，來源或範圍改變後才重新提供一次。
- START／END 或持久標記變更後，下一則訊息提供含 `<reader-annotation>` 的最新區段；普通未變追問去重，預設「講解標記內容」與「閱讀測驗」每次都附上當下區段。
- 預設解析意圖由 Main process 明確注入 App 內建並安裝到 user data 的 `explain-reader-annotations` skill；skill 提供選擇式教學小節、本文用法 CEFR 與複習表，一般輸入仍是正常多輪問答。
- 閱讀頁提供「閱讀測驗」預設動作；Main process 明確呼叫 App 內建 `practice-reading-comprehension` skill，依區段長度與複雜度產生 8 至 12 題四選一及 1 至 3 題問答題，題面、問答題回答與批改使用目前講解語言。第一輪不揭露答案、解析或提示；使用者可在同一對話提交答案，取得逐題批改、表達修正、分數與 final review。
- 設定入口可保存全域講解語言：原文語言（預設）、繁體中文、English 或日本語；影響後續標記解析，以及閱讀測驗的題面、問答題回答要求與批改。
- assistant delta 即時累加，item completed 校正最終文字，turn completed 解除 busy。
- 同一 thread 不允許並行 turn，包含第一次 thread 尚在建立的時間窗。
- 回覆中可使用 `turn/interrupt` 停止目前 turn；若 thread／turn 尚在建立，會先等待真實識別碼再中斷。
- 對話清單與訊息以原子檔案替換方式保存在 Electron user data；損壞資料不會被空資料覆寫，殘留 streaming 訊息重啟後正規化為 failed。
- 對話訊息不顯示占寬的「你／AI」角色標籤；使用者訊息以靠右淡色氣泡呈現，AI 回覆以滿寬正文呈現，並保留輔助技術可辨識的角色語意。
- 使用安全的 Markdown Renderer 呈現 CommonMark 與 GitHub Flavored Markdown；原始 HTML 不會插入 DOM，表格與程式碼在窄側欄中可水平捲動。
- 左側窄欄狀態卡顯示 Codex、右上角連線標籤與上下排列的五小時／每週額度；不顯示信箱或含帳戶資料的「已連線」明細。
- AI 回覆中狀態位於對話訊息流底部；提問框固定呈現「輸入你的疑問」與 Enter／Shift+Enter 提示，並避免輸入法組字期間 Enter 誤送。
- AI 對話面板左邊界可用滑鼠拖曳或方向鍵調整寬度；展開寬度限制於 280–640px 並保護中央閱讀區，摺疊後展開會恢復本次工作階段的調整寬度。
- 「設定」提供講解語言選擇；模型選擇仍直接位於 AI 對話提問框，不提供推理強度設定。
- 生詞庫工作區沿用同一套右側 AI 對話面板與全域對話生命週期，並與閱讀頁共同提供
  typed `createLearningItems` 入口；AI 訊息可附 invitation、持久草稿批次與錯誤狀態。
- 學習項目建立澄清狀態保存在 user message；重新啟動後的下一個直接回答仍會先查
  exact-title 候選，再延續固定 creation skill。

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

- 連線階段、帳戶、額度、模型目錄與選擇、全域對話集合、目前對話、thread、active turn 與訊息投影。
- Codex thread／turn 生命週期與串流 notification 投影。
- `turn/interrupt` 停止流程，以及 starting 狀態等待真實 turn id 的同步。
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

- Renderer 除既有對話 IPC 外，只能使用四個 typed 草稿能力：
  `chat:update-learning-item-draft`、`chat:set-learning-item-draft-state`、
  `chat:submit-learning-item-batch`、`chat:restore-learning-item-match`。
- `chat:state-changed` 只向 Renderer 發送完整型別化 snapshot。
- Preload 將這些能力收斂於 `window.readerDesktop.chat`。
- Renderer 不能指定任意 Codex method、工作目錄、approval、sandbox、process 或工具設定。
- `window.readerDesktop.learning` 仍是獨立的本機資料 bridge。AI 不取得這個 bridge；
  creation workflow 只由 Main Controller 委派 exact-title query、atomic create 與 restore。

### Renderer

- 訂閱並呈現 `ChatSnapshot`，不自行模擬已連線、帳戶或額度資料。
- 從目前模式、選取書籍、章節與 `extractReadingSegment()` 組裝 `SendChatMessageInput`。
- 以 `bookId + chapterId + start + end + annotation revision` 辨識目前 AI 對話最近成功提供的閱讀區段；bridge 拒絕送出時不更新此識別。
- 將一般訊息與三種 typed intent 分開；`explainAnnotations`、`practiceReading`、
  `createLearningItems` 各自附固定 App skill，一般訊息不附 skill。
- 空閱讀區段只送出一般問題，不使用整章 fallback。
- 顯示處理中、需要登入、連線失敗與額度不可用狀態。
- 在提問框呈現模型選擇、鍵盤操作提示與停止按鈕；回覆中狀態顯示於訊息流，IME composition Enter 不觸發送出。
- 管理 AI 對話面板的工作階段寬度、拖曳／鍵盤調整、安全邊界與摺疊恢復；不經 IPC 保存。
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
| `messages` | 訊息狀態，以及可選 learning request／invitation／draft batch／artifact error |
| `conversations` | 依最近更新排序的全域對話摘要，不包含完整訊息複本 |
| `activeConversationId` | 目前選取的產品對話 id；空白新對話時為 null |
| `managementBusy` | 封存等管理操作是否進行中 |
| `conversationError` | 本機保存、恢復或移除對話的可顯示錯誤 |
| `models` | Main Process 驗證過的可見 AI 模型目錄 |
| `selectedModelId` | 目前全域選取的模型 id；目錄不可用時為 null |
| `modelCatalogDetail` | 模型目錄載入或降級原因 |
| `stopRequested` | 已送出中斷 request、正在等待 turn 完成通知；用來防止重複停止 |

### SendChatMessageInput

- `text`：使用者在 AI 對話面板輸入的問題。
- `context.bookTitle`：可選，目前書籍名稱。
- `context.chapterTitle`：可選，目前章節名稱。
- `context.readingSegment`：可選，只能來自 `extractReadingSegment()` 的非空輸出。
- `intent`：可選且只接受 `explainAnnotations | practiceReading | createLearningItems`。
- `explanationLanguage`：可選且只接受 `source | zh-TW | en | ja`；供標記解析與閱讀測驗題面共用。
- `learningItemTargets`：只允許 creation intent 使用，最多 50 個 title／senseHint。

## 5. Connection and Allowance Flow

```text
App ready
  → Electron Main 建立 ChatController
  → SpawnedCodexAppServerClient 啟動 codex app-server
  → initialize request
  → initialized notification
  → account/read
  → 無帳戶：auth-required
  → 有帳戶：ready + allowance／model catalog loading
  → account/rateLimits/read + paginated model/list
  → 依 windowDurationMins 正規化五小時／每週
  → ChatSnapshot 經 IPC 推送 Renderer
```

Controller 在帳戶成功、額度仍讀取的短暫時間明確發布 loading，UI 顯示「取得中…」，不會把未完成讀取誤顯示成「無法取得」。

## 6. Conversation Flow

1. Renderer 驗證 Codex ready、輸入非空且沒有 active turn。
2. 閱讀模式以 START／END 裁切目前非空區段，安全插入區段內標記，並以書籍、章節、邊界及標記 revision 組成區段識別。
3. 該識別尚未成功提供時附上書籍、章節與區段原文；與最近成功提供的識別相同時，普通追問只送使用者問題。預設標記解析與區段練習每次提供當下區段；其他模式或空區段不附 EPUB 原文。
4. Controller 在任何 await 前先進入 starting，封鎖第二個並行 send 及對話管理操作。
5. 空白新對話以固定的唯讀、無工具設定、目前選定模型及 App 內嵌的唯一標記解析 skill instructions 建立 thread，再建立本機產品對話；過去對話以 `thread/resume` 恢復時載入相同 instructions。
6. Controller 保存畫面用的純使用者問題，另把本次實際收到的有限閱讀 context 組成 Codex input，並更新該對話的最近來源摘要。
7. 一般 `turn/start` 只有 text input。標記解析含 `$explain-reader-annotations` 與固定標記 skill input；區段練習含 `$practice-reading-comprehension` 與固定閱讀 skill input。閱讀 skill 依長度與複雜度產生 8–12 題選擇題及 1–3 題問答題，題面、問答題回答要求與批改使用本次講解語言，直接引文保留原文，並在同一 AI 對話後續答案 turn 延續評量 workflow。講解語言以每次預設 turn 的動態參數提供，因此新 thread 與恢復的既有 thread 行為一致。
8. `turn/start` 使用目前選定模型及其預設推理強度；成功後 Renderer 才把本次區段識別記為已提供，bridge 拒絕時保留待提供狀態。
9. 後續 delta／completed notification 更新同一 assistant 訊息並持久保存；使用者可用停止按鈕中斷目前 turn，turn completed 後解除 busy，才能追問、切換、新建、移除對話或切換模型。

## 7. Runtime and Safety Constraints

- Codex 子程序只由 Electron Main 管理，Renderer 不可直接存取。
- thread 使用 `approvalPolicy: never`、read-only sandbox，停用一般 skill instruction catalog、bundled skills、plugins、apps、memories 及 web search。Electron Main 只把 App bundle 隨附的 `explain-reader-annotations` 與 `practice-reading-comprehension` markdown 組入 developer instructions；不得探索或使用其他 skill。各預設 turn 以固定 marker 啟用對應 workflow，閱讀測驗後只有該測驗的答案 turn 延續批改。兩份 skills 都禁止工具、檔案與網路操作。
- working directory 固定為 Electron user data 下的 `codex-runtime`，Renderer 不能指定。
- Desktop build 把 repo skill Markdown 內嵌到 Electron Main bundle；Main 啟動時安裝／更新到 runtime `.agents/skills`，再把這份 user data 絕對路徑作為 `ChatController` 必要設定。Renderer 不能提供 skill 內容或路徑，已安裝 App 也不依賴原始碼 repo。
- account allowance 是帳戶共用狀態，不代表 token、金額、模型或單一 thread 額度。
- notification 必須先驗證 thread id；其他 thread 的訊息不得進入目前對話。
- item completed 是 canonical 最終文字，必須取代而非重複附加 delta。
- LingoShelf 對話索引只收錄本產品建立的 thread；不把使用者帳戶中的其他 Codex 對話混入清單。
- 對話資料只存本機，不提供跨裝置同步；空白新對話在第一則訊息前不持久化。
- `apps/server` 的 Fastify `AiGateway` 仍維持 unconfigured；本機 Codex 生命週期不由桌面與 HTTP server 重複管理。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/chat-contracts.ts` | Main／Preload／Renderer 共用的帳戶、額度、模型、訊息、snapshot 與 context 型別 |
| `apps/desktop/src/main/codex-app-server-client.ts` | Codex 子程序、JSONL transport、request timeout 與 account 解析 |
| `apps/desktop/src/main/chat-controller.ts` | 連線、額度、模型目錄、thread／turn、中斷、串流訊息與 context 組裝 |
| `apps/desktop/src/main/learning-item-artifacts.ts` | creation message attachments 與 recheck 結果驗證 |
| `apps/desktop/src/main/learning-item-duplicate-classifier.ts` | 提交前有限候選的隔離 AI 語義分類 |
| `.agents/skills/explain-reader-annotations/SKILL.md` | 標記解析的語言學習 workflow、CEFR 判斷、選擇式說明與複習表契約 |
| `.agents/skills/practice-reading-comprehension/SKILL.md` | 閱讀理解 CEFR、出題、指定語言批改與 final review 契約 |
| `apps/desktop/src/main/bundled-skill.ts` | 把 App bundle 內建 skill 安裝／原子更新到 user data runtime |
| `apps/desktop/src/main/chat-conversation-store.ts` | 全域對話資料驗證、載入、原子保存與重啟正規化 |
| `apps/desktop/src/main/chat-ipc.ts` | chat IPC 白名單與輸入驗證 |
| `apps/desktop/src/main/main.ts` | 建立 Controller、發布 snapshot、管理 app 關閉清理 |
| `apps/desktop/src/preload/preload.ts` | 暴露窄化的 `readerDesktop.chat` |
| `apps/desktop/src/renderer/App.tsx` | AI 對話面板、閱讀區段 context 與左側狀態卡 |
| `apps/desktop/src/renderer/styles.css` | 對話與窄欄狀態卡樣式 |
| `apps/desktop/src/shared/settings-contracts.ts` | 講解語言與設定 bridge 型別 |
| `apps/desktop/src/main/settings-store.ts` | 全域講解語言載入、降級與原子保存 |
| `apps/desktop/src/main/settings-ipc.ts` | 講解語言 IPC 白名單與輸入驗證 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/main/chat-conversation-store.test.ts` | 原子保存、重啟 streaming 正規化與損壞資料隔離 |
| `apps/desktop/src/main/chat-controller.test.ts` | 既有 transport／對話流程、三個 skills、creation 候選範圍、持久澄清與批次生命週期 |
| `apps/desktop/src/main/reading-comprehension-skill.test.ts` | 閱讀 skill 的 CEFR、8–12／1–3 題、混合題型、批改、語言與 final review 契約 |
| `apps/desktop/src/main/bundled-skill.test.ts` | 三份 App skills 的乾淨安裝、相同內容略過與舊版原子更新 |
| `apps/desktop/src/main/chat-ipc.test.ts` | chat IPC 與預設意圖白名單、模型／對話 id、結構化 context 與惡意格式拒絕 |
| `apps/desktop/src/renderer/App.test.tsx` | 狀態卡、模型與停止控制、IME 鍵盤行為、AI 面板拖曳／鍵盤調寬與邊界、bridge send、閱讀區段裁切／去重／區段練習與語言傳值、全域對話管理、安全 Markdown／GFM 與串流占位 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | Electron 啟動、三份 runtime skills、13 項 chat bridge 白名單與 Node 隔離 |

最近驗證（2026-07-21）：

- Server Vitest：3/3 passed。
- Desktop Vitest：159/159 passed。
- Electron Playwright：本次受執行環境阻擋 Electron process launch，未進入斷言。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。
- 真實本機 Codex：帳戶連線成功；使用者手動確認五小時與每週額度可取得。

## 10. Known Limitations and Follow-up

- 不提供對話搜尋、篩選、釘選、重新命名、匯出、垃圾桶或復原。
- 對話只保存在本機，不提供帳戶或跨裝置同步。
- 模型選擇不為每筆 AI 對話個別保存，重新啟動時回到 Codex 模型目錄的 server default。
- AI 對話面板的調整寬度只保留於目前工作階段，重新啟動後回到 360px。
- 不提供推理強度或 API key 設定；設定視窗目前只包含講解語言。
- 不提供內嵌 Codex／ChatGPT 登入或帳戶切換。
- Markdown 程式碼區塊目前不提供語法高亮。
- 區段練習目前只用 Markdown 對話呈現，不保存結構化題目、選項、問答回答、答案、
  分數或作答歷史；AI 已能建立學習項目草稿，但 Anki 式複習流程尚未實作。
- 本機 GUI 環境必須能找到已安裝的 `codex` 可執行檔。

## 11. Related Documents

- `CONTEXT.md`
- `documents/modules/reading-range.md`
- `documents/modules/annotation.md`
- `documents/modules/skill-management.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/learning-library.md`
- `documents/implements/F05-ai-reading-range-markers.md`
- `documents/implements/F07-codex-ai-conversation.md`
- `documents/implements/F08-compact-markdown-chat-messages.md`
- `documents/implements/F09-send-reading-segment-on-range-change.md`
- `documents/implements/F10-ai-conversation-management.md`
- `documents/implements/F11-improve-ai-conversation-composer.md`
- `documents/implements/F12-resizable-ai-conversation-panel.md`
- `documents/implements/F13-persistent-annotations-and-ai-analysis.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/B03-load-only-bundled-annotation-skill.md`
- `documents/implements/B04-use-language-setting-for-reading-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/B05-use-quiz-language-for-open-ended-answers.md`

變更 Codex protocol、snapshot、上下文邊界、Renderer bridge、狀態卡、訊息呈現或對話生命週期時，必須同步更新本文件與相關 FXX 實作紀錄。
