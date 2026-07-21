---
author: Codex
date: 2026-07-22
title: 拆分可擴充的桌面工作區邊界
uuid: 2572fb0f3a484efead993a671f59d29f
version: 1.0.0
status: approved
source_plan: documents/planning/P01-ai-learning-items-and-learning-library.md
source_queue_item: Q01-01
---

# Refactor Specification – 桌面工作區邊界

## 1. Goal

在不改變產品行為、視覺、資料格式、IPC 或 Codex protocol 的前提下，把集中於 `apps/desktop/src/renderer/App.tsx` 的四個呈現責任拆成可獨立維護的 Renderer 邊界：主要導覽、書籍總覽／章節閱讀工作區、生詞庫／複習工作區，以及 AI 對話面板。

`App` 繼續擁有 Electron bridge 呼叫、非同步 effects、書庫與閱讀狀態、標記、範圍標籤、AI 對話及設定狀態；新元件只接收型別化 props 並回報使用者操作，讓後續生詞庫與 AI 學習項目功能不必繼續堆疊在單一呈現元件。

## 2. User Story

- **As a** 維護桌面閱讀器的開發者
- **I want** Renderer 的導覽、閱讀、生詞庫／複習與 AI 對話面板具有清楚的元件邊界
- **So that** 後續加入生詞庫與 AI 學習項目時，可以在既有責任邊界內擴充而不改變目前閱讀與 AI 行為

## 3. Confirmed Module Map

```text
main.tsx
└── App（狀態與 bridge 協調）
    ├── PrimaryNavigation（書庫、Anki 入口、設定與 Codex 狀態）
    ├── ReadingWorkspace（書籍總覽、章節閱讀、標記與 START／END 呈現）
    ├── LearningLibraryWorkspace（目前既有複習占位頁）
    └── AiConversationPanel（對話、preset、composer、模型與停止控制）
```

相關來源與呼叫者：

- `apps/desktop/src/renderer/main.tsx` 是 `App` 的唯一應用程式 caller。
- `apps/desktop/src/renderer/App.test.tsx` 從使用者可操作行為覆蓋四個邊界。
- `apps/desktop/src/renderer/reading-range.ts` 保持為閱讀區段、範圍標籤與標記的純邏輯來源，不搬入呈現元件。
- `apps/desktop/src/shared/*-contracts.ts`、preload、Electron Main 與 `styles.css` 都維持現有契約。

集中式 queue intake 已確認此 map 的範圍：只做 Renderer 結構重構，不新增功能或改變視覺。

## 4. Requirements

| ID | Requirement | Verification |
|---|---|---|
| R1 | 從 `App.tsx` 抽出主要導覽元件，保留書籍選取、Anki 入口、設定入口、左右欄摺疊與 Codex 狀態呈現 | 既有導覽、摺疊、書籍選取與狀態卡測試 |
| R2 | 抽出受控的書籍總覽／章節閱讀工作區，保留章節導覽、載入／錯誤、標記、START／END、右鍵選單與閱讀區段推進 | 既有書庫、章節、標記與範圍測試 |
| R3 | 抽出生詞庫／複習工作區邊界，但只呈現既有 Anki 複習占位內容，不新增學習項目或排程功能 | 既有複習分離測試與文字斷言 |
| R4 | 抽出受控的 AI 對話面板，保留對話清單、訊息、preset、模型、composer、串流、停止、調寬與摺疊行為 | 既有 AI 對話、preset、面板與 Markdown 測試 |
| R5 | `App` 保留所有 bridge 呼叫、非同步 effects、持久化、領域狀態及跨邊界協調；抽出元件不得新增 IPC、資料轉換或 Codex input 規則 | 型別檢查、boundary test、既有 payload 測試 |
| R6 | 不修改 class name、可見文字、ARIA、CSS、共享資料契約、Electron bridge 或 Codex protocol | Renderer regression、typecheck、production build |

## 5. Acceptance Criteria

- [ ] `App.tsx` 透過四個具名 Renderer 元件組成主要導覽、閱讀工作區、生詞庫／複習工作區與 AI 對話面板，而不是繼續內嵌四個完整呈現區塊。
- [ ] 依序操作書籍總覽、章節閱讀與現有 Anki 複習占位頁時，導覽、中央內容及左右欄行為與重構前一致。
- [ ] 建立／移除標記、拖曳 START／END、切換章節及重新載入保存狀態的既有自動化回歸全部通過。
- [ ] 一般 AI 提問、「解釋標記」與「閱讀測驗」的 context、串流與停止控制既有自動化回歸全部通過。
- [ ] 桌面與全專案相關測試、TypeScript typecheck 及 production build 通過，且沒有資料格式、IPC 或 Codex protocol diff。

## 6. Automated Test Scenarios

| ID | Given | When | Then | Priority |
|---|---|---|---|---|
| TC1 | 新的 Renderer workspace boundary test | 匯入四個具名邊界並檢查 `App` 組合入口 | 重構前因模組不存在而 RED；重構後四個邊界可辨識且由 App 使用 | Critical |
| TC2 | 既有書庫與導覽測試 | 選書、進入總覽／章節／複習並摺疊側欄 | 可見文字、ARIA 與操作結果維持一致 | Critical |
| TC3 | 既有閱讀區段與標記測試 | 移動／拖曳 START／END、建立／移除標記、切章與保存 | offset、bridge payload、恢復與畫面行為維持一致 | Critical |
| TC4 | 既有 AI 對話測試 | 一般提問、兩個 preset、串流、停止、模型、歷史及調寬 | payload、狀態與面板行為維持一致 | Critical |
| TC5 | 完整型別與建置環境 | 執行 typecheck 與 production build | 元件 props 與 bundle 均有效，沒有跨程序契約變更 | High |

## 7. Stop Conditions

- 若拆分需要改變任何使用者行為、可見設計、ARIA、class name 或 CSS 才能完成，立即停止。
- 若需要新增或修改共享資料格式、preload／IPC、Electron Main、持久化語意或 Codex protocol，立即停止。
- 若既有關鍵閱讀或 AI 流程無法建立穩定 regression feedback loop，或新 boundary test 無法因正確的「模組尚未存在」理由先呈現 RED，立即停止。
- 若受控 props 無法維持單一狀態所有權而必須在新元件複製領域狀態，立即停止並要求重新確認架構範圍。

## 8. Assumptions and Non-goals

### Assumptions

- queue intake 對四個呈現邊界與純 Renderer 範圍的確認，等同完成 ddd-start／ddd-doc 要求的 RXX scope confirmation。
- `App` 保持應用程式層協調者是本階段最小風險方案；後續功能可再依實際耦合決定是否抽出 hooks 或 application services。
- 現有 Vitest integration tests 對 DOM、ARIA 與 bridge payload 的覆蓋足以作為行為不變的主要證據。

### Non-goals

- 不建立學習項目、生詞庫資料、SQLite schema、migration、IPC 或管理功能。
- 不實作複習排程、到期項目、複習回合或回答評估。
- 不改寫 `reading-range.ts`、共享 contracts、Main Process、preload、Codex skills 或 server。
- 不變更視覺、CSS、文字、ARIA、資料格式、IPC 或 Codex protocol。

## 9. Expected Files

### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/workspace/PrimaryNavigation.tsx`
- `apps/desktop/src/renderer/workspace/ReadingWorkspace.tsx`
- `apps/desktop/src/renderer/workspace/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/workspace/AiConversationPanel.tsx`

### Test code

- `apps/desktop/src/renderer/workspace-boundaries.test.tsx`
- Existing regression coverage in `apps/desktop/src/renderer/App.test.tsx`
- Existing pure reading coverage in `apps/desktop/src/renderer/reading-range.test.ts`

## 10. Implementation Record

### Status

Implemented

### Implementation Summary

`App` now composes four named Renderer presentation boundaries while retaining all
bridge calls, effects, persistence, reading state, annotation state, AI state and
cross-workspace coordination. `PrimaryNavigation`, `ReadingWorkspace` and
`AiConversationPanel` preserve their existing DOM and CSS hooks through controlled
props and children; `LearningLibraryWorkspace` owns the unchanged review placeholder.
No shared contract, IPC, persistence, Codex input, visible text, ARIA or CSS changed.

### Test Coverage

- TC1: `workspace-boundaries.test.tsx` proves the four boundary modules are exported
  and that the composed application exposes primary navigation, AI panel and review workspace.
- TC2–TC4: existing `App.test.tsx` regressions (61 focused; 129 full desktop suite total)
  retain navigation, library, range-marker, annotation, conversation, preset, streaming,
  panel resize and collapse behavior.
- TC3: existing `reading-range.test.ts` remains green in the focused run.
- TC5: desktop typecheck and production build pass.

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/workspace/PrimaryNavigation.tsx`
- `apps/desktop/src/renderer/workspace/ReadingWorkspace.tsx`
- `apps/desktop/src/renderer/workspace/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/workspace/AiConversationPanel.tsx`

#### Test code

- `apps/desktop/src/renderer/workspace-boundaries.test.tsx`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Four named workspace boundaries composed by App | Pass | `workspace-boundaries.test.tsx` |
| Navigation, overview, reader and review behavior unchanged | Pass | full desktop Vitest suite |
| Annotation and reading-range behavior unchanged | Pass | focused `App.test.tsx` + `reading-range.test.ts` |
| AI conversation and presets unchanged | Pass | focused `App.test.tsx` + full desktop Vitest suite |
| Typecheck and production build pass without contract changes | Pass | `npm run typecheck`; `npm run build` |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `workspace-boundaries.test.tsx` |
| TC2 | Pass | `App.test.tsx` navigation and library regression |
| TC3 | Pass | `App.test.tsx` and `reading-range.test.ts` |
| TC4 | Pass | `App.test.tsx` AI conversation regression |
| TC5 | Pass | desktop typecheck and production build |

### Commands Executed

```bash
npm test -- workspace-boundaries.test.tsx
# RED: failed because the four `workspace/*` modules did not exist.

npm test -- workspace-boundaries.test.tsx
# GREEN: 1 passed.

npm test -- App.test.tsx reading-range.test.ts
# GREEN: 2 files / 61 tests passed.

npm test
# GREEN: 12 files / 129 tests passed.

npm run typecheck
# GREEN.

npm run build
# GREEN: Electron Main and Vite production Renderer bundle built.
```

### Hypotheses and Decisions

- Q01-01 is auto-approved because the RXX is explicit, behavior-preserving, low-risk and testable; centralized intake contains no unresolved questions.
- State and bridge ownership remain in `App`; extracted components are controlled presentation boundaries.
- The initial TC1 GREEN check used a Vite-virtualized `import.meta.url` file read and was
  replaced with a DOM-level composition check; this changed only the new test implementation,
  not product code or requirements.

### Deferred Items

- Further markup extraction within the controlled workspace boundaries and hook/application-service
  extraction are deferred until a concrete cross-boundary behavior requires them.
- Module documents continue to describe `App.tsx` as the Renderer coordinator; no domain behavior changes require a module-document rewrite in this item.

### Notes

- Per-item ddd-tdd completion notification is suppressed because this implementation runs inside DDD queue Q01.
- No module document update is required: `App` remains the Renderer coordinator described by
  the existing book-library, reading-range and AI-conversation documents.
