---
author: Codex
date: 2026-07-21
title: 以分隔線清楚呈現閱讀區段起點與終點
uuid: a8ca6d6f64d24f43b2bd72d8898061fa
version: 1.1.0
status: implemented
---

# Feature Specification - 閱讀區段邊界分隔線

## 1. Feature Overview

範圍標籤目前只顯示在閱讀內容左側，使用者不容易判斷起點與終點實際對應哪一行；當兩個文字 offset 相同時，兩個標籤還會完全重疊。閱讀頁應從每個範圍標籤向內文延伸一條邊界分隔線，並分別顯示 `START` 與 `END`，讓 AI 可讀範圍更直觀。

## 2. Requirements (User Story)

- **As a** 使用範圍標籤選取閱讀區段的使用者
- **I want** 在內文上清楚看見起點與終點分隔線
- **So that** 我拖曳標籤時能立即理解 AI 將讀取哪一段內容，且起終點相同時仍能操作兩個標籤

## 3. Acceptance Criteria

- **Scenario 1：顯示具名稱的邊界分隔線**
  - **Given** 閱讀頁已有一對範圍標籤
  - **When** 章節內容與範圍位置顯示完成
  - **Then** 起點在起始行之前、終點在終止行之後各自向內文延伸分隔線，並分別顯示 `START` 與 `END`

- **Scenario 2：拖曳時分隔線同步移動**
  - **Given** 使用者正在拖曳任一範圍標籤
  - **When** 標籤預覽位置改變
  - **Then** 對應的分隔線與名稱跟隨同一畫面位置移動

- **Scenario 3：相同位置不重疊**
  - **Given** 起點與終點的章內文字 offset 相同，或兩條分隔線的畫面位置過近
  - **When** 閱讀頁呈現兩個邊界
  - **Then** `START` 與 `END` 的標籤、名稱及分隔線在垂直方向錯開，兩個拖曳控制仍可分別辨識與操作

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 顯示兩條命名分隔線 | 閱讀頁已載入閱讀區段 | 顯示範圍標籤 | `START` 在線前、`END` 在線後，且各有命名分隔線 | High |
| TC2 | 分隔線跟隨拖曳 | 起點標籤可拖曳到另一行 | 觸發 Pointer move | 起點列的 top 與範圍預覽同步更新 | High |
| TC3 | 相同位置錯開 | 保存範圍的 start 等於 end | 顯示閱讀頁 | 起點列與終點列具有重疊避讓狀態及不同位移 | High |

## 5. Implementation Notes

- 每個範圍邊界使用一個絕對定位的視覺列，包含既有可拖曳書籤、水平分隔線與文字名稱。
- 起點取文字行的 top；終點取終止位置所在文字行的 bottom，讓 `END` 明確出現在當行之後。
- 分隔線是視覺提示，不建立新的閱讀區段資料，也不改變文字 offset 或保存格式。
- 以兩條邊界的實際畫面 top 距離判斷是否需要避讓，不只處理 offset 完全相等的情況。
- 視覺列本身不攔截內文操作；只有書籤按鈕可接收 Pointer 事件。

## 6. Assumptions and Non-goals

- 顯示文字依使用者指定採用英文大寫 `START`／`END`。
- 本次不改變拖曳保存、右鍵移動、自動推進、AI 裁切或跨章限制。
- 本次不替整個閱讀區段加底色，以免干擾原文閱讀與未來文字標記。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 每個範圍標籤現在位於一個橫跨閱讀內容的邊界列，包含拖曳書籤、水平分隔線及 `START`／`END` 名稱。
- `START` 使用起始文字行的 top，顯示在起始行之前；`END` 使用終止位置所在文字行的 bottom，顯示在當行之後。
- 拖曳預覽更新 `ReadingRange` 後，邊界列與既有 marker top 計算同步移動。
- 當兩條邊界的畫面 top 距離小於 28px 時，起點向上、終點向下各避讓 13px，兩個書籤與名稱仍可分別辨識及操作。
- 分隔線容器維持 `pointer-events: none`；只有原本的書籤按鈕接收拖曳事件，不遮擋內文互動。

### Test Coverage

- TC1：renderer 測試驗證 `START`、`END` 與兩條分隔線；reading-range 測試驗證起點取 line top、終點取 line bottom。
- TC2：Pointer move 測試驗證起點邊界列的文字 offset 與拖曳預覽同步更新。
- TC3：保存相同 start/end 的 renderer 測試驗證兩條邊界皆進入重疊避讓狀態。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/reading-range.test.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F06-reading-range-boundary-lines.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 顯示具名稱的邊界分隔線 | Pass | renderer 驗證兩條分隔線及名稱；座標測試驗證 START 在線前、END 在線後 |
| 拖曳時分隔線同步移動 | Pass | Pointer move 後邊界列的 `data-text-offset` 與預覽位置同步 |
| 相同位置不重疊 | Pass | 相同 start/end 時兩列套用重疊避讓狀態，CSS 使用不同垂直位移 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `shows exactly one start and one end range marker for the active chapter`；`places the start before its line and the end after its line` |
| TC2 | Pass | `persists the last valid marker position immediately when a pointer drag is released in the gutter` |
| TC3 | Pass | `separates start and end boundary lines when their positions overlap` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx
npm run test -w @reader/desktop -- src/renderer/reading-range.test.ts
npm run test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：分隔線紅燈階段 3 個新行為測試失敗；終點定位測試先因 JSDOM 缺少 Range 版面 API 失敗，補齊測試替身後得到預期的 10／28 座標差異紅燈。完成實作後 server 3/3、desktop 52/52、Electron E2E 2/2 通過，型別檢查與正式建置通過。

### Hypotheses and Decisions

- 使用者在實作途中補充：終點必須位於終止行之後。定位函式因此增加 `before`／`after` 邊界語意，而不是用 CSS 任意把 END 往下推。
- `after` 會選取終止 offset 附近的實際字元並使用該字元矩形 bottom；在文字節點邊界時，會使用前一個字元，因此閱讀區段結束點仍對應前一行。
- JSDOM 的 Range 沒有 `getBoundingClientRect`；測試以局部 mock 補足版面矩形，正式 Electron/Chromium 仍使用原生 Range API。
- 重疊判定採用實際畫面 top 距離而非只比較 offset，涵蓋同一視覺行上的不同 offset 與特殊排版。
- 沒有新增資料格式、IPC 或跨模組依賴；這是 renderer 視覺呈現與 DOM 定位邏輯的局部擴充。

### Deferred Items

- 未加入整段底色或可自訂分隔線顏色。
- 瀏覽器預覽環境沒有 Electron preload 與已導入書籍，只能看到空書庫；實際章節視覺以 DOM 行為測試、座標測試與 Electron 啟動回歸驗證。

### Notes

- `notify_email_from` 與 `notify_email_to` 仍為預留值，因此未寄送 standalone ddd-tdd 完成通知。
