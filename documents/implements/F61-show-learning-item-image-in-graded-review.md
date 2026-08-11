---
author: Codex
date: 2026-08-11
title: 在已批改的間隔複習題顯示學習項目代表圖片
uuid: 0e0d65df-911d-41da-8407-e42913ab30ad
version: 1.1.0
status: implemented
---

# Feature Specification - Representative Image in Graded Review

## 1. Feature Overview

目前**學習項目代表圖片**只會在完整的**學習項目詳情**中顯示。使用者完成一份
**複習試卷**並進入對答案階段時，必須另外打開學習項目詳情才能看到圖片，無法直接把
圖片與剛完成的語義回想連結起來。

本功能在每道已批改題目的回饋區右上方顯示小型代表圖片。圖片只在 AI 批改完成後載入，
因此不會在作答前成為提示，也不會進入 review queue、題目資料或 AI scope。沒有代表圖片
的學習項目維持原本版面，不顯示空白框或佔位圖。

## 2. Requirements (User Story)

- **As a** 正在檢視間隔複習批改結果的語言學習者
- **I want** 在每題回饋右側直接看到該學習項目的小型代表圖片
- **So that** 我能在對答案時立即把目標語義與視覺線索建立連結

## 3. Confirmed Product Rules

- 代表圖片只出現在具有批改結果的題目回饋區，不出現在生成、作答或批改進行中階段。
- 縮圖位於回饋區右上方，保持正方形、不變形，且不得遮擋意思回饋、建議回答、詳情入口
  或評級操作。
- 沒有代表圖片時不顯示 placeholder，也不保留縮圖專用空間。
- 批改完成後才以題目既有且受信任的 `itemId` 讀取完整學習項目；圖片不加入
  `ReviewPaperQuestion`、review queue 或 AI payload。
- 讀取其中一張圖片失敗不阻擋其餘批改結果、評級覆寫或排程確認，也不以整頁錯誤取代
  已完成的回饋。
- 從該題開啟學習項目詳情並新增、更換或移除代表圖片後，回饋區縮圖立即同步目前圖片。
- 圖片提供描述該學習項目標題與目標語義的替代文字。

## 4. Acceptance Criteria

- **Scenario 1：有圖片的已批改題目顯示右側縮圖**
  - **Given** 複習試卷中的學習項目具有代表圖片
  - **When** AI 完成批改並顯示逐題回饋
  - **Then** 該題回饋區右上方顯示不變形的小型圖片
  - **And** 圖片替代文字包含學習項目標題與目標語義

- **Scenario 2：作答前不載入或顯示圖片**
  - **Given** 複習試卷仍在作答中
  - **When** 使用者檢視題目與答案輸入區
  - **Then** 不呼叫完整學習項目讀取來取得圖片
  - **And** 題面不顯示代表圖片或圖片佔位

- **Scenario 3：無圖片項目維持原版面**
  - **Given** 已批改題目的學習項目沒有代表圖片
  - **When** 批改回饋顯示
  - **Then** 不顯示圖片、空框或 placeholder
  - **And** 回饋文字仍使用完整可用寬度

- **Scenario 4：單題圖片載入失敗不阻斷對答案**
  - **Given** 一份已批改試卷包含多道題目
  - **When** 其中一個完整學習項目讀取失敗
  - **Then** 其他可用圖片照常顯示
  - **And** 使用者仍可閱讀全部回饋、調整評級並確認排程

- **Scenario 5：詳情中的圖片變更同步回饋縮圖**
  - **Given** 已批改題目已開啟學習項目詳情
  - **When** 使用者新增、更換或移除代表圖片
  - **Then** 關聯題目的縮圖立即顯示最新狀態
  - **And** 不重新生成或批改試卷，也不改變目前評級

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 批改後顯示縮圖 | 完整項目含代表圖片 | 提交並完成批改 | 回饋右側有具名圖片，object-fit 保持比例 | Critical |
| TC2 | 作答階段隔離 | 項目含代表圖片、試卷作答中 | 檢視題面 | 無圖片且未呼叫 `getItem` | Critical |
| TC3 | 無圖片不佔位 | 完整項目圖片為 null | 完成批改 | 無 img／placeholder，回饋維持一般版面 | High |
| TC4 | 部分讀取失敗 | 多題且其中一筆 `getItem` reject | 完成批改 | 其他圖片正常；回饋與確認操作仍可用 | High |
| TC5 | 圖片 mutation 同步 | 已批改題目開啟詳情 | Add／Replace／Remove | 縮圖同步，review API 與 rating 不變 | Critical |
| TC6 | 窄畫面版面 | 已批改題目含圖片 | 視窗縮窄 | 圖片不遮擋回饋與操作，內容可閱讀 | High |

## 6. Impact Scope

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`：批改後懶載入圖片、逐題縮圖與 mutation 同步。
- `apps/desktop/src/renderer/styles.css`：回饋區右側縮圖及窄畫面配置。
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`：作答隔離、有圖、無圖、失敗與同步回歸測試。
- `documents/modules/spaced-review.md`：同步批改後代表圖片的目前行為與測試覆蓋。

不需要修改資料庫、Main、Preload、IPC、review artifact 或 AI skill；既有完整學習項目 API
已在批改結果畫面可用，且會回傳 nullable 代表圖片。

## 7. Non-goals and Assumptions

- 不在未作答題面、生成進度、批改進度、review queue 或 AI scope 顯示／傳遞圖片。
- 不以圖片出題，不讓 AI 讀圖，也不改變語義批改或 FSRS 排程。
- 不新增圖片上傳、裁切、格式或持久化能力；沿用 F59 的既有代表圖片功能。
- 不在排程確認後的完成清單新增縮圖；該頁仍可透過學習項目詳情查看圖片。
- 第一版每題最多一張縮圖，不提供放大、caption 或圖片來源資訊。

## 8. Implementation Record

### Status

Implemented（2026-08-11）。

### Implementation summary

- `SpacedReviewWorkspace` 只在 `reviewing` 階段以每題受信任 `itemId` 懶載入完整學習項目；
  個別 request failure 被隔離，不會改寫頁面 error 或中斷評級確認。
- 每題批改回饋新增 summary grid；有代表圖片時於右上顯示 84×84 正方形縮圖，使用
  `object-fit: cover`、圓角、邊框與陰影，640px 以下縮為 64×64。沒有圖片時不建立 img
  或 placeholder，文字欄自動使用完整寬度。
- 縮圖替代文字沿用完整學習項目的目前標題與 sense。
- 共用詳情的 Add／Replace／Remove callback 會更新逐題 item cache，因此圖片 mutation
  立即反映在回饋區；較晚抵達的初始 lazy-load 不會覆寫已同步的新 item snapshot。
- 試卷題型、review queue、Main／Preload／IPC、AI artifact、批改與 FSRS 排程均未修改。

### Test coverage

- `loads and shows a representative image only after the question is graded`：TC1、TC2、TC6。
- `does not reserve an image placeholder when the graded item has no image`：TC3。
- `keeps grading usable when a representative image cannot be loaded`：TC4。
- `syncs a graded thumbnail after replacing and removing the image in details`：TC5。
- 完整 `SpacedReviewWorkspace.test.tsx`：30/30 passed。
- 相鄰 `learning-library-workspace.test.tsx` 與 review workspace：49/49 passed。
- 完整 desktop suite：52 test files、506 tests passed。
- Desktop TypeScript typecheck passed。

### Changed files

#### Production code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `documents/implements/F61-show-learning-item-image-in-graded-review.md`
- `documents/modules/spaced-review.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 有圖片的已批改題目顯示右側縮圖 | Pass | TC1；具名 img、source 與 feedback image class |
| 作答前不載入或顯示圖片 | Pass | TC2；`getItem` 未呼叫且無 img |
| 無圖片項目維持原版面 | Pass | TC3；無 img／placeholder，feedback 保留 |
| 單題圖片載入失敗不阻斷對答案 | Pass | TC4；無 global alert、rating 與 confirm 可用 |
| 詳情中的圖片變更同步回饋縮圖 | Pass | TC5；Replace／Remove 即時同步且 grade 只呼叫一次 |

### Test scenario verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | 批改後 image role／alt／src／class |
| TC2 | Pass | 作答中 `getItem` call count 與無 img |
| TC3 | Pass | nullable image 不渲染 img 或 placeholder |
| TC4 | Pass | rejected `getItem` 不顯示 alert，rating／confirm 維持 |
| TC5 | Pass | 詳情 Replace／Remove callback 更新縮圖，批改不重跑 |
| TC6 | Pass | summary grid 不重疊；640px media rule 將固定縮圖降為 64×64 |

### Commands executed

```bash
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx -t "loads and shows a representative image only after the question is graded"
npm run test -w @reader/desktop -- --run src/renderer/SpacedReviewWorkspace.test.tsx
npm run typecheck -w @reader/desktop
npm run test -w @reader/desktop -- --run src/renderer/learning-library-workspace.test.tsx src/renderer/SpacedReviewWorkspace.test.tsx
git diff --check
npm run test -w @reader/desktop -- --run
```

### Hypotheses and decisions

- 初始 red 首次停在生成中的畫面，原因是測試未等待 async `generatePaper()` 完成；加入答案
  textarea 等待點後，測試正確以「找不到代表圖片」失敗，再進入 green。
- 使用既有 `LearningDesktopApi.getItem`，避免把圖片加入作答前 review contract 或另建 IPC。
- 圖片載入錯誤保持局部靜默；使用者明確點擊詳情且讀取失敗時，既有全域錯誤回饋仍保留。

### Deferred items

- 未新增完成頁清單縮圖、圖片放大、caption、來源資訊或 AI 讀圖；皆屬本功能 non-goals。

### Notes

- 沒有發現新的模組責任混淆；既有完整項目 API 與共用詳情 callback 已提供合適測試接縫。

## Appendix: TDD Implementation Checklist

1. 先以 TC1–TC5 建立 Renderer failing tests，確認圖片只在批改完成後讀取。
2. 以最小 state 與 effect 懶載入完整學習項目，單筆失敗彼此隔離。
3. 加入逐題縮圖與響應式樣式，保持現有回饋及評級操作。
4. 驗證詳情圖片 mutation 會更新同題縮圖，且不觸發 review workflow。
5. 執行相關 Renderer 測試與 desktop typecheck。
6. 同步本文件 Implementation Record 與 `documents/modules/spaced-review.md`。
