---
author: Codex
date: 2026-07-21
title: 僅在閱讀區段變更後重新提供 AI 內文
version: 1.0.0
status: implemented
---

# Feature Specification - 閱讀區段上下文去重

## 1. Feature Overview

目前 **AI 對話面板**每次送出問題時，都會重新擷取並傳送相同的 **閱讀區段**原文。由於同一段 **AI 對話**會沿用同一個 Codex thread，重複提供未變更的原文只會增加 AI 重新處理相同上下文的成本。

本功能讓系統記住目前 AI 對話最近一次成功提供的閱讀區段識別。第一次針對區段提問時提供內文；後續只有在書籍、章節、START 或 END 改變後，才於下一次提問重新提供一次新內文。

## 2. Requirements (User Story)

- **As a** 使用 AI 對話面板針對閱讀區段持續提問的閱讀者
- **I want** 未改變 START／END 時只送出新問題
- **So that** AI 不必在每一輪重新處理完全相同的 EPUB 原文

## 3. Acceptance Criteria

- **Scenario 1：首次提問提供閱讀區段**
  - **Given** 使用者正在閱讀非空閱讀區段，且目前 AI 對話尚未收到該區段
  - **When** 使用者送出問題
  - **Then** 系統傳送使用者問題、書籍與章節名稱，以及 `extractReadingSegment()` 取得的區段原文

- **Scenario 2：相同範圍追問不重傳內文**
  - **Given** 最近一次成功送出的問題已提供目前書籍、章節與 START／END 對應的閱讀區段
  - **When** START／END 未改變且使用者送出後續問題
  - **Then** 系統只傳送新的使用者問題，不再附帶同一段 EPUB 原文

- **Scenario 3：範圍變更後重新提供一次內文**
  - **Given** 目前閱讀區段已在先前問題中提供
  - **When** 使用者調整 START 或 END，然後送出問題
  - **Then** 系統傳送調整後的書籍、章節與閱讀區段原文；在範圍再次改變前，後續追問不再重傳

- **Scenario 4：來源改變時不得沿用舊內文**
  - **Given** AI 對話最近收到另一個書籍或章節的閱讀區段
  - **When** 使用者切換書籍或章節後送出問題，即使新舊 START／END 數值相同
  - **Then** 系統仍重新提供新來源的閱讀區段，避免 AI 把相同 offset 誤認為相同內容

- **Scenario 5：失敗送出不消耗上下文更新**
  - **Given** 目前閱讀區段尚未成功提供，或範圍剛變更
  - **When** AI bridge 拒絕本次送出
  - **Then** 系統不把該區段記為已提供；下一次重試仍會附帶閱讀區段原文

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 首次提供內文 | 閱讀頁有非空閱讀區段 | 送出第一個問題 | bridge input 含書籍、章節及嚴格裁切的閱讀區段 | Critical |
| TC2 | 相同區段追問 | TC1 已成功送出且範圍未變 | 再送出一個問題 | bridge input 只有新問題，不含重複內文 | Critical |
| TC3 | END 更新 | 目前區段已提供 | 移動 END 後再提問 | bridge input 重新包含新區段，下一輪同範圍再省略 | Critical |
| TC4 | 書籍／章節切換 | 目前來源已提供 | 切換到另一來源且 offsets 相同後提問 | bridge input 包含新來源內文 | High |
| TC5 | 送出失敗重試 | bridge 第一次拒絕 | 以相同範圍再次提問 | 兩次嘗試都包含該閱讀區段 | High |

## 5. Implementation Notes

- 閱讀區段仍必須由既有 `extractReadingSegment()` 擷取，不建立第二套裁切邏輯。
- Renderer 以 `bookId + chapterId + start + end` 作為最近成功提供之閱讀區段的識別；不能只比較裁切文字，亦不能只比較 START／END 數字。
- 只有 `chat.sendMessage()` 成功接受 turn 後才更新最近已提供的識別；同步驗證失敗或 bridge 拒絕時保留待提供狀態。
- 未變更區段的追問不附 context，讓 Codex 使用同一 thread 中已存在的先前閱讀上下文。
- 此狀態只屬於目前應用程式 session，與既有不保存 AI 對話的生命週期一致。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 同一個 `ChatController` 目前只維持一個記憶體內 AI 對話，因此 Renderer 只需追蹤該對話最近成功提供的閱讀區段。
- 書籍或章節改變等同閱讀區段來源改變，即使 START／END 數值相同也必須重新提供內文。
- 空閱讀區段不提供 EPUB 原文；之後 START／END 形成非空區段時視為範圍變更。

### Open Questions

- 無。現有對話為單一 session、單一 thread；未來若加入多個可切換 AI 對話，各對話必須各自保存最近提供的閱讀區段識別。

### Non-goals

- 不改變 START／END 的保存、拖曳、右鍵移動或自動推進行為。
- 不改變 Codex thread／turn、串流協定、prompt、安全設定或訊息呈現。
- 不保存跨次啟動的對話上下文或閱讀區段傳送紀錄。
- 不比較 token 數、不摘要或切分閱讀區段。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/ai-conversation.md`
- `documents/modules/reading-range.md`
- `documents/implements/F09-send-reading-segment-on-range-change.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- Renderer 新增目前 AI 對話最近一次成功提供之閱讀區段識別，內容由 `bookId + chapterId + start + end` 組成。
- 第一次針對非空閱讀區段提問時仍透過 `extractReadingSegment()` 傳送嚴格裁切的原文；識別未改變的後續追問只傳使用者問題。
- 書籍、章節、START 或 END 任一項改變後，下一次提問重新提供一次新區段；新區段成功提供後的追問再次省略原文。
- 只有 `chat.sendMessage()` 成功接受訊息後才更新已提供識別；bridge 拒絕時下一次重試仍附帶原文。

### Test Coverage

- `resends reading content only after the reading range changes`：覆蓋 TC1–TC3，包括首次提供、相同區段追問、省略原文、明確推進後重新提供及新區段後續追問再次省略。
- `resends reading content after switching chapters with equal offsets`：覆蓋 TC4，確認 offsets 相同但章節不同時仍重新提供新來源。
- `retries unsent reading content after the bridge rejects a message`：覆蓋 TC5，確認失敗不消耗待提供狀態。
- 既有 `sends only the current reading segment as EPUB context` 持續覆蓋嚴格裁切及區段外原文不外洩。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/F09-send-reading-segment-on-range-change.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/reading-range.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 首次提問提供閱讀區段 | Pass | 首次 bridge call 包含書籍、章節及 `extractReadingSegment()` 結果 |
| 相同範圍追問不重傳內文 | Pass | 同一識別的第二次與新區段後第四次 bridge call 都只有使用者問題 |
| 範圍變更後重新提供一次內文 | Pass | 明確推進 START／END 後的下一次 call 包含新區段，後續 call 再次省略 |
| 來源改變時不得沿用舊內文 | Pass | 相同 offsets 切換章節後仍傳送新章節名稱及新章原文 |
| 失敗送出不消耗上下文更新 | Pass | bridge 第一次拒絕後，重試仍包含相同閱讀區段 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `resends reading content only after the reading range changes` 首次 call |
| TC2 | Pass | 同上，第二次 call |
| TC3 | Pass | 同上，推進後第三、第四次 call |
| TC4 | Pass | `resends reading content after switching chapters with equal offsets` |
| TC5 | Pass | `retries unsent reading content after the bridge rejects a message` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t 'resends reading content only after|resends reading content after switching|retries unsent reading content'
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t 'sends only the current reading segment|resends reading content only after|resends reading content after switching|retries unsent reading content'
npm run test -w @reader/desktop
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：Red 階段確認相同區段第二次提問仍重傳原文；Green 後目標測試 4/4、Server Vitest 3/3、Desktop Vitest 70/70、Electron Playwright 2/2 通過；全專案型別檢查與 production build 通過。

### Hypotheses and Decisions

- 使用書籍與章節 id 加上 START／END 作為識別，不以裁切文字比較；不同來源即使 offsets 或文字相同也不能沿用舊上下文。
- 已成功提供過的區段即使使用者暫時離開閱讀頁，回到相同來源與邊界時仍沿用 thread 既有上下文；只有識別改變才重傳。
- Red 階段的跨章測試一度查找只存在於書籍總覽的章節項目。檢查閱讀頁 DOM 後確認實際操作入口是「下一章」，改用正確入口後測試通過；這是測試接縫修正，沒有改動 production 導覽行為。
- Electron E2E 在受限環境第一次因桌面程序無法啟動而失敗；於允許 GUI 的環境重跑後 2/2 通過，確認不是產品回歸。

### Deferred Items

- 未加入多個可切換 AI 對話的獨立上下文記錄；目前產品只有單一 session、單一 thread。未來實作多對話時，需把最近提供的區段識別改為每個 AI 對話各自保存。

### Notes

- 未修改 chat IPC、Codex prompt、Controller、transport 或 START／END 持久化格式。
- 本次修改沒有暴露新的模組耦合、測試接縫或責任邊界問題，無需另開 RXX。
