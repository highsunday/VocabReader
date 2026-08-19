---
title: 閱讀區段與 START／END 範圍標籤模組
module: reading-range
status: active
last_updated: 2026-08-19
related_implements:
  - F05-ai-reading-range-markers
  - F06-reading-range-boundary-lines
  - F07-codex-ai-conversation
  - F09-send-reading-segment-on-range-change
  - F13-persistent-annotations-and-ai-analysis
  - F16-invoke-annotation-explanation-skill
  - F17-reading-segment-comprehension-quiz
  - F18-use-reading-comprehension-skill
  - F23-interactive-reading-practice-paper
  - B02-persist-range-marker-on-drag-release
  - F40-reader-jump-to-range-markers
  - B14-jump-to-reading-range-markers
  - B22-default-reading-range-to-whole-chapter
  - B23-align-advanced-range-start-with-first-unread-line
  - B25-align-range-navigation-and-next-segment
---

# 閱讀區段與 START／END 範圍標籤模組

## 1. Purpose

本模組讓使用者在單一章節內，以唯一一對 **範圍標籤（Range Marker）** 界定目前的 **閱讀區段（Reading Segment）**。這個區段是 AI 對話、區段解析、標記講解及區段練習可以取得的原文上限，避免 AI 讀到使用者尚未閱讀的同章內容。

兩個範圍標籤分別呈現為：

- `START`：閱讀區段起點，分隔線顯示在起始行之前。
- `END`：閱讀區段終點，分隔線顯示在終止行之後。

範圍標籤是 AI 上下文選取工具，不是使用者對不理解原文建立的 **標記（Annotation）**，也不代表章節完成狀態。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 每章恰有一對 START／END，不支援同章多組範圍。
- 首次開啟尚未保存範圍的章節時，START 預設位於章首、END 預設位於章末，初始 offset 為 `{ start: 0, end: text.length }`，閱讀區段涵蓋完整章節。
- 已保存的章節範圍會在重新開啟、切換書籍及重新啟動應用程式後恢復。
- START／END 以章內文字 offset 定位，不依賴 EPUB 頁碼、捲動比例或固定像素。
- 可拖曳左側書籤，拖曳途中即時預覽，放開時保存一次。
- 可在內文目前行開啟右鍵功能選單，把 START 或 END 移到該行。
- START 不得位於 END 之後；拖曳或右鍵更新若越界，另一個標籤會跟到正在移動的新位置，使兩者位於同一位置。
- 浮動標記工具旁提供 START／END 快捷按鈕；START 中心對齊閱讀可見高度的 1/4，
  END 中心對齊 3/4，快捷導覽不改動或保存範圍。
- 每個書籤向內文延伸具名分隔線；位置過近時會上下錯開，避免重疊。
- START 以起始 offset 處第一個字元的 glyph rectangle 定位在該視覺行之前，不採用可能落在上一行的 collapsed caret rectangle；END 以終止 offset 前一字元定位在該視覺行之後。
- 「完成這段，前往下一段」會依目前區段約略字數推進到下一個連續範圍，完成新範圍標籤
  定位後自動把 START 導覽至可見高度的 1/4；章末停止且不跨章。
- 已提供只擷取 START／END 之間原文的共用函式；AI 對話面板、標記講解與閱讀測驗都使用此邊界，禁止讀取範圍外內容。
- 標記講解與互動式閱讀測驗已透過 AI 對話面板實作；結果顯示在產生它的 AI 對話中，不由本模組另存一份結構化解析紀錄。
- AI 對話面板只在目前書籍、章節或 START／END 相對於最近成功提供的區段發生改變時，重新附帶一次閱讀區段原文。

## 3. Module Boundary

### Renderer responsibilities

- 初始化、恢復及暫存目前章節的 `ReadingRange`。
- 將 Pointer 或目前行座標轉換成章內文字 offset。
- 驗證 START／END 順序，處理拖曳預覽、放開、取消與右鍵移動。
- 將文字 offset 轉為 START／END 的畫面座標，處理分隔線與重疊避讓。
- 從浮動標記工具旁把 START／END boundary 分別導覽到閱讀可見高度 1/4／3/4，
  不改動範圍資料。
- 計算下一個閱讀區段，並提供嚴格的原文裁切函式。
- 透過 preload bridge 要求保存範圍；renderer 不直接操作檔案系統。

### Main process responsibilities

- 驗證書籍與章節存在。
- 驗證 START／END 是非負整數且 `start <= end`。
- 將每章範圍寫入書籍的 `chapterRanges`，並與其他閱讀狀態寫入共用串行佇列。
- 原子更新本機 `index.json`，避免快速操作互相覆蓋。

### Out of scope

- AI 區段解析回覆與閱讀測驗題目的實際生成／呈現；這些由標記講解與閱讀理解模組負責，本模組只提供嚴格的閱讀區段邊界。
- 使用者原文標記、學習項目與生詞庫。
- Anki 式間隔複習。
- 跨章閱讀區段、多組範圍及範圍歷史。

## 4. Domain Data

### ReadingRange

| Field | Meaning |
|---|---|
| `start` | START 在章節純文字中的非負整數 offset；傳給 `String.slice` 時為包含端 |
| `end` | END 在章節純文字中的非負整數 offset；傳給 `String.slice` 時為不包含端 |

核心不變量：

- `0 <= start <= end`
- renderer 使用時還會把 offset 限制在目前章節文字長度內。
- 範圍只屬於一個 `bookId + chapterId`，不可跨章。
- `start === end` 是合法的空閱讀區段；UI 必須仍可分別操作兩個範圍標籤。

### LibraryBook.chapterRanges

`chapterRanges` 是以 `chapterId` 為鍵的 `Record<string, ReadingRange>`。一本書的不同章節各自保存一對範圍標籤；沒有紀錄的章節會在首次開啟時建立初始範圍。

## 5. Initialization and Restoration

1. Renderer 載入安全的 `ChapterContent.contentHtml`，並由穩定的 `ChapterArticle` DOM 取得 `textContent`。
2. 若 `selectedBook.chapterRanges[chapterId]` 存在、順序有效且 END 未超出目前文字長度，直接恢復保存值。
3. 否則 `initialReadingRange()` 將 START 設為章首、END 設為章末，建立 `{ start: 0, end: text.length }` 的完整章節初始範圍；空章節仍為 `{ start: 0, end: 0 }`。
4. 只有完全沒有保存值時，初始範圍會立即透過 `saveReadingRange()` 持久化。
5. 範圍狀態改變時不重建章節原文 DOM，避免中斷文字選取、右鍵定位或 Pointer 拖曳。

若既有保存值因章節內容改變而超出目前文字長度，renderer 會在本次畫面回退到新初始範圍；目前不會立刻覆寫該舊值，要等使用者下一次有效調整或推進後才保存新範圍。

## 6. START／END Visual Positioning

`markerTopForTextOffset()` 把穩定文字 offset 轉成目前版面的垂直座標：

- START 使用 `before` 語意：建立折疊 DOM Range，取起始文字行矩形的 `top`。
- END 使用 `after` 語意：選取 END 附近、仍屬於閱讀區段末端的字元，取該文字行矩形的 `bottom`。
- 座標以章節 `<article>` 頂端為基準，因此視窗尺寸或文字換行改變後可以重新計算。
- 視窗 `resize` 時重新定位；資料本身仍保持原文字 offset，不保存像素值。

每個邊界列包含可拖曳書籤、水平分隔線及 `START`／`END` 名稱。整條視覺列不攔截內文操作，只有書籤按鈕啟用 Pointer 事件。

當兩條邊界的畫面 top 距離小於 28px 時，兩列加入 `is-overlapping`：START 向上避讓 16px、END 向下避讓 16px。這同時涵蓋 `start === end` 及不同 offset 落在同一視覺行的情況。

## 7. Interaction Flows

### Pointer drag

1. `pointerdown` 攔截瀏覽器預設行為，記住拖曳前範圍。
2. `pointermove` 透過 caret API 或目前命中的閱讀元素取得文字 offset。
3. 候選位置若越過另一個標籤，另一個標籤會跟到候選位置，形成 `start === end` 並維持有效順序；拖曳途中不寫入本機書庫。
4. 系統持續保存「最後一個有效範圍」。即使使用者最後在左側標籤區或其他沒有文字 offset 的位置放開，`pointerup` 仍會保存最後有效範圍一次，不需要額外點擊。
5. `pointercancel` 移除監聽、恢復拖曳前範圍且不保存。

標籤不使用 HTML 原生 `draggable`，避免 native drag 與 Pointer 事件生命週期互相競爭。

### Current-line context menu

1. 章節 article 的原生 `contextmenu` listener 將事件位置轉成文字 offset。
2. 功能選單提供「將起點移到這裡」與「將終點移到這裡」。
3. 兩個選項始終可用；若目標位置會造成交叉，另一個標籤會跟到目標位置。
4. 操作立即更新 renderer 狀態並保存。

### Explicit automatic advance

1. 只有按下「完成這段，前往下一段」才會推進；AI 訊息、說明或出題不會改變範圍。
2. `advanceReadingRange()` 先計算目前裁切文字的約略英文單字數。
3. 新 START 從舊 END 後第一個非空白字元開始，新 END 依相同約略字數向後計算。
4. 剩餘內容不足時 END 停在章末；到達章末後按鈕停用，不自動切換下一章。
5. 保存下一個範圍並完成新 boundary 的渲染與量測後，自動執行 START 的 1/4 導覽。

### Quick navigation to a range marker

1. `START`／`END` 快捷按鈕與浮動標記工具同屬 `.annotation-tool-dock`，不放在頂端章節工具列。
2. 點擊後查找目前章節對應的 boundary DOM，依 boundary 中心與閱讀捲動區的畫面座標
   調整 `scrollTop`；START 對齊可見高度 1/4，END 對齊 3/4，並限制在合法捲動範圍內。
3. 快捷導覽只改變閱讀容器的可見位置；不修改文字 offset、不呼叫範圍保存，也不切換章節。

## 8. Persistence Flow

```text
有效拖曳放開／右鍵移動／明確推進
  → renderer 先樂觀更新 readingRange 與 books[].chapterRanges
  → preload saveReadingRange(input)
  → IPC library:save-reading-range 驗證輸入
  → LocalBookLibrary 驗證書籍、章節與範圍
  → 串行寫入 index.json
  → 回傳更新後 LibraryBook
  → renderer 合併後端 chapterRanges
```

保存失敗時，畫面保留本次暫時調整並顯示「無法保存閱讀區段；本次調整仍可暫時使用。」；不會假裝已跨次持久化成功。

## 9. AI Context Boundary

`extractReadingSegment(text, range)` 是所有 AI 閱讀上下文必須共用的裁切入口：

- 先把 START／END 限制在文字長度內。
- 保證 END 不早於 START。
- 只回傳 `text.slice(start, end).trim()`。
- START 之前與 END 之後的同章內容不會出現在結果中。

F07 的 AI 對話面板透過這個函式界定 Codex context；F13 的 `annotatedReadingSegment()` 在相同 START／END 邊界上插入區段內標記，不建立第二套可繞過範圍的內容入口。Renderer 以 `bookId + chapterId + start + end + annotation revision` 辨識目前版本：普通追問在版本未變時只送新問題，來源、任一邊界或標記變更後重新提供一次；「講解標記內容」則每次明確附上當下區段。空區段只進行一般對話，絕不以整章作為 fallback。

## 10. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/library-contracts.ts` | `ReadingRange`、`chapterRanges` 與保存輸入／API 型別 |
| `apps/desktop/src/renderer/reading-range.ts` | 初始化、裁切、自動推進、DOM 點位／Selection 轉 offset、offset 轉 START／END 座標、標記呈現與安全序列化 |
| `apps/desktop/src/renderer/App.tsx` | 範圍狀態、拖曳、右鍵選單、分隔線、重疊避讓、START／END 快捷導覽、樂觀更新、標記講解與閱讀測驗入口 |
| `apps/desktop/src/shared/chat-contracts.ts` | AI 對話輸入中的閱讀上下文契約 |
| `apps/desktop/src/renderer/styles.css` | START／END 書籤、分隔線、名稱、重疊避讓及浮動快捷導覽樣式 |
| `apps/desktop/src/preload/preload.ts` | 暴露窄化的 `saveReadingRange()` bridge |
| `apps/desktop/src/main/library-ipc.ts` | `library:save-reading-range` IPC 輸入驗證 |
| `apps/desktop/src/main/library-service.ts` | 範圍驗證、每章持久化及串行／原子寫入 |

## 11. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/renderer/reading-range.test.ts` | 新章節完整範圍初始化、空章節邊界、嚴格裁切、等長推進、章末停止、點位轉 offset、START 依第一個 glyph 所在視覺行定位、DOM text node 邊界與章末 fallback、END 在線後、標記資料不受推進影響 |
| `apps/desktop/src/renderer/App.test.tsx` | 一對範圍標籤、START／END 分隔線與 1/4／3/4 快捷導覽、浮動工具位置、重疊避讓、Pointer 放開即保存、取消恢復、右鍵移動、雙向越界聯動、外部點擊關閉選單、版面變動、下一段自動 START 導覽、章末停用、AI 對話嚴格裁切、相同區段去重與邊界／來源變更重傳 |
| `apps/desktop/src/main/library-service.test.ts` | 每章範圍保存、快速連續寫入、無效範圍與不存在章節拒絕 |
| `apps/desktop/src/main/library-ipc.test.ts` | 保存 IPC 路由及輸入格式驗證 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | Electron preload 確實暴露 `saveReadingRange()`，安全設定與應用程式啟動回歸 |

最近相關驗證（2026-08-19，B25）：

- App renderer 與 reading-range：106/106 passed。
- 完整 Vitest：Server 3/3、Desktop 540/540 passed。
- Server／Desktop TypeScript typecheck：passed。
- Desktop production build：passed。
- Electron Playwright 未執行；本次不改動 server、preload 或 Electron main process，互動回歸由
  renderer 的固定幾何座標測試覆蓋。

## 12. Important Constraints

- START／END 必須維持非負整數及 `start <= end`。
- 任何互動、自動推進或 AI 裁切都不得跨章。
- 視覺像素只用於當下呈現，不得取代文字 offset 成為持久化資料。
- 拖曳途中只預覽，放開時最多保存一次。
- 範圍標籤移動不得刪除、搬移或改寫使用者的原文標記。
- 一般 AI 操作不得暗中推進 START／END。
- 章節原文 DOM 必須保持穩定，避免拖曳或選取途中被 React 重建。

## 13. Known Limitations and Follow-up

- 標記講解與閱讀測驗已接上目前閱讀區段，但結果仍屬 AI 對話內容；本模組不另存可獨立查詢的結構化解析或練習紀錄。
- 尚未提供鍵盤調整 START／END 的操作。
- 尚未提供範圍歷史、復原／重做或多組範圍。
- 非空新章節預設建立完整章節閱讀區段；只有空章節或使用者明確把兩個範圍標籤移到同一位置時，才會形成合法的 `start === end` 空閱讀區段。
- 已存在但超出新章節文字長度的舊範圍只在畫面回退，不會立即覆寫持久化值。
- E2E 尚未以真實 EPUB 自動操作 START／END 拖曳；主要互動覆蓋位於 renderer 行為測試。

## 14. Related Documents

- `CONTEXT.md`
- `documents/modules/book-library.md`
- `documents/modules/annotation.md`
- `documents/implements/F05-ai-reading-range-markers.md`
- `documents/implements/F06-reading-range-boundary-lines.md`
- `documents/implements/F07-codex-ai-conversation.md`
- `documents/implements/F09-send-reading-segment-on-range-change.md`
- `documents/implements/F13-persistent-annotations-and-ai-analysis.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/F23-interactive-reading-practice-paper.md`
- `documents/implements/B02-persist-range-marker-on-drag-release.md`
- `documents/implements/F40-reader-jump-to-range-markers.md`
- `documents/implements/B14-jump-to-reading-range-markers.md`
- `documents/implements/B22-default-reading-range-to-whole-chapter.md`
- `documents/implements/B23-align-advanced-range-start-with-first-unread-line.md`

更新範圍資料格式、定位語意、拖曳生命週期、保存流程、自動推進或 AI 裁切邊界時，必須同步更新本文件及相關 FXX／BXX 實作紀錄。
