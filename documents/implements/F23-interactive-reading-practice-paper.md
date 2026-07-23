---
author: Codex
date: 2026-07-24
title: 將區段練習改為 AI 對話欄內的可折疊試卷
uuid: f23b4ed3c9984e18b65ba876e4d04273
version: 1.6.0
status: implemented
---

# Feature Specification - AI 對話欄內的互動式區段練習試卷

## 1. Feature Overview

將目前只在 AI 對話文字中呈現的**區段練習**改造成專用試卷介面。閱讀頁右側的 AI 對話面板提供「閱讀測驗」產生入口；AI 依目前 START／END **閱讀區段**產生選擇題與問答題後，在產生該試卷的 AI 訊息下方顯示可點擊的試卷產物元件，互動節奏與學習項目草稿清單一致。

使用者點擊試卷產物元件後，試卷直接在產生它的 AI 訊息中展開，寬度與 **AI 對話面板**內容區一致，不建立浮動面板也不遮住章節原文。使用者可以隨時把整份試卷折起來，之後再次展開並保留本次工作階段已填答案。展開後可直接點選每題 A、B、C、D，並在問答題輸入文字；所有題目作答完畢後一次提交。AI 在同一**AI 對話**中批改，試卷進入批改中狀態，完成後以紅筆批註風格逐題顯示結果、正解、理由與整體評語。批改總結預設以精簡分數列呈現，詳細的閱讀理解、書面表達與複習重點可再展開，避免壓縮題目查看空間。此功能只改善區段練習的互動與呈現，不建立題庫、不更新複習排程，也不把區段練習改成 Anki 式**複習回合**。

AI 對話面板可在 280–640px 間調整，因此試卷採窄欄優先排版：精簡標題區只保留題名、題數與 CEFR，較長的難度說明收進可展開的「本卷重點」；試卷頂部顯示即時作答進度；每題以獨立卡片和至少 48px 的答案點擊區呈現。為避免長選項在雙欄中被擠壓，所有寬度都維持單欄、由上到下排列。批改狀態仍以紅筆色彩辨識，但長段回饋使用易讀字體和間距。標題、進度與提交區均參與一般排版，不固定覆蓋題目。

## 2. Requirements (User Story)

- **As a** 閱讀 EPUB 並完成一段原文的學習者
- **I want** 在像紙本考卷的專用介面中點選選擇題、輸入問答題並一次提交
- **So that** 我能專心作答，並像查看老師紅筆批改一樣清楚理解每題表現

## 3. Acceptance Criteria

- **Scenario 1：右側顯示測驗產生入口**
  - **Given** 使用者位於章節閱讀頁
  - **When** AI 對話面板展開
  - **Then** 右側快捷功能顯示可辨識的「閱讀測驗」產生入口
  - **And** Codex 未就緒、正在回覆或正在管理對話時入口停用

- **Scenario 2：產生完成後顯示可點擊試卷元件**
  - **Given** 使用者點擊閱讀測驗入口
  - **When** AI 正在依目前閱讀區段產生題目
  - **Then** 不自動開啟試卷或阻擋閱讀畫面
  - **And** AI 回傳有效的結構化試卷後，在對應 AI 訊息下方顯示試卷產物元件
  - **And** 元件顯示試卷標題、題數及「開始作答」提示
  - **And** 不完整、格式錯誤或非最新試卷 artifact 不產生錯誤元件

- **Scenario 3：在 AI 訊息內展開與收合試卷**
  - **Given** AI 訊息下方已有試卷產物元件
  - **When** 使用者點擊該元件
  - **Then** 試卷直接在產生它的 AI 訊息內展開，寬度與 AI 對話欄一致
  - **And** 不建立覆蓋章節原文的浮動面板、遮罩或額外寬度
  - **And** 試卷提供「收起試卷」控制，Escape 也可收起
  - **And** 收起後回到摘要卡，再次展開仍保留本次工作階段答案

- **Scenario 4：在試卷內作答**
  - **Given** 試卷已完成且尚未提交
  - **When** 使用者回答選擇題
  - **Then** 每題可直接點選 A、B、C、D 且同題只能選一個答案
  - **And** 問答題提供多行輸入欄位
  - **And** 未完成所有題目時提交按鈕停用並顯示尚未作答題數
  - **And** 試卷頂部以可存取的進度條即時顯示已完成題數

- **Scenario 4A：窄欄優先的試題排版**
  - **Given** AI 對話面板位於最窄或預設寬度
  - **When** 使用者展開試卷
  - **Then** 標題區以題名、題數及 CEFR 為主，難度說明預設收在「本卷重點」
  - **And** 每題是具清楚間距的獨立卡片，選項使用單欄且點擊區至少 48px 高
  - **And** 鍵盤焦點、已選答案及已完成題目具有可辨識狀態
  - **And** 無論 AI 對話欄寬度為何，選項都固定單欄並依 A、B、C、D 由上到下排列

- **Scenario 5：提交並等待 AI 批改**
  - **Given** 使用者已完成所有選擇題與問答題
  - **When** 使用者點擊「提交試卷」
  - **Then** 系統把具題號的完整答案送回產生試卷的同一 AI 對話
  - **And** 試卷鎖定答案、顯示 AI 批改中狀態且避免重複提交
  - **And** 若送出或批改失敗，保留答案並顯示可理解的錯誤

- **Scenario 6：以紅筆批註顯示結果**
  - **Given** AI 已完成批改
  - **When** 試卷取得有效的結構化批改結果
  - **Then** 每題附近以紅色批註顯示正確或錯誤、正確答案與理由
  - **And** 問答題顯示切題程度、修正版及必要說明
  - **And** 試卷頂部以精簡列顯示分數與可展開的批改總結
  - **And** 詳細總結展開後顯示閱讀理解、書面表達與複習重點
  - **And** 已提交答案不可再次修改或提交

- **Scenario 7：維持既有領域與安全邊界**
  - **Given** 使用者使用互動試卷
  - **When** 系統出題或批改
  - **Then** 題目只使用目前閱讀區段與既有解析
  - **And** 題面、問答題回答與批改仍遵守講解語言
  - **And** 原始 AI 訊息仍保存於 AI 對話
  - **And** 不建立學習項目、不更新複習排程、不允許 Renderer 指定任意 skill 或 prompt

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 測驗產生入口 | 閱讀頁且 Codex ready | 呈現右側快捷功能 | 顯示可用的閱讀測驗產生入口 | Critical |
| TC2 | 對話試卷產物 | AI 完成出題 | snapshot 更新 | 對應 assistant 訊息下方出現試卷標題、題數與開始作答元件，試卷不自動開啟 | Critical |
| TC3 | 訊息內展開試卷 | 試卷產物存在 | 點擊元件 | 同一 AI 訊息內展開與對話欄同寬的試卷，不產生浮動 dialog | Critical |
| TC4 | 作答控制 | 尚有未作答題目 | 點選選項與輸入回答 | 保存作答；完成前不能提交 | Critical |
| TC4A | 窄欄作答進度 | 試卷剛展開 | 依序回答選擇題與問答題 | 可存取進度條由 0 更新至全部完成，題目同步標示完成狀態 | Critical |
| TC4B | 窄欄資訊層級 | 試卷剛展開 | 查看標題與難度 | 題名、題數、CEFR 直接可見；「本卷重點」預設收合並可展開 | High |
| TC4C | 單欄選項 | 試卷在 280–640px 對話欄內 | 調整 AI 對話欄寬度 | 所有寬度皆維持單欄、A–D 由上到下排列，且具 48px 點擊區 | High |
| TC5 | 提交答案 | 所有題目已回答 | 點擊提交 | 同一對話收到具題號答案；試卷鎖定並顯示批改中 | Critical |
| TC6 | 紅筆批改 | AI 回傳結構化批改 | snapshot 更新 | 試卷元件更新狀態；展開後顯示逐題紅色批註、分數與可展開總結 | Critical |
| TC7 | 收合與重開 | 試卷存在 | Escape、收起與同一產物元件 | 收合後可重開且保留本次工作階段作答狀態 | High |
| TC8 | 無效 artifact | AI 回覆缺漏或格式錯誤 | 解析回覆 | 不崩潰、不產生試卷元件並保留 AI 對話文字 | High |
| TC9 | 既有行為隔離 | 一般提問、解析或新增學習項目 | 使用其他功能 | 不開啟或覆寫試卷 | High |

## 5. Implementation Notes

- App 內建 `practice-reading-comprehension` skill 以固定 fenced JSON artifact 輸出題目與批改；一般人類可讀文字仍保留在同一 assistant message。
- Renderer 只解析受限 schema，並以目前對話內最新的有效 artifact 建立本機暫存試卷狀態；artifact 不授予任何額外權限。
- 試卷產物元件附著於含有效 quiz artifact 的 assistant message；同一元件在收合摘要卡與展開試卷之間切換，不由 artifact 到達事件自動展開。
- 試卷答案只在 Renderer 狀態中保存到送出為止；本版不新增持久化資料庫或跨啟動歷史成績。
- 將 artifact 解析與答案格式化拆成純函式，讓格式錯誤、未作答計算與送出內容可獨立測試。
- 互動試卷以獨立 React 元件呈現，避免繼續擴張 `App.tsx` 的單一 JSX 區塊。

## 6. Assumptions and Non-goals

- 「紅字顯示審批過程」定義為批改進度狀態，以及批改完成後的逐題紅筆批註；不顯示模型內部推理或 chain-of-thought。
- AI 回覆的 artifact 可能因串流暫時不完整；Renderer 只在 JSON 完整且通過 schema 驗證後更新試卷。
- 本版一次只顯示目前 AI 對話中最新一份區段練習；切換 AI 對話時跟隨該對話的最新試卷。
- 試卷在 AI 訊息內參與一般文件排版，不使用 fixed／absolute 浮動定位、modal backdrop 或獨立拖曳寬度。
- 試卷整體收合只隱藏題目介面，不清除本次元件工作階段內尚未提交的答案。
- 批改總結使用獨立的可展開區域，預設只顯示分數與摘要標籤。
- 窄欄與寬欄切換以試卷元件自身寬度為準，不依整個視窗寬度判斷。
- 進度以非空答案計算；重新開啟已有批改 artifact 的試卷時直接視為完成。
- 不使用 sticky 標題或 sticky footer，以免任何試卷控制覆蓋題目內容。
- 不新增暫存草稿的跨重啟保存、測驗歷史趨勢、題數設定、題庫或人工重新評分。
- 不改變既有 8–12 題選擇題、1–3 題問答題與講解語言規則。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- 右側「閱讀測驗」快捷入口只負責要求 AI 出題，不再立即開啟或遮住閱讀內容。
- `practice-reading-comprehension` skill 新增固定 `reading-practice-quiz` 與 `reading-practice-grade` fenced JSON 契約，仍維持 8–12 題選擇題、1–3 題問答題、講解語言與延後揭露答案規則。
- 新增獨立 artifact parser，只接受完整且合法的固定 schema；串流中途、錯誤 JSON、quiz id 不符或未覆蓋全部題目的批改安全忽略。
- 有效 quiz artifact 會在產生它的 AI 訊息下方顯示 paper 產物元件，內容包含試卷標題、題數、作答或批改狀態；只有點擊元件才在同一訊息內展開試卷。
- 試卷使用 AI 訊息的一般文件排版並跟隨對話欄寬度，不再建立 fixed 浮動層、dialog、遮罩或獨立寬度，因此不會覆蓋章節原文。
- 同一試卷元件負責收合摘要卡與展開內容兩種狀態；收起按鈕或 Escape 可折起試卷，之後再次展開仍保留本次工作階段答案。
- 試卷支援 A–D 單選、問答多行輸入、未作答計數、完整後提交、送出失敗保留答案及送出後鎖定。
- AI 批改中顯示紅筆進度，完成後在原題旁顯示正確／錯誤、正解、理由與問答修正版；批改總結預設收合，只顯示分數列，展開後才顯示閱讀理解、書面表達與複習重點。
- 1.5 版將展開試卷改為 280–640px 窄欄優先設計：標題只保留題名、題數、CEFR 與題型數，長難度說明放入預設收合的「本卷重點」。
- 1.6 版依使用者閱讀需求，讓所有試卷寬度都固定單欄顯示 A–D 選項，避免長選項在雙欄中被過度換行。
- 試卷頂部新增可存取的原生進度條；每次選擇答案或輸入問答後即時更新完成數，完成題目的題號同步變色，已有批改結果時直接顯示全部完成。
- 每題改為獨立卡片；A–D 點擊區至少 48px 並提供 hover、keyboard focus、selected 狀態。1.6 版移除 460px 時切換雙欄的規則，所有試卷寬度都固定依 A–D 單欄排列。
- 紅筆長段回饋改用一般易讀字體，手寫字體只保留在結果標記；所有控制參與一般排版，不使用 sticky header／footer。
- 原始 artifact 隨 AI 訊息保存在同一對話，但右側 Markdown 訊息隱藏 JSON 本體，避免與互動試卷重複。
- 沒有新增 IPC 權限、資料庫、題庫、複習排程或 Renderer 可指定的 skill／prompt。

### Test Coverage

- TC1、TC2、TC3、TC9：`App.test.tsx` 驗證測驗入口不自動展開、AI 訊息試卷元件、點擊後在同一 AI 訊息內展開、可收合及既有 intent 行為。
- TC3、TC8：`reading-practice-artifact.test.ts` 驗證最新 quiz／grade、串流半份 JSON、錯誤／不相符 artifact 與逐題完整覆蓋。
- TC2、TC4、TC5、TC6、TC7：`ReadingPracticePaper.test.tsx` 驗證試卷產物標題／題數／批改狀態、訊息內 region、A–D 單選、問答輸入、完整前不可提交、固定答案 payload、鎖定、紅筆批註、批改總結預設收合、Escape 及收合／重開保留答案。
- TC4A、TC4B、TC4C：`ReadingPracticePaper.test.tsx` 驗證進度條由 0 更新至全部完成、題目 `data-answered` 狀態、題數／CEFR／本卷重點資訊層級、答案群組語意、48px 點擊區、鍵盤焦點，以及所有試卷寬度都維持單欄的樣式契約。
- AI 契約：`reading-comprehension-skill.test.ts` 驗證 quiz／grade artifact 名稱與核心欄位。

### Changed Files

#### Production code

- `.agents/skills/practice-reading-comprehension/SKILL.md`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/ReadingPracticePaper.tsx`
- `apps/desktop/src/renderer/reading-practice-artifact.ts`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/reading-comprehension-skill.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/ReadingPracticePaper.test.tsx`
- `apps/desktop/src/renderer/reading-practice-artifact.test.ts`

#### Documents

- `documents/implements/F23-interactive-reading-practice-paper.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/ai-conversation.md`

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/reading-practice-artifact.test.ts
npm run test -w @reader/desktop -- src/renderer/ReadingPracticePaper.test.tsx src/renderer/App.test.tsx
npm run test -w @reader/desktop -- src/renderer/ReadingPracticePaper.test.tsx
npm run test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

1.4 Red phase：相關測試 6 failed／52 passed，失敗原因分別為舊元件在收合時不渲染、使用 dialog 與 fixed stage、試卷位於 AI 訊息外，以及批改總結不能折疊。

1.5 Red phase：`ReadingPracticePaper.test.tsx` 4 failed／5 passed，確認既有窄欄版缺少 `aria-expanded`、進度條、本卷重點、答案群組與 container query 樣式。另有一次測試檔路徑錯誤；確認 Vitest 將 `import.meta.url` 轉為瀏覽器 URL 後，改從已設定的 renderer test root 定位樣式檔。

1.5 最終驗證：`ReadingPracticePaper.test.tsx` 9/9 passed；`App.test.tsx` 與試卷整合測試 62/62 passed；全專案 TypeScript typecheck passed；Server Vitest 3/3、Desktop Vitest 185/185、Electron Playwright 2/2 passed；production build 與 `git diff --check` passed。

1.6 Red phase：`ReadingPracticePaper.test.tsx` 1 failed／8 passed，失敗明確來自 460px container query 仍把 `.paper-options` 改成雙欄。

1.6 最終驗證：移除該雙欄覆寫後，`ReadingPracticePaper.test.tsx` 9/9 passed；Desktop Vitest 191/191 passed；Desktop TypeScript typecheck、production build 與 `git diff --check` passed。

### Architectural Notes

- 試卷互動與 artifact 驗證分別抽到獨立元件和純函式，`App.tsx` 只負責入口、AI turn 與開關狀態，避免把整份作答 JSX 繼續堆入主元件。
- quiz／grade artifact 是 AI 對話訊息中的受限呈現資料，不是新的持久化領域實體，也不擴張 Renderer 權限。
- 「紅字顯示審批過程」實作為可見批改進度與教學回饋，沒有要求或顯示模型 chain-of-thought。
- 驗收期間 Electron E2E 曾在既有生詞庫 sticky toolbar 的精確 `getBoundingClientRect()` 相等斷言出現一次 2px 差異。假說包含字型／版面收斂時序、subpixel rounding、CSS 選擇器外溢與既有文案影響；差異檢查排除 `.learning-library-*` CSS 變更，單案例重跑 3/3、最終完整 E2E 2/2，確認為既有時序波動，未修改產品碼或測試。

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 右側顯示測驗產生入口且不自動開啟試卷 | Pass | `starts a reading comprehension quiz from the current range without annotations` |
| 有效 artifact 在對應 AI 訊息下顯示可點擊試卷元件 | Pass | App 整合測試與 `ReadingPracticePaperAction` 測試 |
| 點擊產物後在同一 AI 訊息內展開且不遮住原文 | Pass | `expands and folds the reading paper inside its AI message` 與 inline layout 元件測試 |
| 收合、Escape 與重開保留本次工作階段答案 | Pass | `renders as a collapsible chat artifact and folds with Escape`、`keeps in-progress answers when the paper is closed and reopened` |
| A–D 單選、問答輸入、完整前不可提交 | Pass | `supports A-D selection, open-ended input and one complete submission` |
| 窄欄標題資訊分層、進度與完成狀態 | Pass | `tracks completion with a compact accessible progress overview`、`keeps secondary metadata folded and groups narrow answer choices` |
| 48px 點擊區、鍵盤焦點與所有寬度固定單欄 | Pass | `keeps answer choices in one vertical column at every paper width` |
| 同一 AI 對話提交完整答案、鎖定並顯示批改中 | Pass | submission formatter 與 paper 元件測試 |
| 完整批改以逐題紅筆批註與預設收合總結呈現 | Pass | `renders matching AI grading as red pen annotations and a final review` |
| 維持閱讀區段、講解語言、skill 與複習排程邊界 | Pass | 既有 controller／IPC／skill 回歸測試與未新增 bridge |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | App 測驗入口與 disabled 回歸 |
| TC2 | Pass | assistant message paper artifact action |
| TC3 | Pass | 同一 AI 訊息內的 inline region、無 dialog／fixed stage |
| TC4 | Pass | A–D radio、textarea、未作答計數 |
| TC4A | Pass | 原生 progress、即時完成數與 `data-answered` |
| TC4B | Pass | 題數、CEFR、預設收合本卷重點與答案 group |
| TC4C | Pass | 48px touch target、focus-visible 與全寬度單欄樣式契約 |
| TC5 | Pass | 固定 quiz／question id submission 與鎖定 |
| TC6 | Pass | matching complete grade、紅筆批註與預設收合 final review |
| TC7 | Pass | 收起按鈕、Escape callback、fold／reopen 保留答案 |
| TC8 | Pass | incomplete、malformed、mismatched、partial grade 隔離 |
| TC9 | Pass | Desktop Vitest 全套 185/185 |

### Deferred Items

- 未提交答案的跨啟動保存、獨立測驗歷史與成績趨勢仍不在本版範圍。
- 沒有新增「重新出題」按鈕；同一 AI 對話的入口重開最新試卷，要建立另一份可使用新 AI 對話。

### Notification

- `ddd-email-notify`: skipped-not-configured
- From: —
- To: —
- Reason: `documents/ddd-email-notify.md` 仍為 placeholder，未設定可驗證的寄件與收件地址。
