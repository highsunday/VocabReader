---
author: Codex
date: 2026-07-28
title: 以單一 ZIP 匯出並完整還原書庫與生詞庫
uuid: f31ca7f5-b02e-44d7-b013-c40b3203c5d1
version: 1.1.2
status: implemented
---

# Feature Specification - 以單一 ZIP 匯出並完整還原書庫與生詞庫

## 1. Feature Overview

目前使用者的**書庫**與**生詞庫**只保存在單一裝置的 Electron user data。若要在另一
台電腦延續閱讀與複習，只能手動尋找並複製不同目錄中的 EPUB、書籍索引及 SQLite，
不但容易漏掉閱讀進度、標記或複習歷史，也可能在 App 尚未停止寫入時取得不一致資料。

本功能在設定視窗提供**資料備份**與**資料還原**。使用者可把完整書庫與完整生詞庫
匯出為一個 LingoShelf ZIP 備份，再於另一台電腦選取該 ZIP、檢視摘要並確認還原。
還原採完整取代，不合併來源與目前裝置資料；App 必須先完整驗證備份，成功取代後自動
重新啟動。任何驗證或取代失敗都不得留下混合、部分更新或無法復原的目前資料。

## 2. Requirements (User Story)

- **As a** 在多台電腦使用 LingoShelf 的語言學習者
- **I want** 將書籍、閱讀狀態、學習項目與複習進度匯出成一個 ZIP 並在另一台電腦還原
- **So that** 我可以安全延續閱讀與學習，而不必手動尋找及複製內部資料檔案

## 3. Confirmed Product Rules

### 3.1 備份範圍

一份資料備份必須同時包含：

- 書庫內所有原始 EPUB。
- 書籍索引、章節層級、封面資訊、閱讀進度、目前章節與閱讀位置。
- 每章的範圍標籤與標記。
- 生詞庫內所有使用中與垃圾桶中的學習項目及完整 Markdown 學習內容。
- 每個學習項目的複習排程與精簡複習歷史。

一份資料備份不得包含：

- AI 對話、學習項目草稿清單或其他對話持久資料。
- 講解語言、字級、紙張寬度、行距等全域設定。
- Codex 登入、帳戶、額度、模型選擇、App skills 或 runtime 資料。
- 尚未確認或只存在記憶體中的複習試卷、答案與詳細 AI 回饋。

### 3.2 單一可辨識 ZIP

- 匯出結果是一個副檔名為 `.zip` 的 LingoShelf 資料備份。
- ZIP 包含固定格式識別、格式版本、建立時間、App 版本、資料數量與 payload 完整性
  資訊，讓匯入端可在寫入前驗證來源、相容性與檔案完整性。
- 預設檔名包含 `LingoShelf`、`backup` 及本地建立日期時間；使用者仍可在原生儲存
  對話框修改檔名與位置。
- 匯出空書庫與空生詞庫仍是合法備份。
- 取消儲存對話框不建立檔案，也不顯示失敗訊息。
- 匯出先寫入暫存結果，只有完整 ZIP 成功建立後才成為使用者選定的目的檔；失敗不得
  留下看似成功的部分備份。

### 3.3 匯入預覽與明確確認

- 使用者透過原生開啟對話框選取一個 ZIP；Renderer 不傳入或取得任意本機路徑。
- App 在顯示確認前先驗證格式、版本、必要檔案、checksum、SQLite 完整性、書籍索引
  與每本 EPUB 對應關係。
- 驗證成功後顯示備份建立時間、書籍數、使用中學習項目數及垃圾桶項目數。
- 預覽階段不得改變目前書庫、生詞庫或畫面資料。
- 確認視窗必須清楚說明：目前裝置的全部書籍、閱讀狀態、標記、學習項目、垃圾桶、
  複習排程與複習歷史都會被備份內容完整取代，且不進行合併。
- 使用者取消檔案選擇或取消確認時，目前資料保持不變。

### 3.4 完整取代、失敗回滾與重啟

- 只有使用者在有效預覽上再次確認後才開始資料還原。
- 還原必須把書庫與生詞庫視為同一份資料集合；不可只成功取代其中一邊。
- App 在取代前保留內部回滾資料。若停止資料寫入、關閉資料庫、交換檔案或重新驗證
  任一步驟失敗，必須恢復匯入前狀態並顯示可理解的錯誤。
- 還原成功後保留目前裝置的 AI 對話、全域設定與 Codex 執行環境。
- 還原成功後，正式安裝版自動重新啟動 LingoShelf；Vite 開發模式則保留 Electron
  與 dev server，只重新載入既有視窗。兩種模式都由既有 migration 與載入流程開啟
  還原的書庫及生詞庫。
- 還原失敗或取消時不得重新啟動。

### 3.5 相容性與安全邊界

- 第一版只接受具有受支援 LingoShelf 備份格式與版本的 ZIP；一般 ZIP、損壞 ZIP、
  缺檔、checksum 不符及較新未知版本都必須在寫入前拒絕。
- ZIP entry 必須限制在固定 allowlist 及安全相對路徑，不解壓絕對路徑、`..` traversal、
  symlink 或額外未宣告 payload。
- 匯入必須限制 entry 數量、單檔與解壓總大小，避免壓縮炸彈耗盡記憶體或磁碟。
- Renderer 只取得 typed 摘要、狀態及錯誤，不得取得資料庫路徑、書庫路徑、任意
  filesystem API 或可自行指定的來源／目的路徑。
- 同一時間只允許一個匯出或匯入操作；操作期間停用重複觸發。

### 3.6 設定介面

- 左側欄既有「設定」視窗新增獨立的「資料備份」區塊。
- 區塊提供「匯出備份」及「匯入備份」兩個明確操作與簡短範圍說明。
- 匯出中、驗證中、還原中、成功、取消與失敗皆有可理解的狀態；取消不是錯誤。
- 取代確認使用既有置中 modal、鍵盤操作及焦點管理模式。

## 4. Acceptance Criteria

- **Scenario 1：成功匯出單一完整 ZIP**
  - **Given** 書庫包含兩本有閱讀狀態與標記的書，生詞庫包含使用中與垃圾桶項目、
    複習排程及歷史
  - **When** 使用者在設定中選擇匯出並確認目的檔
  - **Then** 產生一個可驗證的 LingoShelf ZIP
  - **And** ZIP 同時包含所有書籍資料與一致的生詞庫資料
  - **And** 不包含設定、AI 對話或 Codex runtime

- **Scenario 2：取消匯出**
  - **Given** 使用者開啟匯出儲存對話框
  - **When** 使用者取消
  - **Then** 不建立目的檔
  - **And** UI 回到可再次操作狀態，不顯示錯誤

- **Scenario 3：有效備份先預覽、不立即寫入**
  - **Given** 目前裝置已有不同書籍與學習項目
  - **When** 使用者選取一份有效備份
  - **Then** 顯示建立時間及書籍、使用中項目、垃圾桶項目數
  - **And** 目前裝置資料完全不變

- **Scenario 4：取消取代確認**
  - **Given** 有效備份摘要與取代警告已顯示
  - **When** 使用者取消
  - **Then** 書庫、生詞庫、設定與 AI 對話均保持不變
  - **And** App 不重新啟動

- **Scenario 5：成功完整取代並重新啟動**
  - **Given** 使用者確認還原一份有效備份
  - **When** App 完成資料取代
  - **Then** 書庫與生詞庫都只剩備份中的完整狀態
  - **And** 原始 EPUB、閱讀位置、範圍標籤、標記、學習項目、垃圾桶、複習排程與
    歷史均可載入
  - **And** 目前裝置的設定、AI 對話及 Codex 環境不變
  - **And** App 自動重新啟動一次

- **Scenario 6：拒絕無效或不相容 ZIP**
  - **Given** 使用者選取一般 ZIP、損壞 ZIP、缺少必要檔案、checksum 不符、SQLite
    損壞或使用較新未知格式版本的備份
  - **When** App 驗證檔案
  - **Then** 顯示具體且可理解的錯誤
  - **And** 不顯示可執行的取代確認
  - **And** 目前資料不變且 App 不重新啟動

- **Scenario 7：取代中途失敗完整回滾**
  - **Given** 備份已驗證且使用者已確認
  - **When** 書庫或生詞庫交換步驟發生可模擬失敗
  - **Then** 書庫與生詞庫都恢復匯入前狀態
  - **And** 不留下來源與目的資料混合的結果
  - **And** 顯示錯誤且 App 不重新啟動

- **Scenario 8：拒絕不安全或過大的 archive**
  - **Given** ZIP 含 traversal、絕對路徑、額外未宣告 entry、過多 entry 或超出大小限制
  - **When** App 驗證檔案
  - **Then** 在解壓至正式資料目錄前拒絕
  - **And** 目前資料不變

- **Scenario 9：Renderer 維持最小權限**
  - **Given** preload bridge 已載入
  - **When** Renderer 執行匯出、選取匯入檔與確認還原
  - **Then** 只能呼叫具名 typed capability
  - **And** Renderer 無法提供或讀取任意路徑，也無法呼叫任意檔案系統操作

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 完整 ZIP | 2 本書及 active／trash／review 資料 | 匯出 | manifest、EPUB、索引及一致 SQLite 均存在且 checksum 正確 | Critical |
| TC2 | 空資料備份 | 空書庫與空生詞庫 | 匯出 | 產生 counts 為 0 的合法 ZIP | High |
| TC3 | 取消匯出 | save dialog 開啟 | 取消 | 無目的檔、無錯誤、busy 清除 | High |
| TC4 | 匯出寫入失敗 | 暫存或目的寫入失敗 | 匯出 | 無部分目的 ZIP；目前資料不變 | Critical |
| TC5 | 有效預覽 | 目前資料與備份不同 | 選取有效 ZIP | 顯示時間與三種 counts；零 mutation | Critical |
| TC6 | 取消確認 | 有效預覽 | 取消 | 所有資料不變；不 relaunch | Critical |
| TC7 | 成功取代 | 有效完整備份 | 確認 | 書庫＋生詞庫只含備份狀態；設定／對話不變；relaunch 一次 | Critical |
| TC8 | 書庫交換失敗 | 已保存回滾資料 | 確認還原並注入失敗 | 兩個資料域皆回復；不 relaunch | Critical |
| TC9 | 生詞庫交換失敗 | 書庫已暫時交換 | 注入第二階段失敗 | 書庫回復、SQLite 回復；不 relaunch | Critical |
| TC10 | 一般／損壞 ZIP | 非 LingoShelf 或無法解析 | 選取 | 明確錯誤；無確認；零 mutation | Critical |
| TC11 | Manifest 不相容 | 缺欄、較新 version、未知 file | 選取 | 拒絕；零 mutation | Critical |
| TC12 | Payload 損壞 | checksum、EPUB id 或 SQLite integrity 不符 | 選取 | 拒絕；零 mutation | Critical |
| TC13 | Archive 安全 | traversal／absolute／過量 payload | 選取 | 寫入正式目錄前拒絕 | Critical |
| TC14 | 原生對話框 | desktop capability 可用 | 點匯出／匯入 | Main 開 save/open dialog；Renderer 不接觸 path | Critical |
| TC15 | 重複觸發 | 一個 backup operation 進行中 | 再點操作 | 第二次不開始；控制項 disabled | High |
| TC16 | 設定 UI | 開啟設定 | 操作資料備份區塊 | 文案、狀態、取代警告、取消與焦點行為正確 | High |
| TC17 | 重新啟動載入 | 還原成功 | App relaunch | 既有 migration／loader 可列書、讀章及查詢複習摘要 | Critical |

## 6. Implementation Notes

### 6.1 備份格式

- 建議 ZIP 固定包含：
  - `manifest.json`
  - `library/index.json`
  - `library/books/<book-id>/book.epub`
  - `learning-library/learning-items.sqlite`
- `manifest.json` 使用明確 magic／format id 與整數 format version，列出 payload 路徑、
  位元組大小及 SHA-256；摘要 counts 由經驗證資料計算或與 payload 交叉驗證，不只
  信任 manifest 宣告值。
- ZIP 格式版本獨立於 SQLite schema migration 與書籍 EPUB parse version。

### 6.2 Main-owned orchestration

- 新增獨立 Main process 資料備份 service，協調 `LocalBookLibrary` 與
  `LocalLearningLibrary` 的一致 snapshot、驗證、暫存、取代及回滾。
- 匯入分成「選取並驗證，回傳 opaque preview token」與「以 token 確認還原」兩段。
  Renderer 不持有檔案路徑；token 必須有單一用途並在取消、失敗、成功或新選取時失效。
- 寫入與交換使用 App temp／user data 內的明確 staging 及 rollback 目錄；成功或失敗
  後清理。不得對 user data 根目錄執行廣泛遞迴刪除。
- SQLite snapshot 必須使用資料庫支援的一致備份方式或在受控排他邊界關閉後複製，
  不直接假設複製開啟中的 database file 一定一致。
- 書庫 snapshot 必須使用 `LocalBookLibrary` 的正規化輸出。EPUB parser 升級後若
  `lastChapterId` 或 `readingState.chapterId` 已不在目前章節集合，優先沿用另一個
  仍有效的引用；兩者都失效時輸出 `null`，不得因此拒絕其他有效的書庫與生詞庫資料。
- 還原前後都驗證資料；只有書庫與生詞庫交換完成後才呼叫可注入的 relaunch／exit
  capability，讓服務測試不真正關閉 Vitest。
- Vite 開發模式不得退出目前 Electron，因為桌面開發 script 的 `concurrently -k`
  會在 Electron 結束時一併關閉 renderer dev server；此時應延後重新載入現有視窗。
  正式安裝版仍使用 `app.relaunch()` 後退出目前程序。

### 6.3 IPC、preload 與 Renderer

- 建議建立獨立 `DataBackupDesktopApi`，而不是在 `LibraryDesktopApi` 暴露生詞庫或
  任意檔案能力。
- IPC 只接受空 payload 或 opaque preview token；Main 自行開啟原生 dialog 並驗證。
- 設定視窗新增資料備份 section、busy/error/success state 與第二層確認 modal。
- 成功匯出顯示目的檔名即可，不回傳完整路徑；成功還原後立即進入 relaunch 流程。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/main/data-backup-service.ts`（新增）
- `apps/desktop/src/main/data-backup-ipc.ts`（新增）
- `apps/desktop/src/main/data-restore-restart.ts`（新增）
- `apps/desktop/src/shared/data-backup-contracts.ts`（新增）
- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/main/data-backup-service.test.ts`（新增）
- `apps/desktop/src/main/data-backup-ipc.test.ts`（新增）
- `apps/desktop/src/main/data-restore-restart.test.ts`（新增）
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documents

- `CONTEXT.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/modules/data-backup.md`（新增）
- `documents/modules/book-library.md`
- `documents/modules/learning-library.md`
- `documents/modules/annotation.md`
- `documents/modules/spaced-review.md`

## 8. Assumptions, Open Questions, and Non-goals

### Assumptions

- 書籍 id 仍是原始 EPUB 完整位元組的 SHA-256，備份驗證可重新計算並比對。
- 還原發生於本機桌面 App，來源與目的 App 都支援同一份 LingoShelf 備份格式。
- 使用者可取得 ZIP 並自行透過 USB、AirDrop、網路磁碟或其他方式傳到另一台電腦。
- 備份檔沒有密碼或加密；使用者需自行選擇可信任的保存與傳輸位置。

### Open Questions

- 無。

### Non-goals

- 不合併兩台電腦的書籍、學習項目、標記或複習排程。
- 不提供自動、背景、排程或帳號式跨裝置同步。
- 不匯出／匯入個別書籍、個別學習項目、Anki 格式或第三方閱讀器格式。
- 不備份 AI 對話、草稿清單、設定、登入狀態、Codex runtime 或暫態複習試卷。
- 不為 ZIP 提供密碼、加密、雲端上傳或分享連結。
- 不讓使用者編輯 ZIP 內容後當作一般資料匯入格式。
- 不在第一版提供備份清單、歷史版本、排程備份或自動清理外部備份。

## 9. Implementation Record

### 9.1 完成內容

- 新增獨立 `DataBackupService`，以固定格式版本 1 產生單一 ZIP：
  `manifest.json`、`library/index.json`、每本原始 EPUB，以及一致的
  `learning-items.sqlite` snapshot。
- Manifest 保存格式識別、建立時間、App 版本、三種摘要數量，以及每個 payload 的
  位元組數與 SHA-256。匯入時重新計算並交叉驗證，不信任 manifest 單方面宣告。
- 書籍匯出會等待既有書庫寫入佇列，再使用 `LocalBookLibrary.listBooks()` 取得已完成
  舊索引相容與章節遷移的正規化 snapshot；SQLite 使用 `node:sqlite` backup API，
  不直接複製仍在使用中的資料庫檔案。
- 匯出先建立同目錄 partial ZIP，成功後才交換到使用者選定位置。檔名未帶 `.zip`
  時由 Main 自動補上；Renderer 只收到成功狀態與檔名。
- 匯入限制壓縮檔 512 MiB、單 entry 256 MiB、解壓總量 1 GiB 與 1003 entries，
  並拒絕 traversal、絕對路徑、反斜線路徑、symlink、未宣告 entry、未知格式版本、
  checksum／大小不符、損壞 SQLite、較新 schema、無效書籍索引及 EPUB id 不符。
- 有效 ZIP 只解到 App-owned staging，回傳 opaque preview token 與備份時間、書籍、
  active、trash 數量；預覽不變更正式資料。
- 使用者確認後同步交換完整書庫目錄與 learning-library 目錄。兩個資料域均保留內部
  rollback；任一交換步驟失敗時依反向順序復原，成功後才呼叫 relaunch。
- 設定視窗新增「資料備份」區塊、匯出／匯入 busy 與錯誤狀態、完整取代警告及摘要。
  確認視窗初始焦點位於取消按鈕，Escape 等同取消；還原中停用所有重複操作。
- Preload 只暴露四個具名 typed capabilities：匯出、選取並驗證、取消預覽、以 token
  還原。Renderer 無法傳入或取得本機路徑，也沒有通用 filesystem／IPC 能力。
- AI 對話、全域設定、Codex runtime 與暫態複習試卷不在交換目錄內，因此成功還原後
  保持目前裝置狀態。

### 9.2 TDD 與除錯紀錄

先建立 Renderer、service、IPC、repository 邊界與 E2E 的失敗測試，再逐層補足實作。
實作期間的重要假說與決策如下：

1. JSZip 會為安全父路徑產生 directory entries；allowlist 因此只接受已宣告 payload
   的安全父目錄，仍拒絕其他額外 entry。
2. `waitForIdle()` 必須公開既有 `LocalBookLibrary` 寫入 queue，而不是另建一套鎖；
   否則測試清理可能早於未完成的索引寫入。
3. 單純備份原始 `index.json` 會使可由既有 loader 相容讀取的舊索引無法匯出，因此
   正式 wiring 改用 `listBooks()` 的正規化結果建立 snapshot。
4. 書籍還原驗收不能只比較 JSON；測試另外以真正 `LocalBookLibrary` 列出還原書庫並
   讀取 EPUB 章節，確認既有 loader 可使用。
5. 取代失敗測試在第二資料域交換後注入錯誤，證明書庫與 SQLite 均能回到原始狀態，
   且不觸發 relaunch。
6. Electron E2E 第一次在受限 sandbox 無法啟動，改以核准的桌面執行權限重跑；一次
   既有 sticky controls 的 2px timing assertion 波動經專項重跑通過，最終完整 E2E
   亦通過。
7. 實際既有生詞庫含 migration 3（日常複習佇列表），但第一版備份器把可相容上限
   硬編碼為 2，導致匯出前誤報「較新的生詞庫版本」。回歸測試先重現相同錯誤，再把
   相容上限修正為 3；版本 3 的匯出與預覽通過，未知版本 4 仍會被拒絕。

### 9.3 驗證結果

- Desktop Vitest：27 個檔案、291 個測試通過。
- `data-backup-service.test.ts`：完整／空 ZIP、預覽零 mutation、成功取代、真實 EPUB
  載入、一般／損壞／較新／竄改／不安全 ZIP 拒絕，以及跨資料域 rollback。
- `data-backup-ipc.test.ts`：Main-owned path、原生 dialog、`.zip` 補齊、取消與 token
  驗證。
- `App.test.tsx`：資料備份區塊、匯出結果、摘要、明確確認、Escape 取消、busy 與錯誤。
- Desktop TypeScript typecheck：通過。
- Desktop production build：通過。
- Electron Playwright E2E：2/2 通過，包含 secure bridge 與設定資料備份入口。

實作日期：2026-07-28。

## Appendix: TDD Implementation Checklist

1. 先為 manifest、完整性、安全限制、ZIP 內容及替換回滾建立 service 紅燈測試。
2. 新增 IPC／preload capability 測試，確認 Renderer 無任意路徑與 filesystem 權限。
3. 以設定 UI 測試建立匯出、預覽、取消、確認、busy、錯誤與成功狀態。
4. 實作最小備份 service、書庫／SQLite snapshot 邊界、staging 及 rollback。
5. 執行 Main、Renderer、完整 desktop suite、typecheck、build 與 Electron E2E。
6. 填寫 Implementation Record，建立／同步 data-backup、book-library、learning-library、
   annotation 與 spaced-review 模組文件。
