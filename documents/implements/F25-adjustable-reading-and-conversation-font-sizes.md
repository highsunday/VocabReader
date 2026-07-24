---
author: Codex
date: 2026-07-24
title: 新增 AI 對話與電子書內文字體大小設定
uuid: 4cf965c7d7914ca79ff08506483e8a62
version: 1.2.0
status: implemented
superseded_in_part_by: F26-reading-layout-settings
---

# Feature Specification - AI 對話與電子書內文字體大小設定

## 1. Feature Overview

目前 **AI 對話面板**的訊息正文固定為 13px，章節閱讀頁的 EPUB 內文固定為
19px。不同螢幕、閱讀距離與視力需求的使用者無法調整這兩個主要閱讀區域，容易造成
閱讀負擔。

本功能在既有「設定」視窗新增兩個彼此獨立的全域字體大小滑桿。調整時畫面立即反映
新大小，設定也會保存至本機，重新開啟應用程式後繼續沿用。既有使用者未曾設定時，
視覺維持目前的 13px 與 19px。

> 2026-07-24 現況：F26 保留這裡建立的電子書字級偏好與 16–32px 範圍，但把
> 電子書字級入口移至章節工具列的「閱讀版面」面板，並加入紙張寬度與行距；一般
> 設定視窗目前只保留 AI 對話字級。

## 2. Requirements (User Story)

- **As a** 使用電子書閱讀與 AI 輔助學習的讀者
- **I want** 分別調整 AI 對話訊息與電子書章節內文的文字大小
- **So that** 我可以依螢幕與閱讀需求維持舒適、清楚的閱讀體驗

## 3. Acceptance Criteria

- **Scenario 1：調整 AI 對話文字大小**
  - **Given** 使用者開啟設定視窗
  - **When** 使用者在 12–24px 範圍調整「AI 對話文字大小」
  - **Then** 設定旁顯示目前 px 數值
  - **And** 使用者訊息與 AI 回覆的正文立即套用新大小
  - **And** AI 訊息內區段練習試卷的題名、重點、題目、選項、問答輸入、
    批改回饋與總結同步套用新大小
  - **And** AI 對話面板的工具列、模型選擇與輸入框不受影響
  - **And** 試卷的進度、題號、CEFR、按鈕與其他操作標籤維持原大小

- **Scenario 2：調整電子書內文字大小**
  - **Given** 使用者已開啟一個章節
  - **When** 使用者在 16–32px 範圍調整「電子書內文字大小」
  - **Then** 設定旁顯示目前 px 數值
  - **And** EPUB 章節內文立即套用新大小
  - **And** 章節標題等以內文相對大小呈現的 EPUB 內容隨之縮放
  - **And** 閱讀工具列、範圍標籤與其他應用程式介面文字不受影響

- **Scenario 3：保存並恢復字體大小**
  - **Given** 使用者選擇了有效的兩項字體大小
  - **When** 使用者重新開啟應用程式
  - **Then** AI 對話與電子書內文恢復上次保存的大小
  - **And** 講解語言設定維持原值

- **Scenario 4：舊版或無效設定安全降級**
  - **Given** 本機設定檔缺少新欄位、欄位超出範圍或不是整數
  - **When** 應用程式載入設定
  - **Then** AI 對話文字大小使用 13px
  - **And** 電子書內文字大小使用 19px
  - **And** 其他有效設定欄位仍可獨立載入

- **Scenario 5：只接受完整且受限的設定資料**
  - **Given** Renderer 透過設定 bridge 保存偏好
  - **When** 任一字體值不是允許範圍內的整數
  - **Then** Main process 拒絕保存
  - **And** 不把無效資料寫入本機設定檔

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | AI 對話滑桿 | 設定視窗已開啟 | 調整 AI 對話文字至 18px | 數值顯示 18px，訊息正文與試卷可閱讀內容立即依 18px 基準縮放 | Critical |
| TC2 | 電子書滑桿 | 章節與設定視窗已開啟 | 調整電子書內文至 24px | 數值顯示 24px，章節內容立即使用 24px | Critical |
| TC3 | 設定保存 | 三項全域偏好皆有效 | 保存並以新 store 載入 | 講解語言與兩個字體大小完全一致 | High |
| TC4 | 舊設定相容 | 設定檔只有講解語言 | 載入設定 | 語言保留，兩個字體大小採 13px／19px | High |
| TC5 | 欄位獨立降級 | 只有一個字體欄位無效 | 載入設定 | 無效欄位採預設，其他有效欄位保留 | High |
| TC6 | IPC 範圍驗證 | 設定 bridge 已註冊 | 保存小於、超過範圍或非整數值 | 拒絕保存且 store 未被呼叫 | Critical |
| TC7 | 既有預設視覺 | 尚無本機設定 | 啟動應用程式 | AI 對話為 13px、電子書內文為 19px | Medium |

## 5. Implementation Notes

- 擴充 `AppSettings`，加入 `aiConversationFontSize` 與
  `ebookContentFontSize`；Main、Preload 與 Renderer 繼續共用同一份窄型別契約。
- AI 對話允許 12–24px；電子書內文允許 16–32px；兩者只接受整數。
- `LocalSettingsStore` 逐欄驗證與降級，讓既有只含 `explanationLanguage` 的
  `settings.json` 可以無痛升級，也避免單一損壞欄位清除其他有效偏好。
- Renderer 以 CSS custom properties 把設定套用至 `.message-content` 與
  `.chapter-content`，限制影響範圍，不修改 EPUB HTML。
- 區段練習試卷以相同 `--ai-conversation-font-size` 作為正文基準；題名與小節標題
  保留相對層級，試題、選項、輸入及批改內容使用相對單位，進度與控制標籤維持固定值。
- 滑桿變更立即更新 Renderer 狀態並在短暫 debounce 後保存，避免拖曳過程對同一
  暫存設定檔產生大量競爭寫入。

## 6. Assumptions and Non-goals

- 兩項設定都是全域應用程式偏好，不按書籍、章節或 AI 對話分開保存。
- 「AI 對話文字」包含使用者訊息、AI 回覆正文，以及 AI 訊息內區段練習試卷的
  可閱讀內容；也包含正文內依相對單位呈現的 Markdown 元素。不包含提問框、快捷
  操作、模型選擇、歷史清單，或試卷的進度、題號、CEFR 與操作按鈕。
- 「電子書內文」只指 EPUB 章節內容；不包含書籍總覽、閱讀工具列、標記工具、
  START／END 範圍標籤或設定視窗。
- 不新增字型、行高、主題、每本書偏好、重設全部設定或跨裝置同步。
- 不回寫或改造 EPUB 原始內容。

## 7. Implementation Record

### Status

Implemented

### Implementation Summary

- `AppSettings` 現在包含講解語言、AI 對話文字大小及電子書內文字大小。
- 設定視窗加入兩個具可見 px 數值的原生 range 滑桿；調整時立即更新畫面，
  180ms debounce 後透過既有 settings bridge 保存。
- AI 對話滑桿限制於 12–24px，預設 13px；套用至 user／assistant 的
  `.message-content` 及區段練習試卷可閱讀內容。Markdown 與試卷題名、小節標題、
  題目、選項、問答輸入、批改及總結使用相對字級隨正文縮放。
- 試卷的進度、題號、CEFR、操作按鈕與狀態標籤維持固定尺寸，避免大字體破壞窄欄控制。
- 電子書滑桿限制於 16–32px，預設 19px；只套用至 `.chapter-content`，EPUB
  章節內的相對排版隨正文縮放。
- `LocalSettingsStore` 逐欄驗證舊設定；缺少或無效的新欄位獨立回到預設，不會清除
  有效講解語言或另一個有效字體值。
- 設定保存維持 `.next` 原子替換並加入 instance 內串行寫入，避免快速設定操作競爭
  同一暫存檔。
- Main process 只接受完整、合法 enum 且兩個字體值皆為範圍內整數的設定。

### Test Coverage

- TC1、TC2、TC7：`App.test.tsx` 的
  `previews and saves independent conversation and ebook font sizes` 驗證兩個滑桿的
  名稱、範圍、預設值、可見 px 數值、即時 CSS variables 與完整設定保存。
- TC3、TC4、TC5：`settings-store.test.ts` 驗證完整保存／載入、舊版只含語言的
  設定，以及單一無效欄位獨立降級。
- TC6：`settings-ipc.test.ts` 驗證完整設定路由，並拒絕未知語言、兩個範圍的上下界
  外數值及非整數。
- Electron E2E 驗證兩個實際滑桿、訊息／電子書 computed font-size 18px／24px、
  試卷題名 24.84px、題目 19.44px、選項與輸入 18px、批改內容 16.56px，以及從
  Main process 重新讀取的持久設定。

### Changed Files

#### Production code

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/env.d.ts`

#### Test code

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `documents/implements/F25-adjustable-reading-and-conversation-font-sizes.md`
- `documents/modules/annotation.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/book-library.md`
- `documents/modules/reading-comprehension-quiz.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 調整 AI 對話文字大小 | Pass | Renderer 行為測試與訊息／試卷 Electron computed style 驗證 |
| 調整電子書內文字大小 | Pass | Renderer 行為測試與 Electron computed style 驗證 |
| 保存並恢復字體大小 | Pass | Store 重建載入測試與 Electron settings.get 驗證 |
| 舊版或無效設定安全降級 | Pass | Store 舊檔及逐欄無效資料測試 |
| 只接受完整且受限的設定資料 | Pass | IPC enum、上下界與整數參數化測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 對話滑桿 12–24px、18px 預覽、保存、訊息及試卷內容 computed style |
| TC2 | Pass | 電子書滑桿 16–32px、24px 預覽、保存及 computed style |
| TC3 | Pass | `LocalSettingsStore` 完整保存後以新 instance 載入 |
| TC4 | Pass | 只有 `explanationLanguage` 的舊設定載入 |
| TC5 | Pass | 18.5px 對話值降級但有效 28px 電子書值保留 |
| TC6 | Pass | IPC 拒絕未知語言、11／25px、15／33px 與 32.5px |
| TC7 | Pass | Renderer 與 Store 預設為 13px／19px |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/settings-store.test.ts src/main/settings-ipc.test.ts src/renderer/App.test.tsx -t 'defaults all preferences|loads and saves the restricted application preferences|rejects invalid settings|previews and saves independent'
npm run test -w @reader/desktop -- src/main/settings-store.test.ts src/main/settings-ipc.test.ts src/renderer/App.test.tsx -t 'defaults all preferences|loads and saves the restricted application preferences|rejects invalid settings|previews and saves independent|uses the selected explanation language'
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop
npm run test:e2e -w @reader/desktop
npm run test:e2e -w @reader/desktop -- --grep 'launches the secure Electron reading shell'
npm test
npm run typecheck
npm run build
git diff --check
```

Red phase：目標測試 6 項如預期失敗。Store 只回傳
`{ explanationLanguage: "source" }`；IPC 丟棄兩個字體欄位且未拒絕越界值；
Renderer 找不到「AI 對話文字大小」滑桿。

1.1 Red phase：AI 對話 CSS variable 已為 18px，但 Electron computed style 顯示
試卷題名、題目、選項、問答輸入與批改內容仍分別固定為
18px、14px、13px、16px、12px，未隨設定放大。

Green／acceptance phase：目標測試 7/7 passed；Desktop Vitest 191/191 passed；
Server Vitest 3/3 passed；Electron Playwright 2/2 passed；全專案 typecheck、
production build 與 `git diff --check` passed。

### Hypotheses and Decisions

- 使用者確認採用原生滑桿、12–24px／16–32px 範圍與既有 13px／19px 預設。
- 字體偏好是全域設定，不加入 `LibraryBook` 或單一 `AI Conversation` 資料。
- CSS custom properties 放在 `.workspace`，實際 selector 限定於訊息正文與 EPUB
  章節內容，以免放大工具列及其他應用程式介面。
- 使用者追加確認試卷英文也必須放大；實作將同一 CSS variable 傳入試卷根節點，
  可閱讀內容改用相對單位，不依語言偵測，因此中文或其他講解語言也取得一致可讀性。
- 1.1 E2E 首次執行先遇到 F23 已記錄的生詞庫 sticky toolbar 2px 時序波動；
  原樣重跑即越過該斷言並命中新試卷字體紅燈，最終完整 E2E 2/2 passed。沒有修改
  或放寬既有 sticky toolbar 斷言。
- 第一次 Electron E2E 在受限執行沙盒中兩個案例都於 process launch 前失敗。
  診斷假說依序為 GUI 沙盒限制、Electron binary 權限／架構、Main process 崩潰、
  Playwright 暫存或設定異常。相同命令取得桌面執行權限後立即 2/2 passed，
  確認根因是測試環境禁止啟動 GUI；沒有修改產品碼或弱化測試。

### Deferred Items

- 不提供字型、行高、主題、重設按鈕、試卷獨立字體、每本書／每筆對話偏好或跨裝置同步。

### Notes

- 這次擴充再次經過 `App.tsx` 的集中式設定、閱讀與對話協調邊界；它是既有模組文件
  已記錄的架構技術債，後續設定繼續增加時適合另立 RXX 拆分 settings UI／state。
- 本功能沒有新增另一套設定儲存或 IPC；沿用並強化既有全域設定邊界。

### Notification

- `ddd-email-notify`: skipped-not-configured
- From: —
- To: —
- Reason: `documents/ddd-email-notify.md` 仍是 placeholder，未設定可驗證的寄件與收件地址。

## Appendix: TDD Implementation Checklist

1. 先新增 store、IPC 與 Renderer 的失敗測試。
2. 擴充共享設定契約及逐欄驗證。
3. 完成設定載入、保存與舊檔相容。
4. 加入兩個滑桿、即時樣式與 debounce 保存。
5. 執行目標測試、Desktop 全套測試、typecheck、build 與 diff 檢查。
6. 同步本文件的實作紀錄及相關模組文件。
