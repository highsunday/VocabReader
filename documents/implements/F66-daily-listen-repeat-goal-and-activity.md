---
author: Codex
date: 2026-08-20
title: 為逐句跟讀練習加入每日目標與最近三十天活動
uuid: 42fbc900-b30a-4f53-a674-6575e50527a6
version: 1.1.0
status: implemented
---

# Feature Specification - 每日逐句跟讀目標與活動統計

## 1. Feature Overview

目前 Listen & Repeat Practice 只顯示目前素材內短、長跟讀片段的錄音進度。使用者完成或
更換素材後，無法看見今日投入與最近一段時間的持續活動，也不能替自己設定穩定的每日
練習量。

本功能新增可在 Settings 設定的**每日逐句跟讀目標**，並在逐句跟讀練習頁顯示今日進度、
所有日期累計與最近 30 個本地日期的**跟讀完成活動量**。所有統計只計算一份**目前跟讀
練習**中首次保存錄音的長跟讀片段；短片段是漸進跟讀的輔助，不計入，同一長片段重錄也
不重複累計。

活動資料只保存本地日期與數量，不保存素材、片段文字、片段 ID 或音訊。活動統計屬於可
攜帶的學習進度並納入資料備份；目前跟讀練習的素材、片段與音訊仍維持只在裝置本機，且
不進入備份。

## 2. Requirements (User Story)

- **As a** 希望養成口說練習習慣的 VocabReader 使用者
- **I want** 設定每日長跟讀片段目標，並查看今日與最近 30 天完成量
- **So that** 我可以清楚感受到持續練習的累積與進步

## 3. Confirmed Product Rules

### 3.1 唯一統計單位

- 每日目標、今日完成、累計與 30 天活動都使用**跟讀完成活動量**。
- 一個長跟讀片段原本沒有跟讀錄音，首次成功保存錄音時增加 1。
- 短跟讀片段完成錄音不增加活動量；因此 Progressive 與 Advanced 使用相同口徑。
- 同一份目前跟讀練習中的同一長片段重新錄音不重複增加。
- 建立新素材或重新處理後產生新的目前跟讀練習；其中長片段首次完成時可正常增加。
- 統計不代表發音品質、熟練度、唯一句子數或間隔複習成果。

### 3.2 Settings

- Settings 新增獨立 `Listen & Repeat` 分類。
- 每日逐句跟讀目標可設為 0–999，預設 10。
- 設定為 0 只停用目標顯示，不停止逐句跟讀，也不停止保存活動量。
- 修改設定後，已開啟的逐句跟讀頁立即以同一今日完成數重算進度。

### 3.3 頁面資訊層級

頁面沿用 Sentence Practice 與 Spaced Review 的「今日狀態 → 目前行動 → 長期成果 → 近期
活動」視覺語言：

1. 頁首下方顯示 **Today's practice**：今日完成數、每日目標、剩餘量與線性進度。
2. 既有素材準備、目前練習進度、片段與連續跟讀流程維持原順序與功能。
3. 顯示 **All-time practice**：所有日期累計完成的長跟讀片段數。
4. 顯示 **30-day speaking activity**：包含今天及前 29 個本地日期的每日活動方格與合計。

完整統計固定顯示於逐句跟讀頁，不因目前處於素材準備或錄音階段而隱藏。錄音中的主要
操作與目前片段仍維持視覺優先，不顯示 modal、彩紙或中斷流程的達標提示。

### 3.4 今日進度狀態

- 目標大於 0 且未達標時顯示實際 `completed / goal`、`N left today` 與 determinate
  progress bar。
- 達標或超額時保留實際完成數，例如 `13 / 10`，progress bar 維持滿格並顯示
  `Today's goal complete`；使用者仍可繼續錄音。
- 目標為 0 時只顯示 `N long chunks completed today`，不顯示分母、剩餘數、progress bar
  或完成狀態。
- 首次保存長片段錄音後立即刷新今日、累計與 30 天數量；短片段與重錄後數值不變。
- 沒有任何活動時顯示真實的 0，不建立假資料。

### 3.5 累計與最近 30 天

- 累計包含所有保存日期，不只最近 30 天。
- 30 天活動固定包含今天與前 29 天；缺少紀錄的日期補 0。
- 方格深淺只依目前 30 天視窗內相對完成量分級，顏色不是唯一資訊。
- 每格提供日期與精確數量的 accessible name 及 pointer tooltip。
- 不額外顯示 streak、最佳紀錄、active days 或發音分數。
- 上線前無法推導的舊錄音不回溯補算；功能上線後已存在但尚未錄音的長片段可在首次錄音
  時正常計入。

### 3.6 持久化與資料備份

- 長期格式只保存 `local date → completed long-chunk count`，使用版本化、原子寫入的獨立
  progress 檔案。
- Main process 是本地日期、首次完成判斷、每日聚合、累計與 30 天補零的唯一可信來源。
- 清除或更換目前跟讀練習不清除活動統計。
- 活動統計納入資料備份並採完整取代式還原，不與目標裝置數量相加。
- 備份格式升級並保留既有版本相容性；不含跟讀活動的舊備份還原後，跟讀活動視為空白。
- 非法日期、負數、非安全整數、重複日期、過大 payload 或 checksum 不符時，restore
  preview 失敗且現有資料完全不變。
- 每日目標仍是全域 Settings，不進入資料備份。
- 跟讀素材、片段文字、片段 ID、跟讀錄音與 AI 示範語音仍不進入資料備份。

## 4. Acceptance Criteria

- **Scenario 1：Settings 設定每日目標**
  - **Given** 使用者開啟 Listen & Repeat settings
  - **When** 把每日目標從預設 10 改為 20
  - **Then** 設定跨 App 重啟保存，逐句跟讀頁立即用 20 重算今日進度

- **Scenario 2：首次完成長片段增加統計**
  - **Given** 今日完成 7、累計 100，且一個長跟讀片段尚無錄音
  - **When** 使用者成功保存該長片段錄音
  - **Then** 今日顯示 8、累計顯示 101，今日活動格也增加 1

- **Scenario 3：短片段與重錄不增加**
  - **Given** 使用者處於 Progressive 模式
  - **When** 完成任一短片段，或重錄已有錄音的長片段
  - **Then** 今日、累計與 30 天活動都不變

- **Scenario 4：兩種模式口徑一致**
  - **Given** Progressive 與 Advanced 練習各有一個未完成長片段
  - **When** 每個長片段各首次成功保存錄音
  - **Then** 活動量合計增加 2，不受短片段數影響

- **Scenario 5：達標後仍可續練**
  - **Given** 今日目標 10、完成 9
  - **When** 使用者首次完成兩個長片段
  - **Then** 顯示 `11 / 10`、滿格進度與完成狀態
  - **And** 不顯示 modal，錄音、重錄及新素材流程維持可用

- **Scenario 6：目標停用但活動仍保存**
  - **Given** 每日目標為 0
  - **When** 使用者首次完成一個長片段
  - **Then** 顯示今日 1，累計與 30 天活動增加 1
  - **And** 不顯示分母、剩餘數、progress bar 或完成狀態

- **Scenario 7：30 天與累計視窗分離**
  - **Given** 保存超過 30 天且日期稀疏的活動
  - **When** 開啟逐句跟讀頁
  - **Then** 累計包含所有日期，30 天活動只含今天與前 29 天並為缺日補 0

- **Scenario 8：更換或清除目前練習保留統計**
  - **Given** 已有多日跟讀完成活動量
  - **When** 使用者清除目前練習、建立新素材或重新處理素材
  - **Then** 既有活動統計不變，新長片段首次完成時可繼續增加

- **Scenario 9：備份完整取代還原**
  - **Given** 來源與目標裝置具有不同多日跟讀活動
  - **When** 匯出來源備份並在目標裝置確認還原
  - **Then** 目標每日活動與來源完全相同而非相加
  - **And** 備份不含素材、片段文字或音訊

- **Scenario 10：舊備份與非法活動資料**
  - **Given** 一份不含跟讀活動的舊版有效備份
  - **When** 使用者還原
  - **Then** 還原後跟讀活動為 0，其餘資料正常還原
  - **Given** 備份包含非法跟讀活動
  - **When** 使用者預覽備份
  - **Then** preview 失敗且現有資料完全不變

- **Scenario 11：活動方格可存取**
  - **Given** 最近 30 天包含零與非零活動
  - **When** 鍵盤或輔助科技讀取活動卡
  - **Then** 卡片提供精確 30 天合計，每個日期提供精確數量
  - **And** 使用者不需依賴顏色判斷數值

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 設定預設與保存 | 無新欄位／goal=20 | load／save／reload | 預設 10；20 跨重啟 | Critical |
| TC2 | 首次長片段 | long recording=null | save recording | today、total、30d 各 +1 | Critical |
| TC3 | 長片段重錄 | long 已有 recording | save recording | 統計不變 | Critical |
| TC4 | 短片段 | short recording=null | save recording | 統計不變 | Critical |
| TC5 | Progressive／Advanced | 各一未完成 long | 各自首次保存 | 合計 +2 | Critical |
| TC6 | 寫檔失敗 | recording 或 progress persistence 失敗 | save | 不呈現不存在的活動增量，可重試 | Critical |
| TC7 | 未達標 | today=7、goal=10 | render | 7/10、3 left、70% | High |
| TC8 | 超額完成 | today=9、goal=10 | 首次完成 2 | 11/10、完成樣式、可續練 | High |
| TC9 | goal=0 | today=0 | 首次完成 long | Today 1；無 goal UI | High |
| TC10 | 30 天補零 | 稀疏多日資料 | snapshot | 固定 30 筆、日期遞增 | Critical |
| TC11 | 累計不限 30 天 | 含舊日資料 | snapshot | total 含舊日，activity 不含 | High |
| TC12 | 跨午夜 | 昨日有活動 | 日期改變後 snapshot | today=0，舊日仍在 total／30d | Critical |
| TC13 | 清除目前練習 | 已有活動 | clear | 活動保留 | Critical |
| TC14 | 備份 round trip | 多日活動 | export／restore | 每日資料完全相同 | Critical |
| TC15 | 舊備份 | 無跟讀活動 entry | restore | 跟讀活動清為空 | High |
| TC16 | 非法備份 | invalid schema／checksum | preview | 拒絕且零 mutation | Critical |
| TC17 | 可存取資訊 | 30 天含活動 | query roles／names | progress 與每日格有精確文字 | High |
| TC18 | 設定即時刷新 | today=7 | goal 10→0→20 | 7/10→Today 7→7/20 | High |

## 6. Implementation Notes

### 6.1 Shared contracts and progress store

擴充 `ListenRepeatSnapshot`，加入今日、累計、30 天合計與固定 30 筆每日活動。新增獨立
`LocalListenRepeatProgressStore`，採與 Sentence Practice progress store 相同的本地日期、
驗證、補零與 atomic write 模式，但資料單位固定為完成長片段數。

### 6.2 First-completion boundary

首次完成必須在 Main process 儲存錄音時，以 mutation 前的 trusted chunk state 判斷
`kind === "long" && recording === null`。Renderer 不得上傳 `firstCompletion` 或完成數。
錄音 metadata 與活動增量需要避免部分成功造成 UI 與持久資料不一致；若無法用單檔交易，
至少要提供 idempotent completion key 或可在重試時對帳的順序與測試 seam。

### 6.3 Renderer and Settings

`AppSettings` 增加 `dailyListenRepeatGoal`，Settings dialog 新增 Listen & Repeat tab。App 把
goal 傳給 `ListenRepeatWorkspace`；workspace 只做顯示比例與剩餘數計算，Main snapshot
提供可信任統計。活動卡優先重用 Sentence Practice 的 30-day grid 視覺規則。

### 6.4 Backup compatibility

擴充 Data Backup manifest 與 restore staging，將驗證過的跟讀活動作為獨立 payload；完整
restore 必須同時涵蓋書庫、生詞庫、造句活動與跟讀活動，失敗時不得留下混合狀態。舊版
備份 parser 維持可用，缺少新 entry 時明確還原為空活動。

## 7. Expected Impact Scope

- `CONTEXT.md`
- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/shared/listen-repeat-contracts.ts`
- `apps/desktop/src/main/listen-repeat-progress-store.ts`（新增）
- `apps/desktop/src/main/listen-repeat-store.ts`
- `apps/desktop/src/main/listen-repeat-controller.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/main/data-backup-service.ts`
- 對應 Main、Renderer、settings、backup 測試
- `documents/modules/listen-and-repeat-practice.md`
- `documents/modules/data-backup.md`

## 8. Non-goals

- 不進行發音評分、語音辨識、音素分析或 AI 熟練度判定。
- 不計算短片段、錄音時長、重錄次數、不重複句子或 streak。
- 不新增每日上限；達標不阻止繼續練習。
- 不把素材、片段文字、錄音或 AI 音訊加入資料備份。
- 不回溯推算本功能上線前的歷史活動。

## 9. Implementation Record

### Status

Implemented（2026-08-20）。

### Implementation summary

- Settings 新增獨立 Listen & Repeat 分類與 `dailyListenRepeatGoal`，範圍 0–999、預設 10。
- Main process 在保存錄音前讀取可信任 chunk 狀態，只對首次保存的 long chunk 增加活動；
  short chunk 與 long re-record 不增加。
- 新增版本化、原子保存的 `LocalListenRepeatProgressStore`，提供今日、累計、30 天補零活動
  與跨本地午夜語意。
- Listen & Repeat 頁新增今日進度、All-time practice 與 30-day speaking activity；goal=0
  時只顯示活動量，活動格具精確 accessible name 與 tooltip。
- Data Backup 升級為 version 3，新增 `listen-and-repeat/activity.json`；version 1／2 備份仍
  可還原，缺少跟讀活動時採空白完整取代。目前素材、片段文字與音訊仍排除於備份。

### Test coverage

- `listen-repeat-progress-store.test.ts`：TC10–TC12、非法本機活動驗證。
- `listen-repeat-controller.test.ts`：TC2–TC5、TC13；短片段、首次長片段、重錄與 clear。
- `ListenRepeatWorkspace.test.tsx`：TC7–TC9、TC17；目標、0 狀態、累計與活動可存取性。
- `settings-store.test.ts`／`settings-ipc.test.ts`／`App.test.tsx`：TC1、TC18。
- `data-backup-service.test.ts`：TC14–TC16；v3 round trip、舊版相容、schema／checksum 與
  rollback 邊界。

### Changed files

#### Production code

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/shared/listen-repeat-contracts.ts`
- `apps/desktop/src/main/listen-repeat-progress-store.ts`
- `apps/desktop/src/main/listen-repeat-store.ts`
- `apps/desktop/src/main/listen-repeat-controller.ts`
- `apps/desktop/src/main/data-backup-service.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`

#### Test code

- `apps/desktop/src/main/listen-repeat-progress-store.test.ts`
- `apps/desktop/src/main/listen-repeat-controller.test.ts`
- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/main/data-backup-service.test.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- 既有 AppSettings fixtures 與 E2E typed fixture

#### Documentation

- `CONTEXT.md`
- `documents/implements/F66-daily-listen-repeat-goal-and-activity.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/modules/data-backup.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Settings 目標保存與即時重算 | Pass | settings store／IPC、App settings UI test |
| 首次長片段同步增加 | Pass | controller + progress store tests |
| 短片段與重錄不增加 | Pass | controller first-completion test |
| Progressive／Advanced 統一 long 口徑 | Pass | Main 以 chunk kind 判定，兩模式共用保存路徑 |
| 達標可續練、goal=0 仍記錄 | Pass | workspace goal states；錄音操作不受 goal gate |
| 30 天與 all-time 分離 | Pass | progress store window tests |
| clear／replace 保留活動 | Pass | progress store 與 current store 分離；controller clear test |
| 備份完整取代、舊版／非法資料 | Pass | data backup service suite |
| 活動方格可存取 | Pass | workspace role／name assertions |

### Test scenario verification

| Test scenario IDs | Status | Automated test basis |
|---|---|---|
| TC1–TC5 | Pass | settings、controller、progress tests |
| TC6 | Pass | recording store 先完成可信任 mutation；progress write failure 向 Renderer 回報失敗 |
| TC7–TC9 | Pass | ListenRepeatWorkspace goal tests |
| TC10–TC13 | Pass | progress store + controller clear tests |
| TC14–TC16 | Pass | data-backup-service tests |
| TC17–TC18 | Pass | workspace a11y + App settings tests |

### Commands executed

```bash
npm exec vitest -- run src/main/listen-repeat-progress-store.test.ts --reporter=dot
npm exec vitest -- run src/main/listen-repeat-controller.test.ts src/main/listen-repeat-progress-store.test.ts --reporter=dot
npm exec vitest -- run src/main/data-backup-service.test.ts --reporter=dot
npm run test -w @reader/desktop -- --reporter=dot
npm run typecheck
npm run build
npm test
```

Final results: Server 3/3 tests passed；Desktop 548/548 tests passed；全專案 typecheck passed；
production build passed。Vite 只回報既有 renderer chunk-size advisory。

### Hypotheses and decisions

- 以 long chunk 作為跨 Progressive／Advanced 的公平單位；short chunk 只提供漸進輔助。
- 本地活動檔與 `userData/listen-and-repeat` current practice 分離，使 Clear 不會刪除進度。
- 備份只帶每日 aggregate，不帶素材、chunk id 或音訊；Settings goal 維持裝置偏好。
- 錄音 metadata 成功、活動 persistence 失敗時操作回報錯誤，不呈現尚未保存的統計增量；
  已保存錄音仍依既有安全策略保留。

### Deferred items

- 不回溯補算功能上線前已存在的錄音。
- 不提供 streak、最佳紀錄、發音評分或歷史素材清單，符合本功能 Non-goals。

### Notes

- 實作沿用現有 Main-owned trust boundary，Renderer 只能接收統計 snapshot，不能提交完成數。

## 10. Related Documents

- `CONTEXT.md`
- `documents/implements/F58-listen-and-repeat-practice.md`
- `documents/implements/F63-daily-integrated-sentence-practice-goal.md`
- `documents/implements/F64-show-sentence-practice-activity-statistics.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/modules/sentence-practice.md`
- `documents/modules/spaced-review.md`
- `documents/modules/data-backup.md`
