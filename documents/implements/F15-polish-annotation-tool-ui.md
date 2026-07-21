---
author: Codex
date: 2026-07-21
title: 美化固定標記小工具並提升操作辨識度
uuid: 65ac0f2479c648f9978c57bf4381481d
version: 1.3.0
status: implemented
---

# Feature Specification - 標記小工具視覺優化

## 1. Feature Overview

F14 已把標記模式切換與章節標記數量整合成固定工具，但目前工具只有圖示與並排數字，外觀較像無標籤的系統控制。第一次使用者不一定能立即理解它可以點擊或知道其用途。

本功能維持工具位置、狀態與資料行為不變，將其調整為符合現有暖色紙本閱讀器風格的緊湊膠囊按鈕：顯示螢光筆圖示、「標記／標記中」文字及右上角數量徽章，使用淡雅單色與低對比陰影，加入不干擾閱讀的 hover、按壓與 focus 回饋，不顯示額外操作提示。

## 2. Requirements (User Story)

- **As a** 第一次使用標記功能的 EPUB 閱讀者
- **I want** 一眼看懂右上角工具可以用來開啟標記狀態
- **So that** 不必猜測圖示用途，也能清楚知道目前狀態與本章標記數量

## 3. Acceptance Criteria

- **Scenario 1：可辨識的膠囊工具**
  - **Given** 章節閱讀內容已載入且標記狀態未開啟
  - **When** 固定標記工具顯示
  - **Then** 工具使用約 84 × 40px 的橢圓膠囊外觀
  - **And** 同時顯示螢光筆圖示與「標記」文字
  - **And** 使用淡暖白單色底、柔和綠灰前景、低對比邊框與陰影，與簡潔書頁視覺一致
  - **And** 背景不得使用漸層

- **Scenario 2：章節標記數量徽章**
  - **Given** 目前章節具有任意數量的標記
  - **When** 工具顯示
  - **Then** 數量位於膠囊右上角的重疊圓形徽章，而非與標籤並排
  - **And** 零值仍顯示，兩位以上數字仍可完整容納
  - **And** 數量來源與 F14 相同，不改變章節隔離或即時更新行為

- **Scenario 3：明確的啟用狀態**
  - **Given** 標記狀態未開啟
  - **When** 使用者點擊工具
  - **Then** 工具文字改為「標記中」
  - **And** 背景改為淡黃色單色，前景及數量徽章保持足夠辨識度
  - **And** 啟用狀態也不得使用漸層
  - **And** 再次點擊會恢復「標記」及閒置外觀

- **Scenario 4：滑鼠、按壓與鍵盤回饋**
  - **Given** 使用者可用滑鼠或鍵盤操作工具
  - **When** hover、按下或鍵盤聚焦工具
  - **Then** hover 會輕微上浮並加深陰影，按下會輕微縮小，focus-visible 顯示清楚外框
  - **And** 動畫短暫且不持續閃爍
  - **And** 系統偏好 reduced motion 時停用位移及轉場

- **Scenario 5：不顯示額外提示**
  - **Given** 工具未啟用或已啟用
  - **When** 使用者 hover 工具或以鍵盤將焦點移入工具
  - **Then** 不顯示自製或瀏覽器原生 tooltip，也不加入 `title` 或以 `aria-describedby` 關聯提示
  - **And** 仍以可見「標記／標記中」、動態 `aria-label` 與 `aria-pressed` 表達用途及狀態

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 閒置膠囊 | 章節已載入且模式關閉 | 檢查工具 | 具有圖示、可見「標記」標籤、淡暖白單色背景及膠囊樣式契約 | Critical |
| TC2 | 右上角徽章 | 本章標記數量為 0、3 或 12 | 檢查工具 | 徽章重疊右上角且完整顯示數字 | High |
| TC3 | 啟用外觀 | 模式關閉 | 點擊工具 | 文字成為「標記中」、淡黃色單色背景、active 與 `aria-pressed=true` | Critical |
| TC4 | 恢復閒置 | 模式開啟 | 再次點擊 | 文字與樣式恢復閒置 | Critical |
| TC5 | 無 hover 提示 | 模式關閉 | hover／focus | DOM 中沒有 tooltip，button 沒有 `title` 或 `aria-describedby` | High |
| TC6 | 無啟用提示 | 模式開啟 | hover／focus | 仍沒有 tooltip，以可見文字及 pressed 狀態表達 | High |
| TC7 | 互動樣式 | 工具可操作 | 檢查 production CSS | hover、active、focus-visible 與 reduced-motion 規則存在 | High |
| TC8 | 行為回歸 | 已有 F14 工具 | 新增、移除、切章 | 計數、固定位置及標記模式行為維持不變 | Critical |

## 5. Implementation Notes

- 只調整 `App.tsx` 的工具呈現節點及 `styles.css`；不得增加新的狀態或改變 F13／F14 標記邏輯。
- button 內加入裝飾 SVG 與 `annotation-tool-label`；數量徽章改為 button 右上角絕對定位。
- 不建立 tooltip DOM、`title`、`aria-describedby` 或只在 hover 顯示的額外提示；用途由可見標籤、動態 `aria-label` 與 `aria-pressed` 表達。
- 保留 sticky dock 與中央閱讀區邊界，不將工具移到全視窗 fixed layer。
- 使用現有暖白、綠灰、淡黃色色彩語言；工具、啟用狀態與徽章均使用單色，不加入 CSS gradient、外部圖示或動畫套件。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「約 84 × 40px」允許為「標記中」、padding 與兩位數徽章保留少量彈性。
- 桌面應用程式最小寬度已足以容納膠囊工具，不新增窄螢幕版型。

### Open Questions

- 無。風格、縮小尺寸、淡色單色背景、文字、徽章、動態回饋與移除提示均已確認。

### Non-goals

- 不改變標記數量範圍、持久化、重疊、右鍵或 AI 行為。
- 不增加展開選單、標記列表、顏色選擇或首次使用導覽流程。
- 不加入聲音、持續閃爍、循環動畫或第三方圖示套件。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/annotation.md`

## 8. Implementation Record

### Status

Implemented on 2026-07-21.

### Implementation Summary

- 固定標記工具採最小寬 84px、高 40px 的緊湊圓角膠囊，保留 sticky 定位與明確的「標記／標記中」文字。
- 閒置狀態使用淡暖白單色、柔和綠灰前景與單層低對比陰影；啟用狀態使用淡黃色單色、淺琥珀邊框與輕量狀態環，兩種狀態均不使用漸層。
- 章節標記數量改為膠囊右上角絕對定位徽章，支援零值及兩位以上數字。
- 加入 hover 上浮／陰影、按壓縮放、focus-visible 外框；reduced-motion 下停用位移與轉場。
- 移除 tooltip DOM、`title` 與 `aria-describedby`；用途與狀態由可見文字、動態 `aria-label` 及 `aria-pressed` 表達。
- 沿用 F13／F14 的狀態、數量、切章與持久化流程，沒有新增產品狀態或改變標記行為。

### Test Coverage

- TC1、TC3–TC6：擴充 `shows a sticky annotation tool with the current chapter annotation count`，驗證可見狀態文字、沒有 tooltip／`title`／`aria-describedby`、`aria-pressed` 及既有數量。
- TC2：既有零值、單值即時更新與新增 production CSS 雙位數徽章探針共同驗證。
- TC7：Electron E2E 驗證 84 × 40px 膠囊、999px 圓角、閒置／啟用／徽章的淡色單色值、無 gradient、徽章右上角定位、沒有 tooltip 及 reduced-motion 的零秒轉場。
- TC8：完整 Desktop 111/111 測試確認標記新增、移除、切章、AI context 與其他閱讀器功能未回歸。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `documents/implements/F15-polish-annotation-tool-ui.md`
- `documents/modules/annotation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Scenario 1 | Pass | Component 測試驗證圖示與「標記」文字；E2E 驗證 production 膠囊尺寸、圓角、淡暖白單色及 `background-image: none`。 |
| Scenario 2 | Pass | Component 回歸驗證數量來源與更新；E2E 驗證徽章絕對定位及雙位數內容。 |
| Scenario 3 | Pass | Component 測試驗證點擊後「標記中」、active class 與 `aria-pressed=true`；E2E 驗證淡黃色單色及無 gradient。 |
| Scenario 4 | Pass | Production CSS 含 hover、active、focus-visible 及 reduced-motion；E2E 驗證 focus 與 reduced-motion。 |
| Scenario 5 | Pass | Component 驗證沒有 tooltip DOM、`title` 或 `aria-describedby`；E2E 驗證沒有 tooltip 元件。 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `App.test.tsx` 可見 label；E2E 膠囊尺寸與淡暖白單色樣式。 |
| TC2 | Pass | 既有章節計數測試及 E2E 雙位數徽章。 |
| TC3–TC4 | Pass | `App.test.tsx` 動態 label、active 與 pressed 狀態；E2E 淡黃色單色樣式。 |
| TC5–TC6 | Pass | `App.test.tsx` 驗證兩種模式都沒有 tooltip 與描述關聯。 |
| TC7 | Pass | `desktop.spec.ts` production style、focus 與 reduced-motion。 |
| TC8 | Pass | 全套 Server／Desktop／Electron 回歸測試。 |

### Commands Executed

- `npx vitest run src/renderer/App.test.tsx -t "shows a sticky annotation tool"`：先觀察仍有 `aria-describedby` 的預期紅燈，再 1/1 passed。
- `npm test`：Server 3/3、Desktop 111/111 passed；另將切章計數斷言改為等待非同步狀態，避免偶發時序失敗。
- `npm run typecheck`：Server、Desktop passed。
- `npm run build`：Server、Electron main/preload 與 Vite renderer production build passed。
- `npm run test:e2e`：新增單色驗收後先觀察舊漸層與深色徽章造成的預期紅燈；修改 production CSS 後 Electron Playwright 2/2 passed。

### Hypotheses and Decisions

- 使用可見文字而非純圖示解決第一次使用的可發現性；維持單一 button，避免把數量徽章誤做成第二個操作入口。
- 使用者希望縮小工具且不要提示，因此完全移除情境提示節點、原生 `title` 與描述關聯；可見文字與按鈕狀態仍保留基本可發現性及輔助技術資訊。
- 工具採 `min-width: 84px`、高 40px，在先前純圖示過小與 96 × 44px 偏大的回饋之間取得折衷，並保留「標記中」及數量徽章的空間。
- 依簡潔風格回饋，閒置、啟用與徽章全部改用淡色純色；移除 backdrop blur、內側高光與多層陰影，保留足以辨識狀態的文字及邊框對比。
- 動畫只回應 hover／active，不建立持續動畫；reduced-motion 明確停用 transition 與 transform。
- E2E 初次讀取啟用背景時仍得到閒置色；排除 selector 與樣式快取後，確認原因是 160ms background transition。測試探針在比較靜態色票前停用自身 transition，產品轉場維持不變。

### Deferred Items

- 標記列表、顏色選擇與完整導覽。

### Notes

- 本次未增加新的架構耦合；改動局限於既有 Renderer 呈現節點、樣式與驗收測試。
- 樣式仍沿用 F14 sticky dock，不影響中央閱讀區與 AI 對話面板邊界。
