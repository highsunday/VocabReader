---
author: Codex
date: 2026-07-30
title: 每分鐘重新查詢 Codex 帳戶額度
uuid: 95842734-f9c5-4251-b329-998974b2885a
version: 1.1.0
status: implemented
---

# Feature Specification - 每分鐘重新查詢 Codex 帳戶額度

## 1. Feature Overview

目前 **Codex AI 執行層**只在初次連線時查詢帳戶額度，之後仰賴
`account/rateLimits/updated` 通知。當 Codex 沒有送出通知時，左側狀態卡會長時間
保留舊的五小時／每週剩餘比例。本功能在 Codex 保持連線期間，每 60 秒主動重新查詢
一次帳戶額度，讓狀態卡可以取得近期資料。

## 2. Requirements (User Story)

- **As a** 使用 VocabReader 內建 Codex 功能的使用者
- **I want** App 每分鐘重新查詢 Codex 帳戶額度
- **So that** 左側狀態卡不會只顯示啟動時取得的舊比例

## 3. Acceptance Criteria

- **Scenario 1：連線後定期刷新**
  - **Given** Codex 已連線且初次額度已載入
  - **When** 經過 60 秒
  - **Then** App 再呼叫一次 `account/rateLimits/read`
  - **And** 狀態卡收到正規化後的最新額度 snapshot

- **Scenario 2：持續刷新**
  - **Given** Codex 持續保持連線
  - **When** 每再經過 60 秒
  - **Then** App 各執行一次新的額度查詢

- **Scenario 3：關閉後停止**
  - **Given** 額度定期刷新已啟動
  - **When** Chat Controller 關閉或 Codex client 被替換
  - **Then** 定期計時器被清除
  - **And** 後續不再向舊 client 查詢額度

- **Scenario 4：暫時查詢失敗**
  - **Given** 狀態卡已有一份通過驗證的額度
  - **When** 某次定期查詢失敗
  - **Then** 保留最後一份有效額度
  - **And** 下一個 60 秒週期仍會再次嘗試

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 一分鐘刷新 | 初次查詢完成 | 觸發第一個 60 秒週期 | 第二次查詢並發布新比例 | Critical |
| TC2 | 持續刷新 | client 保持 ready | 再觸發兩個週期 | 每個週期各新增一次查詢 | High |
| TC3 | 關閉清理 | polling 已啟動 | 關閉 controller 後觸發週期 | 沒有新增查詢 | Critical |
| TC4 | 查詢失敗後重試 | 已有有效額度，第二次查詢失敗 | 觸發第三次查詢 | 第二次保留舊值，第三次可更新 | High |

## 5. Implementation Notes

- 定期查詢由 Electron Main 的 `ChatController` 管理，Renderer 繼續只呈現
  `ChatSnapshot`，不直接存取 Codex protocol。
- 初次額度查詢完成後才啟動 60 秒 interval。
- 同一時間最多執行一個額度查詢，避免延遲 request 造成重疊。
- controller 關閉、連線失敗或更換 client 時一律清除 interval。
- live rate-limit notification 仍保留，作為比一分鐘輪詢更即時的更新來源。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- `account/rateLimits/read` 可以在同一個已初始化的 Codex app-server client 上重複呼叫。
- 一分鐘的新鮮度符合使用者監看額度的需求。

### Open Questions

- 無。

### Non-goals

- 不提供使用者自訂查詢頻率。
- 不在 Renderer 建立第二套計時器。
- 不改變額度扣除方式、重置週期或 Codex 的計量規則。

## 7. Affected Modules and Files

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`
- `documents/modules/ai-conversation.md`

## 8. Implementation Record

### Status

Implemented on 2026-07-30.

### Implementation Summary

- `ChatController` 在初次帳戶額度與模型目錄載入完成、Codex 維持 ready 後，啟動
  固定 60 秒 interval。
- 每個週期呼叫 `account/rateLimits/read`，驗證並正規化回應後發布完整
  `ChatSnapshot`，Renderer 因既有訂閱而更新左側狀態卡。
- 同一個 client 最多只有一個定期額度查詢進行中；慢查詢不會疊加 request。
- 定期查詢暫時失敗時保留最後一份有效額度，下個週期繼續重試。
- client 結束、被替換或 controller 關閉時清除 interval；延遲返回的舊 client
  response 不得覆蓋新連線狀態。
- `account/rateLimits/updated` live notification 保持原行為，可在輪詢週期中間提供
  更即時的更新。

### Test Coverage

- `TC1`：fake timers 推進第一個 60 秒，驗證新增一次 read 並更新 72% → 67%。
- `TC2`：連續推進多個週期，驗證每分鐘各新增一次 read。
- `TC3`：關閉 controller 後再推進兩分鐘，驗證沒有新增 read。
- `TC4`：第二次 read 回傳錯誤時保留 72%，第三次 read 成功後更新為 67%。

### Changed Files

#### Production code

- `apps/desktop/src/main/chat-controller.ts`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/fake-codex-app-server.ts`

#### Documentation

- `documents/implements/F43-refresh-codex-allowance-every-minute.md`
- `documents/modules/ai-conversation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 連線後每 60 秒重新查詢並發布最新 snapshot | Pass | `refreshes the account allowance every minute and stops after close` |
| 保持連線時持續刷新 | Pass | 同一測試驗證第二、第三個週期 |
| 關閉或替換 client 時停止舊輪詢 | Pass | close 後推進 120 秒沒有新增 request；production cleanup 共用 `#disposeClient` |
| 暫時失敗保留有效資料並在下周期重試 | Pass | 第二次 read failure、第三次 read success |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 60 秒後 read count 2、weekly 67% |
| TC2 | Pass | 180 秒內 read count 4 |
| TC3 | Pass | close 後 read count 維持 4 |
| TC4 | Pass | failure 後 72%，下周期成功後 67% |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run ../main/chat-controller.test.ts -t "refreshes the account allowance every minute"
npm test -w @reader/desktop -- --run ../main/chat-controller.test.ts
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

### Hypotheses and Decisions

- 第一個 Red 指令以 repo 相對路徑傳給以 `src/renderer` 為 root 的 Vitest，導致無法
  收集測試；改用 `../main/chat-controller.test.ts` 後，測試以預期的「只有一次
  rate-limit read」失敗，確認是正確 Red。
- 動態 fake response callback 因 `unknown | function` 聯集失去 contextual typing；
  測試明確標註 `readCount: number` 後 typecheck 通過。
- 輪詢由 Main process 擁有，避免 Renderer 顯示生命週期建立重複 timer 或取得
  protocol 權限。

### Deferred Items

- 無。

### Notes

- 左側狀態卡最多可能比 Codex 帳戶真實額度晚約一分鐘；若收到 live notification，
  則可提前更新。
