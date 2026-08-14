---
title: 本機生詞庫模組
module: learning-library
status: active
last_updated: 2026-08-14
related_implements:
  - F19-local-learning-library-page
  - F20-confirm-learning-item-trash
  - F21-ai-assisted-learning-item-creation
  - F28-ai-graded-spaced-review-paper
  - F33-color-review-results-and-open-learning-item-detail
  - F38-export-and-restore-data-backup
  - F41-persist-review-answers-in-history
  - F44-progressively-load-learning-library-items
  - F45-classify-and-filter-learning-items-by-language
  - F46-integrated-sentence-practice
  - F51-ai-assisted-learning-item-editing
  - F52-edit-learning-items-from-completed-review
  - F53-open-existing-learning-item-from-card-review
  - F55-edit-learning-items-from-graded-review
  - F59-add-learning-item-representative-image
  - F62-show-learning-library-study-status-counts
---

# 本機生詞庫模組

## 1. Purpose

本模組提供跨書籍、跨章節的本機 **生詞庫（Learning Library）**，保存可持續複習的
**學習項目（Learning Item）**。第一版支援查詢、篩選、排序、查看、Markdown 編輯、
移入垃圾桶、個別還原與確認後永久清空，並以十筆一次性 mock data 建立可驗證的資料基礎。

本模組不屬於 EPUB 書庫。它同時保存學習項目、FSRS 排程與精簡複習歷史；AI 建立與
複習流程都只能取得程式選出的有限 scope，AI 本身沒有 SQLite、任意查詢或直接寫入
能力。完整複習流程由 `spaced-review.md` 說明。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 首次建立 SQLite 時執行 schema migration，並以 metadata 記錄一次性 seed 完成狀態。
- 十筆穩定範例涵蓋單字、片語、A1–C2、三句英文例句，以及 `bank` 的兩個獨立語義。
- 標題限定、大小寫不敏感的部分字串搜尋。
- 語言、類型、CEFR 與學習進度複合篩選，以及最近新增、學習優先、下次複習與字母排序。
- 頁首以單列緊湊按鈕顯示 New、Studying、Familiar、Strong 四個互斥進度數量；
  按鈕同時作為篩選入口。Strong 直接共用 Review 的 Solid recall 項目集合與數量，
  Due／Scheduled 等時間狀態仍保留於卡片。
- 學習項目語言固定為英文、日文、繁體中文與其他語言；AI 新增時逐筆判定，詳情編輯
  可修正，清單卡片、草稿預覽與完整詳情皆顯示人類可讀標籤。
- 同標題不同語義以不同不可變 id 保存，不合併內容。
- 每個項目提供可留空的學習注意事項；完整詳情以 `Note`、紅字與紅底線顯示，清單摘要
  與未作答複習題面不載入或顯示。
- 每個正式項目可保存一張可留空的代表圖片；Main 將 JPEG／PNG／WebP 來源自動中心裁切、
  白底合成並輸出為 256×256 JPEG 品質 85。圖片只在完整詳情顯示，清單、未作答複習題
  與複習 AI scope 都不包含圖片。
- 共用置中詳情 modal、安全 Markdown、發音、複習排程與歷史；從生詞庫、已批改的
  複習試卷或排程已確認的複習完成頁開啟時保留人工編輯與 AI 編修，只有生詞庫與
  完成頁提供刪除；從 AI 輔助建立的已存在結果或整合造句練習開啟時則為唯讀。
- active 生詞庫、已批改試卷及複習完成頁詳情可展開極簡 AI 編修 composer，以同一
  畫面預覽多輪暫態草稿，並在使用者明確 Apply 後才保存 Markdown 與注意事項。
- 從詳情刪除前顯示置中確認視窗；確認後才移入垃圾桶。垃圾桶可個別還原，只有確認
  清空才永久刪除。
- 側欄顯示即時使用中數量。
- 生詞庫標題、垃圾桶入口與查詢篩選固定於中央區頂部，只有結果清單獨立捲動。
- 使用中清單與垃圾桶固定每批最多 50 筆，自動接近底部時載入下一批；卡片 grid
  以視窗化 row 保持有界 DOM，完整 Markdown 只在打開詳情時懶載入。
- 提供大小寫不敏感、trim 後完整標題相等的 active／trashed 候選查詢。
- 提供多筆先完整驗證、再以單一 SQLite 交易新增的 `createItemsAtomically()`。
- 提供到期／新項目摘要、90% retention FSRS 計算及整回合原子確認。
- 提供整合造句練習的 reviewed-English 資格計數、2–10 筆隨機唯讀抽取與 Meaning 提示，
  不修改 review events、FSRS card 或 due time。
- 詳情懶載入目前排程、最後評級、下次到期、累計次數及含複習作答的精簡歷史；
  migration 前的舊事件與本次留白作答使用不同文案。
- 可用 SQLite backup API 建立一致 snapshot，隨完整書庫封裝為單一資料備份 ZIP；
  還原會同時取代 active、trash、排程與精簡歷史。

## 3. Module Boundary

### LocalLearningLibrary

`LocalLearningLibrary` 是 Electron Main 擁有的資料與規則邊界，負責：

- 建立資料夾、開啟 SQLite、執行 migration 與一次性 seed。
- 驗證語言、類型、CEFR、狀態、排序及必要文字欄位。
- 組合參數化 SQL，讓搜尋只比對 `title`。
- 以 query-bound opaque cursor、固定 50 筆摘要及 deterministic tie-breaker 執行
  使用中清單與垃圾桶查詢；progress／study status filter 與 sort 在 page 選取前完成。
- 以 Main-owned 完整資料取得 active／trash 與四個進度數量；New 對齊 Review 的
  `newCount`，Studying 對齊兩類 learning count，Strong 復用 Solid recall 判定，
  Familiar 是已開始且不屬於 Studying／Strong 的其餘 active 項目。
- 更新學習內容與時間戳。
- 以 active guard 原子保存或移除處理後的代表圖片 BLOB；Trash／restore 保留圖片，永久
  清空項目 row 時才一併刪除。
- 以 `applyAiEdit()` 只更新 Markdown、注意事項與時間戳，並以 active 狀態與原始
  `updatedAt` 拒絕過期或垃圾桶工作階段覆寫。
- 執行 `active → trashed → active` 狀態轉移。
- 以交易永久清空全部垃圾桶項目。
- 以 `findDuplicateCandidates()` 提供 deterministic exact-title 候選，不做語義判斷。
- 以 `createItemsAtomically()` 提供草稿批次的全有或全無新增。
- 依 Main 裝置時間與可設定的 1–20 題試卷大小選出複習項目，已到期優先，新項目依
  CEFR 補入，並遵守新項目與到期複習的每日完成上限。
- 以獨立 read-only query 計算並隨機抽取 active、英文且 `review_count > 0` 的整合造句
  必要用詞，不沿用 due、daily limit 或 review paper size。
- 驗證四級評級與複習作答、讀寫 FSRS card 狀態，並在單一交易追加事件與更新排程。
- 確認複習試卷時略過建立試卷後已移入垃圾桶或永久刪除的項目，仍原子寫入其餘
  active 項目；全數失效時安全回傳空確認結果。
- 保留內部 `createItem()` 供 seed 使用。
- 以 `backupTo()` 建立 SQLite 一致 snapshot，並以 `close()` 在完整還原交換檔案前
  關閉目前連線。

Renderer 不知道資料庫路徑、schema 或 SQL。

### Electron IPC and Preload

Renderer 只能使用十個一般型別化操作；本機圖片選取仍由 Main 的原生 dialog 擁有：

- `learning:list`
- `learning:counts`
- `learning:get`
- `learning:update`
- `learning:trash`
- `learning:restore`
- `learning:empty-trash`
- `learning:select-representative-image`
- `learning:set-representative-image-from-url`
- `learning:remove-representative-image`

IPC 在呼叫 repository 前再次驗證跨程序資料。Preload 不暴露 create、任意 SQL、
Node API 或通用 IPC。

AI 編修另收斂於 `window.readerDesktop.learning.aiEdit` 的 start、send、stop、apply 與
discard。Renderer 只能提供 item／session id 與非空需求，不能提供正式項目內容、skill、
prompt、Codex method 或權限。流程由獨立暫態 `LearningItemEditController` 擁有，不進入
全域 AI 對話 store。

AI 建立批次的新增／還原由受限 `chat` IPC 呼叫 Main-owned Controller，再委派本
repository；Renderer 仍拿不到一般 create API。

複習使用獨立的六個 `review:*` IPC 操作。Renderer 不可傳入目前時間、項目 scope、
FSRS card、資料庫欄位或 AI workflow 設定。

### Renderer

`LearningLibraryWorkspace` 負責：

- 使用中清單與垃圾桶視圖。
- 搜尋、語言、類型、CEFR、進度狀態、排序及漸進結果集合；卡片時間狀態保持獨立。
- 顯示 New／Studying／Familiar／Strong 的緊湊可切換按鈕；中等寬度時整列移至標題
  下方並維持四欄同時可見，不使用水平捲動或隱藏捲軸。
- 固定工具區與獨立結果捲動區。
- 管理 query identity、250 ms 搜尋 debounce、stale response、下一批 loading／retry，
  並在 query 改變時回頂部、mutation refresh 時保留鄰近 anchor。
- 依中央區寬度視窗化 responsive card grid；卸載遠端 row 時保留鍵盤焦點項目。
- 詳情 modal、焦點回復、Escape／遮罩關閉。
- Markdown 查看、編輯、預覽與錯誤狀態。
- 學習注意事項的人工編輯、即時預覽與醒目完整詳情呈現。
- 代表圖片的完整詳情顯示，以及 editable 入口中的立即 Add／Replace 與確認後 Remove；
  read-only 入口只顯示、不渲染 mutation。
- 以現有詳情作為唯一草稿預覽的 AI composer、多輪狀態、停止、明確 Apply 與未套用
  變更離開確認。
- 對共用詳情分別提供 editable／read-only 與是否可移入垃圾桶的 capability；生詞庫、
  已批改試卷及已確認複習完成頁使用 editable，只有前後兩者允許移入垃圾桶；AI 輔助
  建立的已存在結果與整合造句使用 read-only，唯讀模式不渲染或呼叫 mutation。
- 單筆移入垃圾桶前的置中確認、還原、清空確認與側欄數量同步。
- 在詳情中顯示懶載入的精簡複習摘要、可展開歷史與逐筆複習作答。

`App` 只負責工作區切換、啟動時讀取數量，以及繼續呈現既有 AI 對話面板。

## 4. Shared Data

| Type | Meaning |
|---|---|
| `LearningItemType` | `word | phrase` |
| `LearningItemLanguage` | `en | ja | zh-TW | other` |
| `CefrLevel` | `A1 | A2 | B1 | B2 | C1 | C2` |
| `LearningItemStatus` | `active | trashed` |
| `LearningItemSort` | `recent | alphabetical | study-status | next-due` |
| `LearningItem` | id、標題、類型、語言、CEFR、語義、Markdown、注意事項、nullable 代表圖片、狀態與時間戳 |
| `LearningItemSummary` | 清單所需結構化欄位、study status 與 due；不含 Markdown、注意事項或代表圖片 |
| `LearningItemListInput` | 狀態、可選搜尋／語言／類型／CEFR／progress status／study status、排序與 opaque cursor |
| `LearningItemPage` | 最多 50 筆摘要及 nullable `nextCursor` |
| `LearningItemCounts` | active／trash 與 New／Studying／Familiar／Strong 完整數量 |
| `UpdateLearningItemInput` | item id 與可編輯的結構化／Markdown／注意事項欄位；不攜帶代表圖片 |
| `LearningItemEditSnapshot` | 單項暫態 AI 編修的最新草稿、phase、變更與簡短狀態 |
| `LearningItemDraft` | 尚未提交的 word／phrase 結構、Markdown 與 included／excluded |
| `LearningItemDraftBatch` | drafts、active／trash matches 與提交結果 |
| `ReviewSummary` | 可用總數、本回合 due/new queue 與下一到期時間 |
| `LearningItemReviewDetail` | 狀態、最後評級、due、次數、精簡事件與複習作答 |
| `SentencePracticeSourceItem` | 整合造句 AI scope 使用的 bounded item 與既有簡義 |

標題不是唯一鍵。`sense` 明確標示目標語義，讓 `bank` 的金融機構與河岸能各自保存。

## 5. Persistence

正式資料庫位於 Electron `userData/learning-library/learning-items.sqlite`，測試使用
系統暫存目錄下的獨立檔案。SQLite 包含：

- `schema_migrations`：已套用 schema 版本。
- `learning_metadata`：一次性 seed 等 repository metadata。
- `learning_items`：學習項目內容、語言、注意事項、狀態與時間戳；schema 5 把既有 row
  backfill 為英文並保存四類語言，schema 6 新增 non-null `caution_note` 並以空字串
  backfill 舊項目，schema 7 新增 nullable `representative_image` JPEG BLOB。
- `learning_review_schedules`：每個項目的目前 FSRS card、due、次數與最後評級。
- `learning_review_events`：複習作答、AI／最終評級、FSRS 前後狀態、間隔及 due 的
  精簡事件；schema 4 的 nullable `answer` 讓舊事件可無損保留。

`mock_seed_v1=completed` 是是否 seed 的唯一判定；即使使用者把十筆項目全部永久刪除，
重啟後也不會重新植入。EPUB `library/index.json` 不包含任何學習項目。

完整資料備份保存整份 SQLite，因此同時包含 active、trashed、FSRS schedules、精簡
events 與已確認的複習作答；未確認試卷及其作答、詳細 AI 回饋與設定不在資料庫內，
也不會進入備份。已 Apply 的注意事項與 active／trashed 項目的處理後代表圖片都屬於正式
SQLite 內容，會隨完整備份往返；AI 編修 session、需求與未套用草稿不會進入備份。

## 6. Query and Mutation Flow

```text
Renderer control
  → typed preload API
  → IPC payload validation
  → LocalLearningLibrary validation
  → parameterized SQLite query / mutation
  → typed LearningItemPage / LearningItemCounts result
  → append page or refresh visible window and active / trash / progress counts
```

搜尋值會 trim、轉為小寫並跳脫 `%`、`_` 與反斜線，再套用到 `LOWER(title) LIKE ?`。
Markdown、語義、例句與搭配詞不參與搜尋。

## 7. UI and Accessibility

- 中央工作區本身不捲動；上方工具區固定，結果區使用自己的 `overflow-y: auto`。
- 工具區保留生詞庫標題、說明、垃圾桶入口、搜尋、語言、類型、CEFR 與排序。
- 頁首四個進度數量是可存取的 pressed-state 篩選按鈕；四欄在窄版壓縮並完整可見，
  不產生水平捲動。為抵銷 action 換列高度，中等寬度隱藏標題說明文字。
- 結果區不顯示已載入／總符合筆數；接近底部時自動載入，失敗時保留既有卡片並提供
  Retry，最後一批不顯示結束文案。
- 卡片以類型、語言、CEFR、標題與語義形成清楚層級，hover／focus 有一致回饋。
- 詳情使用 `role="dialog"`、`aria-modal`、具名標題、關閉控制與觸發點焦點回復。
- 同一詳情元件可由已完成 AI 批改的複習題與排程已確認的複習完成頁開啟；兩者都只
  使用 `learning:get` 取得最新內容，並沿用人工編輯與 AI 編修；前者不提供移入垃圾桶，
  後者保留 Delete。完成頁刪除後重查 counts，完成事件摘要不消失。
- AI 輔助建立的「Already exists」列是可對焦按鈕，以 match 的受信任 id
  呼叫 `learning:get`，在草稿清單上疊放共用唯讀詳情；關閉或 Escape 只移除詳情。
- `Edit with AI` 在 active 生詞庫、已批改試卷或複習完成頁的 editable 詳情顯示；
  垃圾桶與造句 read-only 詳情不渲染入口。AI 草稿有變更時，Close、Escape 與遮罩
  離開共用放棄確認。
- 非空注意事項顯示在 Markdown 前，以文字標示、紅色與底線共同傳達重點；空值不留區塊。
- 代表圖片顯示在標題／sense 下方與注意事項／Markdown 上方，使用描述目前標題與 sense
  的替代文字；Remove 使用具名 `alertdialog`，取消或 Escape 保留圖片。
- 詳情中的「刪除」先開啟具名 `alertdialog`；取消或 Escape 只關閉最上層確認視窗，
  明確確認後才呼叫 `learning:trash`，並說明項目仍可還原。
- Markdown 使用 `react-markdown`、GFM 與 `skipHtml`；連結不允許執行 JavaScript URL。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/learning-contracts.ts` | Main／Preload／Renderer 共用型別 |
| `apps/desktop/src/shared/review-contracts.ts` | 複習摘要、試卷、評級及歷史型別 |
| `apps/desktop/src/main/learning-library-service.ts` | SQLite、migration、seed、進度分類、Review summary、查詢與狀態轉移 |
| `apps/desktop/src/main/learning-item-representative-image.ts` | Main-owned dialog、10 MiB 驗證、中心裁切、固定 JPEG 轉檔與 repository 協調 |
| `apps/desktop/src/main/learning-item-edit-controller.ts` | 單項暫態 AI thread、草稿、停止、套用與清理 |
| `apps/desktop/src/main/learning-item-edit-ipc.ts` | 五個 AI edit IPC 白名單 |
| `apps/desktop/src/main/data-backup-service.ts` | 一致 SQLite snapshot、驗證與跨資料域完整還原 |
| `apps/desktop/src/main/spaced-review-controller.ts` | 暫態 AI 試卷與受信任確認 scope |
| `apps/desktop/src/main/learning-item-duplicate-classifier.ts` | 只對 exact-title 候選做 AI 語義重查 |
| `apps/desktop/src/main/learning-library-ipc.ts` | 十個 IPC 白名單、progress／study filter、cursor、圖片 item id 與 payload 驗證 |
| `apps/desktop/src/preload/preload.ts` | `window.readerDesktop.learning` typed bridge |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx` | 生詞庫及共用 editable／read-only 詳情、編輯與垃圾桶 UI |
| `apps/desktop/src/renderer/App.tsx` | 工作區入口、側欄數量與 AI 面板共存 |
| `apps/desktop/src/renderer/styles.css` | 固定工具區、獨立捲動、卡片與 modal 樣式 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `learning-library-service.test.ts` | schema 7 migration／語言、注意事項與圖片 backfill、seed、搜尋／語言／進度篩選、page、cursor、四進度 count／Strong 與 Solid recall 一致性、候選、atomic create、guarded AI apply、圖片 lifecycle／scope、垃圾桶、sentence-practice eligibility、backup／close |
| `learning-item-representative-image.test.ts` | JPEG／PNG／WebP、10 MiB、拒絕格式、中心裁切、透明白底、256px JPEG 與 Main-owned dialog |
| `data-backup-service.test.ts` | active／trash／語言／代表圖片／排程／歷史 snapshot、完整取代與 rollback |
| `spaced-review-artifacts.test.ts`、`spaced-review-controller.test.ts` | 有限 AI scope、artifact 與暫態生命週期 |
| `learning-library-ipc.test.ts`、`learning-item-edit-ipc.test.ts` | 一般與 AI edit IPC 白名單、惡意／錯誤 payload 拒絕 |
| `learning-item-artifacts.test.ts`、`learning-item-edit-controller.test.ts` | 嚴格 edit artifact、最小 scope、暫態草稿、Apply 與停止競態 |
| `learning-library-workspace.test.tsx` | 查詢、四進度指標與切換篩選、卡片時間狀態、分批、Trash、retry、視窗化、共用 modal、安全 Markdown、注意事項、AI 草稿／停止／放棄／Apply 與唯讀邊界 |
| `App.test.tsx` | 入口、啟動數量、AI 新增入口、invitation 與草稿 modal |
| `learning-item-draft-dialog.test.tsx` | 已存在項目唯讀詳情、雙層 Escape 與載入失敗重試 |
| `desktop.spec.ts` | 真實 Electron bridge、十筆資料、詳情、窄版四進度無水平 overflow，以及捲到底後工具區位置不變 |

最近驗證（2026-08-14）：

- Server Vitest：3/3 passed。
- Desktop Vitest：515/515 passed。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed。
- Electron Playwright E2E：3/3 passed，包含 Library 窄版四進度完整可見且無水平
  overflow、runtime edit skill、代表圖片 bridge 與 `learning.aiEdit` 白名單。

## 10. Known Limitations and Follow-up

- AI 新增只支援單字與片語，不支援 sentence 或任意卡片類型。
- AI 可編修既有 active 項目的 Markdown 與注意事項；仍不支援批次編修、其他結構欄位、
  保存編修歷史或 AI 刪除。
- 從標記解析可建立項目，但刻意不保存書籍、章節、標記、原句或來源追溯資料。
- 已實作 AI 語意試卷、每日新項目／到期複習上限、可設定題數與四級 FSRS 複習；
  尚無 deck、手動選題、optimizer 或完整試卷歷史。
- Review summary、Library progress counts 與 progress filter 目前都會依 active 項目的
  完整複習事件重建學習路徑與 Solid recall；資料量大幅成長後可能需要持久化索引或
  快取，同時維持 Library Strong 與 Review Solid recall 的單一判定來源。
- 已提供整份書庫＋生詞庫的 ZIP 備份與完整還原；不提供合併、個別項目匯入／匯出、
  自動同步、封存、單筆永久刪除或復原已清空垃圾桶。

## 11. Related Documents

- `CONTEXT.md`
- `documents/implements/F19-local-learning-library-page.md`
- `documents/implements/F20-confirm-learning-item-trash.md`
- `documents/implements/F21-ai-assisted-learning-item-creation.md`
- `documents/implements/F28-ai-graded-spaced-review-paper.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/spaced-review.md`
- `documents/modules/book-library.md`
- `documents/modules/data-backup.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/implements/F44-progressively-load-learning-library-items.md`
- `documents/implements/F45-classify-and-filter-learning-items-by-language.md`
- `documents/implements/F46-integrated-sentence-practice.md`
- `documents/modules/sentence-practice.md`
- `documents/implements/F51-ai-assisted-learning-item-editing.md`
- `documents/implements/F52-edit-learning-items-from-completed-review.md`
- `documents/implements/F53-open-existing-learning-item-from-card-review.md`
- `documents/implements/F55-edit-learning-items-from-graded-review.md`
- `documents/implements/F59-add-learning-item-representative-image.md`
- `documents/implements/F62-show-learning-library-study-status-counts.md`
- `documents/modules/learning-item-editing.md`
