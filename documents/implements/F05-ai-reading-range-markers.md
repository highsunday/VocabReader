---
author: Codex
date: 2026-07-21
title: 以章內範圍標籤限制 AI 可讀內文
uuid: d46f7fcdd0414cf09edafbbde6877d63
version: 1.1.0
status: implemented
---

# Feature Specification - AI 閱讀範圍標籤

## 1. Feature Overview

在章節閱讀內容左側提供一對小型書籤式範圍標籤，讓使用者以拖曳或目前行的功能選單界定一段連續原文。AI 進行區段解析、根據標記產生說明或產生區段選擇題時，只能取得兩個標籤之間的閱讀區段，不得讀取同章其他內容。

這項功能解決長章節可能跨越多天閱讀，而整章送給 AI 會涵蓋尚未閱讀內容的問題。範圍標籤是簡單的 AI 上下文選取工具；除明確觸發的自動推進外，不負責管理標記、保存學習歷史或判定章節完成。

## 2. Requirements (User Story)

- **As a** 分段閱讀英文 EPUB 的使用者
- **I want** 用章節左側的一對範圍標籤選取目前讀到的連續內文
- **So that** AI 只能根據我已選取的短範圍產生說明與選擇題，不會讀取尚未閱讀的內容

## 3. Acceptance Criteria

- **Scenario 1：每章唯一一對範圍標籤**
  - **Given** 使用者開啟任一章節
  - **When** 章節內容完成載入
  - **Then** 閱讀內容左側顯示一個起點標籤與一個終點標籤，且同一章不提供第二組標籤

- **Scenario 2：首次開啟時建立短範圍**
  - **Given** 此章尚未保存範圍標籤位置
  - **When** 使用者首次開啟此章
  - **Then** 起點位於第一個可閱讀文字位置，終點位於累計約 800 個英文單字後的第一個可用內容邊界；若章節不足 800 個單字，終點位於章末

- **Scenario 3：拖曳調整標籤**
  - **Given** 章節已顯示起點與終點標籤
  - **When** 使用者把任一標籤拖到章內另一個可閱讀文字位置
  - **Then** 對應邊界更新到該位置，另一個標籤維持不變，且系統不允許起點越過終點或終點越過起點

- **Scenario 4：從目前行更新標籤位置**
  - **Given** 使用者在章節某一行開啟功能選單
  - **When** 使用者選擇「將起點移到這裡」或「將終點移到這裡」
  - **Then** 對應標籤移到該行所代表的穩定原文位置；若移動會造成起點與終點順序顛倒，操作不可套用

- **Scenario 5：標籤不得跨章節**
  - **Given** 使用者正在閱讀目前章節
  - **When** 使用者拖曳標籤或從功能選單更新位置
  - **Then** 可選位置只限目前章節，標籤不能移入上一章或下一章

- **Scenario 6：每章分別保存並恢復位置**
  - **Given** 使用者已在兩個不同章節調整各自的範圍標籤
  - **When** 使用者切換章節、切換書籍或重新啟動應用程式後再次開啟其中一章
  - **Then** 系統恢復該章自己的一對標籤位置，不重新套用首次開啟的估算，也不使用另一章的位置

- **Scenario 7：排版改變後維持原文位置**
  - **Given** 某章已保存一對範圍標籤
  - **When** 視窗寬度、字級或行距改變而使文字重新換行
  - **Then** 兩個標籤仍對應原本的原文位置，而不是固定畫面座標、頁碼或捲動百分比

- **Scenario 8：限制 AI 可讀範圍**
  - **Given** 章節中只有部分內容位於起點與終點標籤之間
  - **When** 系統為區段解析、標記說明或區段練習組裝 AI 上下文
  - **Then** 上下文只包含閱讀區段內的原文與區段內標記，不包含起點之前或終點之後的同章內容

- **Scenario 9：一般 AI 操作不推進標籤**
  - **Given** 使用者已設定目前閱讀區段
  - **When** 使用者要求 AI 說明、產生題目或繼續提問
  - **Then** 起點與終點標籤維持原位

- **Scenario 10：明確操作後自動推進**
  - **Given** 目前閱讀區段尚未到達章末
  - **When** 使用者執行「完成這段，前往下一段」
  - **Then** 起點移到舊終點之後的第一個可閱讀位置，終點依舊區段約略字數向後移到可用內容邊界，且使用者仍可手動調整新位置

- **Scenario 11：自動推進停在章末**
  - **Given** 舊終點之後的剩餘內容短於舊閱讀區段
  - **When** 使用者執行「完成這段，前往下一段」
  - **Then** 新範圍只包含本章剩餘內容，終點停在章末，不自動切換或延伸到下一章

- **Scenario 12：調整與推進不改動標記**
  - **Given** 章節中已存在使用者標記
  - **When** 使用者調整範圍標籤或自動推進到下一段
  - **Then** 既有標記不移動、不刪除，只有之後送給 AI 的上下文篩選結果改變

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 唯一標籤組 | 章節內容已載入 | 檢視閱讀頁 | 左側只有一個起點與一個終點標籤 | High |
| TC2 | 長章首次初始化 | 尚無已存位置且章節超過 800 個單字 | 首次開章 | 起點在首個文字位置，終點在約 800 字後的內容邊界 | High |
| TC3 | 短章首次初始化 | 尚無已存位置且章節少於 800 個單字 | 首次開章 | 終點位於章末 | High |
| TC4 | 拖曳起點 | 已顯示有效範圍 | 拖曳起點到終點之前的新位置 | 只更新起點 | High |
| TC5 | 拒絕交叉 | 已顯示有效範圍 | 嘗試把任一標籤移過另一標籤 | 維持有效順序且不套用無效位置 | High |
| TC6 | 功能選單更新 | 在章內某行開啟功能選單 | 選擇更新起點或終點 | 對應標籤定位到該行原文位置 | High |
| TC7 | 防止跨章 | 目前章節前後皆有章節 | 調整標籤 | 可選位置始終限制在目前章節 | High |
| TC8 | 分章保存 | 兩章各自調整過標籤 | 反覆切換章節 | 各章恢復自己的標籤位置 | High |
| TC9 | 跨次啟動恢復 | 標籤位置已保存 | 重新啟動後開章 | 恢復相同原文邊界 | High |
| TC10 | 文字重新換行 | 標籤位置已保存 | 改變閱讀區寬度或字級 | 標籤仍錨定相同原文位置 | High |
| TC11 | AI 上下文裁切 | 起點前、範圍內、終點後皆有文字與標記 | 組裝 AI 請求 | 只輸出範圍內原文與標記 | Critical |
| TC12 | AI 操作不推進 | 已設定有效範圍 | 說明、出題或追問 | 標籤位置不變 | High |
| TC13 | 按鈕觸發推進 | 章內仍有足夠後續內容 | 點擊「完成這段，前往下一段」 | 產生相鄰的新範圍且約略保持原字數 | High |
| TC14 | 章末推進 | 本章只剩少量內容 | 點擊推進按鈕 | 終點停在章末且不跨章 | High |
| TC15 | 標記獨立 | 章內已有標記 | 手動調整或自動推進 | 標記資料保持不變 | High |

## 5. Implementation Notes

- 目前章節以安全處理後的 HTML 放入 renderer；範圍定位不可依賴畫面頁碼、行號、像素座標或既有的 `scrollProgress`。保存格式應使用可在同一份章節原文重新排版後復原的文字位置描述。
- 拖曳命中的是使用者看到的行，但保存的是該行對應的原文位置；文字重新換行後，標籤應跟隨原文而不是停在舊畫面高度。
- 範圍起點與終點皆屬目前章節，且必須維持有序。輸入驗證應同時存在於 renderer 操作層與實際保存邊界。
- 每本書目前只保存一個最後閱讀位置；本功能需要增加以章節為鍵的範圍標籤狀態，不能用單一 `BookReadingState` 覆蓋所有章節。
- AI 功能尚未正式接入時，應先提供可獨立測試的「擷取目前閱讀區段」能力；未來所有區段解析、標記說明與區段練習請求必須共用這個裁切入口，避免各自繞過範圍限制。
- 「約 800 個英文單字」是首次初始化的內容量基準；圖片、純裝飾元素與無可讀文字的節點不計入。自動推進則以舊閱讀區段的約略可讀字數為目標。
- 「完成這段，前往下一段」是唯一的自動推進入口。AI 回覆完成、題目生成完成或送出追問都不得隱式推進。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 起點與終點均包含其所在的可讀文字位置；AI 上下文包含起點至終點之間的連續內容。
- 無效的交叉移動會被拒絕，不自動交換起點與終點角色。
- 使用者已確認每章只能有一對範圍標籤。
- 使用者已確認首次範圍約為 5–10 分鐘閱讀量，本文件以約 800 個英文單字作為可測試基準。
- 使用者已確認自動推進需由明確的「完成這段，前往下一段」操作觸發。

### Open Questions

- 範圍標籤與標記功能尚未實作；標記的精確資料格式應由後續標記功能文件定義，但不得改變本功能的 AI 範圍限制。
- Codex AI 執行層的正式整合介面尚未確認；本功能只要求所有相關 AI 請求共用同一個閱讀區段擷取結果。

### Non-goals

- 不支援同一章建立或命名多組範圍標籤。
- 不以 EPUB 頁碼、畫面頁數或捲動百分比作為範圍邊界。
- 不由範圍標籤保存已完成區段、AI 回覆、題目、答案或學習歷史。
- 不由範圍標籤建立、移動、刪除或重新分類使用者標記。
- 不由範圍標籤判定章節是否完成。
- 不因自動推進而自動切換到下一章。
- 不在此功能中實作完整的區段解析、選擇題生成或 Anki 式間隔複習。

## 7. Affected Modules and Files

- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/book-library.md`

## 8. Implementation Record

### Status

Implemented

### Implementation Summary

- 在章節原文左側加入唯一一對起點／終點範圍標籤，支援指標拖曳與目前行右鍵功能選單定位，並拒絕起終點交叉。
- 新增章內文字 offset 定位；標籤保存原文位置而非頁碼、像素或捲動比例，視窗重排時重新計算畫面位置。
- 沒有已存位置的章節以第一個可讀位置至約 800 個英文單字初始化，短章終點落在章末；每章位置獨立持久化並可跨次啟動恢復。
- 新增純函式閱讀區段裁切及推進能力；只有「完成這段，前往下一段」會以目前約略字數建立下一個相鄰範圍，一般訊息操作不推進。
- 以 memoized 章節原文元件隔離 `dangerouslySetInnerHTML`，標籤狀態更新不會重建 EPUB 內容 DOM 或中斷目前文字元素。
- 新增窄化的 `saveReadingRange` preload／IPC／service 路徑；main process 驗證書籍、章節、非負整數與起終點順序，並與其他狀態寫入共用序列佇列。

### Test Coverage

- `reading-range.test.ts`：TC2、TC3、TC11、TC13、TC14、TC15。
- `App.test.tsx`：TC1、TC4–TC7、TC10、TC12、TC13，並測試無效交叉移動。
- `library-service.test.ts`：TC8、TC9，以及未知章節與無效範圍拒絕。
- `library-ipc.test.ts`：閱讀區段 IPC 正常路徑與格式驗證。
- `desktop.spec.ts`：安全 preload bridge 暴露明確的 `saveReadingRange`，未暴露通用 Node 能力。

### Changed Files

#### Production Code

- `apps/desktop/src/shared/library-contracts.ts`
- `apps/desktop/src/main/library-service.ts`
- `apps/desktop/src/main/library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/reading-range.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/library-service.test.ts`
- `apps/desktop/src/main/library-ipc.test.ts`
- `apps/desktop/src/renderer/reading-range.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F05-ai-reading-range-markers.md`
- `documents/modules/book-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 每章唯一一對範圍標籤 | Pass | `shows exactly one start and one end range marker for the active chapter` |
| 首次開啟時建立短範圍 | Pass | `initializes a long chapter to the first 800 English words`; short-chapter test |
| 拖曳調整標籤 | Pass | `drags a marker to another readable block without crossing its pair` |
| 從目前行更新標籤位置 | Pass | `moves a range marker from the current line menu and persists it` |
| 標籤不得跨章節 | Pass | DOM 定位只接受目前 `articleRef` 的後代；service 驗證目前 chapterId |
| 每章分別保存並恢復位置 | Pass | `persists one independent reading range for each chapter` |
| 排版改變後維持原文位置 | Pass | `restores saved offsets and keeps them through layout changes` |
| 限制 AI 可讀範圍 | Pass | `extracts only the selected text and excludes both outside regions` |
| 一般 AI 操作不推進標籤 | Pass | `advances only from the explicit completion action and stops inside the chapter` |
| 明確操作後自動推進 | Pass | renderer 明確按鈕測試及純函式等字數推進測試 |
| 自動推進停在章末 | Pass | `stops at the chapter end when the remaining range is shorter` |
| 調整與推進不改動標記 | Pass | 範圍函式不接收或寫入標記資料；`does not mutate independent annotation data while advancing` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 唯一起點／終點 renderer 測試 |
| TC2 | Pass | 800 個英文單字初始化單元測試 |
| TC3 | Pass | 短章使用全文單元測試 |
| TC4 | Pass | 拖曳起點 renderer 測試 |
| TC5 | Pass | 拒絕交叉的目前行功能選單測試；service 無效範圍測試 |
| TC6 | Pass | 目前行功能選單定位 renderer 測試 |
| TC7 | Pass | 目前 article 後代限制及 unknown chapter service 測試 |
| TC8 | Pass | 每章獨立範圍持久化測試 |
| TC9 | Pass | 重新建立 LocalBookLibrary 後恢復測試 |
| TC10 | Pass | resize 後 offset 保持 renderer 測試 |
| TC11 | Pass | 嚴格裁切單元測試 |
| TC12 | Pass | 送出一般訊息不保存新範圍 renderer 測試 |
| TC13 | Pass | 明確按鈕及等字數推進測試 |
| TC14 | Pass | 剩餘內容縮短且終點等於章末測試 |
| TC15 | Pass | 範圍推進不改動獨立標記快照測試 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/reading-range.test.ts
npm run test -w @reader/desktop -- src/main/library-service.test.ts
npm run test -w @reader/desktop -- src/main/library-ipc.test.ts
npm run test -w @reader/desktop -- src/renderer/App.test.tsx
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：紅燈階段分別觀察到缺少閱讀區段模組、`saveReadingRange` service、IPC handler 及範圍標籤 UI；綠燈後 server 3/3、desktop 48/48、Electron E2E 2/2 通過，型別檢查與正式建置通過。

### Hypotheses and Decisions

- 互動綠燈初期，既有章節導覽測試取得的文字元素會在範圍初始化後脫離 DOM，右鍵與拖曳也無法命中目前行。
- 驗證過的假說包括：非同步書籍快照覆蓋閱讀狀態、初始化 effect 重跑、jsdom 缺少點位 API，以及 `dangerouslySetInnerHTML` 在父狀態更新後重建內容節點。
- 確認根因是章節原文與頻繁變動的範圍狀態位於同一 render 邊界，導致 EPUB 內容 DOM 被重建；修正為 memoized `ChapterArticle`，只有 ChapterContent 真正改變才重建原文。
- jsdom 沒有 `elementFromPoint`／caret point API；定位邏輯在產品環境優先使用 caret／point API，測試與不支援環境則回退到目前事件目標的文字位置。
- 文字 offset 是同一本已導入 EPUB 內穩定且簡單的定位方式；它不承諾在 EPUB 檔案內容被外部替換後遷移，但目前書籍內容以 SHA-256 識別且不會原地替換。
- 初次在 sandbox 執行 Electron E2E 因桌面程序無法啟動而失敗；允許 Electron 在 sandbox 外啟動後 2/2 通過，產品程式無需修改。

### Deferred Items

- 完整標記建立與編輯流程。
- Codex AI 執行層整合。
- 區段解析與區段選擇題的生成、呈現及作答流程。

### Notes

- F05 已提供未來 AI 功能必須共用的 `extractReadingSegment` 裁切入口，但目前 AI gateway 尚未連線，因此沒有發送任何書籍內容。
- E2E 目前驗證安全 bridge 與整體桌面啟動；真實 EPUB 導入後的滑鼠拖曳主要由 renderer 行為測試涵蓋。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC15 建立 renderer、持久化與範圍裁切的失敗測試。
2. 建立穩定章內文字位置與每章一對範圍標籤的保存合約。
3. 實作首次初始化、拖曳、目前行功能選單與跨排版恢復。
4. 實作閱讀區段裁切與唯一的手動觸發自動推進操作。
5. 執行目標測試、完整測試、型別檢查、建置與 Electron E2E。
6. 實作完成後同步本文件與 `documents/modules/book-library.md`。
