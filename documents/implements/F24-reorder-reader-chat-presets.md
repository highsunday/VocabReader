---
author: Codex
date: 2026-07-24
title: 調整閱讀頁 AI 對話快捷操作順序
uuid: dfb533320d034215935f419672b6d991
version: 1.0.0
status: implemented
---

# Feature Specification - 閱讀頁 AI 對話快捷操作順序

## 1. Feature Overview

閱讀頁的 **AI 對話面板**目前依序顯示「解釋標記」、「閱讀測驗」與「新增卡片」。
為了讓操作順序更貼近先理解、再沉澱學習項目、最後進行區段練習的學習流程，將順序
調整為「解釋標記」、「新增卡片」、「閱讀測驗」。

本功能調整閱讀頁快捷操作的視覺與鍵盤瀏覽順序，並讓建立入口使用需求中的簡潔名稱
「新增卡片」；不改變按鈕樣式、停用條件、點擊後的 typed intent 或生詞庫頁入口。

## 2. Requirements (User Story)

- **As a** 在閱讀區段中使用 AI 輔助學習的讀者
- **I want** 快捷操作依「解釋標記、建立學習項目、閱讀測驗」排列
- **So that** 操作順序符合我從理解到沉澱再到練習的學習節奏

## 3. Acceptance Criteria

- **Scenario 1：閱讀頁依指定順序顯示快捷操作**
  - **Given** 使用者位於章節閱讀頁
  - **When** AI 對話面板顯示提問快捷功能
  - **Then** 按鈕依序為「解釋標記」、「新增卡片」、「閱讀測驗」
  - **And** DOM 順序與畫面順序一致，使鍵盤瀏覽遵循相同順序

- **Scenario 2：保留既有入口範圍與行為**
  - **Given** 使用者位於閱讀頁或生詞庫頁
  - **When** AI 對話面板顯示提問快捷功能
  - **Then** 閱讀頁仍提供全部三個入口
  - **And** 生詞庫頁仍只提供「新增卡片」
  - **And** 各入口的樣式、停用條件與點擊行為不變

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 閱讀頁快捷操作順序 | 章節閱讀頁且 AI 對話面板已呈現 | 查詢提問快捷功能內的按鈕 | 依序為解釋標記、新增卡片、閱讀測驗 | Critical |
| TC2 | 生詞庫入口不變 | 生詞庫頁且 AI 對話面板已呈現 | 查詢提問快捷功能內的按鈕 | 只顯示新增卡片 | High |
| TC3 | 既有動作不變 | 閱讀頁三個按鈕可用 | 分別點擊按鈕 | 仍送出各自既有 typed intent 與資料 | High |

## 5. Implementation Notes

- 只調整 `apps/desktop/src/renderer/App.tsx` 中快捷按鈕的 JSX 排列。
- 使用行為測試讀取同一個 `aria-label="提問快捷功能"` 容器內的 button 順序，避免以
  CSS order 製造視覺與鍵盤順序不一致。
- 沿用既有按鈕元件、class、圖示、事件處理與停用條件。

## 6. Assumptions and Non-goals

- 使用者所說的「解釋筆記」依 `CONTEXT.md` 的領域詞彙解讀為既有「解釋標記」入口；
  本次不把「標記」更名為「筆記」。
- 建立入口依使用者指定顯示為「新增卡片」。
- 不新增、移除或重新設計按鈕。
- 不改變區段解析、AI 輔助建立或區段練習的流程與資料契約。
- 不調整生詞庫頁的入口順序，因該頁目前只有一個快捷操作。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- 閱讀頁的快捷操作 DOM 順序已調整為「解釋標記」、「新增卡片」、「閱讀測驗」。
- 建立入口的可見文字與無障礙名稱統一為「新增卡片」。
- 三個按鈕沿用原本的 class、圖示、事件處理與停用條件。
- 生詞庫頁仍只顯示「新增卡片」。
- `ai-conversation` 模組文件已同步記錄此順序。

### Test Coverage

- TC1、TC2：`App.test.tsx` 新增
  `orders reader chat presets as explanation, card creation, then practice`，
  驗證閱讀頁 DOM／鍵盤順序與生詞庫頁入口範圍。
- TC3：既有 `App.test.tsx` 測試繼續驗證解釋標記、建立學習項目與閱讀測驗的
  typed intent、講解語言及閱讀區段資料。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`

#### Documents

- `documents/implements/F24-reorder-reader-chat-presets.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 閱讀頁依指定順序顯示快捷操作 | Pass | 新增的快捷操作順序測試 |
| 保留既有入口範圍與行為 | Pass | 新增測試加上既有三種 intent 行為測試；`App.test.tsx` 53/53 passed |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 閱讀頁快捷操作容器內的 button 文字依序比對 |
| TC2 | Pass | 切換生詞庫後快捷操作容器只包含新增卡片 |
| TC3 | Pass | App 既有標記解析、學習項目建立與區段練習測試 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t 'orders reader chat presets as explanation, card creation, then practice'
npm run test -w @reader/desktop -- src/renderer/App.test.tsx
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop
npm run build -w @reader/desktop
git diff --check
```

Red phase：新增順序測試如預期失敗，收到
`["解釋標記", "閱讀測驗", "新增卡片"]`，而需求為
`["解釋標記", "新增卡片", "閱讀測驗"]`。

Green／acceptance phase：目標測試 1/1 passed；`App.test.tsx` 53/53 passed；
Desktop typecheck、production build 與 `git diff --check` passed。

Desktop 全套 Vitest 中與本功能相關的測試皆通過，但工作樹中尚未完成的 F23
`ReadingPracticePaper.test.tsx` 另有 4 個既存失敗；整體結果為 181 passed、4 failed。
失敗集中於試卷的 `aria-expanded`、作答進度、次要 metadata 與 container query
契約，與本次快捷操作排序無關，因此未在 F24 範圍內修改。

### Hypotheses and Decisions

- 採用專案既有領域詞彙「解釋標記」，不改成「解釋筆記」。
- 使用 JSX／DOM 實際順序完成排列，不使用 CSS `order`，確保鍵盤瀏覽順序一致。
- 未調整共享的「新增卡片」按鈕功能，只把閱讀頁專屬的「閱讀測驗」入口移到其後。

### Deferred Items

- F23 互動試卷目前 4 個測試失敗不屬於本功能，保留給該工作項目完成。

### Notes

- 獨立瀏覽器預覽可啟動畫面，但沒有 Electron preload 與已導入書籍，無法進入閱讀頁
  做完整視覺確認；閱讀頁的實際 DOM 順序由 JSDOM 行為測試驗證。
- 本次最小排列調整沒有暴露新的模組耦合、測試接縫或責任邊界問題。

### Notification

- `ddd-email-notify`: skipped-not-configured
- From: —
- To: —
- Reason: `documents/ddd-email-notify.md` 仍使用 placeholder，未設定寄件與收件地址。
