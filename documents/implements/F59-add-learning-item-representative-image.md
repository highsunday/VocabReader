---
author: Codex
date: 2026-08-10
title: 為學習項目上傳一張代表圖片
uuid: dbb99779-0e3e-418e-84dd-4e87b0e949a7
version: 1.1.0
status: implemented
---

# Feature Specification - 學習項目代表圖片

## 1. Feature Overview

部分英文單字的目標語義指向具體物件、動植物、食物或其他可視實體。這類概念只用文字
解釋時，往往不如圖片直接，也可能讓學習者把同一標題的不同語義混在一起。

本功能讓每個正式**學習項目**最多保存一張可留空的**學習項目代表圖片**。使用者可從
具備編修能力的**學習項目詳情**人工上傳、替換或移除圖片；App 會自動置中裁成正方形、
縮放為固定尺寸並只保存處理後的結果。圖片只在完整詳情出現，不進入生詞庫清單，也不在
尚未作答的間隔複習題中洩漏目標語義。

## 2. Requirements (User Story)

- **As a** 使用 VocabReader 累積與複習生詞的語言學習者
- **I want** 為一個學習項目附上一張經過統一處理的代表圖片
- **So that** 當目標語義指向具體名詞時，我能用視覺資訊比純文字更直接地理解與辨認它

## 3. Confirmed Product Rules

### 3.1 圖片數量與用途

- 每個正式學習項目最多一張代表圖片；欄位可留空。
- 代表圖片對應該學習項目的**目標語義**，不是一般 Markdown 圖片、圖片集、相簿或來源
  章節截圖集合。
- 同標題但不同語義的學習項目各自擁有自己的代表圖片，不共用或自動複製。
- AI 輔助建立的新草稿沒有圖片欄位；提交成正式學習項目後，使用者才能人工上傳。

### 3.2 上傳來源與驗證

- 第一版接受 JPEG（`.jpg`／`.jpeg`）、PNG（`.png`）與 WebP（`.webp`）。
- 單一來源檔案上限為 **10 MiB（10 × 1024 × 1024 bytes）**；超過上限必須在解碼與寫入
  前拒絕。
- Main Process 必須同時驗證選取檔案的實際內容可解碼為允許的點陣圖片；不得只信任副檔名
  或 Renderer 提供的 MIME。
- SVG、GIF、HEIC 及其他格式不接受。若 WebP 含多幀，正式圖片只使用第一幀。
- 使用者取消原生檔案選擇、檔案不存在、讀取失敗、格式不符、超過大小或無法解碼時，
  原代表圖片保持不變並顯示可理解的錯誤；不得先清除舊圖片。
- Renderer 不取得任意檔案系統能力，也不提供來源路徑。來源路徑只由 Main Process 的
  原生 open dialog 取得。

### 3.3 固定圖片處理規則

- 先依圖片的正常顯示方向取得有效寬高，再以較短邊為正方形邊長，從幾何中心自動裁切。
- 使用者不調整裁切框、縮放比例或焦點位置；不提供裁切編輯器。
- 裁切後一律縮放為 **256 × 256 px**；小於 256 px 的合法來源也會放大至固定尺寸。
- 正式輸出一律為 JPEG，品質固定為 **85%**；透明區域以白色背景合成。
- 只有完整完成解碼、裁切、縮放與 JPEG 編碼後，才可原子取代既有代表圖片。
- 正式資料只保存處理後的 256 × 256 JPEG，不保存來源原圖、EXIF、原始檔名、來源路徑、
  裁切中間檔或其他影像 metadata。

### 3.4 顯示位置與資訊揭露

- 代表圖片只出現在完整**學習項目詳情**，位置在標題與目標語義下方、學習注意事項與
  Markdown 學習內容上方。
- 圖片以固定正方形區域顯示，不得拉伸變形；其替代文字應描述它是目前標題與目標語義的
  代表圖片，不使用本機檔名。
- 共用詳情從下列入口開啟時都顯示既有代表圖片：
  - active 生詞庫；
  - 垃圾桶中的學習項目；
  - 已批改但尚未確認排程的複習試卷；
  - 已確認排程的複習完成頁；
  - AI 輔助建立的 Already exists 結果；
  - 整合造句練習。
- 生詞庫與垃圾桶清單摘要不載入、不顯示圖片，也不新增縮圖或圖片存在標記。
- 尚未作答的間隔複習題不載入或顯示圖片；圖片不得傳入複習題的 AI 出題 scope，避免直接
  或間接洩漏答案。
- AI 建立草稿的唯讀預覽不顯示圖片，因草稿尚不是正式學習項目。

### 3.5 上傳、替換與移除權限

- 圖片是獨立、立即保存的操作，不進入既有文字 `Edit` 表單，也不受其 `Save`／`Cancel`
  控制。
- 具備編修能力的 active 學習項目詳情提供圖片操作：
  - 無圖片時顯示 `Add image`；
  - 有圖片時顯示 `Replace image` 與 `Remove image`。
- 可操作入口包含 active 生詞庫、已批改的複習試卷，以及已確認排程的複習完成頁。
- 垃圾桶、AI 輔助建立的 Already exists 結果與整合造句練習維持唯讀：顯示圖片，但不顯示
  Add、Replace 或 Remove。
- 選取並處理成功後立即保存 Add／Replace，刷新同一詳情中的正式項目並維持視窗開啟。
- `Remove image` 必須先顯示具名確認視窗；取消或按 Escape 不修改資料，明確確認後才立即
  移除圖片。
- 圖片操作進行中不得重複送出；文字人工編輯或 AI 輔助編修正在進行時不得同時修改圖片，
  以免兩個正式 mutation 互相覆蓋或觸發過期套用。
- 圖片 mutation 只接受目前仍為 active 的項目。項目不存在或已移入垃圾桶時拒絕寫入，
  Renderer 顯示錯誤並保留目前畫面狀態。

### 3.6 與人工／AI 編修及複習的關係

- 既有 `UpdateLearningItemInput` 不攜帶代表圖片；人工修改標題、類型、語言、CEFR、sense、
  Markdown 或學習注意事項時必須保留既有圖片。
- **AI 輔助編修**仍只修改 Markdown 與學習注意事項；AI 不可讀取、上傳、替換、生成、
  描述或移除代表圖片。
- Add、Replace 或 Remove 會更新正式學習項目的 `updatedAt`，但不新增複習事件、不重設
  FSRS card、不修改 due time，也不重新生成或重新批改目前試卷。
- 已產生的題目、使用者答案、AI 回饋、建議評級與目前選定評級保持不變。

### 3.7 垃圾桶、永久刪除與資料備份

- 學習項目移入垃圾桶時保留代表圖片；還原後仍顯示同一張圖片。
- 只有永久清空垃圾桶、刪除該學習項目時，代表圖片才一併永久刪除。
- 處理後的 JPEG 保存於 Learning Library SQLite，並與所屬學習項目的生命週期一致；不得
  另外留下無主檔案。
- 既有 Data Backup 的 SQLite snapshot 必須包含 active 與 trashed 項目的代表圖片；還原
  後圖片位元組與項目關聯必須一致。
- 舊 SQLite migration 後所有既有學習項目的圖片為空；舊備份仍可還原並正常顯示無圖片
  詳情。
- Backup ZIP payload 結構與 format version 不因本功能增加另一種檔案；只提升 Learning
  Library schema compatibility version。較舊 App 仍應依既有規則拒絕較新的 schema，而不
  嘗試部分還原。

## 4. Acceptance Criteria

### AC1：上傳並顯示代表圖片

- **Given** active 學習項目尚無圖片，使用者從具備編修能力的詳情操作
- **When** 使用者選取一張 10 MiB 內、可解碼的 JPEG、PNG 或 WebP
- **Then** App 以中心正方形裁切、輸出 256 × 256 JPEG 品質 85%、立即保存並在同一詳情
  的標題／sense 下方顯示
- **And** 正式資料不保存來源路徑、原檔或原始 metadata

### AC2：橫圖、直圖、小圖與透明圖的固定轉換

- **Given** 四張合法來源分別是橫向、直向、短邊小於 256 px，以及含透明區域的圖片
- **When** 使用者逐一上傳
- **Then** 每次結果皆為未拉伸的 256 × 256 JPEG；裁切取幾何中心，小圖被放大，透明區域
  為白色

### AC3：替換採成功後原子取代

- **Given** 學習項目已有代表圖片
- **When** 使用者選擇 Replace 且新圖片成功處理
- **Then** 新圖片完整取代舊圖片，同一詳情刷新且沒有殘留舊圖片資料
- **But when** 使用者取消選檔或新圖片處理失敗
- **Then** 舊圖片與其他學習項目欄位完全不變

### AC4：移除需要確認

- **Given** 學習項目已有代表圖片
- **When** 使用者按 Remove image
- **Then** App 顯示具名確認視窗；Cancel 或 Escape 保留圖片，明確確認才立即移除

### AC5：拒絕不合法來源

- **Given** 使用者選取超過 10 MiB、偽裝副檔名、損壞、SVG、GIF、HEIC 或其他不支援檔案
- **When** Main Process 驗證來源
- **Then** App 拒絕處理、顯示錯誤、不寫入部分資料，既有圖片與項目內容保持不變

### AC6：詳情顯示但清單與未作答題目不揭露

- **Given** 一個學習項目已有代表圖片
- **When** 使用者查看生詞庫／垃圾桶清單、尚未作答的複習題與各入口的完整詳情
- **Then** 清單與未作答題目不載入或顯示圖片，所有完整詳情都顯示圖片
- **And** 圖片不進入複習出題的 AI scope

### AC7：能力邊界

- **Given** 同一 active 項目分別從生詞庫、已批改試卷、複習完成頁、Already exists 與
  整合造句入口開啟
- **When** 詳情渲染可用操作
- **Then** 前三個 editable 入口可 Add／Replace／Remove；後兩個 read-only 入口只顯示
  圖片，不提供 mutation
- **And** 垃圾桶詳情同樣只讀

### AC8：人工與 AI 編修保留圖片

- **Given** active 學習項目已有代表圖片
- **When** 使用者保存人工文字編輯或明確 Apply AI 編修
- **Then** Markdown／注意事項等允許欄位依原流程更新，代表圖片位元組保持不變
- **And** AI artifact 與 AI scope 都不包含圖片

### AC9：複習狀態不受圖片 mutation 影響

- **Given** 學習項目已有 FSRS 排程，或正位於已批改但尚未確認的試卷
- **When** 使用者 Add、Replace 或 Remove 代表圖片
- **Then** 正式圖片與 `updatedAt` 更新，但 review events、card、due、答案、回饋與評級不變，
  也不觸發重新出題或批改

### AC10：垃圾桶生命週期

- **Given** 學習項目已有代表圖片
- **When** 項目被移入垃圾桶後再還原
- **Then** 圖片完整保留
- **And when** 垃圾桶被永久清空
- **Then** 項目及圖片一併永久刪除，不留下可查詢的孤兒資料

### AC11：備份、還原與舊資料 migration

- **Given** active 與 trashed 項目各自含代表圖片，另有一份舊 schema 無圖片資料
- **When** 匯出並還原完整 Data Backup，或開啟舊資料庫
- **Then** 備份往返保留圖片內容與關聯，舊資料庫安全 migration 且既有項目圖片為空
- **And** Data Backup archive payload 結構維持既有 allowlist

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | JPEG／PNG／WebP 成功上傳 | 三種合法來源皆 ≤10 MiB | 逐一 Add／Replace | repository 收到 256×256 JPEG；詳情立即刷新 | Critical |
| TC2 | 中心裁切與固定輸出 | 橫圖、直圖、小圖、透明圖 | 執行處理 | 中心 crop、固定尺寸、JPEG 85、白底且不拉伸 | Critical |
| TC3 | 取消原生選檔 | 已有圖片 | 取消 Replace | 回傳 cancelled；舊圖片與 updatedAt 不變 | High |
| TC4 | 不合法與損壞來源 | oversized／偽副檔名／SVG／GIF／HEIC／損壞檔 | 選取檔案 | 全部拒絕且無 mutation | Critical |
| TC5 | Replace 原子性 | 已有圖片 | 新圖成功／處理失敗 | 成功才取代；失敗保留舊圖 | Critical |
| TC6 | Remove 確認 | 已有圖片 | Cancel、Escape、Confirm | 前兩者保留，Confirm 移除 | High |
| TC7 | 共用詳情顯示 | 各入口開啟含圖片項目 | 渲染詳情 | 圖片位置、尺寸與 accessible name 正確 | High |
| TC8 | editable／read-only 權限 | 三個 editable 與三類 read-only 詳情 | 檢查／操作按鈕 | 只有 editable 顯示並呼叫圖片 mutation | Critical |
| TC9 | 清單與複習題不含圖片 | 50 筆摘要含圖片項目且有未作答試卷 | list／review query | payload、DOM 與 AI scope 均無圖片 | Critical |
| TC10 | 人工編輯保留圖片 | 項目已有圖片 | updateItem | 其他欄位更新，image bytes 相同 | High |
| TC11 | AI 編修隔離 | 項目已有圖片 | start／send／apply | AI payload／artifact 無圖片，Apply 後圖片相同 | High |
| TC12 | review state 隔離 | scheduled／reviewing 項目 | Add／Replace／Remove | FSRS、events、paper、rating 無變化 | Critical |
| TC13 | active 狀態 guard | 項目在選檔期間移入垃圾桶 | 處理完成後嘗試保存 | 寫入拒絕；垃圾桶項目不被修改 | High |
| TC14 | Trash／restore／empty lifecycle | 含圖片項目 | trash、restore、empty Trash | 前兩步保留；永久清空後圖片隨 row 消失 | Critical |
| TC15 | SQLite migration | schema 6 database | 開啟 repository | schema 升級，所有既有 image 為 null | Critical |
| TC16 | Data Backup 往返 | active／trashed 含不同圖片 | export、preview、restore | 圖片 bytes 與 item 關聯完整；payload allowlist 不變 | Critical |
| TC17 | 較新 schema 安全拒絕 | 舊版相容性檢查器讀取 schema 7 | 預覽 restore | 依既有規則拒絕，不部分還原 | High |
| TC18 | 鍵盤與錯誤狀態 | 可編輯詳情已開啟 | 鍵盤操作、busy、錯誤、確認返回 | 焦點可預期、操作具名、錯誤可讀、無重複送出 | Medium |

## 6. Implementation Notes

### 6.1 建議資料模型

- Learning Library schema 7 在 `learning_items` 新增 nullable JPEG BLOB 欄位，例如
  `representative_image`；`NULL` 代表無圖片。
- `LearningItem` 增加 nullable 的詳情圖片表示；Main 可在 `getItem()` 邊界轉成受信任的
  `data:image/jpeg;base64,...`。`LearningItemSummary` 刻意不增加圖片欄位。
- migration 只新增 nullable 欄位，不回填影像，也不改寫既有 row。
- 因圖片存於所屬 row，Trash／restore 自然保留，永久刪除 row 時不會產生孤兒資產；SQLite
  backup 也會自動涵蓋圖片。

### 6.2 建議圖片處理與 IPC 邊界

- 在 Electron Main 建立可單元測試的圖片處理邊界，負責 byte limit、實際格式驗證、正常
  方向、first frame、center crop、resize、白底與 JPEG 編碼。
- 以 Main-owned 原生 dialog 實作窄型 `selectRepresentativeImage(itemId)`；Renderer 只取得
  cancelled 或更新後的正式 `LearningItem`，不取得來源路徑或原始 bytes。
- `removeRepresentativeImage(itemId)` 只接受受驗證 item id；確認行為由 Renderer 的具名
  alertdialog 負責，Main 仍以 active status guard 執行 mutation。
- 圖片操作不併入 `UpdateLearningItemInput`，避免人工文字 Save 或 AI Apply 用舊 snapshot
  覆寫圖片，也讓圖片的立即保存語意保持清楚。
- 寫入應以單次 SQLite UPDATE 原子取代 BLOB 與 `updated_at`；處理完成前不接觸正式 row。

### 6.3 建議 Renderer 邊界

- 沿用單一 `LearningItemDialog` 顯示圖片，確保生詞庫、複習結果、完成頁、Already exists
  與整合造句不產生不同版面。
- 將圖片 mutation capability 與 `readOnly`／`allowMoveToTrash` 一樣明確傳遞；唯讀入口不得
  只靠隱藏 CSS，必須不渲染也不呼叫 mutation。
- 上傳／替換 busy 時停用相關操作。Remove confirmation 疊在詳情上層，Escape 只關閉最上層
  dialog，並在完成或取消後恢復焦點。

### 6.4 Data Backup compatibility

- Backup ZIP 仍只包含 `learning-library/learning-items.sqlite`，因此 format version 可維持 1，
  manifest file allowlist 與 entry count 不需增加。
- `MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION` 升為 7；restore preview 應接受 schema
  7，舊資料庫由 repository 正常 migration。
- 備份回歸測試必須使用實際含 BLOB 的 active／trashed rows，比對還原後 bytes，而不只比較
  item counts。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/data-backup-service.ts`（schema compatibility only）

實作時可依測試接縫新增獨立的圖片處理 service／test file；檔名不在需求層預先鎖死。

### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/main/data-backup-service.test.ts`
- `apps/desktop/src/main/learning-item-edit-ipc.test.ts` 或相應 AI 編修回歸測試
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`

### Documentation after implementation

- `CONTEXT.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-editing.md`
- `documents/modules/spaced-review.md`
- `documents/modules/data-backup.md`
- `documents/implements/F59-add-learning-item-representative-image.md`

## 8. Assumptions, Non-goals and Open Questions

### Assumptions

- JPEG 品質 85 與 256 × 256 的固定輸出足以辨認學習項目的具體名詞，且容量優先於保留
  透明度或原始解析度。
- 自動中心裁切已被接受；主體偏離中心而被切掉時，使用者可換用另一張來源圖片，但第一版
  不調整焦點。
- 白色是透明來源轉 JPEG 時的中性背景。

### Non-goals

- 不支援每項多張圖片、圖片排序、caption、來源網址、版權資訊或相簿。
- 不提供裁切框、拖曳、縮放、旋轉、濾鏡、手動壓縮品質或焦點設定。
- 不從網路搜尋、下載、抓取或由 AI 生成圖片。
- 不讓 AI 讀圖、描述圖片、以圖出題或根據圖片修改學習內容。
- 不在生詞庫清單、垃圾桶清單、未作答複習題或 AI 建立草稿顯示圖片或圖片指示器。
- 不保留原圖，不提供匯出單張圖片或恢復被 Replace／Remove 的舊版本。
- 不增加雲端同步、共享或跨裝置合併。

### Open Questions

- 無阻擋實作的未決問題。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-10.

### Implementation Summary

- 新增 Main-owned `LearningItemRepresentativeImageService`：原生 dialog 只接受 JPEG／PNG／
  WebP，先檢查副檔名與 10 MiB 上限，再用 Sharp 驗證實際格式、自動方向、中心 `cover`
  裁切、透明白底、256×256 與 JPEG 品質 85；處理成功前不呼叫 repository。
- Learning Library schema 升為 7，`learning_items.representative_image` 保存 nullable JPEG
  BLOB。完整 `LearningItem` 才轉為 data URL；`LearningItemSummary` 與 review queue 明確不含
  圖片。
- 新增具名 preload／IPC Add-or-Replace 與 Remove capability。Renderer 不傳來源路徑或原始
  bytes；repository 以 active guard 原子更新 BLOB 與 `updatedAt`。
- 共用 `LearningItemDialog` 在標題／sense 後顯示圖片。editable 入口提供立即 Add／Replace
  與確認後 Remove；read-only、人工文字 editor 與 AI editor 不渲染圖片 mutation。
- 人工 `updateItem()` 與 `applyAiEdit()` 都不接收圖片，現有圖片保持不變；圖片 mutation
  不新增 review event、不修改 FSRS 或未確認試卷。
- Trash／restore 保留同一 BLOB；永久清空刪除所屬 row 與圖片。Data Backup format version 1
  與 allowlist 不變，schema 7 SQLite snapshot 已驗證 active／trashed 圖片完整往返。
- 新增 Sharp 0.35.3 runtime dependency，Main bundle 將它標示為 external native dependency；
  production build 與 Electron E2E 已實際載入成功。

### Test Coverage and Results

| Test | Covered scenarios |
|---|---|
| `learning-item-representative-image.test.ts` | TC1–TC5：三種格式、中心裁切、透明白底、256px JPEG、10 MiB、拒絕格式、取消與 Main-owned path |
| `learning-library-service.test.ts` | TC9–TC15：詳情／summary／review scope、人工與 AI 保存、active guard、Trash／restore／empty、schema 7 |
| `learning-library-ipc.test.ts` | TC1、TC4、TC8、TC13：具名圖片 IPC、item id 驗證與無效 payload 拒絕 |
| `learning-library-workspace.test.tsx` | TC3、TC6–TC8、TC18：顯示、Replace、Remove 確認、read-only capability 與 accessible name |
| `learning-item-edit-controller.test.ts` | TC11：AI payload 明確不含代表圖片 |
| `data-backup-service.test.ts` | TC16、TC17：active／trashed 圖片完整還原、schema 7 接受與 schema 8 拒絕 |
| `desktop.spec.ts` | TC8、TC18：production preload 只增加兩個具名圖片 capability，Electron shell 正常啟動 |

驗證結果：Desktop Vitest 52 files、489/489 passed；Server／Desktop TypeScript typecheck、
Desktop production build、Electron Playwright E2E 3/3 與 `git diff --check` 全部通過。

### Changed Files and Documentation Sync

#### Production code

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-representative-image.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/learning-item-representative-image.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/main/learning-item-edit-controller.test.ts`
- `apps/desktop/src/main/data-backup-service.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F59-add-learning-item-representative-image.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-editing.md`
- `documents/modules/spaced-review.md`
- `documents/modules/data-backup.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| AC1 上傳並顯示 | Pass | 三格式 processor／service tests；共用詳情 Renderer test |
| AC2 固定轉換 | Pass | 真實 Sharp 橫圖中心 crop、透明白底、小圖與 256×256 JPEG assertions |
| AC3 原子替換 | Pass | service 取消不寫入；processor 完成後才呼叫 repository；Renderer Replace refresh |
| AC4 移除確認 | Pass | Renderer Cancel／Confirm；Escape 走相同最上層 guard |
| AC5 拒絕來源 | Pass | oversized、GIF、SVG、corrupt 與 IPC id rejection tests |
| AC6 只在詳情揭露 | Pass | summary／review queue negative assertions；共用詳情 positive assertion |
| AC7 capability 邊界 | Pass | 同一共用詳情 editable／read-only Renderer test；既有入口回歸全綠 |
| AC8 人工／AI 保留 | Pass | repository update／apply assertions；AI payload negative assertion |
| AC9 複習狀態隔離 | Pass | 圖片 SQL 只更新 image／updatedAt；review queue／完整複習 suite 全綠 |
| AC10 垃圾桶生命週期 | Pass | Trash／restore 保留、active guard、empty 後 get not found |
| AC11 備份與 migration | Pass | schema 7 migration 與 active／trashed BLOB Data Backup round-trip |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | processor 三格式 parameterized test；IPC／Renderer Add-Replace |
| TC2 | Pass | processor center crop、white flatten、metadata assertions |
| TC3 | Pass | service cancelled result 無 repository call |
| TC4 | Pass | processor oversized／GIF／SVG／corrupt rejection；dialog filter |
| TC5 | Pass | processing precedes single repository call；失敗／取消無 mutation |
| TC6 | Pass | Renderer Remove alertdialog Cancel／Confirm；Escape guard |
| TC7 | Pass | shared `LearningItemDialog` image position／alt；入口回歸 suite |
| TC8 | Pass | shared editable／read-only test；production preload E2E |
| TC9 | Pass | list summary 與 review selected item 均無 image property |
| TC10 | Pass | `updateItem()` 後 image data URL 相同 |
| TC11 | Pass | `applyAiEdit()` 後 image 相同；controller payload 無 image |
| TC12 | Pass | image mutation SQL 無 review side effect；完整 spaced-review tests |
| TC13 | Pass | trashed item set image 被 active guard 拒絕 |
| TC14 | Pass | repository Trash／restore／empty lifecycle |
| TC15 | Pass | legacy column removal後重新建立 nullable schema 7 欄位 |
| TC16 | Pass | Data Backup active／trashed bytes round-trip，allowlist 回歸不變 |
| TC17 | Pass | schema 7 export／preview 通過，schema 8 安全拒絕 |
| TC18 | Pass | alertdialog／accessible image／busy guards；Electron bridge E2E |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/learning-library-service.test.ts src/main/learning-library-ipc.test.ts src/renderer/learning-library-workspace.test.tsx
npm run test -w @reader/desktop -- --run src/main/learning-item-representative-image.test.ts src/main/learning-library-service.test.ts src/main/learning-library-ipc.test.ts src/main/data-backup-service.test.ts src/renderer/learning-library-workspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
npm run test:e2e -w @reader/desktop
git diff --check
```

### Red／Green Evidence

- 初始 red：4 個新測試正確失敗，分別缺少 repository 圖片 mutation、兩個 IPC handler 與
  詳情圖片／操作 UI；原有 54 個相鄰測試仍通過。
- 第一個 E2E red 是安全白名單仍期待舊 learning keys；加入兩個已核准的具名 capability
  後 3/3 通過，未放寬任意 IPC 或 filesystem access。
- 最終 green：聚焦 71/71、Desktop 全套 489/489、E2E 3/3。

### Hypotheses and Decisions

1. 使用 SQLite nullable BLOB，而不是 App-owned 獨立圖檔；256px JPEG 已有嚴格大小處理，
   BLOB 能讓 Trash、永久刪除與完整備份不產生孤兒檔案或第二套交換流程。
2. Electron `nativeImage.createFromBuffer` 的公開型別只保證先嘗試 PNG／JPEG，無法可靠覆蓋
   已確認的 WebP；採用 Sharp 0.35.3，以同一 pipeline 完成真實格式驗證、方向、crop、
   alpha flatten 與 JPEG 編碼。
3. 圖片 mutation 保持獨立立即保存，不擴張人工 `UpdateLearningItemInput` 或 AI artifact；
   這避免文字 Save／AI Apply 用舊 snapshot 覆寫圖片。
4. `itemFromRow()` 只供完整詳情；review queue 額外明確剔除 data URL。其他 AI controllers
   既有 explicit payload mapping 也不會把圖片傳給模型。
5. Backup ZIP 不新增檔案，format version 維持 1；只有 SQLite compatible schema 升到 7。

### Architectural Observations

圖片處理、repository 與共用詳情已有清楚測試接縫；未發現需要另開 RXX 的責任混淆。
需要持續注意的是 Sharp 為 native runtime dependency：目前 production build 將它 externalize，
且 Electron E2E 已驗證目前平台；未來導入 Electron packager 時必須把各目標平台的 Sharp
binary 納入安裝包檢查。

### Deferred Items

- 多圖片、手動 crop／焦點、AI 圖片、網路搜尋、圖片 caption／來源與舊圖片 undo 仍是
  明確 non-goals，未實作。
- 沒有新增 Windows 專用 E2E；跨平台 runtime binary 由 Sharp 的 optional platform packages
  與未來安裝包流程承擔，現有 Windows 原始碼 path／SQLite 行為未改。

## Appendix: TDD Implementation Checklist

1. 先依 TC1–TC6 建立圖片處理、格式／大小拒絕、原子 Replace 與 Remove 確認的 failing tests。
2. 依 TC7–TC9 建立共用詳情顯示、capability 與清單／複習 scope 不揭露圖片的 failing tests。
3. 依 TC10–TC14 建立人工／AI 編修、複習狀態與垃圾桶生命週期回歸測試。
4. 依 TC15–TC17 建立 schema migration、SQLite BLOB backup／restore 與相容性測試。
5. 完成最小正式碼，執行聚焦測試、Desktop 全套測試、typecheck、build、E2E 與 diff 檢查。
6. 回填 Implementation Record，更新 F59 版本／狀態，並同步 learning-library、
   learning-item-editing、spaced-review 與 data-backup 模組文件。
