---
title: 本機生詞庫模組
module: learning-library
status: active
last_updated: 2026-07-23
related_implements:
  - F19-local-learning-library-page
  - F20-confirm-learning-item-trash
  - F21-ai-assisted-learning-item-creation
---

# 本機生詞庫模組

## 1. Purpose

本模組提供跨書籍、跨章節的本機 **生詞庫（Learning Library）**，保存可持續複習的
**學習項目（Learning Item）**。第一版支援查詢、篩選、排序、查看、Markdown 編輯、
移入垃圾桶、個別還原與確認後永久清空，並以十筆一次性 mock data 建立可驗證的資料基礎。

本模組不屬於 EPUB 書庫，也不實作 Anki 式複習排程。AI 建立流程只能先取得程式以
完整標題篩出的有限候選，並在使用者提交後透過 Main 的交易操作新增；AI 本身沒有
SQLite、任意查詢或直接寫入能力。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 首次建立 SQLite 時執行 schema migration，並以 metadata 記錄一次性 seed 完成狀態。
- 十筆穩定範例涵蓋單字、片語、A1–C2、三句英文例句，以及 `bank` 的兩個獨立語義。
- 標題限定、大小寫不敏感的部分字串搜尋。
- 類型與 CEFR 複合篩選，以及最近新增／字母順序排序。
- 同標題不同語義以不同不可變 id 保存，不合併內容。
- 置中詳情 modal、安全 Markdown、原文編輯與即時預覽。
- 從詳情刪除前顯示置中確認視窗；確認後才移入垃圾桶。垃圾桶可個別還原，只有確認
  清空才永久刪除。
- 側欄顯示即時使用中數量。
- 生詞庫標題、垃圾桶入口與查詢篩選固定於中央區頂部，只有結果清單獨立捲動。
- 提供大小寫不敏感、trim 後完整標題相等的 active／trashed 候選查詢。
- 提供多筆先完整驗證、再以單一 SQLite 交易新增的 `createItemsAtomically()`。

## 3. Module Boundary

### LocalLearningLibrary

`LocalLearningLibrary` 是 Electron Main 擁有的資料與規則邊界，負責：

- 建立資料夾、開啟 SQLite、執行 migration 與一次性 seed。
- 驗證類型、CEFR、狀態、排序及必要文字欄位。
- 組合參數化 SQL，讓搜尋只比對 `title`。
- 更新學習內容與時間戳。
- 執行 `active → trashed → active` 狀態轉移。
- 以交易永久清空全部垃圾桶項目。
- 以 `findDuplicateCandidates()` 提供 deterministic exact-title 候選，不做語義判斷。
- 以 `createItemsAtomically()` 提供草稿批次的全有或全無新增。
- 保留內部 `createItem()` 供 seed 使用。

Renderer 不知道資料庫路徑、schema 或 SQL。

### Electron IPC and Preload

Renderer 只能使用以下六個型別化操作：

- `learning:list`
- `learning:get`
- `learning:update`
- `learning:trash`
- `learning:restore`
- `learning:empty-trash`

IPC 在呼叫 repository 前再次驗證跨程序資料。Preload 不暴露 create、任意 SQL、
Node API 或通用 IPC。

AI 建立批次的新增／還原由受限 `chat` IPC 呼叫 Main-owned Controller，再委派本
repository；Renderer 仍拿不到一般 create API。

### Renderer

`LearningLibraryWorkspace` 負責：

- 使用中清單與垃圾桶視圖。
- 搜尋、類型、CEFR、排序及結果數量。
- 固定工具區與獨立結果捲動區。
- 詳情 modal、焦點回復、Escape／遮罩關閉。
- Markdown 查看、編輯、預覽與錯誤狀態。
- 單筆移入垃圾桶前的置中確認、還原、清空確認與側欄數量同步。

`App` 只負責工作區切換、啟動時讀取數量，以及繼續呈現既有 AI 對話面板。

## 4. Shared Data

| Type | Meaning |
|---|---|
| `LearningItemType` | `word | phrase` |
| `CefrLevel` | `A1 | A2 | B1 | B2 | C1 | C2` |
| `LearningItemStatus` | `active | trashed` |
| `LearningItemSort` | `recent | alphabetical` |
| `LearningItem` | id、標題、類型、CEFR、語義、Markdown、狀態與時間戳 |
| `LearningItemListInput` | 狀態、可選搜尋／類型／CEFR，以及排序 |
| `UpdateLearningItemInput` | item id 與可編輯的全部結構化／Markdown 欄位 |
| `LearningItemDraft` | 尚未提交的 word／phrase 結構、Markdown 與 included／excluded |
| `LearningItemDraftBatch` | drafts、active／trash matches 與提交結果 |

標題不是唯一鍵。`sense` 明確標示目標語義，讓 `bank` 的金融機構與河岸能各自保存。

## 5. Persistence

正式資料庫位於 Electron `userData/learning-library/learning-items.sqlite`，測試使用
系統暫存目錄下的獨立檔案。SQLite 包含：

- `schema_migrations`：已套用 schema 版本。
- `learning_metadata`：一次性 seed 等 repository metadata。
- `learning_items`：學習項目內容、狀態與時間戳。

`mock_seed_v1=completed` 是是否 seed 的唯一判定；即使使用者把十筆項目全部永久刪除，
重啟後也不會重新植入。EPUB `library/index.json` 不包含任何學習項目。

## 6. Query and Mutation Flow

```text
Renderer control
  → typed preload API
  → IPC payload validation
  → LocalLearningLibrary validation
  → parameterized SQLite query / mutation
  → typed LearningItem result
  → refresh visible list and active / trash counts
```

搜尋值會 trim、轉為小寫並跳脫 `%`、`_` 與反斜線，再套用到 `LOWER(title) LIKE ?`。
Markdown、語義、例句與搭配詞不參與搜尋。

## 7. UI and Accessibility

- 中央工作區本身不捲動；上方工具區固定，結果區使用自己的 `overflow-y: auto`。
- 工具區保留生詞庫標題、說明、垃圾桶入口、搜尋、類型、CEFR 與排序。
- 結果區顯示目前筆數及可用的清除篩選操作。
- 卡片以類型、CEFR、標題與語義形成清楚層級，hover／focus 有一致回饋。
- 詳情使用 `role="dialog"`、`aria-modal`、具名標題、關閉控制與觸發點焦點回復。
- 詳情中的「刪除」先開啟具名 `alertdialog`；取消或 Escape 只關閉最上層確認視窗，
  明確確認後才呼叫 `learning:trash`，並說明項目仍可還原。
- Markdown 使用 `react-markdown`、GFM 與 `skipHtml`；連結不允許執行 JavaScript URL。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/learning-contracts.ts` | Main／Preload／Renderer 共用型別 |
| `apps/desktop/src/main/learning-library-service.ts` | SQLite、migration、seed、查詢與狀態轉移 |
| `apps/desktop/src/main/learning-item-duplicate-classifier.ts` | 只對 exact-title 候選做 AI 語義重查 |
| `apps/desktop/src/main/learning-library-ipc.ts` | 六個 IPC 白名單與 payload 驗證 |
| `apps/desktop/src/preload/preload.ts` | `window.readerDesktop.learning` typed bridge |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx` | 生詞庫、詳情、編輯與垃圾桶 UI |
| `apps/desktop/src/renderer/App.tsx` | 工作區入口、側欄數量與 AI 面板共存 |
| `apps/desktop/src/renderer/styles.css` | 固定工具區、獨立捲動、卡片與 modal 樣式 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `learning-library-service.test.ts` | migration、seed、搜尋／篩選、exact-title 候選、atomic create、垃圾桶 |
| `learning-library-ipc.test.ts` | 六個 IPC 白名單與惡意／錯誤 payload 拒絕 |
| `learning-library-workspace.test.tsx` | 查詢控制、非捲動工具區、modal、安全 Markdown、編輯、刪除確認與垃圾桶 |
| `App.test.tsx` | 入口、啟動數量、AI 新增入口、invitation 與草稿 modal |
| `desktop.spec.ts` | 真實 Electron bridge、十筆資料、詳情，以及捲到底後工具區位置不變 |

最近驗證（2026-07-23）：

- Server Vitest：3/3 passed。
- Desktop Vitest：159/159 passed。
- Electron Playwright：本次受執行環境阻擋 Electron process launch，未進入斷言。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。

## 10. Known Limitations and Follow-up

- AI 新增只支援單字與片語，不支援 sentence 或任意卡片類型。
- AI workflow 不提供既有正式項目的編輯或刪除；這些仍由生詞庫詳情 UI 負責。
- 從標記解析可建立項目，但刻意不保存書籍、章節、標記、原句或來源追溯資料。
- 尚未實作到期判定、翻面、AI 出題、自評、間隔排程與複習歷史。
- 不提供匯入、匯出、同步、封存、單筆永久刪除或復原已清空垃圾桶。

## 11. Related Documents

- `CONTEXT.md`
- `documents/implements/F19-local-learning-library-page.md`
- `documents/implements/F20-confirm-learning-item-trash.md`
- `documents/implements/F21-ai-assisted-learning-item-creation.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/book-library.md`
