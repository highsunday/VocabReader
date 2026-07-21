---
author: Codex
date: 2026-07-21
title: 新增全域 AI 對話管理
uuid: fb6b01e280794c13bc01429eb291f159
version: 1.0.0
status: implemented
---

# Feature Specification - 全域 AI 對話管理

## 1. Feature Overview

目前 **AI 對話面板**只維護本次應用程式啟動期間的一個 Codex thread；使用者不能明確建立新對話、切換過去對話、重新開啟後查看紀錄，或移除不需要的對話。

本功能新增跨書籍共用的全域 **AI 對話**清單。使用者可從任何頁面的 AI 對話面板建立新對話、開啟清單、切換並延續既有對話，以及在確認後移除對話。對話訊息及目前選取狀態保存在本機；重新啟動應用程式時恢復上次查看的對話。移除對話時，同步封存其 Codex thread，避免它繼續出現在產品的有效對話集合中。

## 2. Requirements (User Story)

- **As a** 使用 LingoShelf AI 對話面板的閱讀者
- **I want** 建立、查看、切換及移除全域 AI 對話
- **So that** 我能把不同學習問題分成獨立對話，並在重新開啟應用程式後繼續過去的討論

## 3. Acceptance Criteria

- **Scenario 1：開啟全域對話清單**
  - **Given** 使用者位於書籍總覽、章節閱讀或複習畫面
  - **When** 使用者從 AI 對話面板開啟對話紀錄
  - **Then** 系統顯示同一份跨書籍全域對話清單，依最近更新時間由新到舊排列，不因目前選取書籍而過濾

- **Scenario 2：建立新對話**
  - **Given** 使用者正在查看任一既有對話或對話清單
  - **When** 使用者選擇「新對話」
  - **Then** AI 對話面板顯示空白對話與可輸入的訊息欄，既有對話不被修改；送出第一則訊息後才建立新的 AI 對話及 Codex thread

- **Scenario 3：產生可辨識的對話清單項目**
  - **Given** 空白新對話尚未送出訊息
  - **When** 使用者送出第一則訊息
  - **Then** 系統建立一筆對話紀錄，以第一則使用者訊息的單行截短內容作為標題，並顯示最近更新時間及可取得的書籍／章節來源摘要

- **Scenario 4：切換並查看過去對話**
  - **Given** 全域對話清單已有多筆紀錄，且目前沒有進行中的 AI 回覆
  - **When** 使用者選取另一筆對話
  - **Then** AI 對話面板依原順序顯示該對話的完整使用者與 AI 訊息，不混入先前對話的訊息

- **Scenario 5：延續過去對話**
  - **Given** 使用者切換到一筆已保存且具有 Codex thread 的過去對話
  - **When** 使用者送出追問
  - **Then** 系統先恢復該 Codex thread，再於相同 thread 建立新 turn；AI 可使用該對話的既有內容，且不得建立另一個替代 thread

- **Scenario 6：本機保存與重新啟動恢復**
  - **Given** 使用者已有多筆對話，並正在查看其中一筆
  - **When** 應用程式正常關閉後重新啟動
  - **Then** 全域對話清單、訊息、標題、來源摘要與排序仍存在，AI 對話面板自動恢復上次查看的對話

- **Scenario 7：上次對話不可用時顯示空白新對話**
  - **Given** 尚無任何對話，或上次選取的對話已被移除／本機紀錄無法對應
  - **When** 應用程式啟動或重新載入對話狀態
  - **Then** AI 對話面板顯示空白新對話，不建立無訊息的持久紀錄，也不顯示其他對話的訊息

- **Scenario 8：確認後移除過去對話**
  - **Given** 全域對話清單中有一筆既有對話
  - **When** 使用者執行移除並在確認視窗中確認
  - **Then** 系統封存該對話對應的 Codex thread、從本機有效對話清單移除該紀錄，且該對話不再出現在 UI 中

- **Scenario 9：取消移除不改變資料**
  - **Given** 使用者已開啟某筆對話的移除確認視窗
  - **When** 使用者取消或關閉確認視窗
  - **Then** 對話、訊息、Codex thread 與目前選取狀態保持不變

- **Scenario 10：移除目前對話後回到空白新對話**
  - **Given** 使用者正在查看準備移除的對話
  - **When** 使用者確認移除
  - **Then** AI 對話面板顯示空白新對話；其他既有對話仍保留在全域清單中，但不被自動選取

- **Scenario 11：處理中的對話禁止切換、建立或移除**
  - **Given** 目前 AI 回覆仍在串流或 thread／turn 正在建立
  - **When** 使用者檢視對話管理操作
  - **Then** 新對話、切換與移除目前對話的操作保持停用，避免把串流通知寫入錯誤的對話；回答完成或失敗後恢復操作

- **Scenario 12：保存完成與失敗狀態**
  - **Given** 使用者已送出訊息
  - **When** AI 串流回覆完成、失敗或應用程式在未完成狀態後重新啟動
  - **Then** 已完成訊息保存 canonical 最終文字；可確認失敗的訊息保留 failed 狀態；重新啟動時不得把殘留 streaming 狀態誤顯示為仍在處理

- **Scenario 13：保持閱讀上下文邊界**
  - **Given** 使用者在不同書籍或章節中切換及延續同一 AI 對話
  - **When** 使用者送出新問題
  - **Then** 該 turn 只附加送出當下由產品層組裝的書籍、章節與閱讀區段；切換對話不得自動傳送整章、整本書或過去未授權的閱讀內容

- **Scenario 14：對話保存或恢復失敗時可理解地降級**
  - **Given** 本機對話資料損壞、Codex thread 不存在，或封存／恢復 request 失敗
  - **When** 使用者載入、延續或移除該對話
  - **Then** 系統顯示可理解的錯誤，不把操作偽裝成成功，也不破壞其他可用的對話紀錄

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 全域清單不依書籍過濾 | 兩筆對話分別來自不同書籍，另有一般對話 | 從不同畫面開啟紀錄 | 三筆皆依更新時間顯示 | Critical |
| TC2 | 新對話延遲建立 | 正在查看既有對話 | 點擊新對話但未送出，再送第一則訊息 | 點擊時不新增紀錄；送出後建立新紀錄與 thread | Critical |
| TC3 | 對話標題與來源摘要 | 首則問題包含換行且送出時位於閱讀頁 | 建立對話 | 標題為單行截短問題，清單顯示書籍／章節摘要 | High |
| TC4 | 切換訊息隔離 | A、B 兩筆對話各有訊息 | 從 A 切到 B | 只顯示 B 的訊息 | Critical |
| TC5 | 恢復既有 thread | 過去對話保存 thread id | 切換後送出追問 | 呼叫 thread/resume 並在相同 thread id 執行 turn/start | Critical |
| TC6 | 重啟恢復上次對話 | 本機已有多筆對話且選取 B | 建立新的 Controller／應用程式狀態 | 清單及 B 的完整訊息恢復 | Critical |
| TC7 | 空集合與失效選取 | 無對話或 last selected id 不存在 | 載入狀態 | 顯示未持久化的空白新對話 | High |
| TC8 | 確認移除與封存 | 對話 A 有 thread id | 確認移除 A | 呼叫 thread/archive 且 A 從本機清單消失 | Critical |
| TC9 | 取消移除 | 移除確認視窗已開啟 | 取消 | 未呼叫封存，紀錄與選取不變 | High |
| TC10 | 移除目前對話 | 目前選取 A，另有 B | 確認移除 A | 顯示空白新對話，B 仍在清單且未自動選取 | High |
| TC11 | 串流期間管理鎖定 | A 有 active turn | 嘗試新增、切換或移除 | 操作停用或被 Controller 安全拒絕 | Critical |
| TC12 | 串流完成與重啟正規化 | assistant 分別處於 completed、failed、streaming | 保存後重新載入 | completed／failed 保留；殘留 streaming 轉為 failed | High |
| TC13 | 每個 turn 使用當下有限上下文 | 同一對話先後在不同章節提問 | 送出第二個問題 | 只附第二次送出當下的閱讀區段 | Critical |
| TC14 | thread 恢復失敗 | 本機紀錄引用不存在的 thread | 送出追問 | 顯示錯誤，既有訊息仍可查看且不建立替代 thread | High |
| TC15 | 本機資料損壞隔離 | 儲存檔格式無效 | 啟動載入 | 顯示錯誤／空白狀態，不覆寫損壞檔且應用程式可繼續啟動 | High |
| TC16 | IPC 白名單 | Renderer 管理對話 | 檢查 Preload API | 只有型別化 list/select/new/remove/send 能力，無 raw Codex API | Critical |

## 5. Implementation Notes

- 對話屬於 LingoShelf 產品資料，不直接把使用者帳戶中的所有 Codex thread 當成全域對話清單。應用程式在 Electron user data 下維護自己的對話索引與顯示訊息，並以 Codex thread id 延續 AI 上下文。
- 每筆本機對話至少保存產品對話 id、Codex thread id、標題、建立／更新時間、最近來源摘要及顯示用訊息；另保存上次選取的產品對話 id。
- 空白新對話只是一個 UI 狀態。第一則訊息成功取得 Codex thread id 後才寫入持久紀錄，避免全域清單累積無內容項目。
- 標題由第一則使用者訊息移除多餘空白並截短產生，不額外消耗 AI 額度；本階段不提供重新命名。
- 本機寫入使用先寫暫存檔再原子替換的方式，避免中途終止留下半份 JSON。讀取到無效資料時保留原檔供排查，不以空資料覆寫。
- `ChatController` 必須把目前 thread、messages 與 active turn 從單一全域欄位改為目前選取的 AI 對話投影；所有 notification 仍需同時驗證目前 thread id 與 active turn id。
- 切換既有對話時可以先顯示本機保存訊息；在下一次送出前使用 Codex App Server `thread/resume` 恢復同一 thread，並沿用既有 read-only sandbox、approval、skills／plugins／apps／memories 與 web search 禁用設定。
- 移除使用 Codex App Server `thread/archive`。只有封存與本機索引更新都成功後，UI 才把操作視為完成；若其中一步失敗，必須保留可理解且可重試的狀態，避免靜默分裂。
- `ChatSnapshot` 增加全域清單摘要、目前產品對話 id 與管理忙碌狀態；Renderer 仍只接收完整型別化 snapshot。
- 對話管理入口位於右側 AI 對話面板頂部，從任何 workspace mode 使用同一份全域清單。清單與訊息內容在同一面板內切換，不把 AI 對話混入左側書庫導覽。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 使用者確認對話採跨書籍的全域清單，而非每本書各自一份清單。
- 使用者確認移除前需要確認；確認後從有效清單移除並封存底層 Codex thread，第一版不提供垃圾桶或復原。
- 使用者確認重新開啟應用程式時恢復上次查看的對話；失效時回到空白新對話。
- 「完整訊息」指 AI 對話面板呈現的使用者與 assistant 訊息，不包含 Codex 內部 reasoning、工具活動或協定事件。
- 串流期間禁止新建、切換與移除是現有單一 active turn 安全邊界的延伸。

### Open Questions

- 無。全域範圍、移除語意與重新啟動恢復行為已由使用者確認；其餘採用上述可測試的第一版預設。

### Non-goals

- 不提供搜尋、篩選、釘選、資料夾、標籤、重新命名、匯出、分享或批次移除。
- 不提供垃圾桶、解除封存或移除復原。
- 不同步其他裝置，也不匯入 LingoShelf 以外建立的 Codex／ChatGPT 對話。
- 不允許同一對話並行多個 turn，也不在 AI 回覆處理中切換對話。
- 不變更模型、推理強度、帳戶登入、額度顯示、Markdown 呈現或閱讀區段邊界。
- 不保存 Codex 內部 reasoning、工具事件或隱藏 prompt 作為使用者可見訊息。

## 7. Affected Modules and Files

- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/chat-conversation-store.ts`（新增）
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/main/chat-conversation-store.test.ts`（新增）
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/ai-conversation.md`
- `CONTEXT.md`

## 8. Implementation Record

### Status

Implemented.

### Implementation Summary

- 新增 `LocalChatConversationStore`，在 Electron user data 保存 LingoShelf 自有的全域 AI 對話集合與上次選取狀態；寫入使用暫存檔加原子替換，損壞資料不會被空資料覆寫。
- `ChatController` 改為投影目前選取的產品對話，支援空白新對話、依更新時間排序、切換訊息、重啟恢復、`thread/resume` 延續與 `thread/archive` 移除。
- 移除時若本機保存失敗，Controller 會還原本機清單並呼叫 `thread/unarchive` 回滾；恢復或封存失敗時不建立替代 thread，也不移除原紀錄。
- 擴充型別化 `ChatSnapshot`、IPC 與 Preload 白名單，Renderer 無法直接呼叫任意 Codex method。
- 右側 AI 對話面板新增「新對話」與「對話紀錄」，提供全域清單、標題、來源摘要、更新時間、切換及確認移除；串流與管理操作期間會鎖定衝突操作。
- 第一則訊息以單行截短內容產生標題；空白新對話不保存，重啟時殘留 streaming 訊息正規化為 failed。

### Test Coverage

- `chat-conversation-store.test.ts`：TC6、TC12、TC15，涵蓋原子保存、重啟正規化與損壞資料隔離。
- `chat-controller.test.ts`：TC1–TC8、TC10–TC14，涵蓋建立、排序、切換、恢復、封存、失效選取、互斥、錯誤與回滾。
- `chat-ipc.test.ts`：TC16，涵蓋六項 chat IPC 與輸入驗證。
- `App.test.tsx`：TC1、TC3、TC4、TC9–TC11、TC13，涵蓋全域清單、來源摘要、操作流程、確認視窗與串流鎖定。
- `desktop.spec.ts`：TC16，涵蓋對話管理入口、七項 Preload API 白名單與 Node 隔離。

### Changed Files

#### Production Code

- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/chat-conversation-store.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/implements/F10-ai-conversation-management.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 開啟全域對話清單 | Pass | Renderer 全域清單測試與 Controller 排序測試 |
| 建立新對話 | Pass | Controller 延遲建立測試與 Renderer 新對話操作 |
| 產生可辨識的清單項目 | Pass | 第一則訊息標題、來源摘要與更新時間測試 |
| 切換並查看過去對話 | Pass | Controller 訊息隔離及 Renderer 切換測試 |
| 延續過去對話 | Pass | `thread/resume` 與相同 thread id 測試 |
| 本機保存與重新啟動恢復 | Pass | Store 往返與 Controller 重建測試 |
| 上次對話不可用時顯示空白新對話 | Pass | 失效 selected id 測試 |
| 確認後移除過去對話 | Pass | `thread/archive`、Store 與 Renderer 確認測試 |
| 取消移除不改變資料 | Pass | Renderer 取消確認測試 |
| 移除目前對話後回到空白新對話 | Pass | Controller 移除目前對話測試 |
| 處理中禁止切換、建立或移除 | Pass | Controller 互斥測試與 Renderer disabled 測試 |
| 保存完成與失敗狀態 | Pass | canonical completion 既有測試與 Store streaming 正規化測試 |
| 保持閱讀上下文邊界 | Pass | 既有閱讀區段裁切、去重、來源／範圍變更測試 |
| 保存或恢復失敗時可理解地降級 | Pass | 損壞檔、resume／archive 失敗與 unarchive 回滾測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `manages the global conversation list...`、Controller summary sorting |
| TC2 | Pass | `creates, switches and resumes isolated global conversations` |
| TC3 | Pass | 同上；標題壓平換行並保存來源摘要 |
| TC4 | Pass | 同上；切換後只投影目標訊息 |
| TC5 | Pass | 同上；驗證 `thread/resume` 與 `turn/start` thread id |
| TC6 | Pass | `restores the last selected conversation...`、Store round trip |
| TC7 | Pass | `shows a blank conversation when the persisted selection no longer exists` |
| TC8 | Pass | `archives a removed conversation...` |
| TC9 | Pass | Renderer 取消移除不呼叫 bridge |
| TC10 | Pass | Controller 移除目前對話後 active id／thread／messages 皆為空 |
| TC11 | Pass | Controller management lock 與 Renderer disabled assertions |
| TC12 | Pass | Store 把 persisted streaming 正規化為 failed；既有 completed／failed 投影測試 |
| TC13 | Pass | Renderer 閱讀區段裁切、去重、切章與失敗重試測試 |
| TC14 | Pass | resume／archive error 與 local-save unarchive rollback 測試 |
| TC15 | Pass | corrupt JSON 保留原檔測試 |
| TC16 | Pass | IPC test 與 Electron bridge key E2E |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/chat-conversation-store.test.ts
npm run test -w @reader/desktop -- src/main/chat-controller.test.ts
npm run test -w @reader/desktop -- src/main/chat-ipc.test.ts
npm run test -w @reader/desktop -- src/renderer/App.test.tsx -t 'manages the global conversation list'
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：Server 3/3、Desktop 81/81、Electron E2E 2/2 通過；全專案型別檢查及 production build 通過。

### Hypotheses and Decisions

- 對話清單使用 LingoShelf 自有索引，而非直接列出使用者帳戶的所有 Codex thread，避免混入產品外對話並保留乾淨的顯示訊息、標題與來源摘要。
- 空白新對話在第一則訊息成功建立 thread 後才持久化，避免產生大量空紀錄。
- 本機訊息是 UI 顯示來源，Codex thread 是 AI 延續上下文的來源；過去對話送出前才 lazy resume，縮短切換等待時間。
- 原子檔案保存與 Codex archive 無法形成單一交易；實作在 archive 後本機保存失敗時呼叫 unarchive 並恢復記憶體投影，使失敗對使用者保持可見且可重試。
- 實作期間發現另一個已提交的 F09 文件，因此本功能文件從原草案編號調整為 F10，避免編號衝突；功能內容與核准範圍未變。
- Electron E2E 在檔案沙箱內無法啟動桌面程序；改在允許 GUI 的環境重跑後 2/2 通過，屬環境限制而非產品缺陷。

### Deferred Items

- 對話搜尋、篩選、釘選、重新命名、匯出、垃圾桶、復原、批次移除與跨裝置同步不在 F10 範圍。

### Notes

- 對話只保存在本機 Electron user data；不會匯入 LingoShelf 之外建立的 Codex／ChatGPT 對話。
- `thread/resume` 與 `thread/archive` 延續既有 `approvalPolicy: never`、read-only sandbox 及停用工具／網路的安全設定。
- 本次沒有發現需要另立 RXX 的新架構問題；新增 Store 後，持久化、對話生命週期與 Renderer 呈現仍各自維持清楚責任。

## Appendix: TDD Implementation Checklist

1. 先以 Store、Controller、IPC 與 Renderer 測試描述全域清單、延遲建立、切換、恢復、移除及重啟行為。
2. 實作最小本機對話 Store 與型別化管理契約。
3. 讓 ChatController 以目前 AI 對話投影既有 thread／turn 串流流程。
4. 在右側 AI 對話面板加入新對話、對話紀錄、切換及確認移除介面。
5. 執行目標測試、全專案測試、型別檢查、production build 與 Electron E2E。
6. 更新本文件 Implementation Record 與 `documents/modules/ai-conversation.md`。
