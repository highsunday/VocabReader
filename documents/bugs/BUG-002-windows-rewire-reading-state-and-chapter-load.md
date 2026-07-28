---
bug-id: BUG-002
title: Windows 導入 Rewire 後無法保存閱讀位置或載入章節
status: resolved
severity: high
created: 2026-07-28
updated: 2026-07-28
related-bxx: B13
---

## 狀態快照（接手者先讀這一段）

- **現在相信的根因方向：** 已解決。章節根因為 TOC 相對路徑基準錯誤；Windows 保存失敗由唯一 temp 與暫時性 rename 退避重試防護。
- **已排除（別再找）：** sanitizer、fragment/depth、單一 instance 內併發、dist/source 差異、多個 Electron main process。
- **下一步要做什麼：** 使用者重新啟動 Electron dev app，確認現有 Rewire 可直接開章及保存閱讀位置。
- **進度：** 已做 3 次實驗；Rewire 章節 42/42、library-service 18/18、typecheck 與 build 通過。

## Bug 描述

Windows 版導入 Rewire EPUB 後，切換章節時本次執行仍可繼續，但閱讀位置無法持久保存；開啟章節時內容區顯示無法載入。相同書籍在 macOS 版可正常使用。

**錯誤指紋（用來辨識復發）：**

```text
無法保存閱讀位置；本次切換仍可繼續使用。
無法載入這個章節，請返回總覽後再試一次。
無法顯示內容
```

## 重現步驟

```text
# 環境：Windows，Electron 桌面版，2026-07-28 的本機工作樹
1. 導入 Rewire EPUB。
2. 從書籍總覽開啟或切換章節。
3. 觀察閱讀位置保存錯誤，以及章節內容載入錯誤。
```

出現頻率：目前使用者回報為 Windows 穩定發生；macOS 不發生。

## 完成條件 (Done)

| 指標 | 基準值（現在） | 目標值（修好後） | 目前最佳 |
|------|-------------|---------------|---------|
| Windows 保存閱讀位置 | 現場 0 / 1；隔離 1 / 1 | 1 / 1 | 隔離 20 / 20 |
| Rewire 章節內容載入 | 0 / 42 | 42 / 42 | 42 / 42 |
| 相關自動測試 | 1 / 2 | 全數通過 | library-service 18 / 18 |

## 已確認事實（建立後視為真，不再重測）

| 事實 | 如何被確認 | 日期 |
|------|----------|------|
| Windows 使用者資料中的正式 `index.json` 未隨保存更新，並殘留更新時間較新的 `index.json.next` | 唯讀檢查 `%APPDATA%\@reader\desktop\library` | 2026-07-28 |
| 已導入書名為 Rewire，共 42 個索引章節 | 讀取使用者資料 `index.json` | 2026-07-28 |
| Rewire 的 42 個章節全部在 `zip.file(chapter.href)` 回報「章節內容遺失」 | EXP-001 經 production service 逐章載入 | 2026-07-28 |
| 複製到臨時書庫後，單次 `saveReadingState` 可在 Windows 成功取代既有索引 | EXP-001 隔離測試 | 2026-07-28 |
| Rewire 索引首章 href 是 `OEBPS/9780063349827_Cover.xhtml`，實際 entry 是 `OEBPS/text/9780063349827_Cover.xhtml` | EXP-002 直接比對 ZIP entry | 2026-07-28 |
| 同一 `LocalBookLibrary` instance 的 20 次並行保存均成功 | EXP-002 隔離壓測 | 2026-07-28 |

## 調查範圍

### 已排除 — 確認非原因

| 範圍 / 元件 | 排除依據 | 日期 |
|------------|---------|------|
| `sanitizeChapterHtml` / `fast-xml-parser` | 42 章都在呼叫 sanitizer 前的 `zip.file()` 查找階段失敗 | 2026-07-28 |
| 深層 TOC fragment/id | depth 0 與 depth > 0、無 fragment 與有 fragment 的章節全部以同一錯誤失敗 | 2026-07-28 |
| Windows 單次 `rename(temp, existing)` 必然失敗 | 隔離書庫的單次 `saveReadingState` 已通過 | 2026-07-28 |
| 單一 `LocalBookLibrary` instance 內保存併發 | `#stateWriteQueue` 能使 20 次並行保存全部成功 | 2026-07-28 |

### 可疑點

| 優先 | 範圍 / 元件 | 懷疑理由 | 狀態 |
|------|------------|---------|------|
| 🔴 | navigation/NCX href 基準目錄 | navigation link 應相對 navigation document；現行程式錯用 package directory，現場少一層 `text/` | 已確認 |
| 🔴 | `LocalBookLibrary.#saveBooks` 的併發／占用 | 現場殘留 `.next`，但隔離單次保存成功 | 未調查 |

### 未調查

- [ ] Rewire 42 個 `chapter.href` 是否都有完全相同 ZIP entry
- [ ] 每章是否能通過 `sanitizeChapterHtml`
- [ ] renderer 是否吞掉 main process 的具體錯誤

## 當前假說

1. 已確認：navigation href 被錯誤地相對 package directory 解析；應改為相對 navigation/NCX document directory。
2. 若閱讀位置保存失敗由多個 `LocalBookLibrary` instance 競爭固定 `.next` 檔造成，則實際同時存在多個 Electron instance，或不同 instance 壓測可重現；唯一 temp 名稱可避免碰撞。
3. 若已建置程式與 source 不一致，則 dist 的保存邏輯或執行版本可解釋現場與測試差異。

## 實驗紀錄

### EXP-003 — 2026-07-28

- **假說：** 將 EPUB 3 navigation 與 EPUB 2 NCX 連結改為相對各自文件目錄解析，可使巢狀 TOC 位置的章節正確載入；對索引替換的 Windows 暫時占用加入有限重試，可涵蓋現場首次保存失敗。
- **預計修改範圍：** `library-service.test.ts` 先新增 navigation/NCX 巢狀目錄回歸測試；紅燈後修改 `library-service.ts` 的連結解析基準與索引 replace retry。
- **測試方式：** 先確認新增測試紅燈，再跑 Rewire 42 章現場回饋迴圈與完整 desktop tests。
- **修改內容：** 尚未修改。
- **修改內容：**
  - navigation/NCX link 改以各自 TOC 文件目錄為解析基準。
  - 新增 `epubParseVersion = 2`，自動重建舊索引的 chapter href。
  - 索引 temp 改成每次唯一名稱，對 Windows `EACCES` / `EBUSY` / `EPERM` 做最多五次退避重試，最終失敗時清除 temp。
  - 新增兩個永久 nested-navigation 回歸測試；一次性 Rewire 診斷測試完成後已刪除。
- **測試指令：**
  - `npx vitest run ../main/library-service.test.ts -t "nested navigation"`
  - `npx vitest run ../main/rewrite-debug.test.ts`（一次性，已移除）
- **指標變化：**
  - Rewire 章節內容載入：0/42 → 42/42
  - 同 instance 並發保存：20/20 → 20/20（無退步）
  - nested-navigation 永久回歸測試：0/1 紅燈 → 2/2 綠燈
- **結果：** ⚠️ 修正指標已達標，待完整測試套件確認。
- **觀察 / 新線索：** 舊索引也必須 migration，僅修正新導入 parser 不足以修復現有 Rewire。

### EXP-002 — 2026-07-28

- **假說：** 42 個索引 href 與 ZIP entry 存在單一共同路徑差異；保存失敗需在併發保存時才重現。
- **預計修改範圍：** 擴充一次性診斷測試，輸出 ZIP entry 與 href 的最小差異，並在臨時書庫並行執行保存。
- **測試方式：** 直接載入 Rewire ZIP entry 名稱做精確／正規化比對；對同一 `LocalBookLibrary` 及不同 instance 各自進行多次並發保存。
- **修改內容：** 尚未修改。
- **測試指令：** `npm run test -w @reader/desktop -- --run src/main/rewrite-debug.test.ts`；另以 .NET ZipArchive 唯讀列出 basename 對應 entry。
- **指標變化：**
  - ZIP entry 路徑差異：未知 → 確認少了 `text/`
  - 同 instance 20 次並行保存：待量測 → 20/20
- **結果：** ⚠️ 部分收斂；章節根因完全確認，保存問題範圍縮至實際程序／多 instance 條件。
- **觀察 / 新線索：** navigation link 的解析基準必須是 navigation document 目錄，不是 package document 目錄。

### EXP-001 — 2026-07-28

- **假說：** 保存由 Windows `rename` 覆蓋失敗造成；章節失敗可由 href/ZIP entry 或 XHTML 解析結果進一步定位。
- **預計修改範圍：** 本實驗只建立並執行唯讀診斷，不修改產品程式碼或使用者資料。
- **測試方式：** 讀取現場 `index.json` 與 Rewire `book.epub`，逐章檢查精確 entry、等價 entry，並透過現有 `LocalBookLibrary.getChapterContent` 路徑載入全部章節；另在隔離的臨時書庫重現第二次索引保存。
- **修改內容：** 新增一次性 `rewrite-debug.test.ts`，只讀取現場 EPUB，寫入只發生在臨時複本。
- **測試指令：** `npm run test -w @reader/desktop -- --run src/main/rewrite-debug.test.ts`
- **指標變化：**
  - Rewire 章節內容載入：待量測 → 0/42
  - Windows 隔離書庫保存閱讀位置：待量測 → 1/1
  - 診斷測試：1/2 通過
- **結果：** ⚠️ 部分收斂；完整重現章節錯誤，但否定了「單次 rename 必然失敗」。
- **觀察 / 新線索：** 42 章均在 `zip.file(chapter.href)` 失敗，尚未進入 XHTML 解析；保存失敗需加入併發或實際程序條件。

## 解決方案

- **根因：** EPUB 3 navigation／EPUB 2 NCX 內的相對 link 錯誤地以 package document 目錄解析，使巢狀 TOC 文件的章節 href 少一層；現場索引取代另遇 Windows 暫時性檔案占用。
- **修復方式：** 改以 TOC 文件目錄解析 link；以 `epubParseVersion = 2` 自動重建舊索引；索引使用唯一 temp 並對 `EACCES`／`EBUSY`／`EPERM` 做有限退避重試。
- **最終 commit 序列：** 本修正提交。
- **回歸測試：** `library-service.test.ts` 新增巢狀 navigation 新導入與舊索引 migration 兩個案例；真實 Rewire 臨時複本驗證 42/42。
