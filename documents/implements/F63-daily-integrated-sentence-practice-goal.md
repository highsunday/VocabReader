---
author: Codex
date: 2026-08-14
title: 設定每日整合造句目標並在側欄顯示剩餘數量
uuid: e2ab3543-e84c-4d58-ac1a-e15def7c0ba5
version: 1.1.0
status: implemented
---

# Feature Specification - 每日整合造句目標與側欄剩餘數量

## 1. Feature Overview

目前**整合造句練習**可讓使用者每輪選擇 2 至 10 個學習項目，但沒有每日練習目標，
側欄也無法提示今日還需要實際運用多少項目。本功能新增**每日整合造句目標**：使用者
可在 Settings 的獨立 Sentence Practice 分類設定每天想透過合格短文實際運用的學習項目
總數，預設 10、範圍 0 至 999。

每日進度按通過的每輪實際學習項目數累加，不限制回合組合。例如目標 10 可由兩輪各 5
個或五輪各 2 個達成。只有使用者提交短文，且 AI 確認所有必要用詞均符合目標語義並
產生正式**造句批改結果**後，該輪才恰好計入一次；未提交、需修稿、AI 失敗或重複提交
同一輪都不增加進度。

側欄 Sentence Practice 入口在目標大於零時顯示今日剩餘學習項目數；剩餘值以
`max(goal - completed, 0)` 表示。達標後仍可繼續練習，最後一輪超額也不顯示負數。
設定為 0 代表停用每日目標與剩餘數量 badge，不停用整合造句練習。

## 2. Requirements (User Story)

- **As a** 希望每天維持英文主動輸出的 VocabReader 使用者
- **I want** 設定每日整合造句要實際運用的學習項目數，並從側欄看到剩餘數量
- **So that** 我能用不同大小的練習回合彈性完成每日目標，且只有真正通過的練習才算進度

## 3. Confirmed Product Rules

### 3.1 目標設定

- Settings 新增獨立 `Sentence Practice` 分類，避免把整合造句混入 Spaced Review。
- `Daily learning-item goal` 接受 0 至 999 的整數，預設 10；舊設定缺少欄位時使用預設值。
- 0 代表停用目標與側欄 badge，但練習的資格、每輪 2 至 10 個項目及開始新一輪行為不變。
- 目標是建議量而非上限；達標後仍可開始、提交及通過更多練習。
- 修改目標後，側欄立即以今日既有完成數重新計算；降低目標不產生負數，提高目標則重新
  顯示尚未完成的差額。

### 3.2 完成與累計

- 一輪只有在提交後收到通過的 AI artifact、進入 `completed` 並產生正式造句批改結果時，
  才按該輪 `itemCount` 增加當日完成數。
- `needs-revision`、AI／artifact error、尚未提交或只產生三篇用法範例都不計入。
- 同一 session 即使再次提交或重試成功回覆，也只能計入一次。
- 每輪數量可自由組合；完成數保存實際總量而非只保存是否達標，因此超額完成後提高目標
  仍可正確顯示差額。
- 目標為 0 時通過的練習仍保存實際完成數；同日重新啟用目標時可反映已完成的練習。

### 3.3 每日邊界與持久化

- 「今日」依裝置目前時區的本地日曆日判定，跨日後自動從 0 重新計算。
- 今日完成數跨 workspace 與 App restart 保留；只保存完成日期、session 去重資訊及項目數，
  不保存使用者短文、必要用詞、AI 回覆或批改內容，不建立可瀏覽的寫作歷史。
- 每日進度屬於裝置本機練習狀態，不加入**資料備份**；資料還原不回復過去裝置的今日數量。

### 3.4 側欄呈現

- 目標大於 0 時，Sentence Practice 入口右側以與既有 Review／Library 數量一致的 badge
  顯示剩餘學習項目數，accessible name 同時包含入口名稱與數值。
- 每輪通過後立即更新 badge，不要求切頁或重啟 App。
- `needs-revision` 或失敗後 badge 維持不變；通過但超過目標時顯示 0。
- 目標為 0 時完全省略 badge，不以 0 暗示尚有零項或功能不可用。

## 4. Acceptance Criteria

- **Scenario 1：設定每日目標與相容舊設定**
  - **Given** 使用者尚未保存每日整合造句目標
  - **When** 開啟 Settings 的 Sentence Practice 分類
  - **Then** 顯示預設值 10，並可保存 0 至 999 的整數
  - **And** 非整數或越界值不得通過 Settings 邊界

- **Scenario 2：不同回合組合累加達標**
  - **Given** 今日目標為 10 且完成數為 0
  - **When** 使用者通過兩輪各 5 個項目，或五輪各 2 個項目
  - **Then** 今日實際完成數為 10，側欄剩餘數為 0
  - **And** 仍可開始下一輪練習

- **Scenario 3：只有正式通過才計入**
  - **Given** 使用者已開始一輪包含 5 個學習項目的整合造句練習
  - **When** 短文未提交、AI 要求修稿、AI 失敗或只產生用法範例
  - **Then** 今日完成數與側欄剩餘數均不變
  - **When** 使用者修稿後提交並取得正式造句批改結果
  - **Then** 今日完成數增加 5 且同一輪只增加一次

- **Scenario 4：目標是建議量而非上限**
  - **Given** 今日目標為 10 且已完成 8 個項目
  - **When** 再通過一輪 5 個項目的練習
  - **Then** 實際完成數為 13、側欄顯示 0
  - **And** 系統不阻止繼續練習

- **Scenario 5：停用與重新啟用目標**
  - **Given** 每日目標設為 0
  - **When** 使用者檢視側欄並完成一輪練習
  - **Then** Sentence Practice 入口沒有數量 badge，練習仍可正常完成
  - **When** 同日把目標改為非零
  - **Then** 側欄按當日已通過的實際項目數顯示剩餘值

- **Scenario 6：跨重啟與跨日**
  - **Given** 今日已有通過的整合造句項目數
  - **When** 使用者切換 workspace 或重新啟動 App
  - **Then** 側欄恢復相同的今日剩餘數
  - **When** 裝置進入下一個本地日曆日
  - **Then** 今日完成數自動歸零，側欄恢復完整目標值

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 設定預設與保存 | 舊 settings 無新欄位 | load／save 0、10、999 | 預設 10，合法整數保留 | Critical |
| TC2 | 設定邊界 | 完整 settings payload | save -1、1000 或小數 | IPC 拒絕且不寫入 | Critical |
| TC3 | 兩輪各 5 | 目標 10 | 兩個 session 各通過 5 | completed=10、remaining=0 | Critical |
| TC4 | 五輪各 2 | 目標 10 | 五個 session 各通過 2 | completed=10、remaining=0 | Critical |
| TC5 | 不合格狀態 | 5-item session | 未提交／examples／revision／error | 完成數保持不變 | Critical |
| TC6 | 同輪去重 | 同一 completed session | 再次提交或重複完成 callback | 只增加一次 5 | Critical |
| TC7 | 超額與續練 | completed=8、goal=10 | 通過 5-item session | completed=13、badge=0、可新開一輪 | Critical |
| TC8 | 目標停用 | goal=0 | 完成練習並檢視側欄 | 無 badge、練習未停用、實際數仍保存 | High |
| TC9 | 修改目標 | completed=6 | goal 10→5→20 | badge 4→0→14 | High |
| TC10 | 重啟持久化 | 今日 completed=5 | 建立新 progress store／App | completed=5、remaining 正確 | Critical |
| TC11 | 本地跨日 | 前一本地日 completed=5 | clock 前進至隔天 | completed=0、remaining=goal | Critical |
| TC12 | Renderer 即時更新 | badge 顯示 5 | 本輪 5 個通過 | 不切頁即顯示 0 | Critical |
| TC13 | 可存取 badge | goal>0／goal=0 | 檢視 Sentence Practice 入口 | name 含剩餘數／停用時無數值 | High |

## 6. Impact Scope

- `CONTEXT.md`：新增每日整合造句目標詞彙與完成關係。
- `apps/desktop/src/shared/settings-contracts.ts`、`main/settings-store.ts`、`main/settings-ipc.ts`：
  新增預設 10、0–999 的全域設定及 legacy fallback。
- `apps/desktop/src/shared/sentence-practice-contracts.ts`：snapshot 加入今日已完成項目數。
- `apps/desktop/src/main/sentence-practice-progress-store.ts`：本地日進度、原子保存及 session 去重。
- `apps/desktop/src/main/sentence-practice-controller.ts`：只在 parsed completed result 後記錄一次。
- `apps/desktop/src/main/main.ts`：注入 progress store。
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`：把初始、跨日及完成後 snapshot 進度回報 App。
- `apps/desktop/src/renderer/App.tsx`：Settings 分類、設定控制、剩餘值計算與側欄 badge。
- `apps/desktop/src/renderer/styles.css`：僅在現有 badge 樣式不足時補充。
- 對應 Settings、progress store、Controller、IPC、Workspace 與 App 測試。
- `documents/modules/sentence-practice.md`：同步持久進度邊界、state flow 與測試覆蓋。

## 7. Non-goals and Assumptions

- 不限制每日回合數，也不在達標後停用開始或提交操作。
- 不保存、瀏覽或分析歷史作文、必要用詞清單、AI 範例或造句批改結果。
- 不改變每輪 2–10 個項目、資格抽取、AI 驗證、範例產生或新一輪確認流程。
- 不更新 FSRS、複習排程、複習歷史或任何學習項目的熟練狀態。
- 不新增 streak、週／月圖表、通知、補做、臨時加量或自訂一天開始時間。
- 「項目數」計算每輪被要求使用的學習項目數；不同輪再次抽到同一學習項目仍各自計入，
  因為目標衡量的是實際運用次數，不是每日不重複項目數。

## 8. Implementation Record

### Status

Implemented（2026-08-14）。

### Implementation summary

- App Settings 新增獨立 Sentence Practice tab 與 0–999 的每日學習項目目標，預設 10；
  legacy settings 缺欄位或值非法時安全回復預設。
- Main-owned `LocalSentencePracticeProgressStore` 以原子 JSON 保存本地日期、完成項目總數與
  session ids；同輪去重、跨 App restart 保留，跨本地日自動回到 0。
- Controller 只在 AI artifact 已通過 parser 且 status 為 `completed` 後記錄本輪 itemCount；
  revision、examples、malformed／runtime error 均不計入。
- Snapshot 公開 `dailyCompletedItemCount`。保持 mounted 的 Workspace 在初始載入、完成後及
  下一個本地午夜回報 App，側欄以 `max(goal - completed, 0)` 即時顯示剩餘數。
- 目標為 0 時完全省略 badge，但 progress store 仍記錄實際通過量；達標或超額後入口與
  新一輪操作都維持可用。

### Test coverage

- `settings-store.test.ts`、`settings-ipc.test.ts`：TC1、TC2；default／legacy、0／999 與非法值。
- `sentence-practice-progress-store.test.ts`：TC3、TC4、TC6、TC10、TC11；2×5、5×2、去重、
  restart、本地跨日與非法 completion record。
- `sentence-practice-controller.test.ts`：TC5、TC6；revision 不記錄、completed 記錄一次、
  snapshot 完成數及既有 error／examples regression。
- `SentencePracticeWorkspace.test.tsx`：TC11、TC12；初始／完成後 callback 與午夜自動刷新。
- `App.test.tsx`：TC7、TC8、TC9、TC12、TC13；剩餘 badge、停用、調整、超額歸零、
  即時更新與 accessible name。
- `desktop.spec.ts`：既有真實 Electron sidebar 與 Settings persistence 回歸已同步新契約。

### Changed files

#### Production code

- `CONTEXT.md`
- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/shared/sentence-practice-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/main/sentence-practice-progress-store.ts`
- `apps/desktop/src/main/sentence-practice-controller.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`

#### Test code

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/main/sentence-practice-progress-store.test.ts`
- `apps/desktop/src/main/sentence-practice-controller.test.ts`
- `apps/desktop/src/main/sentence-practice-ipc.test.ts`
- `apps/desktop/src/main/selection-speech-service.test.ts`
- `apps/desktop/src/main/listen-repeat-voice-service.test.ts`
- `apps/desktop/src/renderer/SentencePracticeWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `documents/implements/F63-daily-integrated-sentence-practice-goal.md`
- `documents/modules/sentence-practice.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 1. 設定每日目標與相容舊設定 | Pass | Settings store／IPC default、legacy、boundary tests |
| 2. 不同回合組合累加達標 | Pass | Progress store 2×5／5×2 parameterized tests |
| 3. 只有正式通過才計入 | Pass | Controller revision→completed→duplicate submission test |
| 4. 目標是建議量而非上限 | Pass | App overflow=0 且仍可開啟 practice test |
| 5. 停用與重新啟用目標 | Pass | App goal 0→20 badge test；Controller/store 與 goal 解耦 |
| 6. 跨重啟與跨日 | Pass | Progress store restart／local-day tests；Workspace midnight refresh test |

### Test scenario verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Settings default、save、legacy fallback |
| TC2 | Pass | Settings IPC -1／1000／fraction rejection |
| TC3 | Pass | Progress store 2 rounds × 5 |
| TC4 | Pass | Progress store 5 rounds × 2 |
| TC5 | Pass | Controller revision、examples/error regressions |
| TC6 | Pass | Controller session set + progress store persisted idempotency |
| TC7 | Pass | App completed=13、goal=10 shows 0 and opens workspace |
| TC8 | Pass | App goal=0 hides badge；completion persistence independent of setting |
| TC9 | Pass | App goal 10→5→0→20 recalculates immediately |
| TC10 | Pass | New progress-store instance retains today's total |
| TC11 | Pass | Store local day rollover + mounted Workspace midnight snapshot refresh |
| TC12 | Pass | Workspace completed snapshot callback + App badge render |
| TC13 | Pass | App role/name assertions for enabled and disabled goal |

### Commands executed

```bash
npm run test -w @reader/desktop -- --run src/main/settings-store.test.ts
npm run test -w @reader/desktop -- --run src/main/sentence-practice-controller.test.ts \
  -t "records each completed round once"
npm run test -w @reader/desktop -- --run src/renderer/SentencePracticeWorkspace.test.tsx \
  -t "reports today's completed"
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx \
  -t "configures the daily Sentence Practice goal"
npm run test -w @reader/desktop
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
```

結果：Desktop Vitest 53 files／528 tests passed；server + Desktop typecheck passed；
server + Desktop production build passed（只有既有 renderer chunk-size advisory）；Electron
Playwright 3/3 passed。

### Decisions and observations

- `grill-with-docs` 已確認每日數值是可超額的目標，不是硬性上限。
- 0 只停用目標顯示，並不停用整合造句練習。
- 以獨立 Sentence Practice 設定分類維持與 Spaced Review 的領域邊界。
- 每日進度刻意放在 Settings 本機目錄的獨立 store，不修改生詞庫 schema，因此不會把
  裝置當日練習量混入資料備份或間隔複習歷史。
- 持久資料只保留目前本地日摘要與 session ids；跨日首次寫入會取代舊日資料，不形成
  長期寫作活動歷史。

### Deferred items

- 無。

### Notes

- Production build 保留既有大於 500 kB renderer chunk advisory，與本功能無關。
- 實作沒有發現需要另立 RXX 的責任邊界或測試 seam 問題。

## Appendix: TDD Implementation Checklist

1. 為 settings、progress store、controller 與 sidebar 寫入失敗測試。
2. 完成最小設定與可信任進度保存，使完成條件及去重測試轉綠。
3. 接上 Workspace → App 的進度同步、跨日刷新與側欄 badge。
4. 執行目標測試、Desktop 完整測試、typecheck、build，必要時執行 Electron E2E。
5. 更新本文件 Implementation Record 與 `documents/modules/sentence-practice.md`。
