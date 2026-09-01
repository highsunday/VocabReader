---
author: Codex
date: 2026-09-01
title: 安全渲染記憶提示的行內 Markdown
uuid: 0c051bdf-c58d-4450-9a33-1e1733d645a5
version: 1.0.0
status: implemented
---

# Bug Fix: 安全渲染記憶提示的行內 Markdown

## 1. Bug Overview

AI 為 Memory tip 產生拼寫聯想時，會以 Markdown 粗體強調目標詞與字母區塊，
例如 `**heave**`、`**heavy**` 與 `**HEAV-**`。共用 `LearningMemoryTip` 目前直接
以 `<p>{content}</p>` 輸出字串，沒有解析 Markdown，因此草稿預覽、正式詳情與
編輯預覽都會把 `**` 當作普通字元顯示。

這不是資料儲存或 CSS escape 問題；原始 `memoryTip` 字串已正確保留，缺少的是
Renderer 的受限 Markdown 顯示邊界。

## 2. Fix Objective

- Memory tip 應渲染有助於拼寫聯想的輕量行內 Markdown，至少支援粗體、斜體、
  刪除線、行內 code 與 Markdown 換行。
- `**heave**`、`**heavy**` 與 `**HEAV-**` 必須顯示為行內粗體，不顯示定界星號，
  也不把每個粗體詞拆成獨立區塊。
- 記憶提示不是一般 Markdown 文件；標題、清單、表格、引用、連結、圖片與原始
  HTML 不得建立可互動或任意結構。不允許的容器應解包為普通文字，HTML 仍略過。
- 保留現有 Brain 圖示、`Memory tip` 標籤、`role="note"`、藍紫色層級、文字換行與
  無內容時不顯示的行為。

## 3. Acceptance Criteria

- **Scenario 1：粗體拼寫區塊正確顯示**

  - **Given** Memory tip 含有 `**heave**`、`**heavy**` 與 `**HEAV-**`
  - **When** `LearningMemoryTip` 顯示內容
  - **Then** DOM 包含三個行內 `<strong>`
  - **And** 使用者可見文字不包含 Markdown 定界星號

- **Scenario 2：三個入口一致**

  - **Given** 草稿預覽、正式詳情或編輯預覽使用 Memory tip
  - **When** 各入口渲染共用 `LearningMemoryTip`
  - **Then** 都套用同一受限 Markdown 契約

- **Scenario 3：不擴大內容安全邊界**

  - **Given** Memory tip 含有原始 HTML、Markdown 連結、圖片或區塊結構
  - **When** Renderer 解析它
  - **Then** 不建立 script、圖片、可點擊連結、標題或清單結構
  - **And** 允許的行內文字內容仍可閱讀

- **Scenario 4：現有視覺與可存取性不回歸**

  - **Given** 一個非空 Memory tip
  - **When** 渲染正式詳情
  - **Then** 仍有 Brain 圖示、可存取名稱與原有藍紫色層級
  - **And** 內文粗體維持行內排版，不沿用標籤的區塊字型規則

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 重現裸星號 | screenshot 的 heave/heavy 提示 | render | 修正前無 `<strong>` 且可見 `**` | Critical |
| TC2 | 安全行內 Markdown | 粗體、斜體、刪除線、code | render | 對應行內元素正確且無定界符 | Critical |
| TC3 | 不可信結構 | HTML、link、image、heading、list | render | 不建立危險或區塊結構 | Critical |
| TC4 | 三入口共用 | draft/detail/edit preview | render | 一個元件修正覆蓋全部入口 | High |
| TC5 | 視覺與 a11y | Electron 完整詳情 | inspect DOM/styles | 圖示、role、顏色層級保留，內文粗體為 inline | High |

## 5. Implementation Notes

- 延用現有 `react-markdown` 與 `remark-gfm`，不新增 dependency。
- 在 `LearningMemoryTip` 內設定允許元素清單，並使用 `skipHtml`；不允許的
  Markdown 容器只解包文字，不產生連結、圖片或任意 HTML。
- 將 `Memory tip` 標籤樣式限定在獨立 class，避免現有 `.learning-memory-tip strong`
  把內文的粗體全部變成 block、11px 標籤。

## 6. Affected Files and Boundaries

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `.agents/skills/create-learning-items/SKILL.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B37-render-memory-tip-inline-markdown.md`
- `documents/ddd-email-notify.md` (completion-notification ledger only)

## 7. Assumptions and Non-goals

- 本次不修改 `memoryTip` 字串 schema、SQLite、backup、IPC 或人工編輯儲存行為。
- 不把 Memory tip 擴張為完整 Markdown 文件，不支援可點擊連結、圖片、表格或嵌入 HTML。
- 不自動重寫已儲存的 Memory tip；原有 `**...**` 內容會直接因新渲染器正確顯示。
- 不改變 Memory tip 的色彩、位置、警示層級或編輯方式。

## 8. Implementation Record

### Status

Implemented and verified on 2026-09-01.

### Implementation Summary

- `LearningMemoryTip` 由純文字 `<p>` 改為受限 `ReactMarkdown`，共用於草稿預覽、
  正式詳情與編輯預覽。
- 允許的元素只有段落、粗體、斜體、刪除線、行內 code 與換行；`skipHtml`
  略過原始 HTML，`unwrapDisallowed` 只保留不允許 Markdown 容器的可讀文字。
- `Memory tip` 標籤改用 `.learning-memory-tip-label` 獨立樣式；內文強調收旂於
  `.learning-memory-tip-copy strong`，固定維持 `display: inline`、14px 內文尺度與正常字距。
- 新增長字串斷行、多段間距與行內 code 視覺，保留現有藍紫色、Brain 圖示、
  `role="note"` 與視覺層級。
- creation skill 明確允許有助於識別拼寫區塊的輕量行內 Markdown，並禁止標題、
  清單、引用、連結、圖片、表格與原始 HTML。

### Test Coverage

| Test scenario | Automated / visual basis | Result |
|---|---|---|
| TC1 | `LearningMemoryTip` 以截圖內 `heave/heavy/HEAV-` 文字重現裸星號 | Passed |
| TC2 | Renderer unit 驗證三個 `<strong>` 與無 `**` | Passed |
| TC3 | Renderer unit 驗證 link/image/script 不建立可互動或危險 DOM | Passed |
| TC4 | 共用元件直接測試與 `LearningItemDraftDialog` 整合測試 | Passed |
| TC5 | Electron E2E 驗證無裸星號、粗體可見、`display:inline` 與原視覺層級 | Passed |

### Changed Files

#### Production code

- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B37-render-memory-tip-inline-markdown.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 粗體拼寫區塊正確顯示 | Pass | TC1 / TC2：三個 inline `<strong>`，無 `**` |
| 三個入口一致 | Pass | TC4：共用元件與草稿整合測試 |
| 不擴大內容安全邊界 | Pass | TC3：無 anchor、image、script |
| 現有視覺與可存取性不回歸 | Pass | TC5：Brain、role、顏色與 inline emphasis |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Red 階段兩個可重現失敗，DOM 完整顯示 `**...**` |
| TC2 | Pass | `renders spelling emphasis as safe inline Markdown instead of raw markers` |
| TC3 | Pass | 同上；`a, img, script` 不存在 |
| TC4 | Pass | `LearningItemDraftDialog` read-only preview 整合斷言 |
| TC5 | Pass | `shows a memorable cue below the stronger learning caution` Electron E2E |

### Commands Executed

```bash
# Red: 2 expected failures, 25 passed
npm test -w @reader/desktop -- --run \
  src/renderer/learning-library-workspace.test.tsx \
  src/renderer/learning-item-draft-dialog.test.tsx

# Target green: 27/27 passed
npm test -w @reader/desktop -- --run \
  src/renderer/learning-library-workspace.test.tsx \
  src/renderer/learning-item-draft-dialog.test.tsx

# Full desktop unit: 60 files, 582/582 passed
npm test -w @reader/desktop

# TypeScript: passed
npm run typecheck -w @reader/desktop

# Production build + Electron E2E: 5/5 passed
npm run test:e2e -w @reader/desktop
```

### Hypotheses and Decisions

1. **Confirmed:** `LearningMemoryTip` 直接輸出純文字；紅燈 DOM 完整保留 `**heave**`
   並沒有內文 `<strong>`。改用受限 Markdown 後兩個重現測試同時轉綠。
2. **Insufficient alone:** 只要求 AI 不用 Markdown 無法修復已儲存內容，因此 skill 限制與
   Renderer 修正同時完成。
3. **Ruled out:** CSS 不是裸星號根因，但現有寬選擇器 `.learning-memory-tip strong`
   會把新內文粗體變成標籤樣式，因此一併收窄。
4. **Confirmed safe boundary:** `allowedElements + skipHtml + unwrapDisallowed` 保留所需強調，
   同時不產生連結、圖片或 HTML DOM。

### Visual Verification

- 以 1400×900 Electron viewport 實際渲染使用者截圖內的長 CJK Memory tip。
- `heave`、`heavy`、`HEAV-`、`HEAVY` 與 `HEAV + E = HEAVE` 都為同行內粗體；
  無裸星號，中文斷行、Brain 圖示、標籤層級與藍紫色背景正常。
- 視覺結果無需第二輪微調；暫存檢查腳本與截圖已刪除。

### Deferred Items

- 不支援 Memory tip 內的可點擊連結、圖片、標題、清單、表格或原始 HTML。
- 本次未建立版本、installer、Git commit 或 GitHub Release。

### Notes

- Production build 只有既有的 500 kB chunk size warning。
- 共用 `LearningMemoryTip` 已是合適的單一測試 seam，實作未暴露過度耦合或責任
  邊界不清等需要另開 RXX 的架構問題。
