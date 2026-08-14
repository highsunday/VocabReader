---
author: Codex
date: 2026-08-13
title: 修正閱讀區段推進後 START 顯示在上一行
uuid: 9b10e495-086b-4c2f-b9b7-1b73fd4307b0
version: 1.1.0
status: implemented
---

# Bug Fix: 修正閱讀區段推進後 START 顯示在上一行

## 1. Bug Overview

使用者執行「完成這段，前往下一段」後，新的閱讀區段文字已正確從舊 END 後的第一個
可閱讀字元開始，但 START 範圍標籤的分隔線有時顯示在該字元上一個視覺行。當交界落在
瀏覽器自動換行處時，畫面看起來像 START 倒退到上一段，與文字範圍不一致。

## 2. Root Cause

`markerTopForTextOffset()` 以 collapsed DOM Range 測量 START offset。瀏覽器在視覺換行邊界
可把 collapsed caret rectangle 歸到 offset 前一個字元所在行，因此 START 分隔線取得上一行
的 `top`。END 已使用 offset 前一個字元的非空 Range 測量，沒有相同的 collapsed-caret 歧義。

## 3. Fix Objective

- START 應以新閱讀區段第一個可閱讀字元的 glyph rectangle 定位，顯示在該字元所在視覺行之前。
- offset 位於 DOM text node 邊界時，START 應使用下一個可呈現字元，不回退到前一個 text node。
- 章末或沒有後續字元時仍能安全定位，不拋出例外。
- 不改變閱讀區段 offset、自動推進字數、持久化或 AI 裁切內容。

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

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 換行後第一字元 | START 前後字元被瀏覽器排在不同行 | 計算 START top | Range 選取 offset 處字元並回傳新行 top | Critical |
| TC2 | text node 交界 | offset 等於前節點長度 | 計算 START top | 選取後節點第一字元 | Critical |
| TC3 | END 回歸 | END 位於選取文字末端 | 計算 END top | 仍選取前一字元並使用 bottom | High |
| TC4 | 章末 START | offset 等於完整文字長度 | 計算 START top | 安全使用最後字元定位 | Medium |
| TC5 | 自動推進資料回歸 | 目前範圍尚未到章末 | 推進下一段 | offset、裁切與保存行為維持既有測試通過 | Critical |

## 6. Implementation Notes

- `edge = before` 時優先建立 `[offset, offset + 1]` 的非空 DOM Range，再取 `rectangle.top`。
- offset 位於 text node 尾端且後方有節點時，繼續尋找下一個非空 text node；不要把同一 offset
  視為前一節點的 collapsed end caret。
- 只有章節末端沒有下一字元時，才回退選取最後一個可用字元。
- `edge = after` 保持選取 offset 前一字元並取 `rectangle.bottom`。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `documents/modules/reading-range.md`

## 8. Assumptions and Non-goals

- 截圖中的文字換行由瀏覽器排版形成，不代表 EPUB 原文含硬換行。
- 本次只修正範圍標籤的視覺定位，不更改使用者已保存的文字 offset。
- 不改變閱讀版面設定、捲動位置、標籤樣式、重疊避讓或「完成這段」按鈕行為。
- 不新增像素位置持久化；文字 offset 仍是唯一保存座標。

## 9. Implementation Record

### Status

Implemented on 2026-08-13.

### Implementation Summary

- `markerTopForTextOffset()` 計算 START 時不再建立 collapsed Range；只要 offset 後仍有文字，
  便選取 `[offset, offset + 1]` 的第一個 glyph，使用其 `rectangle.top` 定位。
- START offset 恰好位於 text node 尾端時，略過前一節點的 end caret，改用下一個非空
  text node 的第一個 glyph。
- START 位於章節文字末端、沒有下一字元時，安全選取最後一個可用 glyph 作為 fallback。
- END 分支維持選取終止 offset 前一字元並使用 `rectangle.bottom`；閱讀區段 offset、裁切、
  自動推進與保存流程均未變更。

### Test Coverage

- TC1：`places START from the first selected glyph instead of the previous visual line caret`
  模擬 collapsed caret 在上一行、glyph rectangle 在下一行，驗證 START 使用後者。
- TC2：`uses the next text node when START is exactly at a DOM text boundary` 驗證節點交界。
- TC3：既有 `places the start before its line and the end after its line` 保留 END bottom 行為，
  並由完整 reading-range 與 App 測試回歸。
- TC4：`safely anchors START at the last glyph when its offset is at chapter end` 驗證章末 fallback。
- TC5：既有自動推進單元測試與 App 的 explicit completion action 測試保持通過。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/reading-range.ts`

#### Test Code

- `apps/desktop/src/renderer/reading-range.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/B23-align-advanced-range-start-with-first-unread-line.md`
- `documents/modules/reading-range.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 自動換行邊界使用下一個字元定位 START | Pass | collapsed caret 與 glyph rectangle 差異測試 |
| DOM text node 邊界使用後一個節點 | Pass | `Previous`／`Next` 兩節點 Range assertion |
| END 與其他範圍行為不回歸 | Pass | 相關 104/104 與 Desktop 515/515 測試通過 |
| 文字末端安全 fallback | Pass | 章末 START 選取最後 glyph 測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | first selected glyph regression test |
| TC2 | Pass | next text node boundary regression test |
| TC3 | Pass | before／after marker positioning test 與完整回歸 |
| TC4 | Pass | last glyph at chapter end regression test |
| TC5 | Pass | `advanceReadingRange` 與 App explicit completion action tests |

### Commands Executed

```bash
# Expected red: 3 failed, 12 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts

# Target green: 15/15 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts

# Related regression: 2 files, 104/104 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: server 3/3, Desktop 52 files／515 tests
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; Vite reported only the existing chunk-size warning
npm run build -w @reader/desktop

# Whitespace/error-marker check passed
git diff --check
```

### Hypotheses and Decisions

- 使用者截圖顯示文字範圍已向後推進，而只有 START 分隔線落在上一視覺行；因此根因鎖定在
  offset 到像素的呈現層，不修改 `advanceReadingRange()`。
- collapsed caret 在自動換行邊界的 rectangle 歸屬具有瀏覽器歧義；選取第一個實際字元的
  非空 Range 可以直接取得新區段第一行的 glyph rectangle。
- DOM text node 邊界必須特別處理，因 `remaining <= node.length` 會把等於前節點長度的 offset
  提前歸入舊節點；START 改為等於節點尾端時繼續尋找下一個非空節點。
- 沒有新增像素狀態或持久化欄位；版面改變後仍由現有 ResizeObserver 依文字 offset 重新測量。

### Deferred Items

None.

### Notes

- 未發現新的模組耦合、缺少測試切入點或責任邊界問題，不需要另開 RXX。
- DDD 完成通知未寄送：本次請求未明確授權把本機實作與測試摘要傳送到外部信箱。

## Appendix: TDD Fix Workflow

1. 以可區分 collapsed caret 與下一字元 rectangle 的測試重現上一行定位。
2. 最小修改 `markerTopForTextOffset()` 的 START 測量方式。
3. 驗證 text node 邊界、章末 fallback、END 與自動推進回歸。
4. 執行 Desktop 相關測試、完整測試、型別檢查與 diff 檢查。
5. 更新本文件與閱讀區段模組文件。
