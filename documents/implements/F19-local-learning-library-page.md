---
author: Codex
date: 2026-07-23
title: 建立可查詢、編輯與復原刪除的本機生詞庫頁
uuid: 7788bb5e7bc743889b4142b8ec45e51d
version: 1.1.0
status: implemented
---

# Feature Specification - 本機生詞庫頁

## 1. Feature Overview

將目前靜態的「Anki 式間隔複習」占位頁改為第一版**生詞庫（Learning Library）**。
使用者可以瀏覽十筆一次性初始化的範例**學習項目（Learning Item）**，依標題搜尋，
依類型與 CEFR 篩選，切換排序，並在置中的**學習項目詳情（Learning Item Detail）**
查看或編輯結構化資料與 Markdown 內容。

學習項目獨立保存於桌面應用程式專用的本機 SQLite 資料庫，不寫入 EPUB 書庫索引。
刪除項目時先移入**垃圾桶（Learning Item Trash）**，可個別還原；只有使用者確認
「清空垃圾桶」才永久刪除。

生詞庫工作區沿用其他頁面既有的右側 **AI 對話面板**，但本功能不讓 AI 讀取、查詢、
新增、修改或刪除學習項目，也不提供手動新增入口。AI 助教與卡片資料的連動、從標記
沉澱學習項目及 Anki 式間隔複習皆屬後續功能。

## 2. Requirements (User Story)

- **As a** 使用 LingoShelf 累積英文學習材料的讀者
- **I want** 在保留既有 AI 助教的生詞庫頁查詢、篩選、查看、編輯及安全刪除本機卡片
- **So that** 我可以先驗證卡片呈現與持久化基礎，並為後續 AI 建卡及間隔複習建立穩定資料邊界

## 3. Confirmed Product Rules

### 3.1 Learning item data

每筆學習項目至少包含：

- 不可變識別碼。
- 標題：畫面顯示的單字或片語，也是關鍵字搜尋唯一比對的內容。
- 類型：`word | phrase`。
- CEFR：`A1 | A2 | B1 | B2 | C1 | C2`。
- 語義識別：用來區分相同標題的不同語義；例如 `bank` 的「金融機構」與「河岸」是
  兩個學習項目。
- Markdown 內容：包含詞性、發音、簡明解釋、常用搭配及三至五句英文例句與講解語言
  翻譯。
- 狀態：`active | trashed`。
- 建立時間、更新時間，以及移入垃圾桶時間。

標題、類型、CEFR 與語義識別維持結構化；主要學習內容保存為原始 Markdown。
Markdown 查看時安全渲染，編輯時可修改原文並預覽。相同標題不得被當成全域唯一值。

### 3.2 Initial mock data

- 本機生詞庫資料庫第一次建立時，若尚未完成初始化，植入十筆穩定且可重現的範例資料。
- 十筆資料須同時涵蓋 `word`、`phrase`、A1 至 C2、相同標題不同語義，以及完整
  Markdown 呈現。
- 初始化完成狀態必須獨立記錄；不得只用「目前資料筆數為零」判斷。
- 重新啟動、編輯、移入垃圾桶、還原或永久清空後，都不得再次植入或覆寫範例。
- 建議範例標題與語義：

| Title | Type | CEFR | Sense |
|---|---|---|---|
| happy | word | A1 | feeling pleasure |
| bank | word | A2 | financial institution |
| bank | word | A2 | side of a river |
| reluctant | word | B2 | unwilling or hesitant |
| fastidious | word | C2 | very attentive to detail |
| wake up | phrase | A1 | stop sleeping |
| figure out | phrase | B1 | understand or solve |
| take for granted | phrase | B2 | fail to appreciate |
| on the verge of | phrase | C1 | very close to happening |
| for all intents and purposes | phrase | C2 | in every practical sense |

### 3.3 Query, filters, and sorting

- 關鍵字搜尋只比對標題，不搜尋語義識別、Markdown、例句或搭配詞。
- 標題搜尋不分英文字母大小寫，支援部分字串比對。
- 類型篩選提供「全部、單字、片語」。
- CEFR 篩選提供「全部、A1、A2、B1、B2、C1、C2」。
- 排序提供「最近新增、字母順序」；最近新增為預設。
- 搜尋、類型與 CEFR 可同時套用，排序套用於篩選後結果。
- 沒有結果時顯示空狀態及「清除篩選」。
- 使用中清單與垃圾桶是不同集合；垃圾桶項目不可出現在一般查詢結果。

### 3.4 Learning item detail and editing

- 點擊使用中卡片後，詳情以畫面正中央、位於背景內容上層的 modal 呈現。
- 點擊 modal 外的遮罩或按下 Escape 關閉；點擊 modal 內部不得意外關閉。
- modal 須有可辨識的標題、關閉控制、焦點管理及 `aria-modal` 語意。
- 查看狀態顯示標題、類型、CEFR、語義與安全渲染的 Markdown。
- 使用者可切換編輯狀態，修改標題、類型、CEFR、語義識別及原始 Markdown。
- 編輯狀態提供 Markdown 預覽，以及明確的「儲存」與「取消」。
- 標題、語義識別及 Markdown 不可為空；類型與 CEFR 必須是白名單值。
- 儲存成功後立即更新清單與詳情，重新啟動後仍保留。
- 取消或直接關閉未儲存的編輯時，不得修改持久資料。
- Markdown 不能執行 HTML、script、事件處理器或不安全 URL。

### 3.5 Trash and permanent deletion

- 詳情中的「刪除」只把使用中項目移入垃圾桶，不永久刪除。
- 生詞庫提供獨立垃圾桶入口及目前項目數量。
- 垃圾桶中的每個項目可個別還原；還原後重新出現在使用中清單。
- 第一版不提供單筆永久刪除。
- 「清空垃圾桶」執行前必須顯示確認 modal，明確說明不可復原。
- 取消確認不得改變資料；確認後永久刪除垃圾桶內全部項目。
- 清空空的垃圾桶不得失敗，也不得重新植入 mock data。

### 3.6 Local persistence and access boundary

- SQLite 位於 Electron `userData` 下獨立的 learning-library 路徑；測試使用隔離的暫存路徑。
- EPUB `library/index.json` 不保存學習項目。
- Electron Main 擁有 schema migration、一次性 seed、驗證、查詢、更新、垃圾桶及交易。
- Renderer 不可取得 SQLite 路徑、SQL、Node API 或通用 IPC。
- Preload 只暴露本頁需要的型別化 list/get/update/trash/restore/empty-trash 方法。
- Repository 保留內部 create 能力供 seed 與後續功能使用；本階段不向畫面提供新增操作。
- 清空垃圾桶及 seed 必須具交易一致性；輸入在 Main 邊界再次驗證。
- 本階段不做帳號、雲端或跨裝置同步，也不做匯入／匯出。

### 3.7 Workspace and AI boundary

- 左側原「Anki 複習」占位入口改為「生詞庫」，顯示使用中項目數量而非硬編碼 10。
- 生詞庫標題、垃圾桶入口與搜尋／篩選／排序控制固定在中央內容區頂部；只有結果與
  卡片清單獨立捲動，並顯示目前結果筆數。
- 生詞庫頁保留可摺疊、可調寬、可切換對話與模型的既有 AI 對話面板。
- 在生詞庫頁送出訊息仍是一般 AI 對話，不附加學習項目資料或新的 trusted intent。
- 本功能不得改變書庫、書籍總覽、閱讀頁、標記、區段解析、區段練習或 AI 對話生命週期。

## 4. Acceptance Criteria

- **Scenario 1：第一次建立並只植入一次**
  - **Given** 本機 learning-library 尚未初始化
  - **When** 桌面應用程式首次啟動
  - **Then** 資料庫完成 migration 並建立十筆指定範圍的 mock 學習項目
  - **And** 第二次啟動不重複建立或覆寫資料

- **Scenario 2：瀏覽與複合查詢**
  - **Given** 十筆 mock 學習項目已存在
  - **When** 使用者組合標題搜尋、類型篩選、CEFR 篩選與排序
  - **Then** 只顯示同時符合條件的使用中項目，順序符合選擇
  - **And** 搜尋不得因 Markdown 或語義內含關鍵字而命中

- **Scenario 3：置中查看 Markdown 詳情**
  - **Given** 使用中清單有卡片
  - **When** 使用者點擊卡片
  - **Then** 置中的 modal 顯示結構化欄位與安全渲染的 Markdown
  - **And** 點擊遮罩或按 Escape 關閉，點擊 modal 內部不關閉

- **Scenario 4：編輯並持久保存**
  - **Given** 使用者已打開學習項目詳情
  - **When** 使用者修改合法的結構化欄位與 Markdown 並儲存
  - **Then** 清單及詳情立即反映變更，重新啟動後資料仍存在
  - **And** 取消、關閉未儲存編輯或提交非法欄位時不改寫資料

- **Scenario 5：移入垃圾桶與還原**
  - **Given** 一個使用中學習項目
  - **When** 使用者刪除後進入垃圾桶，再執行還原
  - **Then** 項目先從一般查詢消失並出現在垃圾桶，還原後回到使用中清單
  - **And** Markdown 與所有結構化資料保持不變

- **Scenario 6：確認後清空垃圾桶**
  - **Given** 垃圾桶內有一個或多個項目
  - **When** 使用者選擇清空垃圾桶
  - **Then** 取消確認不改變資料，確認後才永久刪除全部垃圾桶項目
  - **And** 重新啟動不恢復已清空項目，也不重新植入 mock data

- **Scenario 7：保留既有 AI 助教但不連動**
  - **Given** 使用者位於生詞庫頁
  - **When** 使用者進行一般 AI 對話、切換對話或模型、摺疊或調整面板
  - **Then** 行為與其他工作區一致
  - **And** AI input、snapshot 及 Renderer bridge 不包含學習項目資料或寫入能力

- **Scenario 8：本機隔離與錯誤狀態**
  - **Given** Renderer 載入、查詢或更新生詞庫
  - **When** Main 成功或拒絕無效輸入／發生持久化錯誤
  - **Then** 成功結果經窄化 typed API 回傳
  - **And** 無效資料不寫入，Renderer 顯示可理解錯誤且既有資料保持完整

- **Scenario 9：固定查詢工具區**
  - **Given** 生詞庫結果超過中央內容區可視高度
  - **When** 使用者向下捲動卡片清單
  - **Then** 生詞庫標題、垃圾桶入口、搜尋、類型、CEFR 與排序維持在中央區頂部
  - **And** 只有結果區發生捲動，左右側欄與固定工具區位置不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Migration and one-time seed | New and reopened local database | Initialize repository twice | Exactly 10 stable items; no duplicate or overwrite | Critical |
| TC2 | Seed survives empty database | All mock cards moved to trash and trash emptied | Reopen repository | Remains empty; seed is not repeated | Critical |
| TC3 | Title-only search | Keyword appears in title, sense, and Markdown on different items | Search keyword | Only title matches, case-insensitive and partial | High |
| TC4 | Combined filters and sorting | Mixed type and CEFR items | Apply search/type/CEFR/sort | Intersection and requested order are returned | High |
| TC5 | Detail modal behavior | Active card is visible | Open, click inside, click backdrop, press Escape | Center modal stays/ closes at correct boundaries | High |
| TC6 | Safe Markdown | Markdown contains GFM and unsafe HTML/URL | Render detail and preview | GFM renders; executable or unsafe content does not | Critical |
| TC7 | Valid edit persistence | Existing item | Save valid structured fields and Markdown, reopen | Updated values persist and timestamps advance | Critical |
| TC8 | Cancel and invalid edit | Existing item | Cancel/close or submit empty/unknown values | No persisted mutation; clear validation/error | High |
| TC9 | Trash and restore | Active item | Trash then restore | State transitions, queries, counts, and content are correct | Critical |
| TC10 | Empty trash confirmation | Trashed items | Cancel then confirm empty | Cancel retains; confirm permanently deletes all | Critical |
| TC11 | Typed IPC validation | Valid and malformed bridge payloads | Invoke list/get/update/trash/restore/empty | Valid routes work; malformed input is rejected | Critical |
| TC12 | AI panel parity | Learning Library workspace | Use existing chat controls and send ordinary message | Existing behavior remains; no learning context or mutation | High |
| TC13 | Existing workspace regression | Imported books, reading range, annotations, settings and chat | Run existing Renderer/Main/E2E suites | Existing behavior remains unchanged | Critical |
| TC14 | Pinned learning controls | Card results exceed center viewport | Scroll result region to bottom | Header and all query controls keep the same viewport positions | High |

## 6. Anticipated Impact

### New files

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- focused Main, IPC and Renderer tests
- `documents/modules/learning-library.md`

### Existing files likely to change

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/ai-conversation.md`
- `CONTEXT.md`

`App.tsx` currently coordinates all workspaces, reading state, settings and AI conversation state.
This feature may extract a focused `LearningLibraryWorkspace` component to keep the new list,
modal and trash state testable, but a broader workspace refactor is not required by this FXX.

## 7. Assumptions and Non-goals

- 第一版只有一次性 mock data，沒有任何 UI 新增入口。
- AI 助教與生詞庫沒有讀寫或查詢連動；使用者在對話中說「新增某單字」只會得到一般文字回覆。
- 不從標記、區段解析、書籍或章節自動建立學習項目，也不保存來源快照。
- 不實作翻卡、AI 即時出題、到期項目、複習回合、複習自評、排程演算法或複習歷史。
- 不提供封存、單筆永久刪除、復原清空垃圾桶、匯入、匯出或同步。
- 不提供全文搜尋；Markdown、語義、例句及搭配詞都不參與關鍵字查詢。
- 不要求 pagination 或 virtual scrolling；第一版資料量及查詢介面仍應允許後續擴充。

## 8. Implementation Record

### Status

Implemented on 2026-07-23.

### Implementation Summary

- 新增獨立的 `LocalLearningLibrary`，使用 Node 內建 SQLite 在 Electron user data 下保存
  學習項目、migration 與一次性 seed metadata。
- 植入十筆穩定 mock data，涵蓋 word／phrase、A1–C2、兩個 `bank` 語義及每筆三句
  英文例句與繁體中文翻譯。
- 新增六個窄化 typed IPC／preload 操作：list、get、update、trash、restore、
  empty-trash；create 僅保留於 Main repository 內部。
- 新增 `LearningLibraryWorkspace`，完成標題搜尋、類型／CEFR 篩選、排序、結果數量、
  空狀態、置中詳情、安全 Markdown、編輯預覽、垃圾桶與確認清空。
- 將中央區改成固定工具區與獨立結果捲動區；生詞庫標題、垃圾桶及全部查詢控制不會
  隨卡片捲動離開畫面，並重整卡片層級、留白、focus／hover 與窄寬容器佈局。
- App 啟動時預先載入使用中／垃圾桶數量，側欄在進入生詞庫前就顯示真實筆數。
- 保留既有右側 AI 對話面板，不增加任何學習項目 context、trusted intent 或寫入能力。

### Test Coverage

- `learning-library-service.test.ts`：5 個 repository 測試，涵蓋 migration、只 seed 一次、
  全刪後不重建、標題搜尋、複合篩選、編輯驗證與垃圾桶生命週期。
- `learning-library-ipc.test.ts`：2 個 IPC 測試，驗證只註冊六個能力及錯誤 payload
  在 repository 前被拒絕。
- `learning-library-workspace.test.tsx`：4 個 UI 測試，涵蓋查詢、固定工具區結構、
  modal 邊界、安全 Markdown、編輯／取消及垃圾桶確認。
- `App.test.tsx`：驗證啟動數量、入口、十筆資料工作區與既有 AI 助教共存。
- `desktop.spec.ts`：真實 Electron 啟動、六個 learning bridge 白名單、十張卡片、
  `bank` 詳情，以及把結果捲到底後固定工具區位置不變。

### Changed Files

新增：

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `documents/modules/learning-library.md`

更新：

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `CONTEXT.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

- Scenario 1–2：SQLite repository 測試確認十筆資料只植入一次，且所有項目永久刪除後
  重啟仍維持空資料庫。
- Scenario 2：repository 與 Renderer 測試確認搜尋僅比對標題，並可與類型、CEFR、
  排序組合。
- Scenario 3–4：Renderer 測試確認 modal、Escape／遮罩、焦點回復、安全 Markdown、
  編輯預覽、取消與儲存；repository 測試確認重啟後仍保留合法編輯。
- Scenario 5–6：repository 與 Renderer 測試確認移入垃圾桶、個別還原、取消清空、
  確認永久清空與空垃圾桶冪等行為。
- Scenario 7：App 與既有 chat 測試確認 AI 面板繼續工作，learning bridge 未進入 chat。
- Scenario 8：IPC 與 repository 雙層驗證錯誤輸入；Renderer 顯示可理解的錯誤狀態。
- Scenario 9：Electron E2E 將獨立結果區捲到底，確認固定工具區與全部查詢控制的
  viewport 座標不變。

### Test Scenario Verification

- TC1–TC4、TC7、TC9：由 `learning-library-service.test.ts` 通過。
- TC5–TC6、TC8、TC10、TC14：由 `learning-library-workspace.test.tsx` 與
  Electron E2E 通過。
- TC11：由 `learning-library-ipc.test.ts` 及 Electron bridge 白名單檢查通過。
- TC12：由 `App.test.tsx` 與完整 AI 對話回歸測試通過。
- TC13：完整 Server／Desktop Vitest、typecheck、production build 及 Electron
  Playwright 全部通過。

### Commands Executed

- `npm test`：Server 3/3、Desktop 139/139 passed。
- `npm run typecheck`：passed。
- `npm run build`：passed。
- `npm run test:e2e -w @reader/desktop`：2/2 passed。
- `git diff --check`：passed。

第一次在受限 sandbox 內啟動 Electron E2E 時，程序在建立 GUI 前因權限限制失敗。
檢查 Electron 的 Node 版本與 `node:sqlite` 支援後排除 runtime 不相容；在獲准的桌面
執行環境重跑，同一套 E2E 2/2 通過。未為此加入產品 workaround 或 debug code。

### Architectural Observations

- 學習項目資料庫與 EPUB index 分離，且 Renderer 只取得六個最小能力，後續可在 Main
  內加入來源追溯、AI draft 或複習排程，而不必把 SQL／檔案能力暴露給畫面。
- `LearningLibraryWorkspace` 已把本功能的查詢、modal、編輯與垃圾桶狀態從廣泛的
  `App.tsx` 抽離，避免進一步擴大 App 的責任。
- `App.tsx` 仍同時協調書庫、閱讀、設定、AI 與工作區切換，是既有架構的長期重構候選；
  本次沒有出現阻擋 F19 或需要立即建立 RXX 的新耦合。
- 未實作的 AI 建卡、標記沉澱與 Anki 式複習刻意留在 typed bridge 之外，避免第一版
  介面先形成過寬權限邊界。
