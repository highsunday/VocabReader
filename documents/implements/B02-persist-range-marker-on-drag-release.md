---
author: Codex
date: 2026-07-21
title: 範圍標籤拖曳放開時立即更新
uuid: 0387dc830d35405dac9a2a66ef177b4d
version: 1.1.0
status: implemented
---

# Bug Fix - 範圍標籤拖曳放開時立即更新

## 1. Bug Overview

閱讀頁的範圍標籤在拖曳途中會顯示新位置，但若使用者在左側標籤區或其他非文字位置放開，系統會因無法從放開座標取得章內文字 offset 而不保存調整。標籤還同時啟用瀏覽器原生拖曳及 Pointer 拖曳，造成操作生命週期不一致。使用者因此必須再點擊一次，才感覺位置完成更新。

## 2. Fix Objective

範圍標籤應使用單一 Pointer 拖曳流程；使用者按住、移動並放開後，系統立即保存拖曳途中最後一個有效的章內文字位置，不需要額外點擊。起點與終點仍不可交叉。

## 3. Acceptance Criteria

- **Scenario 1：在左側標籤區放開仍立即保存**
  - **Given** 使用者已把範圍標籤拖到一個有效的閱讀行
  - **When** 使用者在無法直接對應文字 offset 的左側標籤區放開
  - **Then** 系統立即保存拖曳途中最後一個有效位置，不需再次點擊

- **Scenario 2：維持範圍順序限制**
  - **Given** 一章已有唯一一對起點與終點範圍標籤
  - **When** 使用者嘗試把任一標籤拖過另一個標籤
  - **Then** 無效位置不會成為新的閱讀區段

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 放開即保存 | 拖曳途中曾命中有效閱讀行 | 在左側空白區放開 Pointer | 保存最後有效的範圍，無需 click | High |
| TC2 | 不可交叉 | 起點與終點已有有效順序 | 拖曳位置越過另一標籤 | 不保存交叉範圍 | High |

## 5. Implementation Notes

- 移除標籤的 HTML 原生 `draggable`／drag event 流程，統一使用 Pointer 事件。
- 拖曳開始時攔截瀏覽器預設行為；拖曳途中只更新畫面預覽，不重複寫入本機書庫。
- 記住拖曳途中最後一個符合起終點順序的有效 offset，並在 `pointerup` 時保存一次。
- `pointercancel` 應結束事件監聽並恢復拖曳前範圍，不保存未完成操作。

## 6. Assumptions and Non-goals

- 本修正不改變右鍵目前行功能、自動推進、初始閱讀量或跨章限制。
- 本修正不新增多組範圍標籤，也不新增 AI 出題／說明功能。
- 鍵盤調整標籤不在本次範圍。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 範圍標籤改為單一 Pointer 拖曳流程，移除 HTML 原生 `draggable` 與 drag event。
- 拖曳途中即時預覽有效位置，但不寫入本機書庫。
- `pointerup` 會保存拖曳途中最後一個有效範圍，因此在左側標籤區放開也會立即完成更新。
- `pointercancel` 會恢復拖曳前範圍且不保存；起點與終點交叉限制維持不變。
- 標籤停用觸控捲動與文字選取預設行為，讓滑鼠及 Pointer 操作維持單一生命週期。

### Test Coverage

- TC1：`persists the last valid marker position immediately when a pointer drag is released in the gutter`。
- TC2：`does not persist a pointer drag that would cross the other range marker`。
- 取消邊界：`restores the original range when a pointer drag is cancelled`。

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documentation

- `documents/implements/B02-persist-range-marker-on-drag-release.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 在左側標籤區放開仍立即保存 | Pass | Pointer 拖曳回歸測試在 release 無文字 offset 時驗證保存最後有效範圍 |
| 維持範圍順序限制 | Pass | Pointer 交叉拖曳測試驗證不更新、不保存 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `persists the last valid marker position immediately when a pointer drag is released in the gutter` |
| TC2 | Pass | `does not persist a pointer drag that would cross the other range marker` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：紅燈階段新增的放開測試 1 個失敗、22 個既有 renderer 測試通過；實作及邊界測試完成後 server 3/3、desktop 50/50、Electron E2E 2/2 通過，型別檢查與正式建置通過。E2E 首次因受限環境無法啟動 Electron，允許桌面程序啟動後重跑通過。

### Hypotheses and Decisions

- 確認根因是 `pointerup` 只使用放開當下座標重新取得文字 offset；放開在左側標籤區時結果為 `null`，先前的有效預覽位置因而沒有保存。
- 標籤同時存在 HTML 原生拖曳及 Pointer 拖曳，會讓真實瀏覽器的事件生命週期互相競爭；本次統一為 Pointer 流程。
- 拖曳流程保存完整的最後有效 `ReadingRange`，確保放開落點無效時仍能一次寫入，且不會繞過起終點順序驗證。
- 沒有新增架構邊界或跨模組耦合；修正維持在 renderer 互動層。

### Deferred Items

- 鍵盤調整範圍標籤仍不在本修正範圍。

### Notes

- `notify_email_from` 與 `notify_email_to` 仍為預留值，因此未寄送 standalone ddd-tdd 完成通知。
