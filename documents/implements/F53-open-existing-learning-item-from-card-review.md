---
author: Codex
date: 2026-08-08
title: 從新增卡片確認浮層開啟已存在學習項目
uuid: 497254b6-0ab2-4180-b623-fa2b15f97581
version: 1.0.0
status: implemented
---

# Feature Specification - 從新增卡片確認浮層開啟已存在學習項目

## 1. Feature Overview

**AI 輔助建立**在學習項目草稿清單中會列出「Already exists」的正式
**學習項目**，但目前只顯示標題與語義，無法打開完整內容。本功能讓使用者
直接點擊已存在列，沿用現有共用的**學習項目詳情**浮層檢視完整內容，
以確認它與這次想新增的語義確實重複。

## 2. Requirements (User Story)

- **As a** 正在檢視學習項目草稿清單的使用者
- **I want** 點擊「Already exists」中的學習項目並打開完整詳情
- **So that** 我能核對現有內容，不必關閉草稿清單後再到生詞庫搜尋

## 3. Confirmed Product Rules

- 「Already exists」中每個 active match 都是可用鍵盤對焦與啟用的按鈕。
- 點擊時只以 match 中已驗證的 `itemId` 呼叫現有 `learning:get`，不查詢完整生詞庫。
- 成功載入後沿用共用**學習項目詳情**浮層以唯讀模式顯示；本次不擴張為編修或移入垃圾桶。
- 關閉詳情後，原學習項目草稿清單繼續開啟，其草稿狀態與提交操作不變。
- 載入失敗時不打開空詳情，在草稿清單顯示可理解錯誤，且仍可重試。
- 詳情開啟時，Escape 只關閉最上層詳情，不同時關閉底下的草稿清單。

## 4. Acceptance Criteria

- **Scenario 1：點擊已存在項目開啟詳情**
  - **Given** 學習項目草稿清單含有 active 已存在項目
  - **When** 使用者點擊該項目
  - **Then** App 以該 match 的 id 載入正式學習項目並開啟共用詳情
  - **And** 詳情不顯示編輯、AI 編修或 Delete 操作

- **Scenario 2：關閉詳情保留草稿清單**
  - **Given** 使用者已從「Already exists」開啟詳情
  - **When** 使用者關閉詳情或按一次 Escape
  - **Then** 只關閉詳情，底下原草稿清單仍然開啟

- **Scenario 3：載入失敗可重試**
  - **Given** `learning:get` 無法載入被點擊的學習項目
  - **When** 請求失敗
  - **Then** 草稿清單顯示錯誤且不開啟詳情
  - **And** 已存在項目按鈕回復可用，可再次點擊

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 開啟唯讀詳情 | active match 與可載入正式項目 | 點擊 match | `getItem(itemId)` 一次；共用詳情顯示完整 Markdown；mutation 入口不存在 | Critical |
| TC2 | 關閉只影響最上層 | 詳情疊在草稿清單上 | 關閉詳情／按 Escape | 詳情消失；Review cards dialog 保留；外層 `onClose` 未呼叫 | Critical |
| TC3 | 載入失敗 | `getItem` reject | 點擊 match | 錯誤顯示；詳情不存在；按鈕可重試 | High |

## 6. Affected Modules and Files

### Production code

- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`

### Documentation

- `documents/implements/F53-open-existing-learning-item-from-card-review.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`

## 7. Assumptions and Non-goals

### Assumptions

- 使用者所稱「已經存在的卡片」對應「Already exists」區塊中的 active
  **學習項目**，不包含「In Trash」項目。
- 本入口用來核對重複內容，因此唯讀即滿足需求。

### Non-goals

- 不在此入口編修、AI 編修或移入垃圾桶。
- 不變更去重判斷、草稿排除／恢復、提交交易或對話持久化。
- 不讓 AI 搜尋完整生詞庫，不新增 Main、IPC 或 preload 能力。

### Open Questions

- 無阻擋實作的未決問題。

## 8. Implementation Record

### Status

Implemented and verified on 2026-08-08.

### Implementation Summary

- 「Already exists」的 active match 改為完整寬度、可鍵盤對焦的按鈕，保留標題
  與語義層級，並顯示明確 `Open` affordance。
- 點擊後以 match 的 `itemId` 呼叫現有 `learning:get`，成功時疊放共用
  `LearningItemDialog`，並傳入 learning/review API 以顯示完整 Markdown、發音與複習摘要。
- 此入口固定 `readOnly`，不顯示人工編輯、AI 編修或刪除操作。
- 底層草稿清單在詳情開啟時標記 `aria-hidden`；其 Escape handler 暫停，因此
  一次 Escape 只關閉最上層詳情，並把焦點還給原 match 按鈕。
- 載入期間停用 match 按鈕，失敗時顯示詳細錯誤並恢復按鈕供重試，不影響
  草稿、排除、還原與提交狀態。

### Test Coverage

| Test | Covered scenarios |
|---|---|
| `opens an existing learning item read-only and keeps card review open on Escape` | TC1、TC2：受信任 id 載入、完整內容、唯讀權限與雙層 Escape |
| `shows an existing-item load error and lets the user retry` | TC3：錯誤文案、不開啟空詳情、按鈕恢復與第二次成功載入 |

### Changed Files

#### Production Code

- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F53-open-existing-learning-item-from-card-review.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 點擊已存在項目開啟詳情 | Pass | TC1 驗證 `getItem(itemId)`、Markdown 與 mutation 入口不存在 |
| 關閉詳情保留草稿清單 | Pass | TC2 驗證 Escape 後詳情消失、Review cards 保留、外層 `onClose` 未呼叫 |
| 載入失敗可重試 | Pass | TC3 驗證 reject 後錯誤、按鈕可用與第二次開啟成功 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `opens an existing learning item read-only and keeps card review open on Escape` |
| TC2 | Pass | `opens an existing learning item read-only and keeps card review open on Escape` |
| TC3 | Pass | `shows an existing-item load error and lets the user retry` |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/learning-item-draft-dialog.test.tsx
npm run test -w @reader/desktop -- --run src/renderer/learning-item-draft-dialog.test.tsx -t "opens an existing learning item"
npm run test -w @reader/desktop -- --run src/renderer/learning-item-draft-dialog.test.tsx src/renderer/App.test.tsx
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

### Test Results

- 初始 red：新增兩個互動測試都找不到 `Open bank details` 按鈕，確認已存在項目
  當時只是不可互動的文字。後續可及性 red 確認關閉詳情後焦點會落回 body，
  加入 trigger ref 與 animation-frame 焦點還原後通過。
- 聚焦測試：5/5 passed。
- 草稿浮層與 App 回歸：2 files、80/80 passed。
- Desktop Vitest：39 files、399/399 passed。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed。

### Hypotheses and Decisions

1. 從草稿清單打開的目的是核對重複內容，使用者未要求修改現有項目，因此沿用
   共用詳情但傳入唯讀 capability，不在新增流程擴張 mutation 權限。
2. 詳情疊在草稿清單上，不先關閉草稿清單；這樣可保留使用者的捲動位置、
   included/excluded 狀態與提交上下文。
3. 本功能只使用現有 typed `learning:get` 與 review detail capability；沒有新增 IPC、資料庫查詢
   或 AI scope。

### Architectural Observations

- 現有 `LearningItemDialog` 的 read-only capability 與可選 review API 已提供合適測試接縫；
  本功能沒有新增平行詳情元件或暴露較寬資料邊界。
- 未發現需要另開 RXX 的過度耦合、責任混淆或缺少測試接縫。

### Deferred Items

- 無。TC1–TC3 皆已實作。
