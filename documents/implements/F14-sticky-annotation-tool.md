---
author: Codex
date: 2026-07-21
title: 在章節閱讀區提供固定可見的標記小工具與章節標記數量
uuid: a22e1539b9db4ff6a768bd6860432320
version: 1.1.0
status: implemented
---

# Feature Specification - 固定標記小工具

## 1. Feature Overview

F13 已提供持久標記模式，但切換按鈕位於閱讀區段底部。使用者閱讀長章節時必須捲動到該處才能進入或退出標記狀態，不符合閱讀中隨時標記的操作需求。

本功能以閱讀內容右上角、捲動時保持可見的小型螢光筆工具取代底部文字按鈕。工具可切換標記狀態，並持續顯示目前章節全部標記數量；數量不受 START／END 影響，沒有標記時仍顯示 `0`。

## 2. Requirements (User Story)

- **As a** 閱讀長篇 EPUB 章節並隨時遇到理解困難的使用者
- **I want** 在閱讀內容旁以固定可見的小工具切換標記狀態並查看本章標記數量
- **So that** 不必捲動尋找控制按鈕，也能知道目前章節累積了多少標記

## 3. Acceptance Criteria

- **Scenario 1：顯示固定標記小工具**
  - **Given** 使用者進入已載入的章節閱讀頁
  - **When** 閱讀內容顯示
  - **Then** 閱讀內容右上角顯示小型螢光筆工具
  - **And** 工具在中央閱讀內容捲動時保持可見
  - **And** 原本位於閱讀區段底部的標記文字按鈕不再重複顯示

- **Scenario 2：切換標記狀態**
  - **Given** 標記狀態尚未開啟
  - **When** 使用者點擊標記小工具
  - **Then** 進入既有持續標記狀態，工具呈現明確啟用色及 `aria-pressed="true"`
  - **And** 再次點擊會退出標記狀態並恢復未啟用外觀
  - **And** 切換章節或離開閱讀頁時仍依 F13 自動退出

- **Scenario 3：顯示目前章節標記數量**
  - **Given** 目前章節具有零個或多個持久標記
  - **When** 標記小工具顯示
  - **Then** 工具顯示目前章節全部標記數量，零個時顯示 `0`
  - **And** 數量不因 START／END 移動或標記位於閱讀區段外而改變

- **Scenario 4：數量即時更新且不跨章混用**
  - **Given** 使用者正在目前章節建立或移除標記
  - **When** 標記集合成功更新於 Renderer
  - **Then** 工具數量立即反映新的章節標記總數
  - **And** 切換章節後顯示新章節自己的數量，返回時恢復原章節數量

- **Scenario 5：保留可理解的操作名稱**
  - **Given** 使用者使用滑鼠、鍵盤或輔助技術
  - **When** 聚焦或操作標記小工具
  - **Then** 工具是可鍵盤啟用的原生 button
  - **And** 可存取名稱包含開啟／關閉標記模式及目前章節標記數量
  - **And** 數字與圖示不造成重複朗讀

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 空章節工具 | 章節無標記 | 開啟章節 | 右上角工具顯示數量 0，底部無重複標記按鈕 | Critical |
| TC2 | 點擊切換 | 工具未啟用 | 點擊兩次 | 依序進入與退出標記狀態，`aria-pressed` 同步 | Critical |
| TC3 | 新增即時加總 | 章節已有 1 個標記 | 建立另一個標記 | 工具數量由 1 更新為 2 | Critical |
| TC4 | 移除即時扣除 | 章節已有 2 個標記 | 移除其中一個 | 工具數量由 2 更新為 1 | Critical |
| TC5 | 不受閱讀區段影響 | 本章有區段內外共 3 個標記 | 移動 START／END | 工具維持顯示 3 | High |
| TC6 | 章節隔離 | 兩章標記數量不同 | 切換章節再返回 | 各章顯示自己的數量，模式在切章時關閉 | Critical |
| TC7 | 固定位置 | 長章節可捲動 | 捲動中央內容 | 工具仍位於可視閱讀區右上角 | High |
| TC8 | 可存取名稱 | 本章有 3 個標記 | 檢查未啟用／啟用工具 | 名稱包含狀態動作與「目前章節 3 個標記」 | High |

## 5. Implementation Notes

- 沿用 F13 的 `isAnnotationMode` 與目前章節 `annotations`，不得增加第二套標記模式或另外查詢數量。
- 數量直接使用目前章節完整 `annotations.length`，不得以 START／END 交集計算。
- 工具應位於章節閱讀 workspace，使用 sticky 定位留在中央可捲動區的右上方；不可固定到整個應用程式視窗而遮住 AI 對話面板。
- 使用內嵌、裝飾性的螢光筆圖示及可見數量；button 本身提供完整動態 `aria-label`，圖示／數字對輔助技術隱藏。
- 移除閱讀區段底部既有的標記模式文字按鈕，保留「完成這段，前往下一段」。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「目前章節全部標記」包含 START／END 之外的章內標記。
- 數量為零時仍顯示 `0`。
- 小工具只在章節內容成功載入時顯示，不出現在書籍總覽、載入或錯誤畫面。

### Open Questions

- 無。位置、切換方式、數量範圍及零值呈現均已由使用者確認。

### Non-goals

- 不新增標記清單、點擊數量後展開標記、篩選、跳轉或管理面板。
- 不改變標記持久化、重疊規則、AI context 或區段解析行為。
- 不保存標記模式狀態，也不跨章維持啟用。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`（視固定位置驗收需要）
- `documents/modules/annotation.md`

## 8. Implementation Record

### Status

Implemented on 2026-07-21.

### Implementation Summary

- 以閱讀內容右上角的 sticky 小型螢光筆工具取代閱讀區段底部文字按鈕；工具只在章節成功載入時顯示。
- 工具直接切換既有 `isAnnotationMode`，使用啟用色、`aria-pressed` 與動態操作名稱表示目前狀態。
- 工具以目前章節完整 `annotations.length` 顯示可見數量，包含零值；START／END 不參與計算。
- 新增或移除標記後數量即時更新；切換章節後顯示新章自己的數量並關閉標記狀態。
- 圖示與可見數字標為裝飾內容，button 的動態 `aria-label` 同時提供動作與章節標記數量。

### Test Coverage

- TC1、TC2、TC5、TC8：新增 `shows a sticky annotation tool with the current chapter annotation count`，驗證章節外標記仍計入、工具容器、底部無重複按鈕、可見數量與動態狀態名稱。
- TC3：既有連續標記測試新增從 0 到 1 的工具數量驗證。
- TC4：既有右鍵建立／移除測試新增從 0 到 1 再回到 0 的工具數量驗證。
- TC6：切章測試改用兩章各 1／2 個標記，驗證章節隔離及模式關閉。
- TC7：Electron E2E 驗證 production CSS 中工具 dock 為 `position: sticky` 且位於 toolbar 下方 `72px`。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `documents/implements/F14-sticky-annotation-tool.md`
- `documents/modules/annotation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Scenario 1 | Pass | Component 測試驗證工具位於 `.annotation-tool-dock` 且底部無重複按鈕；E2E 驗證 sticky production CSS。 |
| Scenario 2 | Pass | Component 測試驗證兩態按鈕、啟用 class、`aria-pressed` 及切章關閉。 |
| Scenario 3 | Pass | 區段外既有標記仍顯示為章節總數；零值及不同 START／END 均有覆蓋。 |
| Scenario 4 | Pass | 連續建立、右鍵移除及兩章不同數量測試通過。 |
| Scenario 5 | Pass | 原生 button、動態完整 `aria-label`、裝飾 SVG／數字的測試與 DOM 驗證通過。 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1–TC2 | Pass | `App.test.tsx` 固定工具與 toggle 測試。 |
| TC3–TC4 | Pass | `App.test.tsx` 標記模式新增及右鍵移除測試。 |
| TC5 | Pass | 工具測試使用 START／END 外標記並仍顯示章節總數。 |
| TC6 | Pass | `turns annotation mode off when switching chapters`。 |
| TC7 | Pass | `desktop.spec.ts` production sticky positioning 驗證。 |
| TC8 | Pass | 工具測試驗證未啟用／啟用動態可存取名稱。 |

### Commands Executed

- `npx vitest run src/renderer/App.test.tsx -t "shows a sticky annotation tool"`：先觀察預期紅燈，再 1/1 passed。
- `npx vitest run src/renderer/App.test.tsx`：48/48 passed。
- `npm test`：Server 3/3、Desktop 111/111 passed。
- `npm run typecheck`：Server、Desktop passed。
- `npm run build`：Server、Electron main/preload、Vite renderer production build passed。
- `npm run test:e2e`：Electron Playwright 2/2 passed。

### Hypotheses and Decisions

- 工具數量直接取目前章節 Renderer 標記集合，避免建立可能與持久資料不同步的衍生計數狀態。
- sticky dock 位於 `reading-range-workspace`，以零高度容器避免推動原文版面，並限制在中央閱讀區而非整個應用程式視窗。
- 預載標記是在章節內容 render 後由 effect 恢復，因此測試使用非同步可存取名稱查詢；這是既有載入生命週期，不是產品缺陷。

### Deferred Items

- 標記清單與章內標記導覽。

### Notes

- 本功能沒有改變標記持久化、AI context、START／END 或右鍵行為。
- 後續若數量要成為可展開的標記導覽入口，應另立 FXX，不在目前 button 上隱含加入第二種點擊行為。
