---
author: Codex
date: 2026-07-21
title: 建立持久標記並由 AI 講解閱讀區段中的標記內容
uuid: 69e46a24f8fd44bebd72601af3f8f54c
version: 1.1.0
status: implemented
---

# Feature Specification - 持久標記與 AI 區段解析

## 1. Feature Overview

目前章節閱讀頁已能以 START／END **範圍標籤（Range Marker）**界定 **閱讀區段（Reading Segment）**，並在下一次 AI 訊息中提供變更後的區段原文，但尚未實作真正的 **標記（Annotation）**。使用者無法把不理解的單字、片語或句子留在原文上，也無法讓 AI 分辨區段中的哪些文字是實際困難點。

本功能讓使用者透過持續開關的標記工具或右鍵功能選單，直接在章節原文建立及移除持久標記。標記依書籍與章節保存在本機，重新開啟後仍可還原。閱讀器提供標記模式的視覺狀態與原文標示，但第一版不要求使用者分類，也不把 AI 分類結果寫回標記。

右側 **AI 對話面板（AI Conversation Panel）**新增預設動作「講解標記內容」。閱讀器把 START／END 內的原文裁切後，以專屬 `<reader-annotation>` 標籤在原語序中標出區段內標記；START／END 或標記任一變更，皆使目前 AI 對話的閱讀上下文在下一次訊息中重新提供。一般輸入維持正常問答，只有預設動作會要求 AI 自動判斷標記屬於單字、片語或句子，依「單字、片語、句子」分組講解。

區段解析使用可持久化的全域 **講解語言（Explanation Language）**。預設由 AI 使用與原文相同的語言，使用者也可在設定中改為繁體中文、English 或日本語。

## 2. Requirements (User Story)

- **As a** 閱讀外語 EPUB 並會遇到理解困難的使用者
- **I want** 在原文上持久標記單字、片語或句子，並以一個預設動作交給 AI 講解
- **So that** AI 能在 START／END 的有限上下文中辨識我的實際困難點，而一般多輪對話仍可正常延續

## 3. Acceptance Criteria

- **Scenario 1：開啟與關閉標記模式**
  - **Given** 使用者正在章節閱讀頁且標記模式未開啟
  - **When** 使用者點擊標記工具按鈕
  - **Then** 按鈕顯示明確的啟用狀態，後續有效文字選取會立即建立標記
  - **And** 再次點擊按鈕會關閉標記模式
  - **And** 切換章節或離開閱讀頁時標記模式自動關閉

- **Scenario 2：在標記模式中連續建立標記**
  - **Given** 標記模式已開啟
  - **When** 使用者在目前章節內選取一段非空原文並完成選取
  - **Then** 系統立即以穩定章內文字 offset 建立持久標記並在原文顯示標記樣式，不要求第二次確認
  - **And** 標記模式保持開啟，可繼續建立下一個標記

- **Scenario 3：從右鍵功能選單建立標記**
  - **Given** 使用者未開啟標記模式，且已在目前章節選取非空原文
  - **When** 使用者開啟既有右鍵功能選單並選擇「標記所選內容」
  - **Then** 系統建立與標記模式相同的持久標記
  - **And** 既有「將起點移到這裡」及「將終點移到這裡」仍可使用

- **Scenario 4：忽略無效或重疊選取**
  - **Given** 選取不在目前章節內、去除邊界空白後為空，或與既有標記有任何重疊
  - **When** 使用者嘗試由標記模式或右鍵選單建立標記
  - **Then** 系統不新增或修改標記，也不顯示提示、錯誤或確認視窗
  - **And** 未重疊的相鄰標記仍可分別建立

- **Scenario 5：移除標記**
  - **Given** 章節原文已有一個持久標記
  - **When** 使用者在該標記上開啟右鍵功能選單並選擇「移除標記」
  - **Then** 系統立即從原文與本機章節資料移除該標記，不顯示確認視窗
  - **And** 既有 AI 對話與先前回覆保持不變

- **Scenario 6：跨次開啟恢復標記**
  - **Given** 使用者已在一本書的不同章節建立標記
  - **When** 使用者切換書籍或章節，或重新啟動應用程式後再次開啟相同章節
  - **Then** 每章只恢復自己的標記，文字範圍與原文標示維持一致
  - **And** 舊索引沒有標記資料時視為空集合，不影響既有書籍載入

- **Scenario 7：只序列化 START／END 內的標記原文**
  - **Given** 章節具有閱讀區段及章內標記
  - **When** 閱讀器準備提供 AI 閱讀上下文
  - **Then** 只傳送 `extractReadingSegment()` 所裁切的 START／END 內文字，區段外文字不得出現在 payload
  - **And** 區段內的標記交集依原語序以 `<reader-annotation id="A1">…</reader-annotation>` 包住
  - **And** 原文中的 `&`、`<`、`>` 必須先跳脫，不得與閱讀器專屬標籤衝突
  - **And** 跨出 START／END 的標記只包住裁切後仍位於區段內的交集，產生的標籤必須完整配對

- **Scenario 8：START／END 或標記變更會刷新目前 AI 對話的上下文**
  - **Given** 目前 AI 對話已成功收到一版閱讀區段與標記上下文
  - **When** 使用者移動 START／END，或新增／移除目前章節標記
  - **Then** 系統把閱讀上下文標記為待更新，但不因此自動建立 AI turn 或新對話
  - **And** 下一次一般提問或預設解析動作會重新提供目前書籍、章節及最新的內嵌標記區段
  - **And** 成功提供後，沒有任何範圍或標記變更的普通追問不重複傳送相同上下文
  - **And** bridge 拒絕訊息時不得把待更新上下文誤記為已成功提供

- **Scenario 9：一般 AI 問答不自動執行區段解析**
  - **Given** 目前閱讀上下文包含 `<reader-annotation>`
  - **When** 使用者在提問框輸入一般問題並送出
  - **Then** 系統只送出使用者的一般問題與必要的最新閱讀上下文，不附加「講解標記內容」的分類指令
  - **And** 回覆沿用目前選取的 AI 對話及 Codex thread

- **Scenario 10：以預設動作講解標記內容**
  - **Given** AI 已連線且右側顯示目前選取的 AI 對話或空白新對話
  - **When** 使用者點擊「講解標記內容」
  - **Then** 系統在目前 AI 對話送出可信任的固定區段解析意圖；空白新對話只在此時建立對話
  - **And** AI 只把 `<reader-annotation>` 包住的內容視為標記，其他區段文字只作為上下文
  - **And** AI 自動判斷每個標記是單字、片語或句子，固定依「單字、片語、句子」分組，同組依原文位置排列
  - **And** AI 可在句子組講解句型、文法與上下文語意，但不得把整個閱讀區段翻譯或自行講解未標記文字

- **Scenario 11：沒有標記仍可執行預設動作**
  - **Given** 目前 START／END 內沒有 `<reader-annotation>`
  - **When** 使用者點擊「講解標記內容」
  - **Then** 預設動作保持可用並正常送入目前 AI 對話
  - **And** 固定指令要求 AI 回覆目前沒有標記內容，不得自行選取原文講解

- **Scenario 12：分類只存在於 AI 回覆**
  - **Given** AI 已完成一次區段解析
  - **When** 閱讀器接收並顯示分組的 Markdown 回覆
  - **Then** 回覆像既有 assistant 訊息一樣保存在 AI 對話
  - **And** 閱讀器不解析回覆、不保存 AI 判斷的類型，也不修改標記資料

- **Scenario 13：設定及保存講解語言**
  - **Given** 使用者尚未保存講解語言
  - **When** 使用者開啟既有「設定」入口
  - **Then** 顯示「原文語言（預設）」、「繁體中文」、「English」與「日本語」四個選項
  - **And** 使用者選擇的語言作為全域偏好保存在本機，重新啟動後仍沿用
  - **And** 損壞、缺少或未知設定值安全降級為「原文語言」

- **Scenario 14：講解語言只影響後續區段解析**
  - **Given** 使用者已選擇一個講解語言
  - **When** 使用者之後點擊「講解標記內容」
  - **Then** 固定解析指令要求 AI 使用該語言；「原文語言」要求 AI 依目前閱讀區段的實際文字判斷
  - **And** 語言設定不改變一般 AI 問答、應用程式介面、EPUB 原文或既有 AI 回覆

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 標記模式切換 | 章節閱讀頁 | 連續點擊標記工具 | 按鈕依序啟用／停用；切章後停用 | Critical |
| TC2 | 連續標記 | 標記模式已啟用 | 依序選取兩段不重疊原文 | 兩個標記立即顯示、保存，模式保持啟用 | Critical |
| TC3 | 右鍵建立 | 一般模式已有文字選取 | 右鍵並選「標記所選內容」 | 建立相同資料格式的標記，START／END 選項仍存在 | Critical |
| TC4 | 重疊靜默忽略 | 已有一個標記 | 建立相同、包含或部分重疊範圍 | 標記集合不變且沒有提示 | High |
| TC5 | 右鍵移除 | 已標記原文 | 選「移除標記」 | 原文樣式及持久資料立即移除，聊天歷史不變 | Critical |
| TC6 | 本機恢復 | 多章已有標記 | 重建 LocalBookLibrary／重新載入章節 | 每章恢復自己的 offsets 與原文 | Critical |
| TC7 | 舊索引相容 | LibraryBook 沒有標記欄位 | 載入書庫 | 回傳空標記集合且不破壞其他狀態 | High |
| TC8 | 安全內嵌標記 | 區段含特殊符號及兩個標記 | 序列化 AI 上下文 | 原文被跳脫、專屬標籤配對且順序正確 | Critical |
| TC9 | 邊界交集 | 標記跨過 START 或 END | 序列化裁切區段 | 只包住區段內交集，區段外文字不外洩 | Critical |
| TC10 | 標記刷新上下文 | 相同 START／END 已提供 | 新增標記後送普通問題 | 下一次 call 包含最新標記，後續未變追問省略 context | Critical |
| TC11 | 移除全部標記 | AI 已收到舊標記 | 移除標記並送出下一則訊息 | 提供無標籤的新版本並明確取代舊上下文 | Critical |
| TC12 | 送出失敗重試 | 上下文待更新 | bridge 第一次拒絕後重試 | 兩次嘗試都包含待更新區段 | High |
| TC13 | 一般問答 | 區段含標記 | 手動輸入一般問題 | 不附加區段解析 prompt，沿用目前 thread | Critical |
| TC14 | 預設區段解析 | 區段含單字、片語、句子標記 | 點「講解標記內容」 | 送出固定解析意圖，要求依類型及組內位置排序 | Critical |
| TC15 | 空標記解析 | 區段無標記 | 點預設動作 | 按鈕可用；prompt 要求 AI 回覆沒有標記而不自行講解 | High |
| TC16 | 使用目前對話 | 已選取既有 AI 對話 | 點預設動作 | 在相同 conversation／thread 新增 turn，不強制新建 | Critical |
| TC17 | 空白對話解析 | 目前沒有 active conversation | 點預設動作 | 建立新對話並送出解析 turn | High |
| TC18 | 語言選項與保存 | 無既有偏好 | 選日本語並重啟 | 四個選項可見，重啟後仍為日本語 | Critical |
| TC19 | 原文語言預設 | 設定缺少或損壞 | 執行區段解析 | prompt 要求依區段實際原文語言講解 | High |
| TC20 | 語言作用範圍 | 已有舊回覆後切換繁體中文 | 再執行解析 | 新解析使用繁體中文；舊回覆與一般問答不變 | High |

## 5. Implementation Notes

### 標記資料與持久化

- 建議新增 `Annotation` 共用型別，至少包含不可變 id、章內純文字 `start`／`end` 及建立時原文。核心不變量為 `0 <= start < end`，且同一章的標記不得互相重疊。
- `LibraryBook` 以 `chapterId` 為鍵保存各章標記集合，載入舊資料時缺值正規化為空集合；保存前必須驗證書籍、章節、offset、原文及非重疊條件。
- 標記、閱讀狀態與 `chapterRanges` 共用 LocalBookLibrary 的串行原子寫入，避免快速新增、移除或範圍保存互相覆蓋。
- Renderer 只透過窄型別 preload／IPC 建立或移除標記，不直接讀寫檔案；刪除書籍時標記隨該書索引與目錄一起移除。
- 章節標記使用與閱讀區段相同的章內純文字 offset，不依賴像素、換行或 EPUB 頁碼。呈現標記不得修改已清理的 EPUB 原文內容。

### 選取與右鍵互動

- 標記模式是 Renderer 內的暫態 UI 狀態，不跨章或跨重啟保存；標記資料本身必須持久化。
- 文字選取必須完全屬於目前 `articleRef`，以 DOM Range 起終點轉成章內 offset，正規化反向選取並去除選取邊界空白。
- 既有右鍵選單需要同時理解目前文字選取及游標所在標記：有效選取提供「標記所選內容」，已標記位置提供「移除標記」，並保留 START／END 更新入口。
- 重疊驗證需要在 Renderer 提供立即回饋前先判斷，也必須由 Main process 再次驗證；重疊結果採無副作用的靜默忽略，而非錯誤提示。

### AI 上下文與預設解析意圖

- 擴充現有 `ChatContext`，讓 Renderer 提供經同一個 `extractReadingSegment()` 邊界裁切、再插入標籤的閱讀內容。不要建立會繞過 START／END 的第二套原文裁切入口。
- 內嵌格式固定使用 `<reading-segment>` 與 `<reader-annotation id="…">`。序列化時先跳脫 EPUB 純文字中的 `&`、`<`、`>`，再依 offset 插入專屬標籤；標記 id 只供區分標記，不代表 AI 類型。
- 現有「最近成功提供區段」識別需從 `bookId + chapterId + start + end` 擴充為包含區段內標記 revision。新增、移除或清空標記後都必須讓下一次 send 重新提供上下文；只有 send 成功後才更新識別。
- 每次更新上下文時要明確告知 AI 這是目前版本，舊 START／END 與舊標記狀態已失效；更新本身不建立背景 turn。
- `SendChatMessageInput` 應以型別化的預設意圖區分普通問答與「講解標記內容」，由受信任的產品程式組成固定 prompt，不接受 Renderer 傳入任意系統指令或 Codex method。
- 預設解析的可見 user message 維持簡潔動作名稱；完整 EPUB 內容、標籤格式說明與內部指令只存在於 Codex input，不顯示在使用者訊息氣泡。
- AI 回覆繼續使用既有 Markdown 串流與對話保存，不在第一版增加結構化解析、分類欄位或學習項目。

### 講解語言設定

- 新增最小的全域應用程式偏好邊界及窄型別 preload／IPC；設定存放於 Electron user data，不應塞入單一本書或單一 AI 對話。
- 設定入口使用現有左側「設定」按鈕。第一版只要求講解語言選項、目前值、可關閉介面及保存／失敗狀態，不擴張為完整偏好系統。
- 講解語言使用受限 enum，例如 `source | zh-TW | en | ja`。Main process 驗證輸入，缺少、未知或損壞值降級為 `source`；保存應使用可復原的原子替換。
- `source` 不依賴目前尚未保存的 EPUB metadata，由固定 prompt 要求 AI 根據本次閱讀區段的實際文字使用相同語言。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 本功能延續目前桌面應用程式與本機資料保存方式，不加入帳號同步或跨裝置同步。
- 「標記」是持久的使用者困難點；START／END 仍只是 AI 可讀範圍，兩者不得混稱。
- 標記可建立於章節任何位置；AI 只看目前 START／END 裁切後的內容及其中的標記交集。
- 使用者可連續標記，但第一版不處理重疊。對重疊建立採靜默忽略是已確認的產品行為。
- 預設解析意圖送入目前右側選取的 AI 對話；沒有目前對話時沿用既有延遲建立行為。
- 一般 AI 問答即使上下文含標記，也不自動套用分類講解 prompt。

### Open Questions

- 無。建立、移除、重疊、AI 邊界、上下文更新、回覆排序、講解語言及對話歸屬均已在需求訪談中確認。

### Non-goals

- 不支援重疊或巢狀標記，也不提供重疊管理提示。
- 不提供標記顏色、分類或自訂標籤；第一版所有標記使用同一視覺語意。
- 不讓使用者手動指定單字、片語或句子分類。
- 不保存 AI 分類、不解析 AI Markdown、不建立結構化區段解析資料。
- 不在本功能建立學習項目、生詞庫、區段練習或 Anki 式間隔複習。
- 不自動翻譯整個閱讀區段，也不讓 AI 解釋未標記文字。
- 不因建立、移除標記或調整 START／END 自動建立 AI turn、切換對話或推進閱讀區段。
- 不提供跨裝置設定／標記同步、匯出、匯入或標記搜尋清單。
- 不新增講解語言自訂輸入；第一版只提供四個確認選項。
- 不回溯修改既有 AI 回覆，也不把語言設定套用到一般自由問答。

## 7. Affected Modules and Files

### Existing modules

- `documents/modules/book-library.md`
- `documents/modules/reading-range.md`
- `documents/modules/ai-conversation.md`
- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Expected new boundaries or files

- 標記序列化／選取 offset 的 Renderer 共用邏輯及測試，可依實作結果獨立於 `reading-range.ts`。
- 全域應用程式偏好共用契約、Main process store／IPC 及對應測試。
- `documents/modules/annotation.md`，用來記錄標記資料、互動、持久化與 AI 序列化邊界。

### Tests

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/renderer/reading-range.test.ts` 或新的標記邏輯測試
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- 新增的全域設定 store／IPC 測試

## 8. Implementation Record

### Status

Implemented on 2026-07-21.

### Implementation Summary

- 新增每書每章的持久 `Annotation` 資料、舊索引正規化、Main process 雙重驗證與 `library:save-annotations` 窄化 bridge；寫入與閱讀狀態／範圍共用書庫串行原子替換。
- Renderer 新增持續標記模式、Selection 對章內 offset 的正反向換算、右鍵建立／移除、靜默重疊拒絕及不改寫安全 EPUB 原文的 `<mark>` 呈現。
- AI 閱讀內容改為安全的 `<reading-segment>`／`<reader-annotation>` inline 格式；只序列化 START／END 內文字與標記交集，並跳脫 EPUB 原文符號。
- 閱讀上下文版本加入 annotation revision。START／END 或標記變更後，下一則訊息提供目前版本；普通未變追問維持去重，預設解析動作則每次帶上當下區段。
- 新增受信任的 `explainAnnotations` 意圖。Main process 固定要求 AI 只解讀標籤內容、自動依單字／片語／句子分組並保持同組原文順序；一般自由問答不附加解析規則。
- 新增全域講解語言設定、原子設定 store 與 IPC 白名單，支援原文語言（預設）、繁體中文、English、日本語。
- 新增 `documents/modules/annotation.md`，並同步書庫、閱讀範圍及 AI 對話模組文件。

### Test Coverage

- `reading-range.test.ts`：安全 inline 序列化、特殊符號、跨 START／END 裁切、Selection 正規化、重疊與 revision。
- `App.test.tsx`：標記模式、連續建立、切章關閉、右鍵建立／移除、靜默重疊、AI context 刷新／去重／清空、預設解析與語言設定。
- `library-service.test.ts`／`library-ipc.test.ts`：跨章持久化、移除、舊資料相容、無效／重疊資料與窄化 IPC。
- `settings-store.test.ts`／`settings-ipc.test.ts`：預設值、原子保存、損壞／未知值降級與 enum 驗證。
- `chat-controller.test.ts`／`chat-ipc.test.ts`：一般問答與解析意圖分離、分類順序、空標記、講解語言、目前版本取代規則及 IPC 白名單。
- `desktop.spec.ts`：Electron preload API 形狀、安全隔離、設定視窗四個語言選項與既有版面回歸。

### Changed Files

- Domain／contracts：`CONTEXT.md`、`apps/desktop/src/shared/library-contracts.ts`、`chat-contracts.ts`、`settings-contracts.ts`。
- Main process：`library-service.ts`、`library-ipc.ts`、`chat-controller.ts`、`chat-ipc.ts`、`settings-store.ts`、`settings-ipc.ts`、`main.ts` 及對應測試。
- Bridge：`apps/desktop/src/preload/preload.ts`、`apps/desktop/src/renderer/env.d.ts`。
- Renderer：`apps/desktop/src/renderer/App.tsx`、`reading-range.ts`、`styles.css` 及對應測試。
- E2E／文件：`apps/desktop/tests/e2e/desktop.spec.ts`、`documents/modules/annotation.md`、`book-library.md`、`reading-range.md`、`ai-conversation.md`。

### Acceptance Criteria Verification

| Scenario | Verification |
|---|---|
| 1–4 | Renderer 測試確認模式切換、連續／右鍵建立、切章關閉及重疊靜默忽略。 |
| 5–6 | Renderer 與書庫測試確認直接移除、跨章／跨載入恢復，既有聊天不受標記資料刪除影響。 |
| 7 | 純函式測試確認只含 START／END、邊界交集、原文跳脫、標籤配對與原語序。 |
| 8–9 | Renderer 與 controller 測試確認範圍／標記 revision 刷新、失敗不誤記、普通追問去重且不套分類 prompt。 |
| 10–12 | App／controller 測試確認目前對話的預設 intent、固定分類順序、空標記回覆規則及不保存分類。 |
| 13–14 | Settings store／IPC／App／E2E 測試確認四個選項、持久化降級及只影響後續解析。 |

### Test Scenario Verification

| Test IDs | Automated evidence |
|---|---|
| TC1–TC5 | `App.test.tsx` 標記模式與右鍵互動案例。 |
| TC6–TC7 | `library-service.test.ts` 跨章保存、移除與舊索引案例。 |
| TC8–TC9 | `reading-range.test.ts` inline escaping 與邊界交集案例。 |
| TC10–TC13 | `App.test.tsx` context refresh／dedupe／remove-all／ordinary follow-up；既有拒絕重試案例。 |
| TC14–TC17 | `chat-controller.test.ts` 與 `App.test.tsx` 的可信任解析 intent、空標記及目前／空白對話生命週期。 |
| TC18–TC20 | `settings-store.test.ts`、`settings-ipc.test.ts`、`App.test.tsx` 與 Electron E2E。 |

### Commands Executed

- `npm test`：Server 3/3、Desktop 110/110 passed。
- `npm run typecheck`：Server、Desktop passed。
- `npm run build`：Server TypeScript、Electron main/preload 與 Vite renderer production build passed。
- `npm run test:e2e`：Electron Playwright 2/2 passed。
- `git diff --check`：passed。

### Hypotheses and Decisions

- 使用專屬 inline tag 而非引號、Markdown 強調或獨立標記清單，使 AI 能保留原語序辨識標記，並避免與 EPUB 原文符號衝突。
- START／END 與標記 revision 共同構成 AI 閱讀上下文版本；一般問答與預設解析意圖共用相同最新上下文，但只有預設意圖加入分類講解規則。
- 標記 AI 分類暫不結構化保存，避免本功能提前耦合尚未實作的學習項目與生詞庫。
- 驗收期間 Electron 面板寬度 E2E 曾在 CSS transition 中間取樣而偶發取得 466px，而穩定狀態實際為 640px。單一案例重跑通過後，確認產品拖曳狀態正確；測試改以穩定的 `--right-sidebar-width` 狀態值驗證摺疊恢復，保留另一段真實 bounding box 拖曳驗證，完整 E2E 隨後 2/2 通過。
- 預設解析不能沿用普通訊息的 context 去重：若區段先在一般問答送過，controller 會因本次 payload 缺少標籤而套用空標記規則。因此預設動作每次明確附上當下區段，普通追問才使用去重。

### Deferred Items

- 重疊及巢狀標記。
- 標記顏色／分類、自訂筆記與標記清單管理。
- AI 分類保存、結構化區段解析與學習項目建立。
- 跨裝置同步及更多講解語言。
- `App.tsx` 已同時協調閱讀範圍、標記、AI 對話與設定；後續功能擴張前建議另立 RXX 拆分 Renderer 狀態與畫面邊界。
