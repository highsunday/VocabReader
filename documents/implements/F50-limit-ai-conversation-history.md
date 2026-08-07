---
author: Codex
date: 2026-08-07
title: AI 對話紀錄只保留最近十筆
uuid: 03296694-9ca2-4ea7-a548-4ec7c56a1621
version: 1.1.0
status: implemented
---

# Feature Specification - AI 對話紀錄只保留最近十筆

## 1. Feature Overview

目前 VocabReader 會持續保存所有由產品建立的全域 **AI 對話**，對話紀錄會隨使用時間無限
增加。本功能把本機有效 AI 對話集合限制為最近更新的 10 筆，讓對話清單與本機保存資料
維持固定上限。

建立第 11 筆對話時，系統自動淘汰最久未更新的舊對話；既有資料在載入時若已超過上限，
也套用相同規則。這個上限計算的是 AI 對話筆數，不限制任何一筆 AI 對話內的訊息數。

## 2. Requirements (User Story)

- **As a** 使用 AI 對話面板的閱讀者
- **I want** 對話紀錄只保留最近更新的 10 筆
- **So that** 對話清單及本機資料不會隨使用時間無限累積

## 3. Acceptance Criteria

- **Scenario 1：未達上限時保留全部對話**
  - **Given** 本機有效 AI 對話不超過 10 筆
  - **When** 系統載入、保存或顯示對話紀錄
  - **Then** 所有對話都被保留，既有排序與訊息內容不變

- **Scenario 2：建立第十一筆時淘汰最舊對話**
  - **Given** 本機已有 10 筆 AI 對話
  - **When** 使用者送出空白新對話的第一則訊息並建立第 11 筆 AI 對話
  - **Then** 記憶體狀態、對話清單及本機保存資料只包含最近更新的 10 筆
  - **And** 最久未更新的對話被淘汰，新建立的目前對話仍被保留並可繼續接收回覆

- **Scenario 3：載入既有超量資料時正規化**
  - **Given** 舊版本機資料包含超過 10 筆有效 AI 對話
  - **When** 系統載入該資料
  - **Then** 只載入 `updatedAt` 最新的 10 筆對話
  - **And** 若先前選取的對話已被淘汰，目前選取狀態改為空白新對話

- **Scenario 4：不裁切單筆對話訊息**
  - **Given** 一筆被保留的 AI 對話含有超過 10 則使用者與 AI 訊息
  - **When** 系統套用 10 筆對話上限
  - **Then** 該 AI 對話的完整訊息仍被保留

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 未達上限 | 10 筆以下的 AI 對話 | 載入及保存 | 全部對話與訊息維持不變 | High |
| TC2 | 建立第十一筆 | 10 筆既有對話 | 建立並送出第 11 筆對話 | 只留下最近更新 10 筆，淘汰最舊一筆並保留目前對話 | Critical |
| TC3 | 載入超量舊資料 | 保存檔含 11 筆以上對話 | 啟動載入 | 回傳最新 10 筆；被淘汰的 selected id 正規化為 null | Critical |
| TC4 | 訊息不受限制 | 被保留對話含 11 則以上訊息 | 套用對話上限 | 所有訊息仍存在 | High |

## 5. Implementation Notes

- 上限以 `updatedAt` 判定最近使用順序；時間相同時以 `createdAt` 較新者優先，再以輸入集合
  中較後出現者優先，確保剛建立的目前對話不會因相同測試時鐘被誤淘汰。
- `LocalChatConversationStore` 在載入與保存時正規化資料，避免舊版或外部形成的超量狀態
  進入 App。
- `ChatController` 建立新 AI 對話時同步套用相同上限，確保 snapshot、UI 與保存內容一致。
- 自動淘汰只移除 VocabReader 的本機有效對話紀錄，不呼叫 `thread/archive`；它不是使用者
  主動執行的「移除對話」操作，也不應讓新訊息送出流程因背景封存失敗而失敗。

## 6. Assumptions, Non-goals, and Open Questions

### Assumptions

- 「最近 10 筆」指依最近更新時間排序的 10 筆 AI 對話，而非最近 10 則訊息。
- 上限適用於 VocabReader 自有的全域 AI 對話集合，不影響產品外的 Codex／ChatGPT 對話。

### Non-goals

- 不限制單筆 AI 對話的訊息數、文字長度或附件數。
- 不新增設定讓使用者調整 10 筆上限。
- 不提供被自動淘汰對話的垃圾桶、復原或匯入。
- 不因自動淘汰而封存底層 Codex thread；手動移除的既有封存行為維持不變。

### Open Questions

- 無阻擋實作的未決問題。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/chat-controller.ts`

### Test code

- `apps/desktop/src/main/chat-conversation-store.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`

### Documentation

- `documents/modules/ai-conversation.md`

## 8. Implementation Record

### Status

Implemented.

### Implementation Summary

- 在 `chat-conversation-store.ts` 集中定義 10 筆上限，依 `updatedAt`、`createdAt` 及輸入
  順序保留最近 AI 對話。
- `LocalChatConversationStore` 載入與保存資料時都套用上限；被淘汰的 selected id 會
  正規化為 `null`。
- `ChatController` 建立新 AI 對話後立即套用相同規則，避免記憶體 snapshot 或 UI
  短暫顯示第 11 筆。
- 自動淘汰不裁切保留對話的訊息，也不改變使用者手動移除時既有的 thread 封存流程。

### Test Coverage

- `chat-controller.test.ts`：TC2，驗證建立第 11 筆時淘汰最舊對話、保留目前對話、完整
  收到 user／assistant 訊息，且 snapshot 與保存狀態都是 10 筆。
- `chat-conversation-store.test.ts`：TC1、TC3、TC4，驗證未達上限行為維持、載入與保存
  超量資料只保留最新 10 筆、失效選取改為 null，並保留單筆對話的 11 則訊息。

### Changed Files

#### Production Code

- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/chat-controller.ts`

#### Test Code

- `apps/desktop/src/main/chat-conversation-store.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`

#### Documentation

- `documents/implements/F50-limit-ai-conversation-history.md`
- `documents/modules/ai-conversation.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 未達上限時保留全部對話 | Pass | 既有 Store 往返測試仍保留兩筆資料；完整對話測試 65/65 通過 |
| 建立第十一筆時淘汰最舊對話 | Pass | `keeps only the ten most recently updated conversations when creating an eleventh` |
| 載入既有超量資料時正規化 | Pass | `loads only the ten most recently updated conversations without trimming their messages` |
| 不裁切單筆對話訊息 | Pass | 同一 Store 測試驗證保留對話內 11 則訊息 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Store 原子保存及完整對話相關回歸測試 |
| TC2 | Pass | Controller 建立第 11 筆測試 |
| TC3 | Pass | Store 載入／保存 12 筆資料測試 |
| TC4 | Pass | Store 保留 11 則訊息測試 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-conversation-store.test.ts src/main/chat-controller.test.ts -t 'ten most recently updated conversations'
npm run test -w @reader/desktop -- src/main/chat-conversation-store.test.ts src/main/chat-controller.test.ts
npm run typecheck
npm run test -w @reader/desktop -- src/renderer/learning-library-workspace.test.tsx -t 'automatically appends the next page near the bottom without result counts'
npm test
npm run build
```

結果：紅燈測試先觀察到兩個預期失敗；實作後對話相關測試 65/65、Server 3/3、Desktop
382/382、完整 TypeScript typecheck 與 production build 全部通過。

### Hypotheses and Decisions

- 「最近 10 筆」依 F50 假設解讀為 AI 對話數量，而非單一對話內訊息數量。
- 全套測試首次執行時，既有生詞庫虛擬捲動測試因 1 秒非同步查詢逾時失敗。該測試不依賴
  本次變更檔案，單獨重跑通過，完整套件再次執行也以 382/382 通過，確認為並行時序波動，
  未修改該模組或測試。
- 自動淘汰不封存 Codex thread，避免本機容量規則把新訊息送出流程耦合到額外的遠端管理
  request；使用者手動移除仍維持封存與失敗回滾語意。

### Deferred Items

- 無。

### Notes

- 本次改動沿用既有 Store／Controller 邊界，未發現新的模組耦合、測試 seam 或責任歸屬問題。
