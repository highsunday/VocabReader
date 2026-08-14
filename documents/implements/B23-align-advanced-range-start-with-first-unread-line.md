---
author: Codex
date: 2026-08-14
title: 修正閱讀區段推進後 START 顯示在上一行
uuid: 9b10e495-086b-4c2f-b9b7-1b73fd4307b0
version: 1.2.0
status: implemented
---

# Bug Fix: 修正閱讀區段推進後 START 顯示在上一行

## 1. Bug Overview

使用者執行「完成這段，前往下一段」後，START 範圍標籤有時仍顯示在上一個視覺行。
首次修正處理了瀏覽器在自動換行邊界的 caret rectangle 歧義；2026-08-14 的回歸調查進一步
發現，自動推進也可能直接把新 START offset 放在上一句的句尾標點，因此即使 glyph 定位正確，
分隔線仍會合法地落在上一行。

## 2. Root Cause

本問題有兩條可產生相同畫面指紋的路徑：

1. 原始呈現層問題：`markerTopForTextOffset()` 曾以 collapsed DOM Range 測量 START；瀏覽器在
   視覺換行邊界可能把 caret rectangle 歸到前一行。
2. 回歸時確認的資料層問題：`endAfterWords()` 把 END 停在最後一個單字末尾，不包含緊鄰的
   句尾標點；`firstReadableOffset()` 又只跳過空白，導致句點成為下一段的第一個 glyph。

第二條路徑使 START 的 offset 本身就在上一行；它是 B23 初次修正後仍復發的根因，完整調查史
記錄於 `documents/bugs/BUG-003-b23-start-still-anchors-to-previous-line.md`。

## 3. Fix Objective

- START 應以新閱讀區段第一個可閱讀字元的 glyph rectangle 定位，顯示在該字元所在視覺行之前。
- offset 位於 DOM text node 邊界時，START 應使用下一個可呈現字元，不回退到前一個 text node。
- 章末或沒有後續字元時仍能安全定位，不拋出例外。
- 自動推進不得把已完成句子的句尾標點當成新區段 START。
- 新區段 END 應包含緊鄰最後一個單字的句尾標點；下一段若以開引號開始，開引號應保留在下一段。
- 不改變自動推進的約略字數、持久化格式或 AI 裁切入口。

## 4. Acceptance Criteria

- **Scenario 1：自動換行邊界使用下一個字元定位 START**
  - **Given** 新 START offset 位於瀏覽器自動換行後第一個可閱讀字元之前
  - **When** 系統計算 START 分隔線位置
  - **Then** 測量範圍包含 offset 處的下一個字元
  - **And** 分隔線使用該字元所在行的上緣，不使用前一行的 collapsed caret rectangle

- **Scenario 2：DOM text node 邊界使用後一個節點**
  - **Given** START offset 恰好等於前一個 text node 的結尾且後方仍有文字
  - **When** 系統計算 START 分隔線位置
  - **Then** 使用後一個 text node 的第一個可呈現字元定位

- **Scenario 3：END 與其他範圍行為不回歸**
  - **Given** START／END 為合法章內文字 offset
  - **When** 系統呈現或推進閱讀區段
  - **Then** END 仍顯示在最後選取字元所在行之後
  - **And** 推進後保存的 start／end、裁切內容與約略字數不因視覺定位修正而改變

- **Scenario 4：文字末端安全 fallback**
  - **Given** START offset 位於章節純文字末端，沒有下一個字元可測量
  - **When** 系統計算 START 分隔線位置
  - **Then** 使用最後可用字元或根元素位置安全定位，不越界或拋出例外

- **Scenario 5：自動推進略過上一句句尾標點**
  - **Given** 舊 END 位於最後一個單字與其句尾標點之間
  - **When** 使用者完成這段並前往下一段
  - **Then** 新 START 位於下一段第一個詞或其開頭符號
  - **And** 不指向上一句的句尾標點

- **Scenario 6：新區段保留自己的標點**
  - **Given** 新區段最後一個計數單字後緊鄰句尾標點
  - **When** 系統計算新 END
  - **Then** END 應包含該句尾標點與相鄰閉引號，但不吞入下一個詞

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 換行後第一字元 | START 前後字元被瀏覽器排在不同行 | 計算 START top | Range 選取 offset 處字元並回傳新行 top | Critical |
| TC2 | text node 交界 | offset 等於前節點長度 | 計算 START top | 選取後節點第一字元 | Critical |
| TC3 | END 回歸 | END 位於選取文字末端 | 計算 END top | 仍選取前一字元並使用 bottom | High |
| TC4 | 章末 START | offset 等於完整文字長度 | 計算 START top | 安全使用最後字元定位 | Medium |
| TC5 | 自動推進資料回歸 | 目前範圍尚未到章末 | 推進下一段 | offset、裁切與保存行為維持既有測試通過 | Critical |
| TC6 | 句尾標點邊界 | 舊 END 位於 `three` 與 `.` 之間 | 推進下一段 | START 指向 `Four`，新段為 `Four five six.` | Critical |
| TC7 | 下一段開引號 | 上一句標點後以 `“Four` 起始 | 推進下一段 | START 保留開引號，新段為 `“Four five six.”` | High |

## 6. Implementation Notes

- `edge = before` 時優先建立 `[offset, offset + 1]` 的非空 DOM Range，再取 `rectangle.top`。
- offset 位於 text node 尾端且後方有節點時，繼續尋找下一個非空 text node；不要把同一 offset
  視為前一節點的 collapsed end caret。
- 只有章節末端沒有下一字元時，才回退選取最後一個可用字元。
- `edge = after` 保持選取 offset 前一字元並取 `rectangle.bottom`。
- 自動推進尋找下一個 Unicode 字母或數字；若它前方在最後一個空白之後還有開頭標點，START
  保留該標點，否則略過緊鄰舊 END 的句尾標點。
- `endAfterWords()` 達到目標字數後，把 END 延伸到緊鄰的非字母、非數字、非空白字元之後，
  讓句點與閉引號留在完成它們的區段。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/bugs/BUG-003-b23-start-still-anchors-to-previous-line.md`
- `documents/modules/reading-range.md`

## 8. Assumptions and Non-goals

- 截圖中的文字換行由瀏覽器排版形成，不代表 EPUB 原文含硬換行。
- 本次只正規化「完成這段」自動產生的新 offset；不遷移或改寫既有保存範圍。
- 不改變閱讀版面設定、捲動位置、標籤樣式、重疊避讓或「完成這段」按鈕行為。
- 不新增像素位置持久化；文字 offset 仍是唯一保存座標。

## 9. Implementation Record

### Status

Implemented on 2026-08-13; regression correction implemented on 2026-08-14.

### Implementation Summary

- `markerTopForTextOffset()` 計算 START 時不再建立 collapsed Range；只要 offset 後仍有文字，
  便選取 `[offset, offset + 1]` 的第一個 glyph，使用其 `rectangle.top` 定位。
- START offset 恰好位於 text node 尾端時，略過前一節點的 end caret，改用下一個非空
  text node 的第一個 glyph。
- START 位於章節文字末端、沒有下一字元時，安全選取最後一個可用 glyph 作為 fallback。
- END 分支維持選取終止 offset 前一字元並使用 `rectangle.bottom`。
- 回歸修正讓自動推進略過舊區段的句尾標點，並把新區段自己的句尾標點與閉引號包含在 END 內。
- 若下一段在空白後以開引號開始，新 START 保留開引號；約略字數與保存資料結構不變。

### Test Coverage

- TC1：`places START from the first selected glyph instead of the previous visual line caret`
  模擬 collapsed caret 在上一行、glyph rectangle 在下一行，驗證 START 使用後者。
- TC2：`uses the next text node when START is exactly at a DOM text boundary` 驗證節點交界。
- TC3：既有 `places the start before its line and the end after its line` 保留 END bottom 行為，
  並由完整 reading-range 與 App 測試回歸。
- TC4：`safely anchors START at the last glyph when its offset is at chapter end` 驗證章末 fallback。
- TC5：既有自動推進單元測試與 App 的 explicit completion action 測試保持通過。
- TC6：`keeps sentence-ending punctuation out of the next range START` 先重現 START 指向句點，
  再驗證 START 指向下一句、END 保留下一句句點。
- TC7：`keeps an opening quote with the next range after sentence punctuation` 驗證開引號歸屬；
  App 明確推進測試另斷言 renderer 保存的 START 跳過上一句句點。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/reading-range.ts`

#### Test Code

- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B23-align-advanced-range-start-with-first-unread-line.md`
- `documents/bugs/BUG-003-b23-start-still-anchors-to-previous-line.md`
- `documents/modules/reading-range.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 自動換行邊界使用下一個字元定位 START | Pass | collapsed caret 與 glyph rectangle 差異測試 |
| DOM text node 邊界使用後一個節點 | Pass | `Previous`／`Next` 兩節點 Range assertion |
| END 與其他範圍行為不回歸 | Pass | 相關 108/108 與 Desktop 541/541 測試通過 |
| 文字末端安全 fallback | Pass | 章末 START 選取最後 glyph 測試 |
| 自動推進略過上一句句尾標點 | Pass | 句點 offset 紅燈與 App 保存整合斷言 |
| 新區段保留自己的標點 | Pass | 句點與開／閉引號單元測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | first selected glyph regression test |
| TC2 | Pass | next text node boundary regression test |
| TC3 | Pass | before／after marker positioning test 與完整回歸 |
| TC4 | Pass | last glyph at chapter end regression test |
| TC5 | Pass | `advanceReadingRange` 與 App explicit completion action tests |
| TC6 | Pass | sentence-ending punctuation regression test |
| TC7 | Pass | opening quote ownership regression test |

### Commands Executed

```bash
# Regression red: 1 failed, 15 passed（start 13，預期 15）
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts

# Target green: 17/17 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts

# Related regression: 2 files, 108/108 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: server 3/3, Desktop 53 files／541 tests
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; Vite reported only the existing chunk-size warning
npm run build -w @reader/desktop

# Whitespace/error-marker check passed
git diff --check
```

### Hypotheses and Decisions

- 初次修正把根因鎖定在 offset 到像素的呈現層；回歸測試後確認該結論不完整，因為
  `advanceReadingRange()` 也會產生指向上一句句點的合法 offset。
- collapsed caret 在自動換行邊界的 rectangle 歸屬具有瀏覽器歧義；選取第一個實際字元的
  非空 Range 可以直接取得新區段第一行的 glyph rectangle。
- DOM text node 邊界必須特別處理，因 `remaining <= node.length` 會把等於前節點長度的 offset
  提前歸入舊節點；START 改為等於節點尾端時繼續尋找下一個非空節點。
- 沒有新增像素狀態或持久化欄位；版面改變後仍由現有 ResizeObserver 依文字 offset 重新測量。
- 以句點 offset 13、下一句 offset 15 的紅燈建立資料層 feedback loop；修正後相同案例與 App
  實際保存路徑皆轉綠，因此不需擴大到 EPUB DOM、Range client rect 或字型載入時序。

### Deferred Items

None.

### Notes

- 未發現新的模組耦合、缺少測試切入點或責任邊界問題，不需要另開 RXX。
- DDD 完成通知未寄送：本次請求未明確授權把本機實作與測試摘要傳送到外部信箱。

## Appendix: TDD Fix Workflow

1. 以可區分 collapsed caret 與下一字元 rectangle 的測試重現呈現層定位。
2. 以含句尾標點的自動推進測試重現資料層 offset 回歸。
3. 最小修改 glyph 測量與自動推進邊界，驗證 text node、章末、標點、引號與 END。
4. 執行 Desktop 相關測試、完整測試、型別檢查與 diff 檢查。
5. 更新本文件與閱讀區段模組文件。
