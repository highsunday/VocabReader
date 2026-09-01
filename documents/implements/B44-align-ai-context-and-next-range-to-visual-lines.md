---
author: Codex
date: 2026-09-01
title: 對齊 AI 上下文與下一閱讀區段的視覺行邊界
uuid: 1f53e8b9-4560-4cdf-965c-0af9184466a5
version: 1.0.0
status: implemented
---

# Bug Fix: 對齊 AI 上下文與下一閱讀區段的視覺行邊界

## 1. Bug Overview

目前 START／END **範圍標籤**的分隔線分別顯示在起始視覺行之前與終止視覺行之後，
但送給 AI 的**閱讀區段**仍直接使用範圍內的精確文字 offset。當 offset 落在自動換行後的
視覺行中間時，AI 收到的起始行或終止行會被裁切，與畫面上的分隔線語意不一致。

此外，使用者執行「完成這段，前往下一段」後，新 START 直接從舊 END offset 之後開始。
若舊 END 在視覺行中間，新 START 仍落在舊 END 所在行，畫面看起來像新區段從上一段
的最後一行開始。

## 2. Fix Objective

- 送給 AI 的起點向前擴展至 START 所在視覺行的行首。
- 送給 AI 的終點向後擴展至 END 所在視覺行的行尾。
- START／END 畫面位置、文字 offset、顯示內容與持久化資料維持不變。
- 前往下一閱讀區段時，新 START 從舊 END 所在視覺行之後的第一個可閱讀字元開始。

## 3. Acceptance Criteria

- **Scenario 1：AI 起點不裁切 START 視覺行**
  - **Given** START offset 落在一個已排版視覺行的中間
  - **When** 系統組裝 AI 閱讀區段
  - **Then** 上下文從該視覺行的第一個字元開始

- **Scenario 2：AI 終點不裁切 END 視覺行**
  - **Given** END offset 落在一個已排版視覺行的中間
  - **When** 系統組裝 AI 閱讀區段
  - **Then** 上下文延伸到該視覺行的最後一個字元之後

- **Scenario 3：顯示與儲存範圍不變**
  - **Given** 已保存的 START／END offset 落在視覺行中間
  - **When** AI 上下文擴展至視覺行邊界
  - **Then** 範圍標籤的 `data-text-offset`、畫面分隔線與 `chapterRanges` 不改變

- **Scenario 4：下一閱讀區段不與舊 END 共用視覺行**
  - **Given** 舊 END 後方尚有至少一個視覺行
  - **When** 使用者執行「完成這段，前往下一段」
  - **Then** 新 START 等於舊 END 所在視覺行之後的第一個可閱讀 offset
  - **And** 新區段依舊以原始精確閱讀區段的約略字數計算長度

- **Scenario 5：章首與章末安全限制**
  - **Given** START 在章首或 END 在章末
  - **When** 系統對齊視覺行邊界
  - **Then** 上下文不超出當前章節，空閱讀區段不回退為整章

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | START 視覺行行首 | START 在第二視覺行中間 | 計算 AI 範圍 | start 對齊第二行首 | Critical |
| TC2 | END 視覺行行尾 | END 在第二視覺行中間 | 計算 AI 範圍 | end 對齊第二行尾 | Critical |
| TC3 | AI context 整合 | 範圍兩端皆裁到視覺行 | 送出 AI 訊息 | bridge 收到完整邊界行，marker offset 不變 | Critical |
| TC4 | Next 跳過舊 END 行 | END 在當前視覺行中間 | 推進範圍 | 新 START 在下一視覺行首 | Critical |
| TC5 | 章節邊界 | 範圍觸及章首或章末 | 對齊邊界 | 結果限制於 `0...text.length` | High |
| TC6 | 空區段 | `start === end` | 組裝 AI context | 不傳送章節原文 | High |

## 5. Implementation Notes

- 「一行」以目前閱讀排版下 glyph rectangle 的垂直交疊判定，不把像素位置寫入持久化資料。
- AI 擴展範圍只用於組裝當次 context；畫面狀態、右側狀態文案與保存 API 繼續使用原始 `ReadingRange`。
- 範圍版本識別保留原始 START／END，並加入當次視覺行對齊後的邊界，避免排版變更後沿用過時 AI context。

## 6. Affected Modules and Files

- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/reading-range.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`

## 7. Assumptions and Non-goals

- 使用者所述 `Next Statement` 對應現有「完成這段，前往下一段」動作。
- 不變更 START／END 視覺樣式、快捷導覽、捲動位置、範圍持久化 schema 或章末停止規則。
- 不跨章加入上下文，不將整章作為空區段 fallback。
- 本修正採用目前排版的視覺行；調整字級、紙張寬度或行距後可依新排版重新對齊。

## 8. Implementation Record

### Status

Implemented on 2026-09-01.

### Implementation Summary

- 新增 `expandReadingRangeToVisualLines()`，以目前章節 DOM 的單字元 glyph rectangle
  找出 START 所在視覺行行首與 END 所在視覺行行尾。
- AI 對話、標記講解、閱讀測驗、復述及學習項目建立共用同一個視覺行對齊後的
  `<reading-segment>`；空區段仍不傳送原文。
- AI context 版本 key 同時包含原始 START／END 及對齊後邊界，排版使邊界行改變時
  不會沿用舊 context。
- `advanceReadingRange()` 可接受指定的下一起點；Next 動作先取舊 END 視覺行行尾，
  再從後方第一個可閱讀字元建立新區段，長度仍以原始精確區段的約略字數計算。
- 原始 `readingRange`、marker `data-text-offset`、分隔線、儲存 schema 與快捷導覽都未改變。

### Test Coverage

- TC1／TC2／TC5／TC6：`expands AI context to the complete visual lines containing START and END`
  驗證中間 offset 對齊為完整視覺行、章首章末限制與空區段維持空白。
- TC3／TC4：`sends complete boundary lines and advances START beyond the previous END line`
  驗證 AI bridge 收到完整邊界行、marker offset 維持不變，Next 儲存下一視覺行行首。
- TC4 字數回歸：`advances from the next visual line while preserving the exact range word count`
  驗證指定新起點不會把隱形補齊文字算入下一區段的目標長度。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B44-align-ai-context-and-next-range-to-visual-lines.md`
- `documents/modules/reading-range.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| AI 起點不裁切 START 視覺行 | Pass | 視覺行擴展單元測試與 App bridge 整合測試 |
| AI 終點不裁切 END 視覺行 | Pass | 視覺行擴展單元測試與 App bridge 整合測試 |
| 顯示與儲存範圍不變 | Pass | App 測試保留 marker 2／7，AI 收到 0／10 |
| 下一閱讀區段不與舊 END 共用視覺行 | Pass | App 測試儲存 start 10，字數測試保留原長度 |
| 章首與章末安全限制 | Pass | 0／20 與 7／7 邊界 assertion |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | complete visual lines unit test |
| TC2 | Pass | complete visual lines unit test |
| TC3 | Pass | complete boundary lines App integration test |
| TC4 | Pass | App save range + exact word-count unit test |
| TC5 | Pass | chapter boundary assertions |
| TC6 | Pass | empty range assertion |

### Commands Executed

```bash
# Expected red: 3 failed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx -t \
  "expands AI context|advances from the next visual line|sends complete boundary lines"

# Target green: 3/3 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx -t \
  "expands AI context|advances from the next visual line|sends complete boundary lines"

# Related regression: 113/113 passed
npm test -w @reader/desktop -- src/renderer/reading-range.test.ts src/renderer/App.test.tsx

# Full regression: Server 3/3, Desktop 593/593 passed
npm test

# Server and Desktop type checks passed
npm run typecheck

# Desktop production build passed; only the existing chunk-size warning remained
npm run build -w @reader/desktop

# Whitespace/error-marker check passed
git diff --check
```

### Hypotheses and Decisions

- 範圍標籤已以 glyph 所在視覺行顯示分隔線，因此 AI context 同樣以 glyph rectangle
  對齊，而不導入另一套依字數或段落猜測的「行」定義。
- 視覺行是當下排版結果；像素只用於當次計算，不取代穩定文字 offset 成為儲存資料。
- 空區段在視覺行對齊前即返回原始空範圍，避免將一個視覺行誤當成使用者選取的原文。
- 關聯回歸首次出現 4 個非預期失敗，經 `diagnose` 確認為新 App 測試的
  `document.createRange` spy 未還原，使後續測試污染且交疊 spy 遞迴；以 `try/finally`
  還原後 113/113 通過，排除 production helper 與 ResizeObserver 為根因。

### Deferred Items

- 未新增 Electron E2E 的真實字型與自動換行操作；Renderer 已以可控 glyph rectangle 覆蓋相同邊界行為。

### Notes

- 實作沒有新增儲存欄位、main process 契約或模組邊界；未發現需另開 RXX 的架構問題。
- Desktop build 保留既有的大於 500 kB chunk 警告，不屬於本次修正。
- DDD 完成通知已從驗證的 `highsunday0630@gmail.com` 寄送至
  `highsunday.project@gmail.com`；Gmail message id 為 `1a05ce37b5ac4554`。
