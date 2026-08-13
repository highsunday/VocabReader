---
author: Codex
date: 2026-08-14
title: 在整合造句練習頁顯示今日、累計與三十天運用統計
uuid: 57e083d3-130b-4fe8-bf19-9bcca976fbdf
version: 1.1.0
status: implemented
---

# Feature Specification - 整合造句練習活動統計

## 1. Feature Overview

目前 **Sentence Practice** 側欄入口只顯示今日距離**每日整合造句目標**尚餘多少學習
項目，練習首頁本身則只顯示符合資格的項目數。使用者無法在準備開始練習時看見今日
投入、長期累積或最近一段時間的持續活動，因此完成一輪後的正向回饋只停留在當下。

本功能在 Sentence Practice 首頁加入三層、但統一使用同一單位的**造句運用次數**：

1. 今日完成數與每日目標。
2. 所有日期的累計完成數。
3. 最近 30 個本地日期的每日完成數活動方格。

每一輪只有在使用者提交短文、AI 回傳不含實質修改並使畫面顯示
`Everything looks good` 的正式**造句批改結果**時，才按該輪必要用詞數增加統計。同一
學習項目在不同隨機回合再次出現時會再次計入；不計算不重複項目，也不新增手動選詞。

統計用來呈現合格練習的投入，不宣稱記憶成果、熟練度或正確率。歷史只保存本地日期與
當日完成數，納入**資料備份**及完整取代式**資料還原**；不保存作文、必要用詞、學習
項目 ID、AI 回覆或回合明細。

## 2. Requirements (User Story)

- **As a** 希望維持主動英文輸出的 VocabReader 使用者
- **I want** 在 Sentence Practice 頁面看見今日、累計與最近 30 天成功運用的數量
- **So that** 我能從立即進度與長期累積得到繼續完成整合造句練習的動力

## 3. Confirmed Product Rules

### 3.1 唯一統計單位

- 所有統計使用**造句運用次數**，單位是「通過練習的必要用詞數」。
- 一輪 5 個必要用詞取得 `Everything looks good` 時增加 5；五輪各 2 個則增加 10。
- 同一學習項目由系統在不同回合再次隨機抽到並通過時，每次都正常累加。
- 不計算或顯示不重複學習項目數、完成文章篇數、練習回合數、正確率或熟練度。
- 不增加手動挑選、排除、固定或偏好學習項目的能力；既有隨機抽取規則維持不變。

### 3.2 合格條件

- 沿用 F63 與 B24 的完成規則：只有正式**造句批改結果**的 `changes` 為空、畫面顯示
  `Everything looks good` 時，才按該輪 `itemCount` 增加一次。
- `needs-revision`、AI／artifact error、未提交、只產生用法範例，或 completed feedback
  仍含實質修改時，今日、累計及 30 天數量均不改變。
- `conversationalSuggestions` 是可選自然說法；只要 `changes` 為空便不阻止累計。
- 同一暫態 session 的合格結果只能增加一次。

### 3.3 Sentence Practice 首頁資訊層級

完整統計只出現在 Sentence Practice 首頁，排列順序比照 Spaced Review 的「今日狀態 →
目前行動 → 長期成果 → 近期活動」：

1. **Today's practice**：今日完成數、每日目標、剩餘數量與線性進度。
2. 既有 eligible count、項目數選擇及 Start／Continue practice 區域。
3. **All-time practice**：一個大型累計造句運用次數，不加入其他成果指標。
4. **30-day writing activity**：30 個每日方格及最近 30 天合計數量。

建議版面：

```text
┌ Today's practice ─────────────────────────────────────────┐
│ 7 / 10 successful uses                     3 left today   │
│ ███████████████████████░░░░░░░░░░░░░░░                   │
└────────────────────────────────────────────────────────────┘

┌ Today's focus ─────────────────────────────────────────────┐
│ 84 reviewed English items available    [5] [Start practice]│
└────────────────────────────────────────────────────────────┘

┌ All-time practice ───────────┐  ┌ 30-day writing activity ┐
│ 286                          │  │ 68 successful uses       │
│ successful uses             │  │ □ ▣ ■ □ ▪ ... (30 days) │
└──────────────────────────────┘  └──────────────────────────┘
```

### 3.4 今日進度狀態

- 目標大於 0 且未達標時顯示實際 `completed / goal`、`N left today` 與 determinate progress
  bar；剩餘值不低於 0。
- 達標或超額時保留實際完成數，例如 `13 / 10`，progress bar 維持滿格，顯示低干擾的
  `Today's goal complete` 與勾選狀態；不顯示彈窗、彩紙動畫，也不阻止開始新一輪。
- 目標為 0 時不顯示分母、剩餘數、progress bar 或達標狀態，只顯示
  `N successful uses today`；統計仍照常累加。
- 尚無任何合格練習時顯示真實的 0，不製造假活動；輔助文案引導使用者完成一輪
  `Everything looks good` 的練習。
- 修改每日目標後立即用同一今日完成數重算首頁狀態，與既有側欄 badge 保持一致。

### 3.5 進行中練習

- 進入 writing、checking、needs-revision、completed 或 error 畫面後，隱藏完整統計卡，
  避免干擾寫作。
- 頁首保留精簡今日狀態：目標大於 0 時顯示 `Today N / goal`；目標為 0 時顯示
  `Today N`。
- 本輪尚未符合合格條件前不得預先增加；合格結果完成後，頁首數字立即增加本輪數量。
- 第一次跨越目標時，精簡狀態改成已完成樣式並附勾選，但不彈出 modal 或中斷批改結果。
- 返回 Sentence Practice 首頁後顯示同步更新的完整今日、累計及 30 天統計。

### 3.6 累計與最近 30 天

- 累計數量為所有已保存本地日期之造句運用次數總和，不只保留最近 30 天。
- 30 天活動包含今天及前 29 個本地日期；沒有活動的日期以 0 方格顯示。
- 每個方格的深淺只依該 30 天視窗內的相對完成量分級；顏色不是唯一資訊。
- 方格必須提供日期與精確數量的 accessible name 及 pointer tooltip。
- 活動卡只顯示 30 天合計與每日數量，不另顯示 active days、streak 或最佳紀錄。
- 本功能上線前無法由既有資料推導的過往練習不回溯補算。

### 3.7 持久化、升級與資料備份

- 長期紀錄只保存 `local date → completed item count`；不保存歷史 session id、文章、
  必要用詞、學習項目 ID、AI feedback 或個別回合數量。
- 同一 App 開啟期間的 session 去重由暫態 Controller 狀態負責，不需要成為長期歷史。
- 既有 F63 progress v1 若保存今天的完成數，升級時把該數量遷移成同一本地日期的第一筆
  每日統計，並捨棄只供舊格式去重的 session ids。
- 每日紀錄以本地日期聚合；跨午夜後今日顯示 0，但舊日數量保留在累計與 30 天活動中。
- 統計檔案進入**資料備份**。還原時沿用既有完整取代語意：備份中的統計取代裝置目前
  統計，不進行相加或合併。
- 備份格式升為 version 2 並新增一個受 manifest 宣告的統計 payload；新版同時接受既有
  version 1 備份，version 1 還原後的造句統計視為空白。
- 舊版、不含造句統計的有效備份仍可還原；其統計視為空白，避免把還原前裝置的數量
  混入舊備份。
- 備份只接受通過 schema、日期、非負安全整數、唯一日期與檔案大小限制的統計；非法
  統計使整份 restore preview 失敗，且不得改變任何現有資料。
- 備份預覽不新增造句統計數字；本功能只改變備份內容與還原結果。

## 4. Acceptance Criteria

- **Scenario 1：首頁顯示今日目標進度**
  - **Given** 每日目標為 10 且今日已有 7 次造句運用
  - **When** 使用者開啟 Sentence Practice 首頁
  - **Then** 顯示 `7 / 10`、剩餘 3 與 70% determinate progress bar
  - **And** 側欄 badge 同時顯示 3

- **Scenario 2：合格練習同步更新所有統計**
  - **Given** 今日為 7、累計為 100，且目前 30 天合計為 20
  - **When** 一輪 5 個必要用詞取得無實質修改的 `Everything looks good`
  - **Then** 頁首立即顯示今日 12、累計資料變成 105、30 天合計變成 25
  - **And** 同一 session 不得再次增加

- **Scenario 3：不合格結果不改變統計**
  - **Given** 使用者提交一輪整合造句練習
  - **When** 結果需修稿、失敗、未提交、只產生範例，或 completed feedback 含實質修改
  - **Then** 今日、累計、30 天活動及側欄 badge 全部保持不變

- **Scenario 4：重複抽到仍按使用量累加**
  - **Given** 某學習項目曾在過去合格練習中出現
  - **When** 系統在新一輪再次隨機抽到該項目且本輪合格
  - **Then** 本輪完整 item count 正常增加
  - **And** 畫面不顯示或計算不重複學習項目數

- **Scenario 5：達標後低干擾鼓勵並可續練**
  - **Given** 今日目標為 10 且完成數為 8
  - **When** 使用者通過一輪 5 個項目的練習
  - **Then** 顯示 `13 / 10`、滿格進度與 `Today's goal complete` 勾選狀態
  - **And** 側欄 badge 顯示 0，使用者仍可開始下一輪
  - **And** 不顯示 modal 或慶祝動畫

- **Scenario 6：目標停用但活動仍記錄**
  - **Given** 每日目標設定為 0
  - **When** 使用者完成一輪 5 個項目的合格練習
  - **Then** 首頁與進行中頁首顯示今日 5，累計及 30 天統計也增加 5
  - **And** 不顯示分母、剩餘數、progress bar、達標狀態或側欄 badge

- **Scenario 7：完整統計不干擾寫作**
  - **Given** 首頁已顯示完整統計卡
  - **When** 使用者開始或繼續一輪練習
  - **Then** 完整統計卡隱藏，頁首只保留精簡今日狀態
  - **When** 返回首頁
  - **Then** 完整統計卡以最新數量重新顯示

- **Scenario 8：累計與 30 天視窗語意分離**
  - **Given** 保存了超過 30 天的每日數量，其中部分日期為 0
  - **When** 使用者開啟首頁
  - **Then** 累計包含全部保存日期
  - **And** 活動卡只包含今天與前 29 天，缺少活動的日期顯示 0

- **Scenario 9：既有今日數量安全升級**
  - **Given** 裝置只有 F63 v1 的今日完成數與 session ids
  - **When** 新版第一次載入統計
  - **Then** 今日、累計及 30 天合計都包含該既有完成數
  - **And** 不保存舊 session ids 為歷史回合資料

- **Scenario 10：備份與完整取代還原**
  - **Given** 來源裝置具有多日造句運用統計，目標裝置具有不同統計
  - **When** 匯出來源備份並在目標裝置確認還原
  - **Then** 目標統計與來源每日數量完全相同，而不是兩者相加
  - **And** 書庫及生詞庫仍沿用既有完整還原行為

- **Scenario 11：舊備份與非法統計**
  - **Given** 一份不含造句統計的舊版有效備份
  - **When** 使用者還原
  - **Then** 還原後造句統計為 0
  - **Given** 備份包含非法日期、負數、非整數、重複日期或 checksum 不符的統計
  - **When** 使用者選取備份
  - **Then** preview 失敗且現有資料完全不變

- **Scenario 12：活動方格可存取**
  - **Given** 最近 30 天含有零與非零活動
  - **When** 鍵盤或輔助科技讀取活動卡
  - **Then** 卡片提供 30 天精確合計，每個日期提供精確數量
  - **And** 使用者不需依賴顏色判斷數值

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 今日未達標 | today=7、goal=10 | 顯示首頁 | 7/10、remaining=3、70% progress | Critical |
| TC2 | 合格增加 | today=7、total=100、30d=20 | 5-item flawless result | 12、105、25，側欄為 0 | Critical |
| TC3 | 同 session 去重 | 合格 session 已記錄 | 再處理相同結果 | 所有統計不變 | Critical |
| TC4 | 不合格狀態 | 任一非 flawless 結果 | 讀取 snapshot | 今日／累計／30d 不變 | Critical |
| TC5 | 重複項目仍計數 | 新輪含曾用過項目 | 新輪合格 | 完整 itemCount 累加 | High |
| TC6 | 超額完成 | today=8、goal=10 | 通過 5 | 顯示 13/10、完成狀態、可續練 | Critical |
| TC7 | 目標為零 | goal=0、today=0 | 通過 5 | Today 5；無 goal UI／badge | Critical |
| TC8 | 進行中精簡顯示 | 首頁有完整卡 | 開始／返回練習 | 練習內只顯示 Today；返回恢復完整卡 | High |
| TC9 | 30 個本地日期 | 稀疏多日資料 | 查詢活動 | 補零且只回傳 today-29 至 today | Critical |
| TC10 | 累計不限 30 天 | 含 30 天以前資料 | 查詢統計 | total 包含全部，activity 不包含舊日 | High |
| TC11 | 零資料 | 無歷史 | 顯示首頁 | 真實 0 與 30 個零值方格 | Medium |
| TC12 | v1 遷移 | 今日 v1 count 與 session ids | 第一次讀取 | count 保留、ids 不進長期歷史 | Critical |
| TC13 | 備份 round trip | 多日來源統計 | export／restore | 每日資料完整相同 | Critical |
| TC14 | 還原取代 | 來源與目標都有統計 | restore | 只保留來源，不相加 | Critical |
| TC15 | 舊備份 | backup 無統計 entry | restore | 統計清為空且其餘資料成功還原 | High |
| TC16 | 非法備份統計 | invalid schema／checksum | preview | 拒絕且零 mutation | Critical |
| TC17 | 可存取名稱 | 30 天含活動 | 查詢 roles／names | progress 與每日方格有精確文字 | High |
| TC18 | 設定即時刷新 | today=7 | goal 10→0→20 | 7/10→Today 7→7/20 | High |

## 6. Implementation Notes

### 6.1 Shared contract

建議把 snapshot 的統計表達為一個具名結構，而非讓 Renderer 自行補日期或計算累計：

- `todayCompletedItemCount`
- `totalCompletedItemCount`
- `dailyActivity`：固定 30 筆 `{ date, completedItemCount }`，依日期遞增

Main process 是本地日期、歷史驗證、補零、30 天視窗及累計的唯一來源。Renderer 只負責
以目前 settings goal 計算顯示用剩餘值及比例。

### 6.2 Progress persistence

延伸 `LocalSentencePracticeProgressStore` 為可保存每日聚合數量的版本化格式。v1 遷移只
保留其 `day` 與 `completedItemCount`。為符合最小化原則，長期格式不保存 item ids、文章
或 session 明細；目前 App 生命週期內的重複提交防護留在 Controller。

保存時仍使用既有單一寫入 queue、temporary file 與 atomic rename，避免同時完成的回合
遺失增量。讀取損毀的本機統計時應回報可處理錯誤，不可靜默以 0 覆蓋仍可能可恢復的
歷史；v1 legacy 則明確遷移。

### 6.3 Backup compatibility

`DataBackupService` 應把 format version 升為 2，把受驗證的造句統計作為獨立、具 checksum
的 manifest entry，並明確保留 version 1 parser 供舊備份使用。restore staging 必須先完成
所有檔案與 schema 驗證，再依現有完整取代流程交換資料；任一步失敗都不得留下書庫、
生詞庫或統計的混合狀態。

由於加入第三種可還原資料，實作前需特別驗證 restore failure rollback 與 relaunch 邊界；
若現有交換流程無法原子涵蓋第三個檔案，應先補齊 rollback seam，而不是在 UI 層補救。

### 6.4 Renderer design

優先重用 Spaced Review 的 status strip、成果卡及 30 天 activity grid 視覺語言，但使用
Sentence Practice 專屬 class 與文案，避免把「練習投入」誤呈現為 review memory result。
窄視窗時累計卡與活動卡改為單欄；30 個方格維持可辨識的最小尺寸並允許換行。

## 7. Impact Scope

- `CONTEXT.md`：新增**造句運用次數**及其與目標、備份的關係。
- `apps/desktop/src/shared/sentence-practice-contracts.ts`：今日、累計與 30 天活動契約。
- `apps/desktop/src/main/sentence-practice-progress-store.ts`：每日聚合歷史、v1 遷移、統計查詢。
- `apps/desktop/src/main/sentence-practice-controller.ts`：App 生命週期 session 去重及統計更新。
- `apps/desktop/src/main/data-backup-service.ts`：統計 entry 的 export、preview、restore 與 rollback。
- `apps/desktop/src/main/main.ts`：把統計檔案／store 交給備份服務及 Controller。
- `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx`：完整首頁統計與練習內精簡狀態。
- `apps/desktop/src/renderer/App.tsx`：沿用 snapshot 同步側欄並在 settings 變更後刷新。
- `apps/desktop/src/renderer/styles.css`：今日狀態、累計卡、30 天方格及 responsive layout。
- 對應 progress store、Controller、backup service、Workspace、App 與 E2E 測試。
- 實作完成後更新 `documents/modules/sentence-practice.md` 與
  `documents/modules/data-backup.md`，並把本文件狀態改為 implemented。

## 8. Non-goals and Assumptions

- 不新增手動選詞、固定選詞、排除項目、標籤、deck 或抽選偏好。
- 不計算不重複學習項目、文章篇數、回合數、正確率、熟練度或記憶成果。
- 不新增 streak、最佳紀錄、徽章、等級、排行榜、通知、彩紙動畫或目標失敗提示。
- 不保存或提供歷史作文、必要用詞、學習項目 ID、逐輪數量或 AI 批改瀏覽頁。
- 不由間隔複習事件或舊 AI 對話回推本功能上線前的造句統計。
- 不改變 F63/B24 的 flawless 完成條件、每輪 2–10 項、資格規則、隨機抽取或 AI workflow。
- 不更新 FSRS、複習歷史、學習項目狀態或側欄 badge 的既有剩餘值語意。
- 每日目標為 0 只停用 goal UI；活動紀錄永遠保持啟用。
- 既有 Settings store 仍不屬於**資料備份**；每日目標設定不隨統計一起備份或還原。
- 日期沿用裝置本地日曆日；已保存日期不因之後改變系統時區而重寫。

## 9. Open Questions

無。產品範圍已在需求釐清中確認。

## 10. Implementation Record

### Status

Implemented on 2026-08-14.

### Delivered behavior

- `LocalSentencePracticeProgressStore` now persists a version 2 daily aggregate, migrates the v1
  current-day count, keeps session de-duplication in App memory, and returns today, all-time and a
  zero-filled 30-day activity series.
- `SentencePracticeController` includes the statistics in every snapshot and only records a session
  when the formal completed feedback has no `changes`; conversational suggestions remain eligible.
- Sentence Practice home renders the goal-aware today card, all-time count and accessible 30-day
  activity grid. Active writing renders only the compact today status and updates it immediately
  after a flawless submission.
- The Renderer receives the live Settings goal from `App`; goal changes recompute presentation
  without mutating stored activity. Goal 0 retains counts but removes goal/completion UI.
- Data Backup format version 2 includes `sentence-practice/activity.json`. Restore fully replaces all
  three data domains with rollback protection; valid version 1 backups remain supported and clear
  Sentence Practice activity.
- Settings and the daily goal remain outside backups. No essay, item id, feedback, session history or
  round detail is persisted by the statistics feature.

### TDD evidence

Red failures were observed before each production layer was implemented:

1. Progress-store tests failed because `getStatistics` did not exist.
2. Controller tests failed because snapshots omitted `statistics`.
3. Backup tests failed because the activity entry was absent and restore retained target activity.
4. Renderer tests failed because the today/all-time/activity regions and compact status were absent.

Final automated verification on 2026-08-14:

- F64-focused progress store, controller, backup and Renderer suites: 40/40 passed.
- `SentencePracticeWorkspace.test.tsx`: 15/15 passed, including immediate submission and goal-change
  presentation.
- `App.test.tsx`: 91/91 passed.
- Full Desktop Vitest: 539/539 passed; Server Vitest: 3/3 passed.
- Full TypeScript typecheck: passed.
- Full production build: passed.
- Electron Playwright E2E: 3/3 passed, including the production Sentence Practice statistic regions
  and 30 activity cells.

### Required TDD order

1. 先為 v1 migration、每日聚合、跨日、30 天補零、累計及同日增量建立 failing tests。
2. 再為 backup round trip、舊備份、完整取代及非法統計零 mutation 建立 failing tests。
3. 補 Renderer 的今日四狀態（未達標、達標、超額、goal=0）、完整／精簡切換與 a11y tests。
4. 實作最小 production change，先讓 store 與 backup 綠燈，再接 snapshot 與 UI。
5. 執行相關 suites、全專案 test、typecheck、production build 與 Electron E2E。

## Appendix: TDD Implementation Checklist

1. 依 TC1–TC18 建立 red tests，且每個 Critical scenario 都有直接自動化覆蓋。
2. 實作最小每日聚合資料模型與 legacy migration。
3. 實作備份／還原相容性與失敗安全，再串接 Renderer。
4. 所有測試轉綠後重構，避免 Renderer 重複計算日期語意。
5. 同步 F64、sentence-practice module、data-backup module 與實際驗證結果。
