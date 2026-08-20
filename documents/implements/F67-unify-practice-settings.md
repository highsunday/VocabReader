---
author: Codex
date: 2026-08-20
title: 將三種練習設定整合至單一頁面
uuid: 7d3931ca-0607-42d8-9060-c3582429a18c
version: 1.1.0
status: implemented
---

# Feature Specification - 整合練習設定頁

## 1. Feature Overview

Settings 目前把 Spaced Review、Sentence Practice 與 Listen & Repeat 分成三個相鄰分頁，
但三者都是使用者調整日常練習量的設定。將它們整合為單一 `Practice` 分頁，降低分頁數量，
並讓使用者在同一頁比較及調整全部練習目標。

## 2. Requirements (User Story)

- **As a** VocabReader 使用者
- **I want** 在同一個設定頁調整三種練習設定
- **So that** 我不需在三個相鄰分頁之間切換

## 3. Acceptance Criteria

- **Given** 使用者開啟 Settings，**When** 查看分頁列，**Then** 只顯示一個 `Practice`
  分頁，不再顯示三個獨立練習分頁。
- **Given** 使用者開啟 `Practice`，**Then** 頁內依序顯示 `Spaced Review`、
  `Sentence Practice`、`Listen & Repeat` 三個具名區塊。
- **Given** 任一既有練習欄位，**When** 使用者修改數值，**Then** 沿用原本範圍、即時
  保存、狀態刷新及錯誤處理。
- **Given** 輔助科技讀取 Settings，**Then** `Practice` tab 與單一 tabpanel 關聯正確，
  三個區塊可由 heading 辨識。

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 合併分頁 | Settings 開啟 | 讀取 tabs | 有 Practice，無三個舊 tabs | Critical |
| TC2 | 三區塊順序 | Practice 開啟 | 讀取 headings | Review → Sentence → Listen | Critical |
| TC3 | Review 保存 | Practice 開啟 | 修改 review 欄位 | 原設定 payload 保存 | High |
| TC4 | Sentence 保存 | Practice 開啟 | 修改每日目標 | 原設定 payload保存 | High |
| TC5 | Listen 保存 | Practice 開啟 | 修改每日目標 | 原設定 payload 保存 | High |
| TC6 | ARIA 關聯 | Settings 開啟 | 選取 Practice | tab controls 單一 tabpanel | High |

## 5. Implementation Notes

- `SettingsSection` 以單一 `practice` 取代 `review`、`sentence-practice`、`listen-repeat`。
- 三個既有 panel body 移入同一 tabpanel，保留所有 input id、label、常數與 handler。
- 使用具名 section 與視覺分隔，不合併或重新定義任何領域設定。

## 6. Non-goals

- 不改變任何設定欄位、預設值、範圍或持久化格式。
- 不改變三種練習頁面、每日統計或側欄入口。
- 不新增折疊、搜尋或設定重設功能。

## 7. Implementation Record

### 7.1 Completed behavior

- Settings 分頁列以單一 `Practice` 取代三個獨立練習分頁。
- `Practice` 頁依序顯示 `Spaced Review`、`Sentence Practice`、`Listen & Repeat`，
  並以視覺分隔線區分各區塊。
- 保留既有欄位的 input id、限制、即時預覽、保存 payload 與錯誤處理。
- `Practice` tab 與單一 tabpanel 透過 `aria-controls`、`aria-labelledby` 正確關聯。

### 7.2 Changed files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `documents/implements/F67-unify-practice-settings.md`

### 7.3 TDD evidence

- Red：先將 UI 測試改為尋找 `Practice` tab，測試因產品仍只有三個舊 tab 而失敗。
- Green：合併 tab 與 panel 後，TC1–TC6 全數通過；原有 Review、Sentence Practice、
  Listen & Repeat 保存行為的測試亦通過。

### 7.4 Verification

- `npm test`：通過（server 3/3、desktop 548/548）。
- `npm run typecheck`：通過。
- `npm run build`：通過；僅保留既有 Vite chunk-size advisory。

Implemented on 2026-08-20.
