---
author: Codex
date: 2026-07-29
title: 在學習項目複習歷史保存並顯示使用者作答
uuid: c25d5fb6-edba-4c26-b812-80aa9ba08890
version: 1.1.0
status: implemented
---

# Feature Specification - 複習歷史保存使用者作答

## 1. Feature Overview

目前學習項目詳情的精簡複習歷史只保存複習時間、AI 建議評級、最終評級與排程結果，
無法回看當時輸入的意思。此功能在使用者確認整份**複習試卷**時，將每題原始
**複習作答**隨對應學習項目的複習事件保存，並在精簡歷史逐筆顯示，讓使用者辨識
自己是否反覆把某個單字或片語混淆為相同的其他語義。

## 2. Requirements (User Story)

- **As a** 使用間隔複習記憶單字與片語的使用者
- **I want** 在學習項目的複習歷史看到每次實際作答
- **So that** 我可以追蹤自己是否經常混淆成某個錯誤意思

## 3. Acceptance Criteria

- **Scenario 1：確認試卷後保存逐題作答**
  - **Given** 使用者已提交並完成 AI 批改，且每題可能有文字或留白作答
  - **When** 使用者確認整份試卷的最終評級
  - **Then** 每個複習事件保存該題未經改寫的原始複習作答
  - **And** 作答與受信任的 item id、AI 評級及最終評級在同一交易寫入

- **Scenario 2：在精簡複習歷史顯示作答**
  - **Given** 某學習項目具有已保存作答的複習事件
  - **When** 使用者展開該項目的精簡複習歷史
  - **Then** 每筆事件顯示「你的作答」與原始文字
  - **And** 長文字保留換行並在歷史卡片內換行，不破壞 modal 版面

- **Scenario 3：區分留白作答與舊歷史**
  - **Given** 一筆新事件的作答是空字串，另一筆舊事件沒有作答欄位
  - **When** 使用者查看兩筆歷史
  - **Then** 新事件顯示「未作答」
  - **And** 舊事件顯示「未保存作答」

- **Scenario 4：未確認試卷不保存作答**
  - **Given** 使用者正在作答、已批改但尚未確認，或已放棄試卷
  - **When** 系統查詢學習項目的複習歷史
  - **Then** 不新增複習事件或複習作答

- **Scenario 5：既有資料庫無損升級**
  - **Given** 使用者資料庫已有不含作答的複習事件
  - **When** 新版 App 首次開啟資料庫
  - **Then** schema migration 增加可為 null 的作答欄位
  - **And** 既有事件、排程及備份相容性維持不變

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 控制器保留逐題作答 | 完整答案集合已批改 | 確認評級 | repository 收到每個 item 對應的原始作答 | High |
| TC2 | 交易保存與讀回 | 文字作答含首尾空白或換行 | 確認後查詢詳情 | 讀回未經 trim 或改寫的原始文字 | High |
| TC3 | 留白與舊資料呈現 | `answer = ""` 與 `answer = null` 事件並存 | 展開歷史 | 分別顯示「未作答」與「未保存作答」 | High |
| TC4 | 放棄不保存 | 作答後放棄試卷 | 查詢詳情 | 沒有新事件或答案 | High |
| TC5 | migration 相容 | version 2 資料庫含既有事件 | 開啟新版 repository | 欄位存在且舊事件答案為 null | High |
| TC6 | UI 長文字 | 作答含多行與長字串 | 顯示詳情 | 原文與換行可讀，內容不溢出卡片 | Medium |

## 5. Implementation Notes

- `SpacedReviewController` 在批改成功後把已驗證的完整答案集合保存在 active review
  scope；確認時依 question id 對應到受信任的 item id，不接受 Renderer 在確認 payload
  另行提供答案。
- `ConfirmedReviewRating` 增加 `answer`；`ReviewHistoryEntry` 增加
  `answer: string | null`。空字串代表本次留白，`null` 專供 migration 前的舊事件。
- `learning_review_events` 以 schema version 4 新增 nullable `answer` 欄位。新事件一律
  寫入 string；舊事件保持 null。
- 精簡歷史仍不保存 AI 例句、建議回答、詳細回饋或表達建議。
- 整份 SQLite 備份自然包含新增欄位；不新增獨立備份格式或匯出檔。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 使用者所稱「單字的測驗紀錄」對應領域詞彙中的學習項目精簡複習歷史。
- 每個學習項目代表一個特定語義，因此顯示該項目的原始作答足以協助辨識重複混淆。
- 使用者要求追蹤的是確認後的歷史，不是跨 App 恢復未完成試卷。

### Open Questions

- 無。

### Non-goals

- 不保存或重播完整複習試卷、AI 例句、詳細回饋、建議回答或表達建議。
- 不自動統計或聚類「最常弄錯的意思」。
- 不提供歷史答案編輯、刪除、搜尋或匯出。
- 不回填 migration 前不存在的作答內容。

## 7. Affected Modules and Files

- `CONTEXT.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應 Main、Controller 與 Renderer 測試
- `documents/modules/spaced-review.md`
- `documents/modules/learning-library.md`

## 8. Implementation Record

### Status

Implemented.

### Implementation Summary

- `SpacedReviewController` 在批改成功後保留已驗證答案集合；確認時依 question id
  取回原始答案，與受信任的 item id、AI 評級及使用者最終評級一起交給 repository。
- `learning_review_events` 以 schema 4 新增 nullable `answer`；既有資料庫會在交易內
  無損 migration，新事件保存原始 string，舊事件保持 null。
- `ReviewHistoryEntry` 經 Main／Preload／Renderer typed boundary 回傳答案。
- 共用學習項目詳情逐筆顯示 `Your answer`；文字保留換行並可斷長字，空字串顯示
  `Not answered`，null 顯示 `Answer wasn't saved`。
- 資料備份最大相容 schema 提升為 4；整份 SQLite snapshot 自然包含已確認作答。

### Test Coverage

- TC1：`keeps AI paper data ephemeral and commits only trusted confirmed ratings`
- TC2／TC3：`persists compact FSRS history and uses the final user rating`
- TC3／TC6：`shows compact review status and history in learning item detail`
- TC4：`does not persist review answers when a graded paper is discarded`
- TC5：`migrates a legacy review database with a nullable answer column`
- 備份相容：`exports and previews an existing supported schema version 4 database`

### Verification

#### Changed files

Production code:

- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

Test code:

- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/data-backup-service.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

Documents:

- `CONTEXT.md`
- `documents/modules/learning-library.md`
- `documents/modules/spaced-review.md`
- `documents/implements/F28-ai-graded-spaced-review-paper.md`
- `documents/implements/F32-add-expression-feedback-to-spaced-review.md`

#### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 確認時逐題原子保存原始作答 | Pass | Controller trusted-confirm test；repository round-trip test |
| 精簡歷史顯示原始文字且支援長文字 | Pass | Renderer history test；`white-space: pre-wrap`、`overflow-wrap: anywhere` |
| 區分留白與舊歷史 | Pass | Repository blank／null round-trip；Renderer 三態 test |
| 未確認或放棄不保存 | Pass | Controller discard test；repository 未被呼叫 |
| 既有資料庫無損升級 | Pass | Legacy schema migration test；schema 4 backup compatibility test |

#### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Controller 確認 payload 含原始答案 |
| TC2 | Pass | 首尾空白與換行精確 round-trip |
| TC3 | Pass | 空字串與 null 分別保存／呈現 |
| TC4 | Pass | discard 後無 repository confirmation |
| TC5 | Pass | 缺少 answer 欄位的舊資料庫重開後 migration 至 version 4 |
| TC6 | Pass | 多行文字 render test 與 production build |

#### Commands Executed

```bash
npm run test -w @reader/desktop -- src/main/learning-library-service.test.ts src/main/spaced-review-controller.test.ts src/main/data-backup-service.test.ts src/renderer/learning-library-workspace.test.tsx -t "migrates a legacy review database|persists compact FSRS history|does not persist review answers|keeps AI paper data ephemeral|supported schema version 4|shows compact review status and history"
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

結果：F41 六個焦點案例全數通過（6 passed），desktop typecheck 與 production build
通過。擴大執行相關完整測試檔時，另有既存 GUI／錯誤訊息英文化與舊中文測試之間的
5 個不相關失敗；F41 自己修改的案例已依目前正式碼文案驗證通過。

#### Hypotheses and Decisions

- 紅燈初次執行時，`learning-library-workspace.test.tsx` 同檔多個既有案例在 F41 斷言
  前即失敗。依序檢查工作樹 diff、locale 分支及 HEAD 後，確認根因是尚未提交的正式
  GUI 英文化修改，測試仍期待中文，並非 F41 或測試環境問題。F41 只同步自己使用的
  selector，不擴張修改其他語系案例。
- schema 3 已是資料備份層的既有相容版本，因此答案 migration 使用 schema 4。
- `ConfirmedReviewRating.answer` 對既有 Main 內部直接呼叫保持可選；production
  Controller 一律傳入已驗證 string，repository 對舊呼叫安全正規化為留白字串。
- 不建立 ADR：nullable 欄位與既有 append-only event 相容，且沒有跨服務或難以逆轉
  的架構取捨。

#### Deferred Items

- 不自動彙整「最常誤認的意思」；本次先提供逐筆可追蹤資料。
- 不回填 schema 4 前不存在的作答，也不保存完整試卷、例句或詳細回饋。

## Appendix: TDD Implementation Checklist

1. 先新增控制器、repository migration／round-trip 與 Renderer 紅燈測試。
2. 讓 active review 在批改後保留已驗證答案。
3. 以 schema version 4 保存 nullable answer，並從詳情 typed boundary 回傳。
4. 在共用學習項目詳情顯示作答並區分留白與舊事件。
5. 執行相關測試、完整 typecheck／test，回填實作紀錄並同步模組文件。
