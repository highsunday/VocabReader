# MANIFEST — EPUB 閱讀、START／END 與 Codex 對話範例

> 這是獨立可執行範例的實作說明；目前版本不使用 DDD 流程。

## 1. 功能摘要

這是一個最小 Electron／React 閱讀器，示範使用者匯入 EPUB、從左側可滾動書架選書、在書籍主頁瀏覽封面與章節，再以可拖曳的 START／END 標記界定 AI 可讀原文，並在右側透過本機真實 `codex app-server` 進行多輪串流對話。每個問題只附帶目前標記範圍，不把同章範圍外內容交給 AI。閱讀頁有章節標題、上一章／下一章、START／END 快速定位、下一區段、文字設定及選取文字標註；文字大小、行距與紙張寬度會保存在本機。介面不包含語言學習、複習、造句或跟讀入口；Settings 只保留目前 Codex Account 狀態與重新連線操作。左側保留原產品的 Codex 連線與 5 小時／每週額度卡，整體使用淺米白與深藍主題。

- 來源專案：VocabReader（AI 輔助語言學習電子書閱讀器）
- 原始技術棧：TypeScript、React、Electron、Vite、JSZip、fast-xml-parser、Codex app-server stdio JSONL／JSON-RPC
- 導出日期：2026-08-14

## 2. 入口

從這裡開始讀：

- `src/renderer/App.tsx`：產品流程入口；串起 EPUB 書庫、章節閱讀、START／END、受限 context 組裝及右側對話。
- `src/main/main.ts`：Electron 組裝入口；建立安全視窗、註冊有限 IPC，並啟動書庫與 Codex controller。
- `src/main/chat-controller.ts`：AI 流程入口；建立單一 Codex thread、送出多輪 turn 並投影串流通知。
- `src/main/codex-app-server-client.ts`：Codex transport 入口；啟動真實 `codex app-server` 並分流 response 與 notification。

## 3. 檔案地圖

| 檔案 | 職責 |
|------|------|
| `src/shared/contracts.ts` | Main、Preload、Renderer 共用的最小書籍、範圍與聊天契約 |
| `src/main/epub-library.ts` | 記憶體書庫、EPUB 封面、EPUB 3 navigation／spine fallback 解析及安全章節 HTML 輸出 |
| `src/main/app-ipc.ts` | 可獨立測試的 EPUB picker、章節、範圍與 Codex allow-listed IPC |
| `src/main/codex-app-server-client.ts` | 跨 macOS／Linux／Windows 啟動 Codex app-server，處理 initialize、JSONL request、notification、timeout 與關閉 |
| `src/main/chat-controller.ts` | 帳戶連線、5 小時／每週額度、context prompt、thread／turn、串流訊息及同 thread 多輪對話 |
| `src/main/main.ts` | Electron 視窗、原生 EPUB 選擇器、allow-listed IPC 與生命週期 |
| `src/preload/preload.ts` | 只暴露固定 library／chat 方法與完整聊天 snapshot |
| `src/renderer/App.tsx` | 左側可滾動書架、書籍主頁、章節工具列、文字設定、可拖曳 START／END、標註與右側 AI 對話面板 |
| `src/renderer/reading-range.ts` | 文字 offset 裁切、下一區段推進、DOM point → offset 與 offset → marker 畫面位置 |
| `src/renderer/styles.css` | 淺米白／深藍三欄版面、雙層閱讀工具列、Codex 狀態卡、章節紙張、範圍標線及聊天樣式 |
| `src/renderer/index.html` | Renderer 入口與 Content Security Policy |
| `tests/fake-codex-app-server.ts` | 測試專用 child process，實作與正式 Codex 相同的 JSONL transport boundary |
| `tests/smoke.test.ts` | EPUB → chapter → range → Codex prompt → streaming answer 的關鍵 happy path |
| `tests/app-ipc.test.ts` | 驗證 EPUB-only 原生選擇器、選取路徑傳遞與取消語意 |
| `tests/codex-launch.test.ts` | 驗證 Electron GUI PATH 缺少 Homebrew 時仍能解析 Codex executable |
| `tests/dev-launch.test.ts` | 驗證 dev server、ready check 與 Electron 共用專屬 strict port，避免誤載另一個 Vite 專案 |
| `tests/reading-range.test.ts` | 驗證下一區段保留目前字數向後推進，並在章末正確截斷 |
| `tests/real-codex-connect.test.ts` | 選用的真實本機 Codex 帳戶連線測試，由 `npm run test:codex` 執行 |
| `tests/ui.test.tsx` | 驗證沒有語言學習入口，且 Settings 只呈現 Account |
| `package.json` | 安裝、開發、啟動、測試、型別檢查與建置命令 |
| `package-lock.json` | 綠燈驗證時使用的鎖定依賴版本 |
| `tsconfig.json` | TypeScript 嚴格型別設定 |
| `vite.config.ts` | React Renderer production build 設定 |

## 4. 依賴與執行

- 需要的環境：Node.js 22+、npm、可執行的 Codex CLI，以及已完成的 Codex／ChatGPT 登入
- 安裝依賴：`npm install`
- 開發模式：`npm run dev`
- 建置並啟動：`npm start`
- 執行 smoke test：`npm test`
- 驗證真實本機 Codex：`npm run test:codex`
- 型別檢查：`npm run typecheck`
- Production build：`npm run build`

真實執行時，`SpawnedCodexAppServerClient` 會啟動 `codex app-server`。本範例不讀 OpenAI API key，也不在應用程式內實作登入；若本機帳戶不可用，右側面板會顯示需要登入或連線錯誤。

外部依賴的處理方式：

- 正式執行使用真實 Codex app-server，沒有用 canned response 取代。macOS 會在 Electron GUI PATH 之外額外辨識 Homebrew 常見路徑，也可用後端環境變數 `CODEX_PATH` 指定 executable。
- Smoke test 只把 app-server child process 換成 `tests/fake-codex-app-server.ts`；產品 controller 與 JSONL transport 仍是正式程式碼，因此測試不需要網路、帳戶或消耗 AI 額度。
- Electron 原生檔案選擇器在正式執行中保留；測試直接傳入記憶體 EPUB buffer。
- 原生檔案選擇器附著於主視窗；匯入／解析錯誤顯示在 Import EPUB 按鈕旁，不再落到右側 AI 對話底部。
- 開發模式固定使用專屬的 `127.0.0.1:45173` 並啟用 Vite strict-port；若該 port 已被佔用會明確失敗，不會自動換 port 後讓 Electron 誤載其他專案。
- Renderer CSP 允許 inline styles，供 Vite 開發模式注入 CSS，也讓 React 的 START／END 動態 marker 位置能以 style attribute 正常更新；script、圖片與連線來源仍維持 allow-list。
- 原專案的永久書庫改成記憶體書庫；關閉 example 後匯入書籍和 START／END 不會保留。

目前 EPUB 邊界刻意精簡：支援標準 EPUB 3 navigation 與 spine fallback、安全文字結構及常見點陣圖片；未包含原專案完整的 EPUB 2 NCX、字型混淆、DRM 判斷、巢狀 TOC、跨多個 spine 文件組章，以及永久遷移邏輯。

## 5. 核心概念（語言無關）

> 這是跨棧匯入時的主要參考。即使目標專案使用不同語言，也能依這段流程重做。

本質流程：

1. 受信任的桌面後端開啟使用者選取的 EPUB，驗證容器格式，解析 metadata、manifest、spine 與 navigation，輸出安全章節 HTML。
2. 閱讀畫面以「章節純文字中的整數 offset」保存 START／END，而不是頁碼、像素或捲動比例，因此換字體或視窗寬度後仍指向相同文字。
3. UI 把 pointer 的畫面位置轉為 DOM 文字 offset；START 不可超過 END，END 不可早於 START。標線位置則由 offset 反向換算為目前排版中的 glyph 座標。
4. 「下一區段」以目前 START／END 內的字數為目標，從 END 後第一個非空白字元起建立下一段；章末不足時自動截斷。
5. 使用者提問時，產品層從章節純文字裁出 `[start, end)`，再以結構化 context 傳入聊天 controller。空範圍不回退成整章。
6. 受信任後端啟動 Codex app-server，完成 initialize request 後送 initialized notification，再讀取帳戶；Renderer 不接觸 process 或 raw protocol。
7. 第一個問題建立 Codex thread；每個問題建立新 turn，但同一對話的追問沿用 thread id。
8. Codex prompt 明確分隔書名、章名、目前 START／END 原文和使用者問題，並聲明不可假設範圍外內容。
9. Assistant delta 依 item id 累加；item completed 以 canonical 最終文字校正；turn completed 解除 busy 狀態。
10. 關閉應用程式時解除 notification／exit listeners、拒絕 pending request 並終止本次啟動的 Codex process。

關鍵決策與容易踩雷的點：

- 閱讀邊界必須以原文 offset 保存；若直接存畫面 y 座標，重排版後標記會漂移。
- AI prompt 必須使用共同的 `extractReadingSegment()` 裁切入口；聊天路徑不可自己重做另一套範圍語意。
- 空範圍不可以整章當 fallback，否則使用者的閱讀界線失去安全意義。
- START／END 的 offset 依 Renderer `textContent` 計算，因此安全 HTML 轉換必須穩定，不能在拖曳期間任意重建或插入隱藏文字。
- Codex response 與 notification 共用 stdout；必須按 envelope 形狀分流。
- Initialize response 成功後仍要送 `initialized` notification。
- 送出 turn/start 前先進 busy 狀態，因為 delta 可能比 request promise 恢復得更快。
- `item/completed` 是最終文字，不能把它再次附加在 delta 後面。
- Renderer 只能傳送型別化問題與 context，不能控制 method、cwd、approval、sandbox、tools 或 capability roots。
- 本範例固定 `approvalPolicy: never`、read-only sandbox，並停用 tools 相關的 skills、plugins、apps、memories 與 web search。

## 6. 改寫指引（匯入到別專案時）

| 部分 | 保留或替換 | 說明 |
|------|--------------|------|
| START／END 的文字 offset 模型 | 保留 | 這是跨排版穩定定位的核心 |
| `extractReadingSegment()` 單一裁切入口 | 保留 | 所有 AI 工作流必須服從同一內容邊界 |
| Context 的書名／章名／區段／問題分隔 | 保留 | 防止 metadata 和使用者問題混淆 |
| Codex initialize → initialized → account/read | 保留 | App-server 正常連線的必要握手 |
| Thread id 與 turn id 分離 | 保留 | 支援同一對話的多輪上下文與單次串流狀態 |
| Delta → item completed → turn completed | 保留 | 避免重複文字並正確解除 busy |
| Main／Preload／Renderer 的 allow-list | 保留 | 不把 raw process 或 Codex protocol 暴露給 UI |
| `tests/fake-codex-app-server.ts` | 測試中保留 | 讓協定測試穩定、不消耗帳戶額度 |
| `InMemoryEpubLibrary` | 通常替換 | 接上目標專案的持久書庫、去重、刪除與 migration |
| 精簡 EPUB parser | 視需求替換 | 若產品要廣泛相容 EPUB，補入 EPUB 2 NCX、巢狀目錄、fragment、加密辨識和多文件章節 |
| 三欄 React UI | 可替換 | 對齊目標產品設計系統，但保留閱讀區與對話區的狀態流 |
| Developer instructions | 替換 | 改為新產品「理解內容」的正式語境與回答準則，繼續禁止範圍外推測 |
| Working directory | 替換 | 使用目標應用程式管理的安全 user-data 子目錄，不能接受 Renderer 任意路徑 |
| 記憶體聊天狀態 | 視需求替換 | 需要跨重啟時加入對話持久化和 thread resume |

## 7. smoke test 摘要

這條測試驗證了：

- **Given** 一個執行期建立的合法最小 EPUB，以及使用正式 JSONL client 連接的 fake Codex child process
- **When** 匯入書籍、載入章節、把 START／END 設在 `Inside concept.`，送出問題後再追問
- **Then** EPUB metadata 與章節可讀、script 被移除、Codex prompt 包含書名／章名／範圍內文字但不含 `Before secret`／`After hidden`，只建立一次 thread，兩個 turn 都串流完成

已驗證命令：

```text
npm test
npm run test:codex
npm run typecheck
npm run build
```

匯入端應把這條 smoke test 翻譯成目標專案的核心驗收條件：AI 永遠只收到使用者明確標定的閱讀範圍，同一右側對話中的追問保持多輪上下文。
