---
title: 書籍與本機書庫模組
module: book-library
status: active
last_updated: 2026-07-24
related_implements:
  - F01-epub-book-library
  - F02-chapter-reading-resume
  - F03-simplify-sidebar-navigation
  - F04-delete-library-book
  - F05-ai-reading-range-markers
  - F06-reading-range-boundary-lines
  - F07-codex-ai-conversation
  - F13-persistent-annotations-and-ai-analysis
  - B01-preserve-epub-chapter-hierarchy
  - B02-persist-range-marker-on-drag-release
  - F25-adjustable-reading-and-conversation-font-sizes
  - F26-reading-layout-settings
---

# 書籍與本機書庫模組

## 1. Purpose

本模組負責把使用者選取的 EPUB 導入 Electron 應用程式的本機書庫，解析書籍基本資訊與章節目錄，跨次啟動保存書籍，並向 renderer 提供書籍總覽、章節閱讀內容與每本書閱讀狀態所需資料。

模組使用 CONTEXT.md 定義的領域詞彙：

- **書籍（Book）**：一本已導入的 EPUB，是章節、閱讀進度與後續標記的上層容器。
- **書庫（Book Library）**：跨次開啟持續存在的書籍集合；不同內容的同名書可並存。
- **書籍總覽（Book Overview）**：選取書籍後顯示封面、書名、作者、進度及章節入口的畫面。
- **閱讀版面設定（Reading Layout Settings）**：所有書籍共用、只改變章節呈現而不修改 EPUB 原文的字級、紙張寬度與行距偏好。

本模組不等同於生詞庫，也不負責 Anki 式複習。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 透過 Electron 原生檔案選擇器導入 .epub。
- 解析標準 EPUB 2 與 EPUB 3 的書名、作者、封面及章節順序。
- 保留 EPUB 目錄的章節／子章節層級與 fragment；同一 XHTML 中的子章節不會被誤判為重複項目。
- 將 EPUB 原始檔與書庫索引保存於 Electron user data 目錄。
- 重新開啟應用程式後載入既有書庫。
- 以 EPUB 完整內容 SHA-256 去重；相同內容不重複導入，同名不同內容可並存。
- 在左側書庫直接選取與切換書籍，並於中央顯示書籍總覽；側欄不另設重複的「書籍總覽」按鈕。
- 從書籍總覽經不可復原確認後永久刪除書籍、本機 EPUB 與閱讀進度，並自動切換至相鄰書籍或空書庫狀態。
- 從總覽的開始／繼續閱讀按鈕或章節清單進入章節閱讀介面。
- 從本機 EPUB 讀取指定章節，安全呈現常見文字結構、表格、清單與書內點陣圖片。
- 在閱讀介面返回書籍總覽或切換上一章。
- 每本書保存最後所在畫面、章節與相對捲動位置，切換書籍或重新啟動後可恢復。
- 每章保存唯一一對範圍標籤；閱讀頁可拖曳或從目前行功能選單調整，並以「完成這段，前往下一段」明確推進。
- 每章保存不重疊的持久標記；舊索引沒有標記欄位時安全視為空集合。
- 閱讀區段使用章內文字 offset 定位，不依賴頁碼、像素或捲動比例；版面重新換行後仍對應相同原文。
- 封面以 Data URL 經安全 preload bridge 傳給 renderer。
- 長章節清單只捲動中央內容，左右欄保持在視窗內。
- 書籍總覽以縮排、字級、標記及操作文字區分子章節；開啟子章節時定位到書內 fragment。
- 舊版索引缺少目錄層級時，會從已保存的 EPUB 自動補回並持久化，不需重新導入。
- 章節閱讀工具列提供 `Aa` 閱讀版面面板，可即時調整 16–32px 內文字級、
  560–960px 紙張寬度與 1.4–2.4 倍正文行距，並可恢復 19px／760px／1.9
  預設值；設定跨書籍保存，但不改變側欄、AI 對話面板或 EPUB 原始內容。

章節內容採安全 allowlist，而非完整瀏覽器方式重現 EPUB；自訂 CSS、字型、SVG、影音與複雜互動內容目前不保證呈現。

## 3. Module Boundary

資料與控制流：

1. React renderer 顯示書庫與書籍總覽。
2. Electron preload 提供受限 library API。
3. Main process IPC 接收 library:list、library:import、library:delete、library:chapter、library:save-reading-state、library:save-reading-range 與 library:save-annotations。
4. LocalBookLibrary 負責 EPUB 解析、去重、刪除、章節內容安全處理與狀態持久化。
5. 書籍資料保存到 Electron user data，再沿原路回傳 renderer。

### Electron main process

- 擁有原生檔案選擇器、檔案系統與 EPUB 解析能力。
- 決定書庫路徑並註冊 IPC handler。
- renderer 不可直接提供任意檔案路徑，也不可直接操作檔案系統。

### Preload bridge

- 使用 contextBridge 暴露唯讀的 readerDesktop.library API。
- 僅提供 listBooks()、importBook()、deleteBook()、getChapterContent()、saveReadingState()、saveReadingRange() 與 saveAnnotations()。
- 不暴露 Node.js require、fs、ipcRenderer 或通用 IPC 呼叫。

### Renderer

- 載入並保存目前 session 的書籍清單、選取狀態與閱讀位置。
- 依章節初始化、顯示、調整及推進範圍標籤，並提供只擷取目前閱讀區段的共用邏輯。
- 顯示書籍縮圖、書籍總覽、章節清單、安全章節內容、載入與錯誤訊息。
- 以全域閱讀版面設定呈現安全章節內容；字級、紙張寬度與正文行距可在章節工具列
  即時預覽，標題與程式碼保留自己的行距，範圍標籤會在版面變更後重新定位。
- 在書籍總覽提供刪除入口與確認對話框；刪除成功後依原清單位置選取下一本、前一本或顯示空書庫。
- 側欄以書籍項目作為書籍總覽入口，保留獨立的 Anki 複習入口，不顯示章節機制說明卡片。
- 不解析 EPUB，也不直接讀寫書庫檔案。

## 4. Key Files

| File | Responsibility |
|---|---|
| apps/desktop/src/main/library-service.ts | EPUB 解析、內容雜湊、書籍刪除、章節安全輸出、閱讀狀態、書庫索引與錯誤回滾 |
| apps/desktop/src/main/library-ipc.ts | 註冊書庫、導入、刪除、章節與閱讀狀態 IPC，開啟原生 EPUB 選擇器 |
| apps/desktop/src/main/main.ts | 決定正式與測試書庫路徑，建立 LocalBookLibrary 並註冊 IPC |
| apps/desktop/src/preload/preload.ts | 將受限書庫 API 暴露給 renderer |
| apps/desktop/src/shared/library-contracts.ts | main、preload、renderer 共用的書籍、章節內容、閱讀狀態與導入結果型別 |
| apps/desktop/src/renderer/App.tsx | 載入書庫、選取書籍、總覽、章節閱讀、導覽與閱讀位置恢復 |
| apps/desktop/src/renderer/reading-range.ts | 閱讀區段初始化、裁切、自動推進、DOM 文字 offset 與範圍標籤定位 |
| apps/desktop/src/renderer/styles.css | 書庫／總覽／章節排版與中央獨立捲動的三欄版面 |
| apps/desktop/src/renderer/index.html | renderer CSP；允許本機與 Data URL 封面圖片 |
| apps/desktop/src/shared/settings-contracts.ts | 閱讀版面數值範圍、步進、預設值與全域設定型別 |
| apps/desktop/src/main/settings-store.ts | 閱讀版面偏好舊檔相容、逐欄降級與本機保存 |
| apps/desktop/src/main/settings-ipc.ts | 完整設定 payload 與各閱讀版面欄位的 Main process 驗證 |

## 5. Domain Data

### LibraryBook

| Field | Meaning |
|---|---|
| id | EPUB 完整位元組內容的 SHA-256；同時作為書籍目錄名稱與去重鍵 |
| title | package metadata 的第一個 title；缺少時拒絕導入 |
| author | package metadata 的第一個 creator；缺少時使用「未知作者」 |
| coverDataUrl | 封面圖片的 MIME type 與 Base64 Data URL；沒有可辨識封面時為 null |
| progressPercent | 閱讀進度百分比；依讀到最遠的章節與章內相對位置單調增加 |
| lastChapterId | 上次閱讀章節；同時供舊索引相容與開始／繼續閱讀使用 |
| readingState | 每本書的最後畫面（overview／reader）、章節識別碼與 0–1 相對捲動位置 |
| chapterRanges | 以 chapterId 為鍵、保存該章唯一一對起點／終點文字 offset 的集合 |
| chapterAnnotations | 以 chapterId 為鍵、保存該章不重疊 `Annotation[]` 的集合 |
| chapters | 依 order 排列的章節集合 |

正式恢復狀態以 `readingState` 為準；載入沒有此欄位的舊索引時，會從既有欄位建立相容預設。

### BookChapter

| Field | Meaning |
|---|---|
| id | 解析後 archive href 的 SHA-256 前 16 字元 |
| title | EPUB 3 navigation、EPUB 2 NCX 或 spine fallback 取得的章節名稱 |
| order | 章節在書籍總覽中的穩定顯示順序 |
| href | EPUB archive 內已正規化的章節路徑，供後續章節載入使用 |
| depth | EPUB navigation／NCX 中的目錄深度；頂層為 0 |
| fragment | 章節在 XHTML 中的錨點；沒有錨點時為 null |

### ImportBookResult

- cancelled：使用者取消原生檔案選擇器。
- imported：新內容已解析並寫入書庫。
- existing：相同內容的 EPUB 已存在，回傳既有書籍且不重設進度。

### ChapterContent

- bookId／chapterId：對應已導入書籍與章節。
- title：章節目錄標題。
- fragment：需要定位的 XHTML 錨點；頂層或無錨點章節可為 null。
- contentHtml：由 main process 產生的安全閱讀 HTML，只保留 allowlist 元素與屬性；書內點陣圖片轉為 Data URL。

## 6. Data and State Flow

### Application startup

1. Main process 在正式環境使用 app.getPath("userData")/library 建立 LocalBookLibrary。
2. Renderer mount 後透過 preload 呼叫 listBooks()。
3. Main process 讀取 index.json；若舊章節缺少 depth／fragment，從保存的 EPUB 重新解析並更新索引。
4. Main process 依 order 排序每本書的章節後回傳。
5. Renderer 顯示書籍清單，並預設選取第一本書。
6. 若第一本書上次停在 reader，載入保存章節並在本文呈現後恢復相對捲動位置；否則顯示總覽。

### EPUB import

1. 使用者在 renderer 點擊「導入 EPUB」。
2. Preload 呼叫 library:import；main process 開啟只接受 .epub 的原生選擇器。
3. LocalBookLibrary 讀取完整檔案並計算 SHA-256。
4. 若 SHA-256 已存在，直接回傳 existing。
5. 新內容經 JSZip 與 XML parser 解析 metadata、封面和章節。
6. 原始 EPUB 複製至書籍目錄，書籍資料追加至索引。
7. Renderer 將回傳書籍新增或替換於目前清單、選取該書並顯示書籍總覽。

### Book selection and reading entry

1. 使用者在左側書庫選取書籍。
2. Renderer 依該書 readingState 恢復書籍總覽，或恢復 reader 的章節與相對位置。
3. 「開始／繼續閱讀」優先使用 lastChapterId，否則使用第一章；點擊章節則直接選取該 chapter.id。
4. Renderer 經 preload 呼叫 library:chapter，只傳遞 bookId 與 chapterId。
5. LocalBookLibrary 驗證書籍與章節後，從保存的 book.epub 讀取 chapter href。
6. Main process 移除腳本、事件、表單、嵌入與外部資源，只保留常見閱讀結構；安全書內圖片轉為 Data URL。
7. Renderer 顯示章節內容，並依 readingState.scrollProgress 恢復中央捲動位置；從子章節入口開啟且沒有較後保存位置時，定位至該 fragment。
8. 捲動採 300ms 防抖保存；切換書籍、章節或返回總覽前立即保存。
9. LocalBookLibrary 串行寫入狀態並原子替換 index.json，避免快速操作互相覆蓋。

### Reading range markers

START／END 的完整定位、互動、自動推進與 AI 裁切邊界另見 `documents/modules/reading-range.md`；本節只保留它與書庫持久化的整合摘要。

1. 章節原文載入後，renderer 讀取該章 `chapterRanges`；沒有保存位置時 START／END 都初始化於第一個可讀位置，形成合法的空閱讀區段。
2. 起點與終點標籤顯示在原文左側並向內文延伸具名分隔線；`START` 位於起始行之前、`END` 位於終止行之後，畫面位置過近時會上下錯開。Pointer 拖曳途中即時預覽，放開時保存最後一個有效位置，即使放開點位於左側標籤區也不需額外點擊；目前行功能選單同樣可把位置轉成章內文字 offset，兩種操作都拒絕起終點交叉。
3. Renderer 透過 `library:save-reading-range` 保存該章範圍；main process 驗證書籍、章節、非負整數及起終點順序後串行寫入索引。
4. 範圍標籤調整不重建安全章節 DOM，避免中斷文字選取或拖曳；視窗重排時再由文字 offset 計算標籤畫面位置。
5. 「完成這段，前往下一段」以目前區段約略字數建立下一個相鄰範圍，章末停止且不跨章；一般 AI 訊息操作不會推進。
6. `extractReadingSegment` 是 AI 對話、未來區段解析、標記說明與區段練習共用的裁切入口；F07 的 AI 對話已使用此入口，空區段不會回退成整章。

### Book deletion

1. 使用者在書籍總覽點擊「刪除書籍」。
2. Renderer 顯示包含書名與不可復原警告的確認對話框；取消不呼叫刪除 API。
3. 確認後，preload 只把 bookId 傳給 library:delete；main process 驗證它是非空字串。
4. LocalBookLibrary 將刪除排入閱讀狀態寫入佇列，先從 index.json 移除書籍，再刪除該 SHA-256 書籍目錄；目錄刪除失敗時嘗試還原索引。
5. Renderer 只在後端成功後更新目前清單：優先選取原位置的下一本，否則前一本；沒有書籍時回到空書庫總覽。

## 7. EPUB Parsing Rules

- mimetype 必須是 application/epub+zip。
- 從 META-INF/container.xml 取得 package document 路徑。
- EPUB 3 優先使用帶有 nav property 的 navigation document。
- EPUB 2 使用 spine toc 指向的 NCX，或第一個 NCX media type 項目。
- navigation document 的巢狀 `<ol>` 與 NCX 的巢狀 `navPoint` 會依深度遞迴解析；同檔案不同 fragment 會保留為不同閱讀入口。
- 如果沒有 navigation／NCX 連結，依 spine manifest 順序建立 fallback 章節。
- EPUB 3 封面使用 manifest cover-image property；EPUB 2 使用 metadata cover id。
- archive href 會移除 fragment、嘗試 percent decoding、正規化，並拒絕絕對路徑與 ../ traversal。
- 發現 META-INF/rights.xml 或 META-INF/encryption.xml 時，目前一律視為不支援的 DRM EPUB。

## 8. Persistence

正式書庫位於 Electron user data 目錄：

    library/
    ├── index.json
    └── books/
        └── <book-sha256>/
            └── book.epub

- index.json 保存完整 LibraryBook[]，包含 Base64 封面與章節 metadata。
- 索引更新先寫入 index.json.next，再以 rename 替換正式索引。
- 閱讀狀態寫入在單一 LocalBookLibrary instance 內串行執行，以最後一筆操作為準。
- 章內範圍標籤、持久標記與閱讀狀態共用同一寫入佇列，並分別保存在 `chapterRanges`、`chapterAnnotations` 與 `readingState`。
- 書籍刪除與閱讀狀態寫入共用同一佇列，避免刪除後又被較晚完成的狀態保存寫回索引。
- 刪除先原子更新索引，再移除 books/<book-sha256>；目錄移除失敗時嘗試恢復原索引並回報失敗。
- 新書導入時先建立內容雜湊目錄並複製 EPUB；後續步驟失敗時移除該書目錄。
- 測試環境使用系統暫存目錄下、包含 process id 的隔離書庫。

## 9. External Dependencies

| Dependency | Current range | Use |
|---|---:|---|
| Electron | ^43.1.1 | 桌面生命週期、原生檔案選擇器、IPC、user data 路徑 |
| React / React DOM | ^19.2.7 | 書庫與書籍總覽 UI 狀態 |
| JSZip | ^3.10.1 | 讀取 EPUB ZIP archive |
| fast-xml-parser | ^5.10.1 | 解析 container、package、navigation 與 NCX XML |

檔案雜湊、路徑處理與持久化使用 Node.js 內建模組。

## 10. Important Constraints

- Electron window 啟用 contextIsolation 與 sandbox，並停用 renderer Node integration。
- IPC 面向必須維持窄介面；新增書庫功能時優先增加明確的方法，不可暴露任意 channel 或檔案路徑。
- 書籍原始檔和使用者狀態必須與 renderer 分離。
- 相同內容的 EPUB 必須回傳既有書籍，不可重設進度。
- 書名不是識別碼；同名不同內容必須允許並存。
- 封面 Data URL 需要 renderer CSP 的 img-src data:，不可因此放寬 script CSP。
- 書籍總覽過長時只能捲動中央 .content；左側書庫和右側 AI 面板維持在 viewport 內。
- 導入失敗不得在索引留下半完成書籍。
- EPUB 原始 XHTML 不可直接注入 renderer；章節輸出必須維持 allowlist 與外部資源封鎖。
- 子章節定位只允許在安全閱讀元素上保留經驗證及 escaping 的 `id`，不得因此放寬其他 EPUB 屬性。
- 閱讀位置使用 0–1 相對值並限制於有效範圍；不存在的書籍或章節不得改寫狀態。
- 範圍標籤使用章內文字 offset；起終點必須是非負整數且起點不得大於終點，不存在的章節不得保存範圍。
- 範圍標籤只能裁切目前章節，任何操作與自動推進都不得跨章。
- 標記必須使用合法章內純文字 offset、包含非空原文且同章互不重疊；不存在的書籍或章節不得保存標記。
- 快速連續的閱讀狀態寫入必須串行，最後一筆操作為最終狀態。
- 刪除請求只接受索引中存在的 bookId；renderer 不得提供檔案路徑，刪除失敗時不得先從畫面移除書籍。
- 閱讀版面設定只控制安全章節內容的呈現；紙張寬度超過中央可用空間時必須自動
  收縮，且任何版面調整都不得改寫 EPUB 原文或每本書的閱讀狀態。

## 11. Testing Notes

| Test file | Coverage |
|---|---|
| apps/desktop/src/main/library-service.test.ts | EPUB 導入與刪除、章節階層與舊索引遷移、fragment 定位、安全內容與圖片、閱讀狀態及每章範圍持久化、不存在書籍／章節與錯誤回滾 |
| apps/desktop/src/main/library-ipc.test.ts | 書庫、導入、刪除、章節、閱讀狀態與閱讀區段 handler，以及輸入驗證 |
| apps/desktop/src/main/settings-store.test.ts | 閱讀版面預設、完整保存、舊設定相容與無效欄位獨立降級 |
| apps/desktop/src/main/settings-ipc.test.ts | 字級、紙張寬度、行距及完整設定 payload 的範圍／步進驗證 |
| apps/desktop/src/renderer/App.test.tsx | 側欄書籍切換、書籍刪除、章節閱讀、閱讀版面面板／即時預覽／重設／關閉、閱讀位置恢復、範圍標籤拖曳／功能選單／防交叉／推進 |
| apps/desktop/src/renderer/reading-range.test.ts | 約 800 字初始化、短章、嚴格裁切、等長推進、章末停止、DOM 文字位置與標記資料獨立性 |
| apps/desktop/tests/e2e/desktop.spec.ts | Electron 安全 bridge（含刪除與閱讀區段 API）、閱讀版面保存與 computed style、響應式紙張寬度、Data URL 圖片政策、中央獨立捲動與固定左右欄 |

最近驗證（2026-07-24）：

- Server Vitest：3/3 passed。
- Desktop Vitest：198/198 passed。
- Electron Playwright：2/2 passed。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。

## 12. Known Limitations and Technical Debt

- 章節閱讀只保留常見安全 HTML 與點陣圖片，尚未支援 EPUB 自訂 CSS／字型、SVG、影音、MathML 與複雜互動內容。
- 相對閱讀位置可容忍版面重排，但字型或視窗變動很大時只能恢復到接近原段落，無法保證像素完全一致。
- 尚未提供重新命名、排序、重新導入或匯出書籍的操作。
- index.json 沒有 schema version、資料 migration、結構驗證或損壞修復流程。
- 書庫沒有跨 process 寫入鎖；目前假設只有單一 Electron main process 操作。
- Base64 封面直接保存在 index.json 並經 IPC 傳遞；大量或高解析度封面可能使索引與 IPC payload 過大。
- 封面解析只支援標準 cover-image／legacy cover metadata 指向的直接圖片，不支援以封面 XHTML 間接引用圖片的變體。
- 目前只檢查 encryption／rights 文件是否存在，未區分完整 DRM 與可解密的字型混淆等情況。
- E2E 測試驗證 bridge、圖片政策與版面，但未自動操作原生檔案選擇器完成真實 EPUB 導入。
- renderer 的書庫、閱讀、複習與 AI 狀態目前集中在 App.tsx；功能成長後需要拆分狀態與畫面邊界。

## 13. Related Documents

- CONTEXT.md
- documents/implements/F01-epub-book-library.md
- documents/implements/F02-chapter-reading-resume.md
- documents/implements/F03-simplify-sidebar-navigation.md
- documents/implements/F04-delete-library-book.md
- documents/implements/F05-ai-reading-range-markers.md
- documents/implements/F06-reading-range-boundary-lines.md
- documents/implements/F13-persistent-annotations-and-ai-analysis.md
- documents/implements/B01-preserve-epub-chapter-hierarchy.md
- documents/implements/B02-persist-range-marker-on-drag-release.md
- documents/implements/F25-adjustable-reading-and-conversation-font-sizes.md
- documents/implements/F26-reading-layout-settings.md
- documents/modules/reading-range.md
- documents/modules/annotation.md

更新本模組行為、資料格式、IPC、儲存路徑或 EPUB 解析規則時，必須同步更新本文件與相關 FXX／RXX／BXX 實作紀錄。
