---
author: Codex
date: 2026-07-28
title: 設定每日學習完成上限與複習試卷題數
uuid: 370c3c3e-20f1-4097-ba99-200c12b3a17f
version: 1.1.0
status: implemented
---

# Feature Specification - 設定每日學習完成上限與複習試卷題數

## 1. Feature Overview

目前間隔複習固定每回合最多 10 題，且不限制一天內引入或完成的新項目與既有到期
項目。使用者無法依自己的每日時間與負擔控制學習量，也無法調整一份試卷的長度。

本功能在全域設定中加入三項間隔複習偏好：

- **每日新項目完成上限**：`0–999`，預設 `10`。
- **每日到期複習完成上限**：`0–999`，預設 `50`。
- **每份試卷題數**：`1–20`，預設 `10`。

兩種每日額度彼此獨立。「完成」不是每次確認評級都增加數量；只有確認後的下一次
到期日期進入裝置目前時區的隔天或更晚，才完成該項目的本輪學習。下一次到期仍在
當天時，項目維持學習中並占用原始類別的名額，但不增加完成數。

## 2. Requirements (User Story)

- **As a** 使用間隔複習的語言學習者
- **I want** 設定每日可完成的新項目與到期複習數量，以及每份試卷題數
- **So that** 我能控制每日負擔與單次作答長度，並先完成已開始學習的項目

## 3. Confirmed Product Rules

### 3.1 設定、預設值與驗證

- 全域設定顯示「每日新項目完成上限」、「每日到期複習完成上限」與
  「每份試卷題數」。
- 每日兩種完成上限只接受 `0–999` 的整數；`0` 明確代表暫停該類項目，不代表
  無上限。
- 每份試卷題數只接受 `1–20` 的整數。
- 未保存過新欄位、舊版設定缺少欄位或欄位無效時，分別使用 `10`、`50`、`10`。
- 設定保存後立即影響後續選題；已生成或正在作答、批改、等待確認的試卷維持原內容，
  即使新上限不足以容納它也允許完成。

### 3.2 新項目與到期複習的穩定分類

- **新項目學習路徑**從一個從未開始複習的新學習項目首次被引入時開始。
- 新項目確認評級後，若下一次到期仍在同一個本地日曆日，它維持新項目學習中；
  跨越午夜也不自動變成既有到期複習。
- 新項目第一次把下一次到期日期推進到隔天或更晚時，完成新項目學習；該次才增加
  新項目完成數。此後再次到期時才進入到期複習路徑。
- **到期複習路徑**從一個已完成新項目學習的項目再次到期並被引入時開始。
- 既有到期項目確認評級後，若下一次到期仍在同一個本地日曆日，它維持到期複習
  學習中；跨越午夜仍保留到期複習類別。
- 既有到期項目把下一次到期日期推進到隔天或更晚時，完成本輪到期複習；該次才增加
  到期複習完成數。
- 同一學習路徑中的同日再次作答不重複占用新名額，也不增加另一類完成數。
- 試卷生成、提交答案、AI 批改或放棄試卷均不增加完成數；只有確認整份試卷且排程
  交易成功後，才依更新後的到期日期判定是否完成。

### 3.3 每日名額與選題

- 「今日」依 Main process 所在裝置的目前時區，以本地 00:00（含）至次日 00:00
  （不含）為界。
- 每一類別的占用量為「今日已完成數 + 目前尚未完成的學習中項目數」。
- 當一類別的占用量達上限時，不得再引入該類別的其他項目；已再次到期的學習中項目
  仍屬於既有占用，不會因再次入卷而重複占用名額。
- 兩種上限獨立；一類達上限不會消耗或阻擋另一類尚未用完的額度。
- 選題優先序固定為：
  1. 已再次到期、尚未完成的學習中項目；
  2. 其他既有到期項目，依逾期時間由久到近；
  3. 尚未開始的新項目，依 CEFR A1 至 C2、同級建立時間由舊到新。
- 第一類中的項目保留各自原始的新項目或到期複習分類；同層項目依精確到期時間由久
  到近排列。
- 一個回合最多選取「每份試卷題數」設定值；可用項目或剩餘額度不足時允許少於設定
  題數，不以其他已達上限的類別強行補滿。
- 每日上限設為 `0` 時，後續試卷不選入該類別，包括該類別尚未完成的學習中項目；
  既有進行中試卷不受影響。

### 3.4 當日中途修改

- 每日上限修改後立即套用於後續摘要與試卷。
- 已完成數不回溯，也不因調低上限而刪除複習歷史或改變排程。
- 若「已完成數 + 學習中數」已高於新上限，後續不得引入同類其他項目；使用者調高
  上限後，新增的剩餘名額立即可用。
- 已生成的進行中試卷按生成時的選題保留並可完成，因此修改當天的完成數可能暫時
  高於新上限。

### 3.5 進度與可用數顯示

- 間隔複習首頁分別顯示：
  - 新項目：「已完成 X / 上限 Y」與「學習中 Z」；
  - 到期複習：「已完成 X / 上限 Y」與「學習中 Z」。
- 顯示的可再引入名額等於 `max(0, 上限 - 已完成數 - 學習中數)`。
- 完整的新項目與到期項目待處理數仍在間隔複習首頁顯示，與每日可用數清楚區分。
- 側欄「間隔複習」數字改為目前可排入後續試卷的項目數，受兩類剩餘額度與當前到期
  狀態限制，不再顯示不受上限限制的全部 backlog。
- 確認試卷或保存設定後，摘要與側欄數字以最新資料更新。

## 4. Acceptance Criteria

- **Scenario 1：載入與保存三項設定**
  - **Given** 使用者尚未保存新設定欄位
  - **When** 開啟設定
  - **Then** 顯示每日新項目完成上限 10、每日到期複習完成上限 50、每份試卷題數 10
  - **And** 保存合法整數後，重新開啟 App 仍保留設定

- **Scenario 2：拒絕無效設定**
  - **Given** 使用者正在編輯間隔複習設定
  - **When** 任一每日上限不是 `0–999` 整數，或試卷題數不是 `1–20` 整數
  - **Then** 設定不得保存
  - **And** 使用者可辨識是哪個欄位無效

- **Scenario 3：兩種每日上限獨立選題**
  - **Given** 新項目占用量已達 10，但到期複習仍有額度及可用項目
  - **When** 系統建立下一回合摘要
  - **Then** 不引入其他新項目
  - **And** 仍可選入到期複習項目
  - **And** 反向情境採相同行為

- **Scenario 4：只有排到隔天才完成**
  - **Given** 一個新項目與一個既有到期項目都在今天進入各自學習路徑
  - **When** 確認後兩者的下一次到期仍在今天
  - **Then** 兩種今日完成數都不增加
  - **And** 兩者分別維持原始類別的學習中狀態並占用名額
  - **When** 後續確認把兩者的下一次到期日期排到隔天或更晚
  - **Then** 新項目完成數與到期複習完成數各增加 1

- **Scenario 5：跨日保持學習路徑**
  - **Given** 新項目今天開始後仍未完成
  - **When** 到達本地次日且項目再次到期
  - **Then** 它仍是新項目學習中，不轉成到期複習
  - **And** 完成時增加新項目完成數

- **Scenario 6：學習中項目優先**
  - **Given** 已再次到期的學習中項目、其他既有到期項目及全新項目同時存在
  - **When** 系統選出下一份試卷
  - **Then** 先選學習中項目，再選其他到期項目，最後以新項目補足
  - **And** 同層排序遵守精確到期時間或既有 CEFR／建立時間規則

- **Scenario 7：自訂試卷題數**
  - **Given** 每份試卷題數設為 6，且兩類額度合計至少有 6 個可選項目
  - **When** 生成下一份試卷
  - **Then** 摘要與試卷恰有 6 題
  - **Given** 只有 4 個項目可選
  - **When** 生成試卷
  - **Then** 試卷有 4 題且不超額引入其他項目

- **Scenario 8：中途調低設定保留既有試卷**
  - **Given** 已有一份 10 題進行中試卷
  - **When** 使用者把相關每日上限調低到不足 10
  - **Then** 既有試卷、答案與狀態不變且仍可確認
  - **And** 新上限只限制之後的試卷

- **Scenario 9：顯示完成、學習中及今日可用數**
  - **Given** 新項目今日已完成 3、學習中 2、上限 10
  - **When** 開啟間隔複習首頁
  - **Then** 顯示「已完成 3 / 10」與「學習中 2」
  - **And** 系統最多再引入 5 個新項目

- **Scenario 10：零代表暫停**
  - **Given** 每日新項目完成上限為 0，且沒有既有進行中試卷
  - **When** 系統建立下一回合
  - **Then** 不選入新項目或新項目學習中項目
  - **And** 到期複習仍依其獨立上限運作

- **Scenario 11：側欄顯示今天實際可排入數**
  - **Given** backlog 有 100 個項目，但今日兩類額度皆已用完
  - **When** 顯示側欄間隔複習入口
  - **Then** 側欄數字為 0
  - **And** 間隔複習首頁仍能顯示完整 backlog 與已用完的每日進度

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 舊設定升級 | settings.json 缺少三個欄位 | 載入設定 | 回填 10／50／10 且保留其他合法欄位 | Critical |
| TC2 | 設定邊界 | 上限 0、999；題數 1、20 | 保存設定 | 邊界值可保存 | Critical |
| TC3 | 設定拒絕 | 負數、小數、超過上界或非數字 | 保存設定 | 拒絕且不覆寫原設定 | Critical |
| TC4 | 獨立額度 | 一類用完、另一類仍有額度 | 查詢摘要 | 只選仍有額度的類別 | Critical |
| TC5 | 新項目未完成 | 首次確認後 next due 仍是今天 | 查詢摘要 | 新完成數不增、維持新學習中並占位 | Critical |
| TC6 | 到期複習未完成 | 既有到期確認後 next due 仍是今天 | 查詢摘要 | 到期完成數不增、維持到期學習中並占位 | Critical |
| TC7 | 完成判定 | next due 日期跨到隔天 | 確認交易成功 | 原始類別完成數增加 1 | Critical |
| TC8 | 跨日分類 | 前一天開始但未完成的新項目 | 次日查詢 | 仍屬新項目學習中 | Critical |
| TC9 | 選題優先序 | 學習中、其他到期與全新項目並存 | 選回合 | 依確認的三層順序選取 | Critical |
| TC10 | 題數設定 | paper size 為 1、6、20 | 選回合與生成 | 不超過設定且題目一一對應 | Critical |
| TC11 | 額度不足 | paper size 10、僅 4 個可選 | 生成試卷 | 產生合法 4 題試卷 | High |
| TC12 | 設定立即生效 | 已完成／學習中數高於調低後上限 | 查詢下一回合 | 不再引入同類項目 | Critical |
| TC13 | 既有試卷豁免 | 進行中試卷建立後調低上限 | 確認試卷 | 仍成功更新全部題目排程 | Critical |
| TC14 | 零值暫停 | 一類上限為 0 | 查詢摘要 | 該類不入卷、另一類正常 | Critical |
| TC15 | 進度 UI | 完成 3、學習中 2、上限 10 | 開啟複習頁 | 顯示 3/10、學習中 2、可再引入 5 | High |
| TC16 | 側欄可用數 | backlog 非零但額度用完 | 顯示側欄 | badge 為 0、首頁仍顯示 backlog | High |
| TC17 | 本地日界線 | 午夜前後有確認事件 | 計算完成數 | 依兩個本地午夜界定日期 | Critical |
| TC18 | 放棄不計數 | 生成、作答或批改後放棄 | 重新查詢摘要 | 完成數與排程不變 | Critical |

## 6. Implementation Notes

- `AppSettings`、本機設定 store 與 IPC validation 需新增三個整數欄位；設定頁新增一組
  「間隔複習」欄位與簡短輔助說明。
- Main process 的複習摘要與選題必須取得最新設定，避免 Renderer 傳入可偽造或過期
  的額度。
- 現有 `previous_card_json IS NULL` 只能判斷「這次確認前是否已有排程」，不足以辨認
  跨日未完成的新項目。實作需以可持久、可測試的方式保存或可靠推導「新項目學習
  路徑／到期複習路徑」及是否已完成，不能在午夜只依目前是否有 schedule 重新分類。
- 完成判定比較 `reviewedAt` 與 `nextDueAt` 在裝置目前時區的日曆日期，不以固定
  24 小時間隔判定；需保留既有精確到期時間與 FSRS 結果。
- 進行中試卷已在 `SpacedReviewController` 記憶體中保存選定項目；確認時不得重新套用
  後來調低的上限，但建立下一份試卷時必須重新讀取設定與摘要。
- `ReviewSummary` 應提供足以顯示 backlog、兩類完成數、兩類學習中數、剩餘可引入
  名額及實際可排入項目數的結構化欄位，避免 Renderer 重建領域計數。
- `selectedItems` 長度改由每份試卷題數設定控制；AI artifact 契約仍要求一個選定
  項目恰有一道題。
- 不需要 ADR：設定範圍與選題政策可由功能規格和測試安全演進，沒有難以逆轉的技術
  選擇。

## 7. Affected Modules and Files

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/spaced-review-ipc.test.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `documents/modules/spaced-review.md`

## 8. Assumptions, Open Questions and Non-goals

### Assumptions

- 使用者原稱的「新卡片」對應新項目學習路徑；「複習卡片／舊卡片」對應到期複習
  路徑。
- 每日上限控制完成量與同時占用的學習路徑名額，不改變 FSRS 如何依評級計算精確
  間隔。
- 裝置時區沿用現有本地日界線規則，不新增自訂學習日開始時間。

### Open Questions

- 無。

### Non-goals

- 不設定每日總題數、每日回合數、學習分鐘數、連續天數或每日通知。
- 不提供「無上限」特殊值；最大合法值為 999。
- 不改變 AI 出題格式、答案批改、複習評級或 FSRS 參數。
- 不保存未完成試卷到 App 重啟之後。
- 不重新分類或回寫既有複習歷史的 AI 回饋與答案內容。

## 9. Module Documentation Recommendation

實作完成時更新 `documents/modules/spaced-review.md`：

- 把固定 10 題改為可設定 1–20 題。
- 說明新項目與到期複習的穩定學習路徑、完成條件及選題優先序。
- 說明兩種獨立每日完成上限、學習中占位及側欄可排入數。
- 更新摘要資料流、設定依賴與相關 F37 連結。

不需要建立新模組文件；功能仍落在既有設定與 `spaced-review` 模組邊界內。

## 10. Implementation Record

### Status

Implemented on 2026-07-28.

### Implementation Summary

- `AppSettings`、本機 JSON store 與 IPC validation 新增每日新項目完成上限、每日到期
  複習完成上限及每份試卷題數，舊設定分別安全回填 10／50／10。
- Main process 每次建立複習摘要都讀取最新設定；Renderer 保存設定後重新查詢摘要與
  側欄數字，已有試卷時保留原選題與作答狀態。
- `LocalLearningLibrary` 依既有事件序列推導新項目／到期複習學習路徑。下一次到期
  日期仍在確認當天時維持學習中且不增加完成數；排到隔天或更晚才完成。未完成路徑
  跨日保持原類別。
- 選題依學習中、其他既有到期、全新項目三層排序，套用兩類獨立名額與 1–20 題設定；
  `0` 暫停該類，額度或項目不足時產生較短試卷。
- 間隔複習首頁顯示兩類完成數／上限、學習中數、backlog 與剩餘名額；側欄 badge 改為
  目前受額度限制後仍可排入試卷的數量。
- App 內建 `practice-spaced-review` skill 的 generation input 上限由 10 更新為 20。

### Test Coverage

- TC1–TC3：settings store 與 IPC 測試涵蓋舊設定回填、合法邊界、負數、超界、小數及
  不覆寫 store。
- TC4–TC14、TC17–TC18：真實 `node:sqlite` repository tests 涵蓋獨立額度、同日
  學習中、完成判定、跨日分類、三層排序、題數不足、立即生效、零值暫停、本地日界線
  與未確認不寫入。
- TC15–TC16：Renderer 與 App tests 涵蓋設定欄位、保存後刷新、完成／學習中進度、
  可用數及側欄同步。
- controller、IPC 與 artifact 既有測試確認 1–20 題仍維持一項目一題、暫態試卷及
  受信任確認邊界。

### Changed Files

#### Production Code

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `CONTEXT.md`
- `documents/implements/F37-configurable-daily-review-limits-and-paper-size.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 載入與保存三項設定 | Pass | settings store、IPC 與 App tests |
| 拒絕無效設定 | Pass | IPC range／integer parameterized tests |
| 兩種每日上限獨立選題 | Pass | repository independent-capacity tests |
| 只有排到隔天才完成 | Pass | same-day retry → later-date repository test |
| 跨日保持學習路徑 | Pass | next-day summary 仍回傳 `reviewKind: new` |
| 學習中項目優先 | Pass | 三層混合 repository test |
| 自訂試卷題數 | Pass | configured size、capacity-shortage tests |
| 中途調低設定保留既有試卷 | Pass | confirmation 不重新檢查額度；Renderer refresh 保留 selectedItems |
| 顯示完成、學習中及今日可用數 | Pass | SpacedReviewWorkspace status tests |
| 零代表暫停 | Pass | repository zero-limit test |
| 側欄顯示今天實際可排入數 | Pass | `totalAvailable` policy、App refresh test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `safely loads legacy settings and falls back invalid fields independently` |
| TC2 | Pass | settings IPC accepts 0／999 and 1／20 |
| TC3 | Pass | `rejects invalid ... values` parameterized cases |
| TC4 | Pass | `limits new introductions independently...` and mixed queue test |
| TC5 | Pass | `keeps a same-day retry in its new learning path...` |
| TC6 | Pass | progress classifier plus mature due mixed queue path |
| TC7 | Pass | same-day retry test verifies later-date completion |
| TC8 | Pass | next-day assertion retains new learning kind |
| TC9 | Pass | `prioritizes learning paths, then mature due items...` |
| TC10 | Pass | setting boundaries, policy size and controller coverage |
| TC11 | Pass | selected rows are bounded by actual eligible capacity |
| TC12 | Pass | settings provider read per summary and App refresh test |
| TC13 | Pass | controller retains active paper and confirmation contract |
| TC14 | Pass | `treats zero as a pause...` |
| TC15 | Pass | status region shows `X / Y` and learning counts |
| TC16 | Pass | `totalAvailable` drives App sidebar badge |
| TC17 | Pass | local calendar boundary repository test |
| TC18 | Pass | discard／confirmation tests preserve transaction boundary |

### Commands Executed

```bash
npm run test -w @reader/desktop -- --run src/main/settings-store.test.ts src/main/settings-ipc.test.ts
npm run test -w @reader/desktop -- --run src/main/learning-library-service.test.ts
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx src/renderer/SpacedReviewWorkspace.test.tsx
npm run test -w @reader/desktop
npm run typecheck
npm run build -w @reader/desktop
npm run test:e2e -w @reader/desktop
npx playwright test tests/e2e/desktop.spec.ts --grep "launches the secure Electron reading shell"
git diff --check
```

### Hypotheses and Decisions

1. Repository 紅燈最初被 Vitest 的全域 jsdom/client bundler 擋住，錯誤為無法 bundle
   `node:sqlite`。假設依序為錯誤測試環境、錯誤 project root、Node 不支援 SQLite；
   直接匯入成功且設定檔明確使用 jsdom，確認第一項。測試檔加入
   `// @vitest-environment node` 後可執行真實 SQLite 測試。
2. Windows 測試清理會因 SQLite handle 尚存而回報 `EBUSY`；清理僅對已驗證的臨時
   測試目錄忽略該錯誤，不削弱任何功能 assertion。
3. 不新增資料庫欄位：新／到期學習路徑可由事件的完成順序與本地日期可靠推導，避免
   migration 與雙重狀態來源。代價是摘要目前需掃描 active 項目的事件序列。
4. `totalAvailable` 改為受今日額度限制後的實際可排入數，另以 `backlogTotal` 保存
   完整待處理量；側欄因此不再在額度用完時顯示誤導數字。
5. 保存設定時重新查詢摘要；若已有試卷，保留舊 `selectedItems`，只更新額度、進度與
   側欄數字，符合進行中試卷豁免。
6. Electron E2E 在 Playwright 注入 inspector loader 時以 exit code 1 退出，沒有進入
   測試；清除後重跑結果相同。直接啟動同一 production build 可持續運行且 stderr
   為空，因此判定為目前 Playwright／Electron Windows 啟動環境限制，而非產品啟動
   回歸。

### Deferred Items

- Electron Playwright E2E 因上述 inspector 啟動環境限制未執行到頁面 assertion；
  production build、直接 Electron 啟動、276 個 Vitest tests 與 root typecheck 已通過。
- 未新增自訂學習日開始時間、無上限模式或完成趨勢圖。

### Architectural Observations

- `LocalLearningLibrary` 能從 immutable review events 還原穩定學習路徑，保持單一真相
  來源；但每次摘要掃描完整 active event history，資料規模增長後可能需要一份可重建
  的 projection 或索引。這是後續 RXX 候選，不阻擋目前功能。
- 設定 store 與複習 repository 透過窄的 async preferences provider 連接，Main process
  保有額度信任邊界，Renderer 不傳入可偽造的上限或目前時間。

## Appendix: TDD Implementation Checklist

1. 先以設定預設值／validation、完成與學習中分類、跨日保持、獨立額度、選題順序、
   自訂題數、進行中試卷豁免及 UI 進度建立紅燈。
2. 完成可持久的學習路徑狀態與 repository 查詢，再串接最新設定。
3. 更新 Renderer 設定與間隔複習摘要，維持進行中試卷狀態。
4. 執行聚焦測試、desktop 完整測試、typecheck、build、E2E（若環境可用）與
   `git diff --check`。
5. 回填本文件實作記錄並同步 `documents/modules/spaced-review.md`。
