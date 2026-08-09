---
author: Codex
date: 2026-08-09
title: 朗讀章節原文的暫時選取內容
uuid: 5a93b3a1-0f5e-4cc0-9408-7634db5d5a43
version: 1.1.0
status: implemented
---

# Feature Specification - 朗讀章節原文的暫時選取內容

## 1. Feature Overview

使用者閱讀英文 EPUB 時，除了查詢單字，也需要聽見完整句子或連續段落的發音、節奏與
語調。目前章節原文的文字選取只服務於**標記**及範圍功能選單，無法直接播放選取內容。

本功能新增**選取朗讀**：使用者選取章節原文中的非空白文字後，可從選取範圍附近的
懸浮操作或既有右鍵功能選單開始朗讀。播放使用裝置提供的英文語音，不把原文送往 AI
或其他外部服務，也不保存選取內容。功能可朗讀單字、完整句子或跨文字節點的連續段落，
並與既有標記模式共存。

## 2. Requirements (User Story)

- **As a** 閱讀英文原文的語言學習者
- **I want** 選取單字、句子或段落後直接播放其英文發音
- **So that** 我能在閱讀當下聽見原文的發音、節奏與語調，而不必把文字複製到其他工具

## 3. Confirmed Product Rules

### 3.1 兩個播放入口

- 章節原文有非空白選取時，在選取範圍附近顯示小型 `Pronounce` 懸浮按鈕。
- 對同一選取開啟既有右鍵功能選單時，顯示 `Pronounce selection` 選單項目。
- 空白選取、章節外選取或沒有選取時，不顯示這兩個選取朗讀入口。
- 入口只使用暫存選取本文；不建立持久資料，也不擴張 AI 可讀的閱讀區段。

### 3.2 播放規則

- 使用 Web Speech API 及裝置可用的第一個英文 voice；沒有英文 voice 時以 `en-US`
  語言提示交由裝置選擇預設 voice。
- 語速為 `0.85`、pitch 為 `1`，與既有學習項目英文發音的學習速度一致。
- 開始新朗讀前先停止上一段播放；朗讀中的懸浮按鈕改為 `Stop pronunciation`，再次按下
  只停止目前播放。
- 播放自然結束、發生錯誤、切換章節或離開閱讀頁時，清除播放中狀態並停止裝置語音。
- 裝置不支援語音或播放失敗時，提供可辨識但不阻斷閱讀的狀態訊息。

### 3.3 與文字選取及標記共存

- 一般模式選取文字後，懸浮操作保持可用；使用者點擊按鈕時不得因瀏覽器 Selection
  先消失而失去待播放文字。
- 標記模式仍在選取後自動建立標記並清除瀏覽器 Selection，但 Renderer 暫存剛選取的
  本文與位置，使 `Pronounce` 懸浮按鈕仍可朗讀同一內容。
- 選取朗讀不新增、移除或修改標記，也不改變 START／END 範圍標籤。
- 右鍵選單保留 Move start、Move end、Annotate selection 與 Remove annotation 的既有
  行為；新增朗讀項目不改變其他操作條件。

## 4. Acceptance Criteria

- **Scenario 1：從懸浮操作朗讀句子或段落**
  - **Given** 使用者位於章節閱讀頁且裝置支援語音
  - **When** 使用者選取非空白原文並點擊選取範圍附近的 Pronounce
  - **Then** 系統以英文 voice、`0.85` rate、`1` pitch 朗讀完整選取文字
  - **And** 不保存選取內容、不建立標記、不改變閱讀區段

- **Scenario 2：從右鍵功能選單朗讀**
  - **Given** 使用者已選取章節原文並打開既有右鍵功能選單
  - **When** 使用者選擇 Pronounce selection
  - **Then** 系統朗讀相同的完整選取文字
  - **And** 既有範圍與標記選單項目仍依原規則可用

- **Scenario 3：停止及取代播放**
  - **Given** 一段選取原文正在朗讀
  - **When** 使用者按下 Stop pronunciation
  - **Then** 目前語音立即停止且播放中狀態結束
  - **When** 使用者改選另一段並開始朗讀
  - **Then** 系統先停止舊播放，再只朗讀新的選取內容

- **Scenario 4：標記模式仍可朗讀剛選取的文字**
  - **Given** 標記模式已開啟
  - **When** 使用者選取一段有效原文
  - **Then** 系統照常建立標記
  - **And** Pronounce 懸浮按鈕仍保留並可朗讀剛才選取的完整文字

- **Scenario 5：無效選取與語音失敗安全降級**
  - **Given** 選取為空白、位於章節外，或裝置不支援／無法播放語音
  - **When** Renderer 處理選取或使用者嘗試朗讀
  - **Then** 無效選取不出現朗讀入口
  - **And** 語音失敗顯示非阻斷狀態，閱讀、標記及範圍操作仍可繼續

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 懸浮按鈕朗讀完整選取 | 章節內跨文字節點的有效選取 | 點擊 Pronounce | `speak` 收到完整本文、英文 voice、rate 0.85、pitch 1 | Critical |
| TC2 | 右鍵選單朗讀 | 章節內有效選取 | 開啟選單並選 Pronounce selection | 播放相同本文；既有選單項目仍存在 | Critical |
| TC3 | 停止播放 | utterance 尚未結束 | 點擊 Stop pronunciation | `cancel` 被呼叫且按鈕回到非播放狀態 | Critical |
| TC4 | 新播放取代舊播放 | 第一段正在播放 | 選取第二段並播放 | 先 cancel，再 speak 第二段；舊 callback 不覆寫新狀態 | High |
| TC5 | 標記模式共存 | 標記模式開啟且選取有效 | 完成 mouseup 後點 Pronounce | 標記照常保存；即使 DOM Selection 清除仍朗讀剛選文字 | Critical |
| TC6 | 選取入口生命週期 | 有效選取懸浮操作可見 | 點擊章節外、切章或離開閱讀頁 | 懸浮操作關閉；切換時取消播放 | High |
| TC7 | 無效選取 | 空白、章節外或 collapsed selection | 完成選取／開啟右鍵 | 不顯示 Pronounce 入口、不呼叫 speak | High |
| TC8 | 裝置語音不可用或錯誤 | 缺少 Web Speech API 或 utterance error | 嘗試播放 | 顯示非阻斷狀態；閱讀工具維持可用 | High |

## 6. Implementation Notes

- 在 Renderer 以暫態 selection speech state 保存本文及懸浮位置；不得加入書庫、IPC、
  備份或 AI context。
- 沿用 `annotationRangeFromSelection()` 驗證選取屬於目前章節並取得已去除邊界空白的
  完整本文，避免朗讀章節外或純空白內容。
- 懸浮位置取自 Selection Range 的 viewport rect，並限制在可視範圍內；點擊操作時保留
  已暫存本文，不依賴當下仍存在的 DOM Selection。
- 播放 request 使用遞增識別避免舊 utterance 的 `onend`／`onerror` 清除新播放狀態。
- 此功能先在 `App.tsx` 的既有閱讀選取協調區完成，不新增 main process 或 server 邊界。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`（視覺與 production 回歸）

### Documentation

- `CONTEXT.md`
- `documents/implements/F56-speak-selected-reader-text.md`
- `documents/modules/annotation.md`

## 8. Assumptions and Non-goals

### Assumptions

- 產品目標與目前章節閱讀內容以英文為主，因此第一版固定優先選擇英文裝置 voice。
- 使用者要求的「整段」是目前章節 DOM 中一次連續選取的完整文字，不是 START／END
  定義的閱讀區段，也不代表整章。
- 懸浮按鈕與右鍵選單是同一暫態選取朗讀能力的兩個入口。

### Non-goals

- 不下載、生成或快取雲端音訊，不呼叫 AI 或外部 TTS 服務。
- 不加入 voice、口音、語速或 pitch 設定。
- 不提供逐字高亮、句子切分、播放進度、暫停後續播或音訊檔匯出。
- 不保存朗讀歷史、選取文字或播放位置。
- 不朗讀 AI 對話、生詞庫、測驗或其他非章節原文區域。

### Open Questions

- 無阻擋實作的未決問題。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-09.

### Implementation Summary

- Renderer 在章節 mouseup 後沿用既有 selection offset 驗證，暫存完整本文及 Range viewport
  位置，並顯示含 Volume 圖示的 Pronounce 懸浮膠囊。
- 既有右鍵功能選單在有效選取時新增 Pronounce selection，同時保留 Move start、Move end、
  Annotate selection 及 Remove annotation 的原有條件與行為。
- Web Speech 播放優先使用第一個英文 voice，固定 rate `0.85`、pitch `1`；開始新朗讀前
  cancel 舊播放，朗讀同一選取時按鈕切換成 Stop。
- request revision 讓舊 utterance callback 無法清除較新的播放狀態；切章、離開閱讀頁及
  unmount 會取消仍在播放的語音並清除暫態選取。
- 標記模式的 mouseup 流程先保存暫態朗讀本文，再沿用既有自動標記；即使建立標記清除
  DOM Selection，使用者仍可朗讀剛才選取的內容。
- API 缺失或播放 error 顯示鄰近懸浮操作的非阻斷狀態，不影響標記及範圍工具。
- 沒有新增書庫欄位、IPC、preload API、main process、server、AI context 或備份資料。

### Test Coverage

| Test | Covered scenarios |
|---|---|
| `speaks the complete reader selection from the floating pronunciation action` | TC1：跨 inline 節點完整本文、位置、英文 voice、rate／pitch、無持久化副作用 |
| `speaks the reader selection from the existing right-click menu` | TC2：右鍵朗讀及既有選單項目回歸 |
| `stops the current selection speech and replaces it when a new selection plays` | TC3、TC4：停止、取代、cancel 順序及舊 callback 隔離 |
| `keeps selection speech available after annotation mode clears the DOM selection` | TC5：自動標記與 Selection 清除後仍可朗讀 |
| `dismisses selection speech controls and cancels playback when leaving the chapter` | TC6：點外關閉、切章取消與暫態狀態清理 |
| `does not offer selection speech for whitespace or a missing reader selection` | TC7：空白及缺少 Selection 不出現入口 |
| `reports unsupported and failed selection speech without blocking reading tools` | TC8：API 缺失與 utterance error 安全降級 |
| Electron `launches the secure Electron reading shell` | production CSS 的 fixed 層級、尺寸、圓角及 reduced-motion |

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F56-speak-selected-reader-text.md`
- `documents/modules/annotation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 從懸浮操作朗讀句子或段落 | Pass | TC1 驗證完整跨節點本文、英文 voice 參數及零持久化 mutation |
| 從右鍵功能選單朗讀 | Pass | TC2 驗證相同本文與既有範圍／標記操作並存 |
| 停止及取代播放 | Pass | TC3、TC4 驗證 cancel、第二段播放與 callback revision |
| 標記模式仍可朗讀剛選取的文字 | Pass | TC5 驗證標記保存、DOM Selection 清除及後續朗讀 |
| 無效選取與語音失敗安全降級 | Pass | TC7、TC8 驗證不顯示入口、API 缺失、error 狀態與工具維持可用 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | floating pronunciation component test |
| TC2 | Pass | right-click pronunciation component test |
| TC3 | Pass | stop／replace component test 的 Stop 分支 |
| TC4 | Pass | stop／replace component test 的新選取與 stale callback 分支 |
| TC5 | Pass | annotation mode coexistence component test |
| TC6 | Pass | dismissal and chapter lifecycle component test |
| TC7 | Pass | invalid／missing selection component test |
| TC8 | Pass | unsupported／utterance error component test |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "speaks the complete reader selection from the floating pronunciation action"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "speaks the complete|speaks the reader selection|stops the current selection|keeps selection speech"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "selection speech|speaks the complete reader|speaks the reader selection|stops the current selection|reports unsupported"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx
npm run test -w @reader/desktop
npm run build -w @reader/desktop
npm run typecheck
npm run test:e2e -w @reader/desktop
git diff --check
```

### Test Results

- 初始 red：找不到 `Pronounce selected text` 按鈕，1 個目標測試依功能尚未存在的正確原因
  失敗。
- 聚焦選取朗讀：7/7 passed。
- `App.test.tsx`：83/83 passed。
- Desktop Vitest：39 files、410/410 passed。
- Server／Desktop TypeScript typecheck：passed。
- Desktop production build：passed；既有 Vite chunk-size warning 不影響輸出。
- Electron Playwright：2/2 passed。
- `git diff --check`：passed。

### Hypotheses and Decisions

1. `annotationRangeFromSelection()` 已是章節內 Selection 驗證與邊界空白正規化的可靠接縫，
   選取朗讀沿用它可避免建立第二套章節邊界判定。
2. 標記模式會清除 DOM Selection，因此播放本文必須先保存為 Renderer 暫態 state；這同時
   讓使用者點擊懸浮按鈕時不依賴瀏覽器是否仍保留視覺選取。
3. 只以 `isSpeaking` boolean 無法區分「舊內容仍在播放、但使用者已改選新內容」；實作
   保存正在播放的本文，使新選取的按鈕顯示 Pronounce，點擊即 cancel 舊播放並播放新內容。
4. App 已知同時協調閱讀範圍、標記、AI 對話與設定；本次也加入選取朗讀暫態協調。既有
   模組文件已標示未來宜以 RXX 拆分，但本功能的既有 selection 與生命週期接縫足夠，未在
   F56 中擴大重構。

### Deferred Items

- voice／口音／語速／pitch 設定。
- 逐字高亮、句子切分、播放進度、暫停後續播、朗讀歷史及音訊匯出。
- AI 對話、生詞庫、測驗等非章節原文區域的選取朗讀。

### Notes

- 工作樹在本功能開始前已有未追蹤的舊版 icon 資產；F56 未修改或刪除這些檔案。
- production build 保留專案既有的單一 renderer chunk 大於 500 kB 警告；本功能未新增套件，
  與警告的既有 code-splitting 技術債範圍無關。

## Appendix: TDD Implementation Checklist

1. 先新增懸浮入口、右鍵入口、停止／取代與標記模式共存的 failing component tests。
2. 完成最小 selection speech state 與 Web Speech 播放控制，使目標測試轉綠。
3. 補上無效選取、API 缺失、錯誤 callback 與生命週期回歸測試。
4. 執行 Desktop Renderer suite、完整 Desktop tests、typecheck、build 與必要 E2E。
5. 回填 Implementation Record，並同步 `documents/modules/annotation.md`。
