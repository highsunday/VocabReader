---
author: Codex
date: 2026-08-01
title: 自動判定並依語言管理學習項目
uuid: 8e9d063c-f705-4282-bdd0-0a6b73e13d63
version: 1.0.0
status: implemented
---

# Feature Specification - 自動判定並依語言管理學習項目

## 1. Feature Overview

目前 **學習項目**沒有持久化的語言欄位。AI 會在建立內容或產生複習題時臨時推測
標題語言，但 **生詞庫**無法依語言整理項目，使用者也無法修正判定結果。

本功能新增結構化的**學習項目語言**，固定為英文、日文、繁體中文與其他語言四類。
AI 輔助建立時逐筆依標題自動判定草稿語言，正式提交後保存至學習項目。生詞庫的
使用中清單可依語言篩選；使用者也能在學習項目詳情的編輯狀態修正語言。語言類別
描述標題本身，不受全域**講解語言**影響，也不改變去重、複習排程或 Markdown 內容。

## 2. Requirements (User Story)

- **As a** 同時學習不同語言內容的 VocabReader 使用者
- **I want** AI 在建立學習項目時標記其語言，並讓我在生詞庫篩選或修正語言
- **So that** 我能可靠整理多語學習內容，且 AI 判定錯誤時不會被鎖死

## 3. Acceptance Criteria

- **Scenario 1：AI 為每筆草稿判定語言**
  - **Given** 使用者透過 AI 輔助建立一筆或多筆學習項目草稿
  - **When** AI 產生結構化草稿結果
  - **Then** 每筆草稿都具有一個學習項目語言
  - **And** 英文、日文、繁體中文分別使用自己的類別，其餘語言使用其他語言
  - **And** 同一草稿清單可以包含不同語言
  - **And** 講解語言不會覆蓋學習項目語言

- **Scenario 2：拒絕缺少或無效語言的 AI 草稿**
  - **Given** AI 回傳缺少語言或含有未支援語言值的學習項目草稿
  - **When** Main process 驗證結構化結果
  - **Then** 該結果不得成為可提交草稿清單
  - **And** 不得寫入生詞庫

- **Scenario 3：提交後持久保存語言**
  - **Given** 一份每筆都具有有效語言的待提交草稿清單
  - **When** 使用者明確提交草稿清單
  - **Then** 每個新學習項目保存對應語言
  - **And** 重新開啟 App、查看摘要或完整詳情時仍取得相同語言

- **Scenario 4：既有資料庫相容升級**
  - **Given** 使用者已有 migration 前建立的學習項目
  - **When** App 首次以新版本開啟該資料庫
  - **Then** schema migration 成功完成且既有內容、垃圾桶、排程與歷史不遺失
  - **And** 既有項目取得英文類別，符合產品原先以英文學習為主的資料語義
  - **And** 使用者之後仍可逐筆修正該類別

- **Scenario 5：在生詞庫依語言篩選**
  - **Given** 使用中生詞庫包含多種語言的學習項目
  - **When** 使用者在 Library 工具列選擇 English、日本語、繁體中文或其他語言
  - **Then** 清單只顯示該語言的項目
  - **And** 語言篩選可與搜尋、類型、CEFR、學習狀態及排序組合
  - **And** 改變語言會建立新查詢、忽略舊 response、清除 cursor 並回到結果頂部
  - **And** 選擇 All languages 可取消語言條件

- **Scenario 6：在詳情編輯語言**
  - **Given** 使用者從生詞庫開啟學習項目詳情並進入編輯狀態
  - **When** 使用者從四個語言選項中選擇另一類並儲存
  - **Then** 更新後的學習項目持久保存新語言
  - **And** 目前清單摘要與語言篩選結果反映變更
  - **And** 取消編輯不保存變更
  - **And** 唯讀的複習題詳情不提供語言編輯

- **Scenario 7：所有邊界只接受固定語言值**
  - **Given** Renderer 或其他不受信任輸入提供學習項目語言
  - **When** 輸入經過 IPC、artifact 或 repository 邊界
  - **Then** 只接受英文、日文、繁體中文與其他語言的正式值
  - **And** 缺少或未支援值不會靜默寫入正式項目

- **Scenario 8：既有行為不受影響**
  - **Given** 學習項目新增了語言欄位
  - **When** 使用者搜尋、編輯、移入垃圾桶、還原、備份、還原備份或進行間隔複習
  - **Then** 既有項目內容、語義去重、複習排程與歷史行為維持不變
  - **And** 完整 SQLite 備份自然包含語言欄位

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 多語 AI 草稿 | 英文、日文、繁中及其他語言 targets | 解析 AI result | 每筆保留對應的有效語言 | Critical |
| TC2 | 無效 AI 語言 | 缺少或未知語言值 | 驗證 artifact | 拒絕整份可提交結果 | Critical |
| TC3 | 原子建立 | 有效的多語 included drafts | 提交批次 | 每筆語言與其他欄位在同一交易保存 | Critical |
| TC4 | Migration | 舊 schema 含 active／trash／schedule／events | 開啟新版 repository | 資料完整、既有項目語言為英文 | Critical |
| TC5 | Repository 篩選 | 多語 active 項目 | 查詢指定語言 | 只回傳該語言且可與其他條件組合 | Critical |
| TC6 | IPC 驗證 | 合法與非法語言 filter／update | 呼叫 typed handlers | 合法通過，非法安全拒絕 | Critical |
| TC7 | Library 語言控制 | 生詞庫有多語摘要 | 切換語言與 All languages | 查詢條件、結果、cursor 與回頂行為正確 | Critical |
| TC8 | 詳情修改 | editable 詳情已開啟 | 選擇語言並儲存／取消 | 前者持久更新，後者不變 | Critical |
| TC9 | 唯讀詳情 | 從未確認複習試卷開啟詳情 | 查看結構化資料 | 顯示語言但沒有編輯操作 | High |
| TC10 | Query stale response | 舊語言查詢延遲 | 新語言查詢先完成 | 舊結果不混入新結果 | High |
| TC11 | 備份與還原 | 多語學習項目已保存 | 建立並還原完整備份 | 語言值隨 SQLite 完整保留 | High |
| TC12 | 既有流程回歸 | seed、去重、垃圾桶與複習測試 | 執行相關 suites | 原行為保持通過 | Critical |

## 5. Implementation Notes

### Domain and contracts

- 使用穩定的程式值表示四類語言：`en`、`ja`、`zh-TW`、`other`。
- `LearningItemLanguage` 應成為正式共用型別，出現在學習項目、摘要、建立／更新輸入與
  草稿。它不加入 duplicate match，因為去重仍只依完整標題候選與語義比較。
- `LearningItemListInput` 可帶一個 optional language filter；不提供任意字串或多選集合。

### AI-assisted creation

- `create-learning-items` 的 draft contract 與範例必須要求 `language`。
- AI 逐筆依 canonical title 的語言及文字系統判定，不依使用者請求語言、閱讀區段語言或
  講解語言判定。
- Artifact parser 必須在建立可提交 batch 前驗證每筆語言；草稿重新驗證與提交 recheck
  都保留原語言，不要求 AI 在 recheck 階段再次判定。

### Persistence and query

- SQLite migration 為 `learning_items` 新增非空 language 欄位與固定值約束；既有 row
  backfill 為 `en`，seed 與所有新建路徑必須明確提供語言。
- 語言 filter 必須在 page limit 前於 Main-owned query boundary 套用，並納入 opaque
  cursor 的 query fingerprint，避免跨語言重用 cursor。
- Repository、IPC 與 preload 保持現有受限操作數量，不新增通用資料庫或 create API。

### Renderer

- 使用中生詞庫工具列新增 Language select，選項為 All languages、English、Japanese、
  Traditional Chinese、Other language；垃圾桶不新增語言篩選。
- 摘要卡片與完整詳情應以人類可讀標籤呈現語言，讓篩選結果與編輯值可被確認。
- Editable 詳情新增 language select；read-only 詳情只顯示語言標籤。
- 語言加入 query identity、active-filter 判斷與 Clear filters；沿用 F44 的 debounce、
  stale response、分頁與 mutation anchor 行為。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 既有資料主要依產品原始定位保存英文學習項目，因此 migration backfill 為英文；無法
  可靠自動判定的既有非英文項目可在詳情中修正。
- 一個學習項目只屬於一個語言類別；混合語言固定表達歸入最能代表標題的類別，無法
  明確歸類時使用其他語言。
- 語言篩選第一版為單選。

### Open Questions

- 無。

### Non-goals

- 不新增語言、方言、文字系統或地區代碼的任意管理功能。
- 不讓使用者在 AI 草稿預覽中編輯語言或其他內容；正式提交後才由詳情編輯。
- 不依語言建立獨立 deck、生詞庫、每日上限或複習排程。
- 不改變講解語言、介面語言、Markdown 內容語言或例句規則。
- 不重新呼叫 AI 批次分類所有既有資料。
- 不把語言加入重複判定鍵；同標題同語義仍視為相同項目。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `.agents/skills/create-learning-items/SKILL.md`

### Test code

- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/renderer/learning-item-draft-dialog.test.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- Related App, spaced-review, backup and Electron regression tests as required by contract changes

### Documentation

- `CONTEXT.md`
- `documents/implements/F45-classify-and-filter-learning-items-by-language.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`

## 8. Implementation Record

### Status

Implemented on 2026-08-01.

### Implementation Summary

- 新增 `LearningItemLanguage = en | ja | zh-TW | other`，並使正式項目、摘要、建立／更新
  input 與草稿都必須帶語言。
- `create-learning-items` 逐筆依 canonical title 判定語言；artifact、chat IPC、learning
  IPC 與 repository 會拒絕缺少或未支援值，Controller 提交時保留草稿語言。
- SQLite schema 5 新增具固定值約束的 `language` 欄位、既有 row 英文 backfill 與
  status／language／created index；seed 與新建／更新交易皆保存語言。
- 語言 filter 在分頁 limit 前套用並納入 cursor query fingerprint；Library 控制列加入
  All languages 與四類單選，並沿用 query reset、stale response 與 Clear filters 行為。
- 草稿預覽、清單卡片與完整詳情顯示語言；editable 詳情提供 language select，read-only
  詳情只顯示標籤。
- 完整 SQLite 資料備份與還原會保留語言，支援版本上限同步升至 schema 5。

### Test Coverage and Verification

- TC1／TC2：`learning-item-artifacts.test.ts` 驗證多語值保留，以及缺少／未知值拒絕。
- TC3／TC5：`learning-library-service.test.ts` 驗證持久保存、原子 input 驗證與 page filter。
- TC4：同檔案實際移除 language 欄位與 migration 5 後重新開啟，驗證英文 backfill。
- TC6：`learning-library-ipc.test.ts`、`chat-ipc.test.ts` 驗證合法與偽造語言 payload。
- TC7／TC8／TC10：`learning-library-workspace.test.tsx` 驗證 filter、All languages、查詢更新
  與詳情編輯；既有 stale-response 測試覆蓋共用 query-generation 路徑。
- TC9：共用 `LearningItemDialog` 的既有 read-only capability 回歸測試，語言只在 edit form
  渲染 select。
- TC11：`data-backup-service.test.ts` 驗證日文類別經完整備份與還原後維持不變。
- TC12：完整 Desktop Vitest 337/337、TypeScript typecheck 與 production build 通過。

### Changed Files

#### Production code

- `.agents/skills/create-learning-items/SKILL.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/renderer/LearningItemDraftDialog.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`

#### Test code

- Main、Renderer 與 review fixtures 更新為新必填語言契約。
- 新增 artifact、migration、repository filter、IPC、Library UI、detail edit 與 backup restore
  語言案例。

#### Documentation

- `CONTEXT.md`
- `documents/implements/F45-classify-and-filter-learning-items-by-language.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 1. AI 逐筆判定固定語言 | Pass | skill contract、artifact multi-language test |
| 2. 拒絕缺少或無效語言 | Pass | artifact、chat IPC、learning IPC tests |
| 3. 提交並持久保存 | Pass | Controller mapping、repository create／read tests |
| 4. 舊資料庫相容升級 | Pass | schema 4→5 downgrade／reopen test |
| 5. Library 語言篩選 | Pass | repository page 與 Renderer Language control tests |
| 6. 詳情編輯語言 | Pass | editable dialog save／cancel test |
| 7. 固定值安全邊界 | Pass | artifact、IPC、repository validation |
| 8. 既有行為不受影響 | Pass | 337/337 full suite、typecheck、build |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1–TC3 | Pass | artifact required-language、Controller／repository batch flow |
| TC4 | Pass | legacy schema language migration test |
| TC5–TC6 | Pass | repository filter、typed IPC rejection |
| TC7–TC10 | Pass | Learning Library filter／edit／read-only／stale response suites |
| TC11 | Pass | DataBackupService multilingual restore assertion |
| TC12 | Pass | full regression suite |

### Commands Executed

```bash
npm test -- --run src/main/learning-item-artifacts.test.ts src/main/learning-library-service.test.ts
npm test -- --run src/renderer/learning-library-workspace.test.tsx src/renderer/learning-item-draft-dialog.test.tsx
npm test -- --run src/main/learning-library-service.test.ts src/main/learning-library-ipc.test.ts src/main/chat-ipc.test.ts
npm test -- --run src/main/data-backup-service.test.ts src/renderer/gui-language.test.ts src/renderer/learning-library-workspace.test.tsx
npm test -- --run src/renderer/App.test.tsx -t "scrolls the AI conversation to a newly sent user message only once"
npm test
npm run typecheck
npm run build
```

### Hypotheses and Decisions

- Migration 對既有項目採英文 backfill，因產品原始資料以英文為主；使用者可在詳情修正。
- GUI 守門測試要求產品文案為英文，因此四類顯示為 English、Japanese、Traditional
  Chinese、Other language，資料值與領域分類不變。
- 完整測試與 build 並行時曾出現一次既有捲動時序測試抖動；該案例聚焦重跑及串行完整
  suite 均通過，確認不是本功能回歸，未修改其測試或實作。

### Deferred Items

- 無。

### Architectural Observations

- 語言值目前在 artifact、chat IPC、learning IPC 與 Renderer 各自有小型 enum／label
  mapping；行為清楚且邊界獨立，但未來若語言集合擴充，適合抽成共用 runtime validator。

## Appendix: TDD Implementation Checklist

1. Add failing tests mapped to TC1–TC12.
2. Implement the smallest contract, migration, validation, query and UI changes that make them pass.
3. Refactor while all focused tests remain green.
4. Run typecheck, focused suites, production build and proportionate Electron regression checks.
5. Update this implementation record and the two affected module documents.
