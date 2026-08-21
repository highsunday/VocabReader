---
author: Codex
date: 2026-08-21
title: 以學習語言工作區隔離書籍與學習資料
uuid: 5cbf8a3a-874c-4abd-ad6b-066ad3f5be92
version: 1.0.0
status: implemented
---

# Feature Specification - 學習語言工作區

## 1. Feature Overview

目前書庫、生詞庫、練習進度與 AI 對話都是全域集合；生詞庫再以學習項目語言篩選。
這會讓英文、日文與繁體中文的書籍、對話及學習資料出現在同一個使用環境，也讓全域
講解語言錯誤承擔閱讀測驗出題語言的責任。

本功能在 Settings 新增**學習語言**，第一版提供 English、日本語與繁體中文。每種語言
形成獨立的**學習語言工作區**，隔離書庫、閱讀狀態、標記、生詞庫、複習紀錄、造句與
跟讀進度、目前練習及 AI 對話。**講解語言**改為每個工作區各自保存；閱讀測驗則用
學習語言出題與作答，只用講解語言提供教學與批改說明。

## 2. Requirements (User Story)

- **As a** 同時學習多種語言的 VocabReader 使用者
- **I want** 切換彼此隔離的學習語言工作區，並為每個工作區設定講解語言
- **So that** 不同語言的書籍、學習項目、練習資料與 AI 對話不會混用

## 3. Workspace Boundary

### 3.1 工作區隔離資料

- 書籍、章節閱讀狀態、閱讀區段與標記。
- 學習項目、垃圾桶、複習排程與複習歷史。
- 整合造句與逐句跟讀的進度、活動量及目前工作狀態。
- AI 對話、學習項目草稿與右側欄目前選取狀態。
- 每個工作區自己的講解語言。

### 3.2 跨工作區共用資料

- AI 對話與 EPUB 閱讀字級、紙張寬度及行距。
- AI 語音憑證、角色與語氣。
- 每日目標、複習試卷題數與其他一般偏好。
- Codex 登入、模型選擇與 allowance 顯示。

### 3.3 語言不變量

- 第一版學習語言只允許 `en`、`ja`、`zh-TW`。
- 新增書籍歸入導入當下的工作區；不依 EPUB metadata 自動搬移。
- 正常建立或編修學習項目時，項目語言必須等於目前工作區的學習語言。
- AI 判斷建立目標屬於其他支援語言時，不產生草稿，改為提示使用者切換工作區。
- 生詞庫移除學習項目語言篩選器；語言屬性仍保留供資料驗證與遷移。
- 整合造句、複習與跟讀功能只使用目前工作區資料；原本固定英文的整合造句改用目前
  學習語言的合格項目與輸出。

## 4. Language Responsibility

### 4.1 一般 AI 與學習項目

- 右側欄一般 AI 回覆、區段解析及學習項目的解釋、例句輔助說明使用講解語言。
- 學習項目標題、例句本體、復述、造句及其他學習輸出使用學習語言。
- 每個工作區各自記住講解語言；切換後恢復該工作區上次設定。

### 4.2 閱讀測驗

- 測驗標題、題目、選項、問答題預期作答及修正版答案使用學習語言。
- 答對／答錯原因、文法與用字說明、閱讀理解總評及改進建議使用講解語言。
- 閱讀原文引文保持原文，不翻譯。
- 此契約取代 B04、B05 及現有模組文件中「題面、作答、批改都使用講解語言」的舊行為。

## 5. Switching Behavior

- 沒有 AI 或資料操作進行時，切換立即生效，關閉目前書籍／練習畫面，回到新工作區
  書庫，並載入該工作區的 AI 對話。
- AI 回覆、測驗批改、學習項目生成、資料備份或還原進行時，學習語言選擇器停用。
- 尚未提交且未持久化的測驗答案、復述文字與練習草稿不跨工作區保留。
- 切換不得讓舊工作區的延遲回呼或寫入落入新工作區。

## 6. Existing-data Migration

- 現有書籍、閱讀進度、標記、AI 對話及學習項目草稿移入 English 工作區。
- 現有學習項目連同複習排程與歷史，依 `en`、`ja`、`zh-TW` 移入對應工作區。
- 現有 `other` 項目及其複習資料完整保留為待分類資料，不顯示於任何生詞庫。
- Settings 提供待分類項目數量及一次移入三個工作區之一的操作；完成分類後項目語言
  改為目標工作區語言，並保留內容、圖片、狀態、時間與完整複習資料。
- 遷移須可重入；App 中途停止後再次啟動不得重複、遺失或跨工作區複製資料。

## 7. Backup and Restore

- 一份資料備份包含三個工作區、各工作區講解語言與所有原本可備份的隔離資料。
- 共用設定一併備份；還原仍完整取代全部工作區，不提供合併或只還原目前工作區。
- 備份預覽分別列出三個工作區的書籍、啟用中與垃圾桶學習項目數量，並另列待分類數量。
- 目前跟讀素材與音訊仍依既有邊界排除在備份外，但其所屬工作區不得混用。

## 8. Acceptance Criteria

- **Scenario 1：獨立工作區**
  - **Given** 三個工作區各有不同書籍、項目、進度與 AI 對話
  - **When** 使用者依序切換學習語言
  - **Then** 每次只看見目前工作區資料，生詞庫沒有語言篩選器
- **Scenario 2：工作區講解語言**
  - **Given** 三個工作區保存不同講解語言
  - **When** 使用者切換工作區並重新開啟 App
  - **Then** 各自恢復正確講解語言且一般 AI 回覆遵守該語言
- **Scenario 3：測驗雙語責任**
  - **Given** English 工作區使用繁體中文講解
  - **When** AI 產生並批改閱讀測驗
  - **Then** 題目、作答與修正版為英文，原因與總評為繁體中文
- **Scenario 4：避免錯誤建立**
  - **Given** 使用者位於 English 工作區
  - **When** AI 辨識到建立日文學習項目的請求
  - **Then** 不產生或提交草稿，並提示切換至日本語工作區
- **Scenario 5：安全切換**
  - **Given** AI 或資料操作進行中
  - **When** 使用者開啟 Settings
  - **Then** 學習語言選擇器停用；操作完成後才能切換並返回新工作區書庫
- **Scenario 6：既有資料遷移**
  - **Given** 舊版含多語學習項目及 Other 項目
  - **When** 新版首次啟動
  - **Then** 書籍與對話進 English，三種項目依語言分流，Other 完整保留待分類
- **Scenario 7：完整備份還原**
  - **Given** 三個工作區都有資料與各自講解語言
  - **When** 使用者匯出、預覽並還原備份
  - **Then** 預覽分語言顯示數量，還原後三個工作區與共用設定完整取代

## 9. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 設定契約 | 初始或已保存設定 | 讀取／保存 | active language 與三組 explanation language 正確 | Critical |
| TC2 | 書庫隔離 | 三區各有書 | list／import／delete | 只操作目前工作區 | Critical |
| TC3 | 生詞與複習隔離 | 三區各有項目及歷史 | list／review／trash | 只操作目前工作區 | Critical |
| TC4 | 對話與草稿隔離 | 三區各有 conversation | switch | 對話與 draft 不混用 | Critical |
| TC5 | 練習狀態隔離 | 三區各有 progress/current state | switch | 只載入目前工作區狀態 | High |
| TC6 | 生詞庫 UI | 任一工作區 | 開啟生詞庫 | 無語言篩選器 | High |
| TC7 | 建立語言 gate | target 與 workspace 相同／不同 | 準備草稿 | 同語言建立、異語言提示切換 | Critical |
| TC8 | 測驗 prompt | learning=en, explanation=zh-TW | 產生／批改 | 題答英文、說明繁中 | Critical |
| TC9 | 一般 AI prompt | explanation=ja | 傳送一般訊息 | 回覆說明要求日文 | High |
| TC10 | 切換鎖定 | active operation | 查看 selector | disabled 且不切換 | Critical |
| TC11 | 舊資料分流 | legacy fixture | migrate twice | 正確分流且可重入 | Critical |
| TC12 | Other 分類 | quarantined item | 指定目標 workspace | 完整資料移動且 language 更新 | Critical |
| TC13 | 備份格式 | 三區資料 | export／preview／restore | 各區 counts 與完整取代正確 | Critical |
| TC14 | 回歸 | 完整測試資料 | test/typecheck/build | 既有閱讀與練習行為通過 | High |

## 10. Implementation Notes

- 使用單一工作區協調器作為目前學習語言來源；Main Process 的書庫、生詞、練習與對話
  服務不得各自保存可能不同步的 active language。
- 工作區切換是具狀態邊界的操作，必須等待目前寫入完成並以 revision 防止舊回呼污染。
- 優先以工作區鍵分隔持久化路徑或資料集合；所有 IPC 由 Main Process 決定作用中工作區，
  不信任 Renderer 任意指定其他工作區。
- 保留學習項目 `language` 欄位作不變量與遷移依據，但正常 list API 不再需要語言篩選。
- 舊備份版本仍須可還原並套用同一遷移；新備份格式增加工作區 counts 與設定資料。

## 11. Assumptions and Non-goals

### Assumptions

- 使用者把 EPUB 導入目前工作區即代表其分類意圖；第一版不做書籍語言自動偵測。
- 第一版不支援新增自訂語言或把工作區重新命名。
- 待分類資料只處理舊版 `other` 學習項目，不是第四個可日常使用的工作區。

### Non-goals

- 不提供跨工作區搜尋、合併書庫或搬移一般書籍／對話的 UI。
- 不提供每本書或每筆學習項目的日常語言篩選器。
- 不新增帳號、雲端同步或工作區分享。
- 不依文字內容自動覆蓋使用者選擇的學習語言。

## 12. Module Documentation Impact

需更新 `book-library`、`learning-library`、`ai-conversation`、
`reading-comprehension-quiz`、`spaced-review`、`sentence-practice`、
`listen-and-repeat-practice` 與 `data-backup`；並新增 `learning-language-workspace` 模組文件。

## 13. Implementation Record

Implemented on 2026-08-21 with a document-driven red → green → acceptance cycle.

### Delivered

- Added `LearningLanguageWorkspaceRegistry` and Main-owned active proxies for book, learning,
  review, sentence-practice, listen-and-repeat, progress and AI conversation services.
- Added `learningLanguage` plus per-workspace `explanationLanguages` settings, Settings UI and
  workspace reload/reset behavior. The Learning Library language filter was removed.
- Added restartable legacy SQLite splitting with an immutable source snapshot; `en`、`ja`、
  `zh-TW` and quarantined `other` rows retain schedules, events and foreign-key integrity.
- Added Settings count and one-transaction assignment for quarantined items.
- Enforced the active workspace language in learning-item services, AI draft prompts and artifact
  validation; generalized integrated sentence practice from fixed English to the active language.
- Split reading-quiz language responsibilities in both Main prompt composition and the bundled
  skill: questions, answers and corrections use learning language; teaching and grading use
  explanation language.
- Added an outer three-workspace backup containing independently validated workspace archives,
  shared settings and optional quarantined data, with per-language restore preview.
- Legacy single-workspace backups are first accepted by the existing hardened validator, then
  converted into English books/activity, language-split learning databases and quarantined `other`
  data before the normal three-workspace preview and restore flow.
- Updated domain vocabulary and affected module documents; added
  `documents/modules/learning-language-workspace.md`.

### TDD evidence

- Red phase: missing workspace coordinator and migration modules, old quiz-language prompt,
  Language filter UI, legacy per-target card explanation behavior and missing multi-workspace
  backup all produced focused failures before production changes.
- Green phase: focused coordinator, migration, backup, Settings, ChatController, skill and Renderer
  suites passed as each boundary was added.
- Acceptance:
  - `npm run test -w @reader/desktop -- --run` — 57 files, 555 tests passed.
  - `npm run typecheck -w @reader/desktop` — passed.
  - `npm run build -w @reader/desktop` — passed (existing Vite chunk-size warning only).
  - `npm run test:e2e -w @reader/desktop` — 4 tests passed.
  - `git diff --check` — passed.

### Architectural observation

The nested backup keeps the mature per-workspace EPUB/SQLite validation format intact while the
outer format owns cross-workspace coordination. This avoids duplicating the security-sensitive ZIP
and database validators. AI conversations remain intentionally outside data backup, matching the
existing backup boundary; they are nevertheless isolated and persisted per workspace.

## Appendix: TDD Implementation Checklist

1. 先以設定、服務隔離、遷移、測驗雙語 prompt 與 UI 行為測試建立 red phase。
2. 實作最小工作區協調器與資料邊界，逐一讓聚焦測試轉綠。
3. 補齊備份相容、既有資料遷移與跨工作區延遲回呼防護。
4. 更新模組文件，執行完整 test、typecheck、build、E2E 與 diff check。
