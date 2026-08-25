---
title: 學習語言工作區模組
module: learning-language-workspace
status: active
last_updated: 2026-08-25
related_implements:
  - F69-isolate-learning-language-workspaces
---

# 學習語言工作區模組

## Purpose

本模組以 `en`、`ja`、`zh-TW`、`ko` 四種學習語言建立互斥工作區。切換學習語言會一起切換
書庫、生詞庫、複習與練習進度、目前練習狀態及 AI 對話，避免不同語言資料混用。
講解語言則由每個工作區各自保存，只控制 AI 教學與批改說明。

## Boundaries and invariants

- `LearningLanguageWorkspaceRegistry` 是 Main Process 的 active workspace 協調器；IPC 不接受
  Renderer 指定任意資料路徑。
- English 沿用舊版資料路徑；日本語、繁體中文與韓文位於
  `learning-language-workspaces/<language>/`，各自保存 library、learning-library、chat 與 progress。
- 書籍在導入當下歸入目前工作區。學習項目建立與編修時，`language` 必須等於工作區語言。
- 生詞庫不提供語言篩選；`language` 欄位只保留為資料不變量、顯示與升級遷移依據。
- 切換成功後 Renderer 關閉舊書與暫態練習，重新載入新工作區書庫、學習數量及 AI 對話。
- AI turn、對話管理、複習或資料備份進行中時，Renderer 停用學習語言選擇器。

## Explanation language

Settings 保存 `learningLanguage` 與四組 `explanationLanguages`。讀取設定時，
`explanationLanguage` 是目前工作區值的便利投影。一般 AI、標記解析、學習卡解釋與批改
原因使用講解語言；閱讀測驗題目、選項、問答答案及修正版使用學習語言。

## Existing-data migration

F69 首次升級會先保存不可變 legacy SQLite snapshot，再由同一 snapshot 產生
`en`、`ja`、`zh-TW` 與待分類 `other`；當時沒有可靠的舊韓文分類來源，因此目前的 `ko`
工作區使用獨立資料庫並在首次使用時建立。舊資料分流時，刪除非目標項目會依
foreign-key cascade 一起分流排程與複習事件。完成 marker 使重啟可重入；若中途停止，
下一次由 snapshot 重建全部 stage，不使用半完成來源。

Settings 會顯示待分類數量。使用者可把全部待分類項目一次移入其中一個工作區；交易會
更新項目語言並搬移排程與複習歷史。未分類前不出現在任何生詞庫。

## Backup

外層 `vocabreader-learning-language-backup` version 2 ZIP 包含四份各自通過既有 checksum、
EPUB 與 SQLite 驗證的工作區備份、共享 `settings.json`，以及存在時的待分類 SQLite。
預覽同時提供每個工作區數量與待分類數量；確認後完整取代四個工作區與共享設定，再重新
啟動。匯入舊 version 1 三工作區備份時保留目的裝置目前的韓文工作區，並為缺少的韓文
講解語言設定使用 `source`。

## Main files

- `apps/desktop/src/main/learning-language-workspace.ts`
- `apps/desktop/src/main/learning-language-migration.ts`
- `apps/desktop/src/main/learning-language-data-backup-service.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/renderer/App.tsx`

## Tests

- `learning-language-workspace.test.ts`：active proxy 與切換。
- `learning-language-migration.test.ts`：四路分流、關聯保留、可重入與待分類搬移。
- `learning-language-data-backup-service.test.ts`：四工作區封裝、舊三工作區備份相容、分區預覽、設定與完整還原。
- `settings-store.test.ts`、`settings-ipc.test.ts`：設定升級、白名單與持久化。
- `App.test.tsx`：設定 UI、切換後講解語言與工作區 reload。
