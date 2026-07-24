---
author: Codex
date: 2026-07-24
title: 新增閱讀版面設定面板與紙張寬度、行距控制
uuid: 0dcbe931f6a24f32942e9a2911e7f47b
version: 1.1.0
status: implemented
---

# Feature Specification - 閱讀版面設定

## 1. Feature Overview

章節閱讀頁目前把 EPUB 內文字級、閱讀紙張最大寬度與正文行距分散在全域設定和
固定樣式中。字級雖然已可在一般設定視窗調整，但使用者無法在閱讀時直接控制紙張
寬度或行距，也難以一邊閱讀一邊找到舒適的版面。

本功能在章節閱讀工具列加入 `Aa`「閱讀版面」入口，集中提供字級、紙張寬度與行距
三項全域偏好。調整時立即預覽並自動保存，所有書籍共用同一組偏好；使用者也可一次
恢復預設版面。這些設定只改變應用程式如何顯示安全解析後的章節內容，不修改 EPUB
原文或其他應用程式介面。

## 2. Requirements (User Story)

- **As a** 使用電子書閱讀與 AI 輔助學習的讀者
- **I want** 在章節閱讀畫面直接調整字級、紙張寬度與行距
- **So that** 我可以依螢幕、閱讀距離與個人習慣建立舒適且一致的閱讀版面

## 3. Acceptance Criteria

- **Scenario 1：從章節閱讀工具列開啟閱讀版面設定**
  - **Given** 使用者已開啟一個章節
  - **When** 使用者點擊工具列的 `Aa`「閱讀版面」按鈕
  - **Then** 顯示包含文字大小、紙張寬度、行間距與恢復預設值的設定面板
  - **And** 面板以目前保存值初始化
  - **And** 點擊面板外、再次點擊入口或按下 Escape 可以關閉面板
  - **And** 非章節閱讀畫面不顯示這個入口

- **Scenario 2：調整電子書內文字大小**
  - **Given** 閱讀版面設定面板已開啟
  - **When** 使用者在 16–32px 範圍調整文字大小
  - **Then** 面板顯示目前 px 數值
  - **And** EPUB 章節內容立即套用新字級
  - **And** 章節標題等以內文相對大小呈現的 EPUB 內容隨之縮放
  - **And** 閱讀工具列、範圍標籤、標記工具與 AI 對話面板不受影響

- **Scenario 3：調整閱讀紙張寬度**
  - **Given** 閱讀版面設定面板已開啟
  - **When** 使用者在 560–960px 範圍調整紙張寬度
  - **Then** 面板顯示目前 px 數值
  - **And** 白色閱讀紙張、範圍標籤及其分隔線、閱讀區段操作列立即使用相同寬度
  - **And** 章節工具列內容與閱讀紙張維持對齊
  - **And** 可用中央空間小於所選寬度時，版面縮至可用寬度而不產生水平捲動
  - **And** 左側書庫與右側 AI 對話面板的寬度不被這項設定改變

- **Scenario 4：調整正文行間距**
  - **Given** 閱讀版面設定面板已開啟
  - **When** 使用者在 1.4–2.4 倍範圍以 0.1 步進調整行間距
  - **Then** 面板顯示目前倍數
  - **And** EPUB 的一般正文、清單與引用文字立即套用新行距
  - **And** 章節標題與程式碼區塊保留各自較緊湊的行距
  - **And** EPUB 以外的介面文字不受影響

- **Scenario 5：恢復預設閱讀版面**
  - **Given** 使用者已修改至少一項閱讀版面設定
  - **When** 使用者點擊「恢復預設值」
  - **Then** 文字大小恢復為 19px
  - **And** 紙張寬度恢復為 760px
  - **And** 行間距恢復為 1.9 倍
  - **And** 三項預設立即預覽並自動保存
  - **And** AI 對話字級與講解語言等其他設定不被重設

- **Scenario 6：全域保存並恢復閱讀版面**
  - **Given** 使用者選擇了三項有效的閱讀版面設定
  - **When** 使用者切換至其他書籍、重新開啟章節或重新啟動應用程式
  - **Then** 所有書籍都沿用相同設定
  - **And** 三項設定恢復為最後一次保存值
  - **And** EPUB 原文與每本書的閱讀狀態不被修改

- **Scenario 7：舊版或無效設定安全降級**
  - **Given** 本機設定檔缺少紙張寬度或行距、欄位超出範圍或格式錯誤
  - **When** 應用程式載入設定
  - **Then** 缺少或無效的紙張寬度採 760px
  - **And** 缺少或無效的行距採 1.9 倍
  - **And** 既有有效的講解語言、AI 對話字級與電子書字級仍可獨立載入

- **Scenario 8：只接受完整且受限的設定資料**
  - **Given** Renderer 透過設定 bridge 保存偏好
  - **When** 任一閱讀版面值超出允許範圍、使用不允許的步進值或不是有限數字
  - **Then** Main process 拒絕保存
  - **And** 不把無效資料寫入本機設定檔

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 開關閱讀版面面板 | 章節已開啟 | 點擊 `Aa`，再點擊外部或按 Escape | 面板正確開啟與關閉，且包含三項控制與重設入口 | Critical |
| TC2 | 閱讀字級即時預覽 | 面板已開啟 | 將文字大小設為 24px | 顯示 24px，章節內容 computed font-size 為 24px，其他介面不變 | Critical |
| TC3 | 紙張寬度即時預覽 | 面板已開啟且中央空間足夠 | 將紙張寬度設為 900px | 紙張、範圍 UI、操作列與工具列內容對齊 900px 欄寬 | Critical |
| TC4 | 紙張寬度響應式降級 | 可用中央空間小於設定寬度 | 選擇 960px | 閱讀欄縮至可用寬度且沒有水平捲動 | High |
| TC5 | 行距即時預覽 | 面板已開啟 | 將行距設為 2.2 | 正文、清單與引用使用 2.2，標題與程式碼維持專用行距 | Critical |
| TC6 | 恢復閱讀預設 | 三項值皆非預設 | 點擊恢復預設值 | 三項值成為 19px／760px／1.9，其他偏好不變 | High |
| TC7 | 全域保存 | 三項值皆有效 | 切換書籍並以新 store 載入 | 各書與重啟後使用相同保存值 | Critical |
| TC8 | 舊設定相容 | 設定檔沒有新欄位 | 載入設定 | 舊欄位保留，新欄位採 760px／1.9 | High |
| TC9 | 欄位獨立降級 | 紙張寬度或行距只有一項無效 | 載入設定 | 無效欄位採預設，其他有效欄位保留 | High |
| TC10 | IPC 邊界驗證 | 設定 bridge 已註冊 | 保存越界、錯誤步進、NaN 或 Infinity | 拒絕保存且 store 未被呼叫 | Critical |
| TC11 | 入口顯示範圍 | 使用者位於書籍總覽或生詞庫 | 檢視主要工具列 | 不顯示閱讀版面入口 | Medium |

## 5. Implementation Notes

- 延伸既有全域 `AppSettings` 與 `LocalSettingsStore`，加入閱讀紙張寬度與正文行距；
  沿用逐欄驗證、舊設定相容及原子保存，不建立每本書的版面資料。
- 電子書字級沿用現有 16–32px、整數步進與 19px 預設；紙張寬度限制於
  560–960px，預設 760px；行距限制於 1.4–2.4，步進 0.1，預設 1.9。
- 紙張寬度控制採不超過可用中央空間的最大寬度；閱讀紙張、範圍 UI、操作列與
  章節工具列共用同一個寬度來源。
- Renderer 以限定於章節閱讀區的 CSS custom properties 即時預覽三項偏好，
  不修改經安全處理的 EPUB HTML。
- `Aa` 面板使用按鈕與原生 range control，提供目前數值、可辨識標籤、
  Escape／外部點擊關閉及明確的恢復預設操作。
- 現有一般設定視窗保留 AI 對話字級與講解語言；電子書字級移至閱讀版面面板，
  避免兩處出現相同控制。
- 設定變更沿用短暫 debounce 保存；恢復預設值只重設三項閱讀版面偏好。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 三項閱讀版面設定都是全域偏好，所有書籍共用，不按書籍或章節分開保存。
- 紙張寬度代表整張白色閱讀紙張的最大寬度，而不是只改變紙張內的文字欄寬。
- 紙張寬度控制可使用不超過 20px 的離散步進；實際控制步進可在 TDD 紅燈階段
  依可用性測試確定，但必須包含 560px、760px、900px 與 960px。
- 關閉面板不取消已預覽的變更，因為每次調整都會自動保存。

### Open Questions

- 無。

### Non-goals

- 不新增字型選擇、背景／主題、段落間距、文字對齊或獨立頁邊距設定。
- 不新增每本書、每個章節或每個 AI 對話的閱讀版面偏好。
- 不改變 AI 對話字級、左／右側欄寬度、閱讀進度或 EPUB 原始內容。
- 不提供跨裝置同步。

## 7. Affected Modules and Files

### Modules

- `documents/modules/book-library.md`：補充閱讀版面入口、三項全域偏好與顯示邊界。

### Expected production files

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Expected test files

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 章節工具列加入 `Aa`「閱讀版面」按鈕與非模態設定面板；面板只在閱讀章節時
  出現，可再次點擊入口、點擊外部、關閉按鈕或按 Escape 關閉。
- 面板集中提供 16–32px 文字大小、560–960px／20px 步進紙張寬度與
  1.4–2.4／0.1 步進行間距，顯示目前值並即時套用。
- 紙張、範圍標籤／分隔線、閱讀區段操作列與章節工具列共用閱讀寬度來源；中央
  可用空間不足時使用百分比上限自動收縮，不產生水平捲動。
- 正文行距透過限定於 `.chapter-content` 的 CSS variable 套用；標題維持 1.25、
  程式碼區塊維持 1.55 的專用行距。
- 閱讀版面變更後重新計算 START／END 範圍標籤的畫面位置，不更動其章內文字
  offset。
- `AppSettings`、Main IPC 與 `LocalSettingsStore` 已加入紙張寬度和行距；
  舊設定缺欄位或單一欄位無效時逐欄回到 760px／1.9，不清除其他有效偏好。
- 「恢復預設值」只重設電子書字級、紙張寬度與行距，不影響 AI 對話字級或講解
  語言。
- 一般設定視窗移除重複的電子書字級控制，保留 AI 對話字級與講解語言。

### Test Coverage

- TC1、TC2、TC3、TC5、TC6、TC7、TC11：
  `App.test.tsx` 的
  `controls and resets the global reading layout from the reader toolbar`
  驗證入口顯示範圍、面板內容、數值範圍／步進、即時 CSS variables、保存、
  重設、外部點擊與 Escape 關閉。
- TC4：Electron E2E 以 900px 保存值驗證閱讀欄不超過中央可用寬度，且中央內容
  沒有水平溢位。
- TC5：Electron E2E 驗證 24px 正文搭配 2.2 倍行距得到 52.8px，36px 標題仍
  使用 45px 專用行距，18.72px 程式碼仍使用 29.016px 專用行距。
- TC7、TC8、TC9：`settings-store.test.ts` 驗證完整保存後重建 store、舊檔缺欄位
  與紙張／行距錯誤步進的逐欄降級。
- TC10：`settings-ipc.test.ts` 驗證合法完整 payload，並拒絕字級、紙張寬度與
  行距的越界或錯誤步進值。
- Electron E2E 另驗證 Main process 保存後重新載入為
  24px／900px／2.2，且既有 AI 對話字級與練習試卷相對字級維持正確。

### Changed Files

#### Production code

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `CONTEXT.md`
- `documents/implements/F25-adjustable-reading-and-conversation-font-sizes.md`
- `documents/implements/F26-reading-layout-settings.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 從章節閱讀工具列開啟閱讀版面設定 | Pass | Renderer 入口／面板／四種關閉行為測試 |
| 調整電子書內文字大小 | Pass | Renderer 即時樣式與 Electron computed font-size |
| 調整閱讀紙張寬度 | Pass | Renderer 共用 CSS variable 與 Electron 無水平溢位驗證 |
| 調整正文行間距 | Pass | Renderer 即時樣式與 Electron 正文／標題／程式碼 computed line-height |
| 恢復預設閱讀版面 | Pass | Renderer 三項重設、其他偏好不變與保存斷言 |
| 全域保存並恢復閱讀版面 | Pass | Store 重建載入與 Electron Main process 重載 |
| 舊版或無效設定安全降級 | Pass | Store 舊檔與逐欄無效資料測試 |
| 只接受完整且受限的設定資料 | Pass | IPC 合法 payload、上下界與步進參數化測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Renderer 開啟、入口切換、關閉按鈕、外部點擊與 Escape |
| TC2 | Pass | Renderer 24px 即時預覽；Electron 24px computed style |
| TC3 | Pass | Renderer 900px 即時預覽與閱讀 UI 共用寬度來源 |
| TC4 | Pass | Electron 閱讀欄不超過中央可用寬度且沒有水平溢位 |
| TC5 | Pass | Renderer 2.2 即時預覽；Electron 正文／標題／程式碼行高 |
| TC6 | Pass | Renderer 恢復 19px／760px／1.9 且保留其他偏好 |
| TC7 | Pass | Renderer 保存、Store 重建、Electron 重載 |
| TC8 | Pass | Store 載入只有舊欄位的設定 |
| TC9 | Pass | Store 紙張 901px／行距 2.25 的獨立降級 |
| TC10 | Pass | IPC 拒絕越界與錯誤步進值且不呼叫 store |
| TC11 | Pass | Renderer 在總覽不顯示入口、章節閱讀才顯示 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/settings-store.test.ts src/main/settings-ipc.test.ts src/renderer/App.test.tsx -t 'defaults all preferences|loads and saves the restricted|rejects invalid settings|previews and saves the conversation|controls and resets the global reading layout'
npm run test -w @reader/desktop
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
git diff --check
```

Red phase：目標測試如預期失敗；store 缺少新欄位、IPC 忽略或接受無效的新值、
一般設定仍顯示 EPUB 字級，且章節工具列找不到「閱讀版面」入口。

Green／acceptance phase：目標測試 16/16 passed；Server Vitest 3/3 passed；
Desktop Vitest 198/198 passed；Electron Playwright 2/2 passed；全專案 typecheck、
production build 與 `git diff --check` passed。

### Hypotheses and Decisions

- 使用者確認三項偏好全域共用；紙張寬度代表整張閱讀紙張，不是紙內文字欄寬。
- 紙張寬度採 20px 步進，包含規格要求的 560、760、900 與 960px；Main process
  與舊檔載入使用相同步進規則。
- 閱讀版面面板是工具列內的非模態 popover；變更立即成為目前偏好，因此關閉面板
  不回復先前值。
- 首次 Electron E2E 在受限沙盒內於 process launch 前失敗；相同命令取得桌面
  執行權限後成功啟動，確認是 GUI 沙盒限制，沒有修改產品碼或弱化測試。
- E2E 首次啟動後量到標題行高 45px，而測試先假設 30px。除錯假說依序檢查
  `h2` 相對字級、正文行距滲入、selector 未命中與 Chromium 預設差異；新增
  36px 標題字級斷言後確認 36px × 1.25 = 45px，正文 2.2 倍行距沒有滲入標題。

### Deferred Items

- 字型選擇、背景／主題、段落間距、文字對齊、獨立頁邊距、每本書偏好與跨裝置
  同步維持 non-goal。
- Electron E2E 仍未自動操作原生檔案選擇器導入真實 EPUB；閱讀版面面板的完整
  互動由 React 行為測試覆蓋，Electron E2E 覆蓋 Main 保存、重載與實際 CSS 計算。

### Architectural Notes

- `App.tsx` 目前集中協調閱讀、對話、設定與多個浮層狀態；本功能先沿用既有設定
  邊界，但若後續再增加閱讀外觀選項，應另立 RXX 評估抽出閱讀設定元件與狀態。
- 本功能未新增另一套偏好 store 或 IPC，也未發現會阻擋交付的責任邊界問題。

### Notification

- `ddd-email-notify`: skipped-not-configured
- From: —
- To: —
- Reason: `documents/ddd-email-notify.md` 仍是 placeholder，沒有可驗證的寄件與
  收件地址。

## Appendix: TDD Implementation Checklist

1. 先為共享設定契約、store、IPC 與 Renderer 互動新增失敗測試。
2. 擴充全域設定契約與逐欄舊版相容。
3. 實作閱讀版面面板、三項 CSS custom properties 及恢復預設。
4. 驗證即時預覽、面板可及性、紙張對齊、全域保存與無效值拒絕。
5. 執行 Desktop 目標測試、全套測試、typecheck、build 與 Electron E2E。
6. 更新本文件 Implementation Record 及 `documents/modules/book-library.md`。
