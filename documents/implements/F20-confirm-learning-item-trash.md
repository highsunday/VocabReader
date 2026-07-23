---
author: Codex
date: 2026-07-23
title: 刪除學習項目前顯示置中確認視窗
uuid: 306873bc73684ca2b1a9715e24d3964e
version: 1.1.0
status: implemented
---

# Feature Specification - 學習項目刪除確認

## 1. Feature Overview

目前使用者在**學習項目詳情（Learning Item Detail）**按下「刪除」後，項目會立即移入
**垃圾桶（Learning Item Trash）**，容易因誤觸而中斷閱讀與整理流程。本功能在真正變更
資料前顯示畫面正中央的確認視窗，讓使用者能取消，或明確確認把該學習項目移入垃圾桶。

確認視窗必須清楚顯示目標學習項目的標題，並說明這次操作仍可從垃圾桶還原，避免把
「移入垃圾桶」誤解成永久刪除。

## 2. Requirements (User Story)

- **As a** 在生詞庫整理學習項目的讀者
- **I want** 刪除學習項目前先在畫面中央再次確認
- **So that** 我不會因誤觸立即把正在查看的學習項目移出使用中清單

## 3. Acceptance Criteria

- **Scenario 1：開啟置中刪除確認**
  - **Given** 使用者正在查看一個使用中的學習項目
  - **When** 使用者在學習項目詳情按下「刪除」
  - **Then** 畫面正中央顯示具有 modal 語意的確認視窗
  - **And** 視窗顯示目標標題及「可從垃圾桶還原」的說明
  - **And** 尚未呼叫移入垃圾桶操作

- **Scenario 2：取消刪除**
  - **Given** 刪除確認視窗已顯示
  - **When** 使用者按下「取消」或 Escape
  - **Then** 確認視窗關閉，學習項目詳情維持開啟
  - **And** 學習項目資料及使用中狀態都不變

- **Scenario 3：確認移入垃圾桶**
  - **Given** 刪除確認視窗已顯示
  - **When** 使用者明確確認刪除
  - **Then** 系統只呼叫一次既有的移入垃圾桶操作
  - **And** 成功後關閉確認視窗及學習項目詳情，更新使用中清單與垃圾桶數量

- **Scenario 4：移入垃圾桶失敗**
  - **Given** 刪除確認視窗已顯示
  - **When** 使用者確認，但本機操作失敗
  - **Then** 學習項目詳情保持開啟並顯示可理解的錯誤
  - **And** 使用者可再次操作，資料不會先從畫面移除

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Open confirmation | Active learning item detail is open | Click Delete | Centered modal shows item title and recovery explanation; `trashItem` is not called | Critical |
| TC2 | Cancel confirmation | Confirmation is open | Click Cancel | Confirmation closes; detail remains; data is unchanged | Critical |
| TC3 | Cancel with Escape | Confirmation is open | Press Escape | Only confirmation closes; detail remains | High |
| TC4 | Confirm deletion | Confirmation is open | Click the confirm action | `trashItem` is called once with the item id; detail closes and counts refresh | Critical |
| TC5 | Mutation failure | `trashItem` rejects | Confirm deletion | Detail remains open with an error; item is not optimistically removed | High |

## 5. Anticipated Impact

### Existing files likely to change

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/learning-library.md`

本功能沿用既有 `learning:trash` typed bridge、IPC 與 SQLite 狀態轉移，不新增或放寬
Renderer 權限，也不改變 Main process 資料規則。

## 6. Assumptions and Non-goals

- 「刪除」仍代表 `active → trashed`，不是永久刪除。
- 單字與片語等所有使用中的學習項目都套用相同確認流程。
- 不改變垃圾桶的個別還原及「清空垃圾桶」永久刪除確認流程。
- 不新增單筆永久刪除、復原已清空垃圾桶、undo toast 或跨裝置同步。
- 確認進行中停用重複送出，避免同一學習項目被重複呼叫。

## 7. Implementation Record

### Status

Implemented on 2026-07-23.

### Implementation Summary

- 學習項目詳情中的「刪除」不再直接呼叫 `trashItem`，而是開啟畫面中央的確認視窗。
- 確認視窗顯示目標學習項目標題，並清楚說明項目只會移入垃圾桶、之後仍可還原。
- 「取消」及 Escape 只關閉確認視窗，底下的學習項目詳情維持開啟。
- 確認操作進行中會停用按鈕；成功後才關閉詳情並更新清單與數量。
- 移入垃圾桶失敗時關閉確認層、保留詳情並顯示錯誤，不先從畫面移除項目。
- 沿用既有 `dialog-backdrop` 與 `delete-dialog` 置中樣式，以及既有 typed
  `learning:trash` 能力，沒有新增 IPC、資料格式或 Renderer 權限。

### Test Coverage

- 更新 `learning-library-workspace.test.tsx`：
  - `confirms before moving a card to trash, then restores and empties trash` 覆蓋
    TC1–TC4，確認尚未按下最終操作前不會呼叫 `trashItem`，取消與 Escape 保留詳情，
    明確確認後才移入垃圾桶。
  - `keeps the detail open and reports an error when moving to trash fails` 覆蓋 TC5。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`

#### Test code

- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`

#### Documents

- `documents/implements/F20-confirm-learning-item-trash.md`
- `documents/modules/learning-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Scenario 1：開啟置中刪除確認 | Pass | Renderer 測試確認 alertdialog、目標標題、可還原說明及未呼叫 `trashItem` |
| Scenario 2：取消刪除 | Pass | Renderer 測試確認「取消」與 Escape 只關閉確認視窗，詳情維持開啟 |
| Scenario 3：確認移入垃圾桶 | Pass | Renderer 測試確認明確操作後只以 item id 呼叫一次，並沿用清單與數量刷新 |
| Scenario 4：移入垃圾桶失敗 | Pass | Renderer 測試以 rejected mutation 確認詳情保留及錯誤可見 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `confirms before moving a card to trash, then restores and empties trash` |
| TC2 | Pass | 同上：「取消」不呼叫 `trashItem`，詳情仍存在 |
| TC3 | Pass | 同上：Escape 只關閉 alertdialog |
| TC4 | Pass | 同上：最終操作後 `trashItem("item-bank")` 只呼叫一次 |
| TC5 | Pass | `keeps the detail open and reports an error when moving to trash fails` |

### Commands Executed

- `npm run test -w @reader/desktop -- src/renderer/learning-library-workspace.test.tsx`
  - 紅燈：2 failed、4 passed；原因為找不到尚未實作的刪除確認 alertdialog。
  - 綠燈：6/6 passed。
- `npm run test -w @reader/desktop`：141/141 passed。
- `npm run typecheck`：Server 及 Desktop passed。
- `npm run build`：Server、Electron Main／Preload 及 Renderer production build passed。

### Hypotheses and Decisions

- 第一次目標測試命令從 monorepo 根目錄傳入
  `apps/desktop/src/renderer/learning-library-workspace.test.tsx`；npm workspace 已先把
  Vitest 執行目錄切至 `apps/desktop`，因此篩選路徑多一層而找不到測試。
- 驗證假說後改用 workspace 相對路徑
  `src/renderer/learning-library-workspace.test.tsx`，測試隨即執行並因缺少 alertdialog
  正常進入紅燈，確認不是 include 規則或檔名問題。
- 確認視窗的主要操作採「移到垃圾桶」，而非「永久刪除」，以維持
  `CONTEXT.md` 定義的資料生命週期。
- 確認視窗開啟時，Escape 優先關閉最上層確認視窗，不會穿透而關閉學習項目詳情。

### Deferred Items

- 無。本 FXX 的 TC1–TC5 全部實作。

### Notes

- 本功能沒有更動 Main process、SQLite、typed bridge 或垃圾桶永久清空流程。
- 既有共享確認視窗樣式已提供 fixed positioning、grid centering、遮罩與警示外觀，
  因此不需要新增平行的樣式元件。

## Appendix: TDD Implementation Checklist

1. 先新增 TC1–TC5 對應的 Renderer 失敗測試。
2. 以最小狀態與 UI 實作置中確認視窗。
3. 通過目標測試後執行 Desktop 回歸測試、型別檢查與建置。
4. 同步本文件的實作紀錄及生詞庫模組文件。
