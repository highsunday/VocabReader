---
author: Codex
date: 2026-09-01
title: 為新建學習項目加入具象記憶提示
uuid: 275283f1-27d0-4815-9688-42ac83e74396
version: 1.0.0
status: implemented
---

# Feature Specification - 具象記憶提示

## 1. Feature Overview

學習項目目前有釋義、搭配、例句與學習注意事項，但仍缺少一個專門幫助使用者
快速形成心智畫面、並在之後複習時可主動提取的記憶線索。

本功能為每個由 **AI 輔助建立**新產生的單字或片語草稿加入一個非空的
**記憶提示（Memory Tip）**。提示優先使用可視化、有動作或反差的微型場景，
讓使用者能在腦中「看見」目標語義；只有在實際有助時才使用字形、發音或
可驗證的詞源聯結。正式詳情以藍紫色中度強調面板呈現，比一般 Markdown
內容更容易掃描，但警示強度低於紅色、帶底線的**學習注意事項**。

## 2. Requirements (User Story)

- **As a** 使用 VocabReader 累積與複習學習項目的語言學習者
- **I want** 每個新建的學習項目都有一個具象、簡短的記憶提示
- **So that** 我可以透過心智畫面與聯想線索，更容易在複習時想起目標語義

## 3. Confirmed Product Rules

### 3.1 生成與內容

- 每個新的學習項目草稿，不論類型為 `word` 或 `phrase`，都必須含有非空
  `memoryTip`；遺漏或空白時整份 AI artifact 不可提交。
- 記憶提示使用該批學習項目的**講解語言**，但保留必要的目標語言詞彙。
- 預設優先寫成一個簡短的心智場景：包含可感知的物件、動作、方向、大小或
  反差，並明確連回該學習項目的目標語義。
- 可在更自然時改用字形分解、發音聯想或詞源，但不得捏造詞源、強拉無關的
  讀音雙關，或用一個更難的生詞解釋另一個生詞。
- 記憶提示是獨立結構化欄位，不寫入 Markdown，也不冒充學習注意事項。

### 3.2 生命週期與編修

- 草稿預覽必須在 Markdown 內容之前顯示記憶提示，使用者可在提交前審閱。
- 提交草稿後，記憶提示與標題、目標語義和 Markdown 一起原子寫入正式學習項目。
- 具備編修能力的學習項目詳情提供 `Memory tip` 多行文字欄位，可人工修改或清空。
- 既有學習項目在 migration 後的記憶提示為空字串；空值在唯讀詳情不保留空白區塊。
- 移入垃圾桶、還原、完整備份與還原都必須保留記憶提示；清空垃圾桶時隨項目刪除。
- 記憶提示的修改不新增複習事件、不重設 FSRS，也不重新產生或批改目前試卷。

### 3.3 顯示層級

- 草稿預覽與完整學習項目詳情顯示一個具名 `Memory tip` 的區塊，並使用非顏色
  線索（圖示、標籤、左側線與穩定位置）傳達用途。
- 視覺使用低彩度藍紫色、淡色背景與一條較深左側線；不使用綠色。
- 記憶提示必須比一般 Markdown 段落更容易掃描，但不使用紅色、底線、警示圖示、
  高彩度實心背景或重陰影，以確保學習注意事項仍是更高優先層級。
- 同時存在時的順序為：代表圖片 → 學習注意事項 → 記憶提示 → Markdown 內容。
- 生詞庫清單摘要與尚未作答的間隔複習題不顯示記憶提示，避免過度擁擠或洩漏回想線索。

## 4. Acceptance Criteria

### AC1：AI 建立必須產生具象記憶提示

- **Given** 使用者對一個適格單字或片語啟動 AI 輔助建立
- **When** AI 回傳學習項目草稿
- **Then** 每筆草稿都有一個非空、使用講解語言的 `memoryTip`
- **And** 內容優先形成與目標語義直接連結的可視化微型場景

### AC2：缺少記憶提示時不得提交

- **Given** AI artifact 包含新草稿
- **When** 任一草稿的 `memoryTip` 缺少、不是字串或只有空白
- **Then** App 拒絕該 artifact，不顯示可提交草稿，也不寫入生詞庫

### AC3：草稿預覽與提交後保留

- **Given** 一筆合法草稿已產生
- **When** 使用者開啟草稿清單並提交
- **Then** 草稿預覽顯示 Memory tip，正式學習項目保留完全相同的內容

### AC4：正式詳情層級與可存取性

- **Given** 一個學習項目同時有學習注意事項與記憶提示
- **When** 使用者開啟學習項目詳情
- **Then** 記憶提示以具名、有圖示與左側線的藍紫色區塊顯示，不只依賴顏色
- **And** 學習注意事項仍使用紅色與底線，具有更高的警示優先層級
- **And** Memory tip 文字與背景至少符合 WCAG AA 一般文字對比

### AC5：人工編修與空值

- **Given** 使用者從可編修入口開啟學習項目
- **When** 使用者修改、清空或取消 Memory tip 的文字編輯
- **Then** Save 只套用已確認的草稿，Cancel 保留正式內容，清空後唯讀詳情不顯示空區塊

### AC6：舊資料與生命週期

- **Given** 一份舊 schema 資料庫、active 項目或 trashed 項目
- **When** App migration、移入垃圾桶、還原、備份還原或清空垃圾桶
- **Then** 舊項目安全 backfill 為空，現有記憶提示跟隨項目往返並只在永久刪除時消失

### AC7：不擴大資訊曝露

- **Given** 學習項目已有記憶提示
- **When** App 查詢生詞庫摘要、生成未作答的複習題或建立去重候選資料
- **Then** 摘要與未作答題目不顯示記憶提示，去重仍只依標題與目標語義判斷

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 解析完整草稿 | word 與 phrase 的 artifact 都有 memoryTip | parse | 兩筆草稿都可提交且內容 trim | Critical |
| TC2 | 拒絕缺少提示 | memoryTip 缺少／空白／型別錯誤 | parse | 整份 batch 不可提交 | Critical |
| TC3 | 草稿預覽 | 合法草稿 | 開啟 Review cards | 具名 Memory tip 出現在 Markdown 前 | High |
| TC4 | 原子建立 | 合法草稿 | submit batch | 正式項目存有相同 memoryTip | Critical |
| TC5 | 正式詳情呈現 | item 有 memoryTip 與 caution | render | 兩區塊順序、名稱、圖示與層級正確 | High |
| TC6 | 人工編修 | editable item | Save／Cancel／清空 | 對應保存或保留；空值不顯示 | High |
| TC7 | schema migration | schema 7 database | 開啟 repository | 升級並以空字串 backfill memory_tip | Critical |
| TC8 | 摘要與複習邊界 | item 有 memoryTip | list／review query | payload 不擴大且未作答題不顯示 | High |
| TC9 | 可存取視覺 | 兩種訊息都存在 | 檢查 DOM 與 computed colors | 有非顏色線索、AA 對比、Memory tip 低於 caution | High |

## 6. Affected Modules and Files

- `CONTEXT.md`
- `.agents/skills/create-learning-items/SKILL.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應的 Main、Renderer 與 IPC 測試

## 7. Assumptions and Non-goals

- 使用者說的「單字建立」依現有領域語言解讀為 AI 輔助建立學習項目；因片語
  同樣需要記憶線索，新 `word` 與 `phrase` 草稿一律必填。
- 本功能不為舊項目批次生成記憶提示，也不新增篩選、搜尋或清單摘要。
- 本功能不改變學習項目代表圖片、學習注意事項、去重或間隔複習規則。
- 本次不擴大 AI 輔助編修 artifact；它仍只編修 Markdown 與學習注意事項，並保留
  正式記憶提示。

## 8. Implementation record

### Status

Implemented on 2026-09-01

### Implementation summary

AI 輔助建立現在要求每筆 `word`／`phrase` 草稿提供非空 `memoryTip`；skill 以講解語言
生成與目標語義直接相連的具象微型場景，Main artifact parser 對缺漏、空白或非字串值
採整批拒絕。草稿提交後，提示隨其他欄位原子寫入 schema 8 的 `memory_tip`。

草稿預覽與完整詳情共用具名 `LearningMemoryTip`，以 Brain 圖示、標籤、1px 左側線與
低彩度淡藍紫背景呈現；它比一般 Markdown 容易掃描，但不使用 Note 的紅色、底線或
警示語彙。一般人工 editor 可修改或清空，空值不渲染。既有資料與舊對話 artifact
安全正規化為空字串；AI-assisted edit 不擴張 artifact，Apply 會保留現有 Memory tip。

清單摘要、未作答複習 queue 與去重候選不包含 Memory tip，以避免 payload 擴張或在
回想前洩漏答案線索。

### Test coverage

- Artifact：接受並 trim 合法提示；拒絕缺少、空白與非字串提示；舊持久化對話可遷移。
- Controller：提交完整保留提示；更新草稿時未提供新值會保留原值。
- Repository／IPC／backup：schema 7→8 migration、原子建立、人工更新、生命週期保存、
  未來版本拒絕，以及清單／複習 queue 不暴露提示。
- Renderer：草稿預覽、完整詳情、人工修改／清空、空值隱藏、Brain 圖示與穩定順序。
- Electron E2E：實際 computed style 驗證淡藍紫面板、無底線、Brain 圖示，以及紅色
  Note 仍保有更強層級。
- 對比：正文 9.52:1、標籤 7.32:1、圖示 5.27:1，皆符合 WCAG AA 一般文字門檻。

### Changed files

- `.agents/skills/create-learning-items/SKILL.md`
- `CONTEXT.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-conversation-store.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應 Main、Renderer、IPC、conversation store、backup 與 Electron E2E 測試
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`
- `documents/modules/learning-item-editing.md`

### Commands executed

- Red：`npm test -- --run src/main/learning-item-artifacts.test.ts src/main/learning-library-service.test.ts src/renderer/learning-item-draft-dialog.test.tsx src/renderer/learning-library-workspace.test.tsx src/main/chat-controller.test.ts`
  — 7 expected failures, 143 passed。
- Green targeted：相同命令 — 150/150 passed。
- Full desktop unit：`npm test` — 60 files, 580/580 passed。
- TypeScript：`npm run typecheck` — passed。
- Production build：`npm run build` — passed（只有既有的 500 kB chunk warning）。
- Feature E2E：`npx playwright test --grep "shows a memorable cue"` — 1/1 passed。
- Full Electron E2E：`npm run test:e2e` — 5/5 passed；同步補齊既有 General settings
  測試對 Korean 講解語言選項與 workspace 預設值的預期。

### Production Deployment

- Feature commit：`dd2d728`（`feat: add imaginative memory tips`）。
- Release commit：`e1d8845`（`release: prepare v0.1.4`）。
- `main` 與 annotated tag `v0.1.4` 已推送至 `highsunday/VocabReader`。
- GitHub Actions `Release desktop installers` run `33475217157` 完成且 conclusion 為
  `success`；macOS Apple Silicon、macOS Intel 與 Windows x64 三個 native build 皆成功。
- GitHub Release `VocabReader v0.1.4` 已公開，包含：
  - `VocabReader-0.1.4-mac-arm64.dmg`
  - `VocabReader-0.1.4-mac-x64.dmg`
  - `VocabReader-0.1.4-windows-x64-setup.exe`
