---
title: 資料備份與完整還原模組
module: data-backup
status: active
last_updated: 2026-07-28
related_implements:
  - F38-export-and-restore-data-backup
---

# 資料備份與完整還原模組

## 1. Purpose

本模組把一個時間點的完整**書庫**與完整**生詞庫**封裝為單一 VocabReader ZIP，供
使用者自行移到另一台電腦，再以**資料還原**完整取代目的裝置的兩個資料域。

這是手動備份／還原，不是雙向同步或合併匯入。AI 對話、全域設定、Codex runtime
及暫態複習試卷刻意不在備份範圍內。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 從設定視窗匯出或匯入一個 `.zip`。
- 匯出全部 EPUB、正規化書籍索引、閱讀狀態、範圍標籤、標記，以及完整生詞庫
  SQLite。
- EPUB 重新解析後留下的失效閱讀章節引用會先由書庫正規化，不會阻擋整份備份。
- 保存 active／trashed 學習項目、FSRS 排程與精簡複習事件。
- 有效備份先顯示時間與三種數量，使用者再次確認後才完整取代。
- 嚴格驗證格式版本、allowlist、路徑、大小、checksum、SQLite 與書籍資料。
- 書庫與生詞庫跨資料域 rollback；成功後正式版自動重新啟動 App，開發版重新載入
  renderer，避免退出 Electron 連帶終止 Vite。
- Renderer 只能使用具名 typed capabilities，不接觸任意本機路徑。

## 3. Archive Format

為維持舊備份相容性，格式識別仍為 `lingoshelf-data-backup`，目前版本為整數 `1`。固定內容：

```text
manifest.json
library/index.json
library/books/<epub-sha256>/book.epub
learning-library/learning-items.sqlite
```

`manifest.json` 保存：

- `format`、`version`、`createdAt`、`appVersion`。
- `books`、`activeLearningItems`、`trashedLearningItems` 摘要數量。
- 每個非 manifest payload 的安全相對路徑、位元組數與 SHA-256。

書籍 id 必須等於原始 EPUB 位元組的 SHA-256。匯入會從實際 payload 重算摘要與
checksum，並與 manifest 交叉驗證。

## 4. Export Flow

```text
設定：匯出備份
  → Main 開啟原生 save dialog
  → 等待書庫寫入完成並取得正規化 index snapshot
  → SQLite backup API 建立一致 snapshot
  → 驗證並組裝 manifest + payload
  → 寫入同目錄 partial ZIP
  → 完成後交換為目的 .zip
  → Renderer 只顯示檔名
```

若使用者省略副檔名，Main 自動補上 `.zip`。取消 dialog 不建立檔案。匯出失敗會清除
partial 檔，既有目的檔不會被部分 ZIP 覆蓋。

## 5. Preview and Restore Flow

```text
設定：匯入備份
  → Main 開啟原生 open dialog
  → 驗證 ZIP 並解至 App-owned staging
  → 回傳 opaque token + 摘要
  → 使用者確認完整取代
  → 等待書庫寫入、關閉 SQLite
  → 暫存目前兩個資料域
  → 交換書庫與生詞庫
  → 成功：清除 rollback
      → 正式版 relaunch
      → Vite 開發版保留 Electron／Vite，重新載入既有視窗
  → 失敗：反向復原兩個資料域，不 relaunch
```

取消摘要會使 token 失效並清除 staging。新選取、失敗或成功也會使舊 token 失效。
正式資料只有在使用者確認後才交換；預覽永遠是 read-only。

## 6. Validation and Safety

- 壓縮 ZIP 上限 512 MiB。
- 單一 entry 解壓上限 256 MiB。
- 全部 entries 解壓總量上限 1 GiB。
- entry 數量上限 1003。
- 只接受固定 payload 與其安全父目錄。
- 拒絕絕對路徑、`..`、反斜線路徑、symlink、重複／額外／未宣告 entry。
- 拒絕未知或較新 format version、缺檔、大小或 checksum 不符。
- SQLite 必須通過 `integrity_check`、foreign key check，且 schema 不高於目前版本。
- 書籍索引必須符合型別、章節關聯、範圍與標記不變量；每本 EPUB 必須存在且 id
  checksum 相符。
- 同一 `DataBackupService` 同時只允許一個匯出、預覽或還原操作。

## 7. Typed Boundary

`DataBackupDesktopApi` 只提供：

- `exportBackup()`
- `selectBackup()`
- `cancelRestore(token)`
- `restoreBackup(token)`

來源與目的路徑由 Electron Main 的原生 dialog 決定。Renderer 只取得取消／成功狀態、
目的檔名、opaque token 與摘要，不取得 filesystem API、資料目錄或 ZIP payload。

## 8. Persistence Boundary

備份包含：

- `userData/library` 的正規化索引與每本原始 EPUB。
- `userData/learning-library/learning-items.sqlite` 的一致 snapshot。

備份不包含：

- chat conversation store 與 AI 草稿。
- settings store。
- `userData/listen-and-repeat` 的目前素材、片段、學習者錄音與 AI 示範語音；restore 也不
  覆寫、搬移或清除這個專用路徑。
- Codex 帳戶、登入、模型、skills 或 runtime。
- `SpacedReviewController` 記憶體中的試卷、答案、詳細回饋與未確認評級。

## 9. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/data-backup-contracts.ts` | 預覽、結果與 Renderer API 型別 |
| `apps/desktop/src/main/data-backup-service.ts` | ZIP、驗證、staging、交換、rollback 與 relaunch |
| `apps/desktop/src/main/data-restore-restart.ts` | 正式版 relaunch 與 Vite 開發版視窗 reload 政策 |
| `apps/desktop/src/main/data-backup-ipc.ts` | 原生 dialog、IPC 白名單與 token 驗證 |
| `apps/desktop/src/main/library-service.ts` | 書庫寫入 idle boundary 與正規化 snapshot 來源 |
| `apps/desktop/src/main/learning-library-service.ts` | SQLite backup 與安全 close |
| `apps/desktop/src/preload/preload.ts` | frozen `window.readerDesktop.dataBackup` bridge |
| `apps/desktop/src/renderer/App.tsx` | 設定區塊、狀態、摘要與取代確認 |

## 10. Testing Notes

| Test file | Coverage |
|---|---|
| `data-backup-service.test.ts` | 完整／空備份、失效閱讀章節正規化、驗證、預覽、取代、listen-and-repeat 排除、loader、rollback 與安全拒絕 |
| `data-restore-restart.test.ts` | 開發版不退出程序、正式版 relaunch／exit |
| `data-backup-ipc.test.ts` | Main-owned path、dialog、取消、附檔名與 token |
| `library-service.test.ts` | 書庫 idle boundary |
| `learning-library-service.test.ts` | SQLite backup、close 與重新開啟 |
| `App.test.tsx` | 設定 UI、摘要、焦點、Escape、確認、busy 與錯誤 |
| `desktop.spec.ts` | production preload 白名單與設定入口 |

最近驗證（2026-07-28）：

- Desktop Vitest：294/294 passed。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed。
- Electron Playwright E2E：2/2 passed。

## 11. Known Limitations and Follow-up

- 不合併來源與目的資料。
- 不提供自動排程、背景、雲端或帳號式同步。
- 不支援密碼、加密、備份歷史或個別書籍／學習項目匯出。
- 第一版只接受目前支援的格式版本；不把使用者手動修改的 ZIP 當一般匯入格式。

## 12. Related Documents

- `CONTEXT.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/modules/book-library.md`
- `documents/modules/learning-library.md`
- `documents/modules/annotation.md`
- `documents/modules/spaced-review.md`
