---
author: Codex
date: 2026-07-28
title: 將專案與桌面 App 統一改名為 VocabReader
uuid: 1fb65c24-72c5-4e53-83b1-99bed103672d
version: 1.1.0
status: implemented
---

# Feature Specification - 將產品改名為 VocabReader

## 1. Feature Overview

專案根套件目前使用 `ai-assisted-epub-reader`，桌面 App 對外則使用
`LingoShelf`。本變更把專案與所有使用者可見的 App 品牌統一為
`VocabReader`，避免開發名稱、視窗標題、備份操作與 AI 任務識別不一致。

## 2. Requirements (User Story)

- **As a** VocabReader 使用者與開發者
- **I want** 專案及 App 中的產品名稱一致
- **So that** 畫面、檔案、文件與執行資訊都清楚屬於同一產品

## 3. Acceptance Criteria

- **Scenario 1：桌面 App 顯示新名稱**
  - **Given** VocabReader 桌面 App 已啟動
  - **When** 使用者查看視窗、頁面標題、側欄與設定文字
  - **Then** 使用者可見的產品名稱為 `VocabReader`
  - **And** 不再顯示 `LingoShelf`

- **Scenario 2：備份操作使用新名稱**
  - **Given** 使用者開啟資料備份功能
  - **When** 匯出、選取或還原資料備份
  - **Then** 預設檔名、原生對話框與錯誤文字使用 `VocabReader`
  - **And** 既有 `lingoshelf-data-backup` 格式識別維持可讀，避免破壞舊備份

- **Scenario 3：開發與 AI 執行資訊使用新名稱**
  - **Given** 專案安裝依賴或 App 建立 Codex AI 工作
  - **When** 檢視根套件名稱或 AI client metadata
  - **Then** 使用 `vocab-reader`／`VocabReader` 對應名稱

- **Scenario 4：現行產品文件使用新名稱**
  - **Given** 開發者閱讀產品總覽、領域脈絡與現行模組文件
  - **When** 搜尋目前產品名稱
  - **Then** 文件以 `VocabReader` 稱呼產品

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 視窗與頁面標題 | App 啟動 | 檢視 Electron／HTML title | 顯示 `VocabReader` | High |
| TC2 | 備份對話框 | 開啟匯出或匯入 | 檢視預設檔名、標題及 filter | 使用 `VocabReader` | High |
| TC3 | AI client metadata | Codex client 初始化 | 檢視 initialize 與 developer instructions | 使用 VocabReader 識別 | Medium |
| TC4 | 根套件名稱 | 讀取 npm metadata | 檢視 package 與 lockfile | 名稱為 `vocab-reader` | Medium |
| TC5 | 舊備份相容 | 選取格式為 `lingoshelf-data-backup` 的有效 ZIP | 驗證備份 | 仍可正常預覽與還原 | Critical |

## 5. Scope and Constraints

- 保留 `@reader/desktop`、`@reader/server`、`readerDesktop` 等通用內部技術名稱。
- 保留備份 manifest 的 `lingoshelf-data-backup` 格式識別，將它視為穩定資料協定值。
- 不重新命名工作區實體資料夾；資料夾路徑不屬於 App 使用者可見品牌。
- 既有已完成 FXX／BXX 的歷史敘述可保留當時名稱；產品總覽、現行模組文件與 F38
  這類仍描述現行操作的文件需同步。

## 6. Affected Areas

- 根 `package.json`、`package-lock.json`
- Electron main process、renderer、HTML 與 E2E 測試
- 資料備份 service／IPC 與測試
- Codex AI client metadata、專用 prompt 與 bundled skill 描述
- `README.md`、`CONTEXT.md`、現行模組文件與 F38

## Implementation record

### Status

Implemented

### Implementation summary

- 根 npm 專案由 `ai-assisted-epub-reader` 改名為 `vocab-reader`。
- Electron 視窗、HTML title、頁首品牌、設定與資料還原文字統一使用
  `VocabReader`，品牌字母由 `L` 改為 `V`。
- 資料備份預設檔名、原生對話框與可理解錯誤文字改用 `VocabReader`。
- 一般對話、間隔複習與學習項目提交前檢查的 Codex client metadata 及產品限定
  developer instructions 改用 VocabReader。
- server health service 名稱改為 `vocab-reader-server`。
- bundled skill 描述、產品總覽、領域脈絡、現行模組文件及 F38 同步新名稱。
- 備份 manifest 的 `lingoshelf-data-backup` 格式識別刻意保留，既有備份仍可讀。

### Test coverage

- TC1：E2E 驗證 HTML title 與頁首 `VocabReader` 品牌文字。
- TC2：`data-backup-ipc.test.ts` 與 `data-backup-service.test.ts` 驗證對話框、filter、
  檔名、錯誤文字與備份內容。
- TC3：一般 AI 對話、間隔複習、重複項目檢查測試驗證 client metadata。
- TC4：`npm pkg get name` 驗證根 npm metadata，typecheck／test／build 均以
  `vocab-reader@0.1.0` 執行。
- TC5：既有資料備份 service 測試仍以 `lingoshelf-data-backup` 建立及驗證 manifest。

### Changed files

#### Production code

- `package.json`
- `package-lock.json`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/learning-item-duplicate-classifier.ts`
- `apps/desktop/src/main/data-backup-ipc.ts`
- `apps/desktop/src/main/data-backup-service.ts`
- `apps/desktop/src/renderer/index.html`
- `apps/desktop/src/renderer/App.tsx`
- `apps/server/src/routes/system.ts`
- `.agents/skills/create-learning-items/SKILL.md`
- `.agents/skills/practice-spaced-review/SKILL.md`

#### Test code

- `apps/desktop/src/main/data-backup-ipc.test.ts`
- `apps/desktop/src/main/data-backup-service.test.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/learning-item-duplicate-classifier.test.ts`
- 相關測試暫存路徑與 `apps/desktop/tests/e2e/desktop.spec.ts`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/server/tests/app.test.ts`

#### Documents

- `README.md`
- `CONTEXT.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/data-backup.md`
- `documents/modules/skill-management.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/implements/F39-rename-product-to-vocabreader.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 桌面 App 顯示 VocabReader | Pass | Renderer tests、build 與 Electron E2E 失敗快照均顯示新 title／品牌 |
| 備份操作使用新名稱且舊格式可讀 | Pass | 9 個 backup tests passed；manifest 相容值仍受測 |
| 開發與 AI 執行資訊使用新名稱 | Pass | npm metadata 與 62 個相關 AI tests passed |
| 現行產品文件使用新名稱 | Pass | README、CONTEXT、modules、F38 已同步 |

### Test scenario verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | E2E `toHaveTitle("VocabReader")` 與可見品牌斷言均已通過後續執行點 |
| TC2 | Pass | data backup IPC／service tests |
| TC3 | Pass | chat／spaced review／learning item recheck tests |
| TC4 | Pass | `npm pkg get name`、全專案 test／typecheck／build |
| TC5 | Pass | backup service manifest round-trip tests |

### Commands executed

```bash
npm run test -w @reader/desktop -- --run src/main/data-backup-ipc.test.ts
npm run test -w @reader/desktop -- --run src/main/data-backup-ipc.test.ts src/main/data-backup-service.test.ts
npm run test -w @reader/server -- --run tests/app.test.ts
npm pkg get name
npm run test -w @reader/desktop -- --run src/main/chat-controller.test.ts src/main/spaced-review-controller.test.ts src/main/learning-item-duplicate-classifier.test.ts
npm run test -w @reader/desktop -- --run src/renderer/App.test.tsx
npm run typecheck
npm test
npm run build
npm run test:e2e
```

### Hypotheses and decisions

- Red phase first observed the backup dialog test correctly fail because implementation仍回傳
  `LingoShelf 資料備份`；改名後通過。
- 首次 E2E 在 sandbox 內無法啟動 Electron；取得 GUI 權限後可正常啟動。
- GUI E2E 的品牌／標題斷言已通過，但同一案例後段因找不到既有文案「現在可練習」
  而失敗。診斷比較失敗快照與未提交的 `SpacedReviewWorkspace` diff 後，確認既有首頁
  改版已改成「先完成 10 題，讓記憶繼續往前」，舊 E2E 斷言尚未同步；這與 F39
  改名無關，因此未改動該斷言。
- 保留 `@reader/*`、`readerDesktop` 與 `lingoshelf-data-backup`，前兩者是通用內部
  技術 API，後者是需維持相容的持久資料協定值。
- 保留目前工作區實體資料夾名稱，避免在執行中的共享工作區移動根目錄。

### Deferred items

- 完整 E2E 結果為 1 passed、1 failed；失敗是工作樹既有間隔複習首頁改版的舊文案
  斷言，應由該功能變更同步更新。

### Notes

- 未發現本次改名新增的架構耦合或缺少測試接縫。
