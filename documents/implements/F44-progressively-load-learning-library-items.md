---
author: Codex
date: 2026-07-31
title: 漸進載入並視窗化呈現生詞庫學習項目
uuid: e7fdebe8-c204-40af-a353-78dbc50bdcbd
version: 1.0.0
status: implemented
---

# Feature Specification - 漸進載入並視窗化呈現生詞庫學習項目

## 1. Feature Overview

目前生詞庫每次查詢都會取得所有符合條件的完整**學習項目**，包含清單卡片不會使用的
Markdown 內容；Renderer 隨後一次建立全部卡片。側欄數量也透過取得完整 active／trash
清單後計算。當學習項目與複習歷史持續增加時，SQLite 查詢、Electron IPC 傳輸、
Main process 狀態整理及 React DOM 數量都會隨完整資料量成長，造成開啟、搜尋、
篩選、排序及捲動延遲。

本功能讓生詞庫與**垃圾桶**固定以每批最多 50 筆的輕量摘要漸進載入，使用者接近目前
結果底部時自動取得下一批，不顯示已載入筆數或總符合筆數。Renderer 以視窗化方式只
掛載可視卡片與必要緩衝範圍；完整 Markdown 仍只在開啟**學習項目詳情**時懶載入。
查詢條件改變時建立新的結果集合，項目 mutation 則盡量保留使用者目前的閱讀位置。

此功能延續 F19 當時明確延後的 pagination／virtual scrolling 擴充點，不改變學習項目、
複習排程或垃圾桶的領域語義。

## 2. Requirements (User Story)

- **As a** 長期累積大量學習項目與複習歷史的 VocabReader 使用者
- **I want** 生詞庫與垃圾桶在捲動時自動、分批載入並只渲染目前需要看到的項目
- **So that** 即使生詞庫達到一萬筆規模，仍能快速開啟、查詢、捲動及管理學習項目

## 3. Acceptance Criteria

- **Scenario 1：首次只載入一批使用中項目**
  - **Given** 生詞庫有超過 50 筆符合目前查詢的使用中學習項目
  - **When** 使用者開啟生詞庫
  - **Then** App 只取得排序後的前 50 筆輕量學習項目摘要
  - **And** 清單 payload 不包含 Markdown 學習內容
  - **And** 結果區不顯示「Showing X of Y」或其他已載入／總符合筆數

- **Scenario 2：接近底部時自動取得下一批**
  - **Given** 目前結果仍有下一批且沒有載入 request 進行中
  - **When** 使用者捲動到接近已載入結果底部
  - **Then** App 自動取得下一批最多 50 筆摘要並接續目前結果
  - **And** 使用者不需要點擊「Load more」
  - **And** 不重複、遺漏或打亂已載入項目
  - **And** 同一時間最多只有一個相同查詢的下一批 request

- **Scenario 3：垃圾桶使用相同行為**
  - **Given** 垃圾桶有超過 50 筆學習項目
  - **When** 使用者進入垃圾桶並持續向下捲動
  - **Then** 垃圾桶以每批最多 50 筆自動漸進載入
  - **And** 垃圾桶與使用中清單都不一次取得或渲染完整集合

- **Scenario 4：視窗化保持有界 DOM**
  - **Given** 使用者已透過自動載入瀏覽數千筆學習項目
  - **When** 使用者繼續向下或向上捲動
  - **Then** Renderer 只掛載可視卡片列與小幅前後緩衝範圍
  - **And** 已載入資料的增加不會使掛載卡片元素持續無界成長
  - **And** 使用者仍可向上返回較早載入的項目
  - **And** responsive card grid、鍵盤焦點與卡片詳情入口維持可用

- **Scenario 5：查詢條件改變後建立新結果集合**
  - **Given** 使用者已在某個搜尋、篩選或排序結果中向下捲動
  - **When** 使用者改變搜尋文字、類型、CEFR、學習狀態或排序
  - **Then** App 取消或忽略舊查詢尚未完成的 response
  - **And** 清除舊結果及舊 cursor，從新查詢第一批重新載入
  - **And** 結果區回到頂部
  - **And** 搜尋文字約 debounce 250 ms 後才發出查詢

- **Scenario 6：完整詳情維持懶載入**
  - **Given** 清單只持有學習項目摘要
  - **When** 使用者開啟一個學習項目
  - **Then** App 透過既有受限詳情操作取得該項目的完整 Markdown 與結構化資料
  - **And** 詳情查看、編輯、複習摘要及歷史行為維持不變

- **Scenario 7：下一批載入狀態與失敗重試**
  - **Given** 目前結果仍有下一批
  - **When** 下一批正在載入
  - **Then** 結果底部顯示低干擾的 spinner 或 skeleton loading 狀態
  - **When** 該 request 失敗
  - **Then** 已載入卡片保持可用，底部顯示可操作的 Retry
  - **And** Retry 只重試相同查詢的失敗批次
  - **When** 已取得最後一批
  - **Then** 不顯示「all items loaded」或結果總數文案

- **Scenario 8：mutation 保留目前位置**
  - **Given** 使用者已向下捲動並開啟一個學習項目詳情
  - **When** 使用者儲存編輯，或把項目移入垃圾桶
  - **Then** 可見摘要及其所屬結果集合反映最新狀態
  - **And** 結果以最接近 mutation 前的可見學習項目作為 anchor，保留約略捲動位置
  - **And** 不因 refresh 無條件跳回清單頂部
  - **Given** 使用者位於垃圾桶
  - **When** 使用者還原項目或清空垃圾桶
  - **Then** 垃圾桶結果正確更新並在仍有結果時保留鄰近 anchor

- **Scenario 9：數量查詢不載入完整集合**
  - **Given** 側欄及垃圾桶入口需要完整 active／trash 數量
  - **When** App 載入或 mutation 後刷新數量
  - **Then** Main process 使用受限的 count 操作取得兩個狀態的數量
  - **And** 不為計算數量取得學習項目內容、摘要或複習歷史

- **Scenario 10：一萬筆資料規模**
  - **Given** 測試資料庫包含 10,000 筆混合狀態、類型、CEFR、複習狀態及大量歷史的
    學習項目
  - **When** 使用者開啟使用中清單或垃圾桶，捲動載入後續批次，並執行搜尋、篩選及排序
  - **Then** 每次清單 response 仍最多包含 50 筆摘要
  - **And** Main process 不為單一清單批次建立全部學習項目或全部複習歷史的回傳集合
  - **And** Renderer 掛載的卡片數量保持在視窗與緩衝範圍所需的有界數量
  - **And** 自動化互動不發生可觀察的長時間凍結、重複卡片或結果錯置

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 使用中第一批 | 51 筆以上符合項目 | 查詢第一批 | 回傳 50 筆摘要、具有下一批 cursor、無 Markdown | Critical |
| TC2 | 使用中最後一批 | 剩餘不足 50 筆 | 使用目前 cursor 查詢 | 依序回傳剩餘項目且沒有下一批 cursor | Critical |
| TC3 | 自動載入觸發 | 第一批已顯示且仍有下一批 | 底部 sentinel 接近 viewport | 自動呼叫一次下一批並接續結果 | Critical |
| TC4 | 防止重複 request | 下一批仍在進行 | sentinel 重複進入 viewport | 不建立第二個相同 request | High |
| TC5 | 垃圾桶漸進載入 | 51 筆以上 trashed 項目 | 進入並捲動垃圾桶 | 每批最多 50 筆且順序完整 | Critical |
| TC6 | 視窗化 DOM | 已載入數千筆摘要 | 往返捲動多個遠距位置 | 掛載卡片數保持有界且可返回先前項目 | Critical |
| TC7 | Responsive grid | 不同中央區寬度 | 改變可用寬度並捲動 | 欄數與 virtual row 計算更新，卡片不重疊或錯位 | High |
| TC8 | 查詢 reset | 已載入多批舊查詢 | 改變 filter 或 sort | 舊結果／cursor 清除、回頂部、只顯示新查詢 | Critical |
| TC9 | 搜尋 debounce | 連續輸入多個字元 | 250 ms 尚未／已經過 | 前者不查詢，後者只查詢最後文字 | High |
| TC10 | Stale response | 舊查詢延遲、新查詢先完成 | 舊 response 最後返回 | 舊資料不覆蓋或附加到新結果 | Critical |
| TC11 | 詳情懶載入 | 摘要沒有 Markdown | 開啟卡片 | 才取得完整項目並正常顯示詳情 | Critical |
| TC12 | 載入中與失敗 | 下一批延遲或拒絕 | 自動載入／Retry | 顯示底部狀態、保留既有卡片、成功後只附加一次 | High |
| TC13 | 無結束文案 | 最後一批完成 | 繼續停留底部 | 不再查詢且不顯示總數或結束文案 | Medium |
| TC14 | 編輯保留 anchor | 深度捲動後開啟詳情 | 儲存會影響摘要或排序的欄位 | 結果正確刷新並保留鄰近可見位置 | High |
| TC15 | 移入垃圾桶與還原 | 深度捲動且項目可見 | trash／restore 項目 | 兩個集合與數量正確，相關 view 保留鄰近 anchor | Critical |
| TC16 | Count query | active／trash 各有多筆完整內容 | 載入或 mutation 後刷新數量 | 回傳正確數量且不呼叫完整 list query | High |
| TC17 | Cursor 邊界 | cursor 無效、過期或屬於不同查詢 | 經 typed IPC 傳入 | 安全拒絕或要求從第一批重查，不混合結果 | Critical |
| TC18 | 一萬筆結構壓測 | 10,000 筆項目及大量 events | 查詢、捲動、搜尋、篩選、排序 | 每批與 DOM 有界，結果正確且互動無長時間凍結 | Critical |
| TC19 | 既有生詞庫回歸 | 既有 seed、詳情、編輯與垃圾桶案例 | 執行 Main／IPC／Renderer／E2E suites | 原有行為保持通過 | Critical |

## 5. Implementation Notes

### Query boundary

- `learning:list` 應從「回傳完整陣列」改為回傳一個有界 page，包含最多 50 筆
  `LearningItemSummary` 與 opaque `nextCursor`；最後一批的 cursor 為空。
- Renderer 不可指定任意 page size；50 筆是此功能的固定內部 batch size。
- 摘要只包含卡片、排序、anchor 與操作識別實際需要的欄位，不包含
  `markdownContent`。完整 `LearningItem` 繼續由 `learning:get` 懶載入。
- cursor 必須綁定查詢狀態、搜尋、篩選、排序及一致的時間判定，並使用唯一 id 作為
  deterministic tie-breaker。不得讓不同查詢共用 cursor。
- study-status filter 與 `study-status`／`next-due` sort 必須在選出 page 之前完成；
  pagination 不得先任意截斷資料再於 JavaScript 排除或重排。
- Main process 只整理目前 page 所需的摘要狀態。清單查詢不得再為每一批取得所有 active
  學習項目的完整歷史集合。
- 依最終 SQL filter／sort／cursor 形狀補充必要 index；migration 必須相容既有資料庫。
- 新增受限的 learning-library count 操作，直接回傳 active／trash 數量；不得使用兩次
  完整 `listItems()` 代替 count。

### Renderer behavior

- 使用結果 scroll region 內的 bottom sentinel 觸發下一批；應在 sentinel 真正到達底部
  前保留適度 root margin，降低使用者看到空白等待的機率。
- 查詢 loading、load-more loading、load-more error 與 exhausted 必須是不同狀態；
  exhausted 不呈現額外文案。
- windowing 必須支援目前 responsive grid。中央區寬度改變造成欄數變動時，重新計算
  virtual rows 並維持合理 anchor。
- focused card 不得因 windowing 意外卸載；鍵盤與輔助技術仍需能操作已呈現的卡片。
- query identity 改變時使舊 async response 失效。search 採約 250 ms debounce，
  select filter 與 sort 可立即開始新查詢。
- mutation refresh 以可見學習項目 id 作為 anchor；若該項目已移出 view，改用最近仍存在
  的鄰近項目。只有查詢條件改變才固定回到頂部。

### Dependency decision

目前 Desktop dependencies 沒有 windowing library。實作時可以選擇小型、可測試且支援
responsive grid 的既有套件，或建立聚焦的本機 windowing helper；F44 不預先指定套件。
若新增 dependency，Implementation Record 必須記錄選擇理由、bundle 影響及替代方案。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 自動載入門檻以使用者接近底部為準，不需要精確停在最後一張卡片才觸發。
- 每批 50 筆為固定產品行為，不提供使用者設定。
- 結果區不顯示已載入筆數、總符合筆數或「全部載入」文案。
- 一萬筆測試以確定性的有界 query／payload／DOM 指標為主要驗收，避免依單一 CI
  硬體設定容易波動的毫秒門檻。

### Open Questions

- 無。

### Non-goals

- 不改變學習項目的內容、去重、建立、編輯、垃圾桶或複習排程語義。
- 不改變搜尋只比對 title 的既有範圍，也不新增全文搜尋。
- 不顯示結果總數、頁碼、「Load more」按鈕或最後一批提示。
- 不讓 Renderer 取得 SQLite、任意 SQL、完整複習歷史或可自行調整 batch size 的能力。
- 不把整份生詞庫傳給 AI。
- 不處理帳號同步、遠端資料庫或跨裝置即時更新。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/package.json`（只有選擇新增 windowing dependency 時）
- `package-lock.json`（只有 dependency 改變時）

### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documentation

- `documents/implements/F44-progressively-load-learning-library-items.md`
- `documents/modules/learning-library.md`

## 8. Implementation Record

### Status

Implemented on 2026-07-31.

### Implementation Summary

- Renderer-facing `learning:list` 改為固定最多 50 筆的 `LearningItemPage`，page 只含
  `LearningItemSummary` 與 nullable opaque cursor，不傳送 Markdown。
- cursor 保存 query fingerprint、as-of time 與下一個 offset；不同搜尋、篩選、排序或
  status 無法共用，所有 order 都以 id 作 deterministic tie-breaker。
- `LocalLearningLibrary.listItemPage()` 直接從目前 schedule 的 FSRS state 與 due 計算
  study status，先完成 filter／sort 再限制 page，不再為清單掃描並回傳完整 review
  event 集合。
- 新增 `learning:counts`／`countItems()`，App 與 Learning Library 不再以完整 active／
  trash list 計算側欄數量。
- Renderer 以 250 ms debounce 建立 query identity；查詢改變會使舊 response 失效、
  清除 cursor 並回頂部。接近底部時由 IntersectionObserver 自動取得下一批。
- 下一批載入顯示低干擾 spinner；失敗保留既有卡片並停止自動重試，直到使用者按 Retry。
  最後一批與結果區均不顯示總數或結束文案。
- active grid 與 Trash list 使用固定 row geometry、自適應欄數與三列 overscan 的本機
  windowing；離開視窗的 focused item 以單一 keeper 保留並在 DOM handoff 後恢復焦點。
- edit、trash、restore、empty-trash 會重新取得目前已載入深度，並恢復 mutation 前的
  scroll offset；query change 才固定回頂部。
- 未新增 windowing dependency。

### Test Coverage

- `learning-library-service.test.ts`
  - TC1／TC2：固定 50 筆摘要 page、最後一批及 Markdown exclusion。
  - TC17：跨 query cursor 與 malformed cursor 拒絕。
  - TC18：直接建立 10,000 筆 SQLite fixture，驗證連續 page、summary boundary 及 count。
  - TC8：既有 study-status filter／sort 案例同步驗證 paged query。
- `learning-library-ipc.test.ts`
  - TC16／TC17：七個 typed IPC、paged list、direct counts 及 malformed payload。
- `learning-library-workspace.test.tsx`
  - TC3／TC4：bottom intersection 自動附加且不重複 request。
  - TC5：Trash 使用相同自動分批。
  - TC6／TC7：有界 responsive window、深度捲動與 focused item retention。
  - TC8／TC9／TC10：filter reset、250 ms search debounce、stale response rejection。
  - TC11：summary card 開啟後才以 `learning:get` 讀取 Markdown。
  - TC12／TC13：next-page loading、failure、manual Retry 及無結果／結束文案。
  - TC14／TC15：edit／trash／restore／empty-trash 與 scroll anchor。
- `App.test.tsx`、`SpacedReviewWorkspace.test.tsx`
  - 更新 typed Learning API doubles，並由 App 直接使用 `countItems()`。
- `desktop.spec.ts`
  - preload 白名單加入 `countItems`。

### Changed Files

#### Production code

- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/main/learning-library-ipc.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-library-ipc.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/implements/F44-progressively-load-learning-library-items.md`
- `documents/modules/learning-library.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 1. 首次只載入 50 筆摘要、無 Markdown／結果數量 | Pass | repository page test、Renderer no-count test、Electron smoke |
| 2. 接近底部自動取得下一批且不重複 | Pass | `automatically appends...`、loading guard |
| 3. 垃圾桶使用相同行為 | Pass | `automatically pages through Trash...` |
| 4. 有界 DOM、可回捲、responsive 與焦點 | Pass | bounded-card／focus keeper test、fixed responsive row implementation |
| 5. query change reset、stale protection、250 ms debounce | Pass | controls test、`ignores a stale response...` |
| 6. 完整詳情懶載入 | Pass | existing centered Markdown detail test；summary type／SQL 無 Markdown |
| 7. loading、失敗 Retry、最後一批無文案 | Pass | `keeps loaded cards visible and retries...` |
| 8. mutation 保留位置 | Pass | edit scroll-offset assertion；trash／restore refresh coverage |
| 9. count 不載入完整集合 | Pass | repository count、IPC count、App `countItems()` |
| 10. 一萬筆資料規模 | Pass | deterministic 10,000-item repository fixture、bounded Renderer test |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `returns fixed-size summary pages...` |
| TC2 | Pass | 同一測試的第二 page／null cursor |
| TC3 | Pass | `automatically appends the next page...` |
| TC4 | Pass | `isLoadingMore` guard 與 auto-load test call count |
| TC5 | Pass | `automatically pages through Trash...` |
| TC6 | Pass | `keeps mounted learning-item cards bounded...` |
| TC7 | Pass | width-derived columns、ResizeObserver、bounded window test |
| TC8 | Pass | controls test與 stale-query test |
| TC9 | Pass | controls test等待 debounced final search query |
| TC10 | Pass | `ignores a stale response after filters...` |
| TC11 | Pass | existing detail test與 `LearningItemSummary` contract |
| TC12 | Pass | `keeps loaded cards visible and retries...` |
| TC13 | Pass | auto-load test的 null cursor 及 no-count／no-end DOM |
| TC14 | Pass | edit test的 420px scroll preservation |
| TC15 | Pass | existing trash／restore／empty test使用 anchored reload |
| TC16 | Pass | repository／IPC count tests、App direct count |
| TC17 | Pass | cursor isolation test、IPC cursor validation |
| TC18 | Pass | 10,000-item repository fixture、50-item bounded DOM fixture |
| TC19 | Pass with unrelated E2E caveat | 334/334 Vitest、typecheck、build、focused Electron smoke；完整 E2E 受既有 annotation assertion 阻擋 |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run ../main/learning-library-service.test.ts -t "returns fixed-size summary pages"
npm test -w @reader/desktop -- --run ../main/learning-library-ipc.test.ts
npm test -w @reader/desktop -- --run ../main/learning-library-service.test.ts
npm test -w @reader/desktop -- --run learning-library-workspace.test.tsx
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
npm run test:e2e -w @reader/desktop
npm run test:e2e -w @reader/desktop -- --grep "keeps long overview content"
node -e '<focused Electron Learning Library bridge and UI smoke>'
```

### Hypotheses and Decisions

- F19 原始範圍以十筆 seed data 為基礎，明確把 pagination 與 virtual scrolling 留作後續；
  F44 將此擴充點提升為正式的一萬筆規模需求。
- 使用者選擇自動漸進載入，不使用手動按鈕或 numbered pages。
- 自動載入若未搭配 windowing，深度捲動後仍會重新累積大量 DOM；因此兩者屬於同一
  feature 的必要條件。
- 使用者選擇不顯示「Showing 50 of 2,341」類型的結果統計。
- 查詢條件改變回到頂部；item mutation 則保留鄰近 anchor，避免管理深度結果時反覆失去
  位置。
- 未採用第三方 windowing dependency；目前 card 與 Trash row 都有穩定 geometry，
  本機 responsive fixed-row window 能保持實作及 bundle boundary 小而可測試。
- paged query 直接使用 `learning_review_schedules.card_json` 的目前 FSRS state 判定
  learning／relearning，避免清單每次重播所有歷史 events；完整統計流程仍沿用既有
  `reviewProgress()`，責任不混合。
- focus retention 首次測試出現 `event.currentTarget` 在 React state updater 執行時已清空。
  假說包含 synthetic event lifetime、scroll region unmount、jsdom target 與 focus
  re-entrant render；snapshot metrics 後確認 synthetic event lifetime 為第一個根因。
- 同一 focus test 隨後確認 window handoff 會讓 browser 將焦點退回 body；以最多一筆
  focused-item keeper 並在 layout effect 恢復焦點，兼顧 DOM 上限與鍵盤操作。
- 完整 Electron E2E 在 F44 assertion 之前失敗。比對 HEAD 與目前 CSS 確認
  `.annotation-tool` 本來就是 96×36、11px radius、top 84px，但既有測試仍期待舊的
  84×40 pill；F44 CSS 僅新增 `learning-*` selectors，因此未修改該無關視覺契約。

### Deferred Items

- F44 無 deferred behavior。
- `desktop.spec.ts` 的 annotation-tool 舊視覺 assertion 應由該 UI 所屬工作另行同步；
  本功能沒有改寫無關 assertion。

### Notes

- `documents/modules/learning-library.md` 已在保留其他尚未提交更新的前提下同步 F44。
- 完整 Desktop Vitest 334/334、typecheck 與 production build 通過。
- 官方長內容 E2E 1/1 通過；focused Electron smoke 確認 bridge keys、10 張 seed card、
  virtual space、無 `Showing` 文案及 idle `aria-busy`。

## Appendix: TDD Implementation Checklist

1. 先以 TC1、TC2、TC5、TC16、TC17 建立 repository／IPC Red tests，定義 page、
   cursor、summary 與 count boundary。
2. 實作最小 Main／shared／preload 變更，使固定 50 筆查詢、deterministic sort、
   query-bound cursor、輕量摘要及 count 通過。
3. 以 TC3、TC4、TC8 至 TC13 建立 Renderer Red tests，涵蓋 sentinel、debounce、
   stale response、loading、retry 與 exhausted。
4. 實作自動載入狀態機，再以 TC6、TC7 建立 responsive grid windowing Red tests。
5. 以 TC14、TC15 驗證 mutation anchor 與 active／trash 集合更新。
6. 建立 TC18 的 10,000 筆 deterministic scalability fixture，驗證 batch、payload、
   query work boundary 及 mounted DOM 上限。
7. 執行 TC19 既有 Main、IPC、Renderer、typecheck、build 與 Electron E2E 回歸。
8. 更新本文件 Implementation Record 及 `documents/modules/learning-library.md`。
