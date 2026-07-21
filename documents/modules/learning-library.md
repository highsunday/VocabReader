---
title: 本機生詞庫模組
module: learning-library
status: active
last_updated: 2026-07-22
related_implements:
  - F19-local-learning-library
---

# 本機生詞庫模組

## Purpose

本模組保存跨書籍的**學習項目**與其一至多筆**來源快照**。它與 EPUB 書庫索引分開：
書庫仍擁有書籍檔案、章節、閱讀狀態、範圍標籤與標記；生詞庫只保存可長期留存的學習
材料及其建立當下的來源資訊。

目前的 fallback 讓使用者從單一**標記**建立 `pending_ai`（畫面文案「待 AI 整理」）項目。
本階段不產生 AI 提案、不合併語義、不計算到期項目，也不建立**複習回合**。

## Boundaries and data flow

1. Renderer 在章節標記的右鍵選單選擇「加入生詞庫」，收集目前書籍／章節名稱、標記、
   offset 與原句。
2. Preload 只暴露 `listItems`、`getItem`、`createDraft`、`updateItem`、`archiveItem` 五個
   型別化方法；它不提供 SQLite 路徑、SQL、Node API 或通用 IPC。
3. Main 的 `registerLearningLibraryIpc` 驗證每個 payload，再交給 `LocalLearningLibrary`。
4. `LocalLearningLibrary` 在 `userData/learning-library/learning.sqlite` 執行 migration，保存
   `learning_items` 與 `learning_item_sources`。同一 `(bookId, chapterId, annotationId)` 有唯一
   約束，因此重複 fallback 操作返回既有項目。
5. 讀取 source 時 repository 透過 `LocalBookLibrary.hasBook()` 動態判斷 availability。刪除
   書籍不改寫或刪除 SQLite snapshot；Renderer 顯示「原書已刪除」。

## Key files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/learning-contracts.ts` | Main、preload 與 renderer 共用契約 |
| `apps/desktop/src/main/learning-library-service.ts` | `node:sqlite` repository、migration、source idempotency、edit/archive |
| `apps/desktop/src/main/learning-library-ipc.ts` | 窄化 IPC 與跨程序輸入驗證 |
| `apps/desktop/src/main/main.ts` | 建立 userData database 並注入書籍 availability 查詢 |
| `apps/desktop/src/preload/preload.ts` | 受限 learning bridge |
| `apps/desktop/src/renderer/App.tsx` | 載入、annotation fallback 與 workspace 協調 |
| `apps/desktop/src/renderer/workspace/LearningLibraryWorkspace.tsx` | 清單、詳情、可編輯欄位、封存篩選與 source 呈現 |

## Constraints and testing

- `pending_ai` 和 `archived` 是本階段唯一狀態；沒有 hard delete。
- 不以 canonical form 建資料庫唯一鍵，保留 Q01-04 的不同語義設計空間。
- source snapshot 中的書名、章節名、標記文字與原句不可因刪書遺失。
- `learning-library-service.test.ts` 覆蓋 migration、重開持久化、idempotency、edit/archive 和
  unavailable source；`learning-library-ipc.test.ts` 覆蓋 IPC validation；`App.test.tsx` 覆蓋
  fallback 到 UI 的操作路徑。
