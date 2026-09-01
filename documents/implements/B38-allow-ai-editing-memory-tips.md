---
author: Codex
date: 2026-09-01
title: 讓 AI 編輯可修改記憶提示
uuid: 14f3af3d-8f3d-4931-87dc-2d88c3e5f61e
version: 1.0.0
status: implemented
---

# Bug Fix: 讓 AI 編輯可修改記憶提示

## 1. Bug Overview

學習項目的人工編輯器已可修改或清空記憶提示，但 AI 編輯只會把
`markdownContent` 與 `cautionNote` 放入暫態草稿、AI artifact 與儲存邊界。
使用者要求 AI 改寫、補充或清空 Memory tip 時，AI 沒有可回傳該欄位的
受控通道，Renderer 也始終顯示正式項目的舊值，Apply 不會寫入 `memory_tip`。

## 2. Fix Objective

- 讓 AI 編輯可根據明確需求改寫、補充或清空記憶提示。
- 暫態 AI 草稿應即時預覽新的記憶提示，但只在使用者明確 Apply 後儲存。
- 未要求修改記憶提示時，AI 必須原樣保留；修改時仍遵守專案的
  拼寫／字形回想優先、語言一致與受限行內 Markdown 契約。
- 保留現有單項目、暫態、嚴格 artifact、stale/Trash optimistic guard 與明確 Apply 邊界。

## 3. Acceptance Criteria

- **Scenario 1：AI 可修改記憶提示**

  - **Given** active 學習項目已有記憶提示
  - **When** 使用者要求 AI 修改該提示，且 AI 回傳有效的完整 artifact
  - **Then** 暫態 snapshot 含有新 `memoryTip`，詳情中即時預覽新值
  - **And** 明確 Apply 後 SQLite 儲存新值

- **Scenario 2：AI 可清空記憶提示**

  - **Given** 學習項目有記憶提示
  - **When** 使用者明確要求移除，AI 回傳空字串
  - **Then** artifact 可通過驗證，草稿預覽不顯示 Memory tip
  - **And** Apply 後正式 `memory_tip` 為空字串

- **Scenario 3：無關編修保留記憶提示**

  - **Given** 本輪需求只修改例句、一般 Markdown 或學習注意事項
  - **When** AI 產生完整草稿
  - **Then** `memoryTip` 與本輪輸入值完全一致

- **Scenario 4：嚴格信任邊界維持**

  - **Given** AI 回傳缺少 `memoryTip`、非字串或額外欄位的 artifact
  - **When** Main parser 驗證結果
  - **Then** 整份結果被拒絕，不覆蓋上一版有效草稿

- **Scenario 5：受保護儲存邊界不回歸**

  - **Given** 學習項目在 AI 編輯開始後已變更或進入垃圾桶
  - **When** 使用者 Apply 含新記憶提示的草稿
  - **Then** repository 依舊拒絕 stale/trashed 覆寫，三個內容欄位都不變

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 重現 artifact 缺欄位 | 含 Memory tip 的項目 | 現有 parser/controller 往返 AI edit | snapshot 與 Apply 沒有 `memoryTip` | Critical |
| TC2 | 完整 artifact 解析 | 新、舊、空的 Memory tip | parser 驗證 | 字串完整保留，缺失／非字串／額外 key 拒絕 | Critical |
| TC3 | controller 暫態往返 | 項目現有 tip | start、send、apply | payload、snapshot、hasChanges 與 Apply 均含 tip | Critical |
| TC4 | repository 儲存 | current active item | Apply 新 tip 或空字串 | `memory_tip` 與其他內容同步原子更新 | Critical |
| TC5 | Renderer 草稿預覽 | AI snapshot 含新 tip | send 完成 | 顯示新 tip，不顯示舊 tip | High |
| TC6 | skill 契約 | 無關或 tip 專屬需求 | AI 編修 | 保留或符合記憶提示規則地修改 | High |
| TC7 | stale/Trash guard | 已變更或進入 Trash 的項目 | Apply | 拒絕全部內容欄位覆寫 | High |

## 5. Implementation Notes

- 將 `memoryTip` 加入 `LearningItemEditSnapshot.draft`、bounded payload、
  `learning-item-edit-result` 嚴格 schema 與 `applyAiEdit()` 輸入。
- `memoryTip` 必須是字串，但可為空字串，以支援明確移除。
- Skill 每輪必須回傳完整 `memoryTip`；無關需求原樣保留，
  有關需求使用 `primaryExplanationLanguage` 並遵守 `CONTEXT.md`
  定義的拼寫／字形回想與受限行內 Markdown 邊界。
- Renderer 與 Markdown 顯示共用現有 `LearningMemoryTip`，不新增編輯 UI。
- SQL 維持單一 conditional update，避免部分欄位在 stale 衝突下被寫入。

## 6. Affected Files and Boundaries

- `.agents/skills/edit-learning-item/SKILL.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-item-edit-controller.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`
- 對應的 artifact、controller、repository、Renderer 與 skill 契約測試
- `documents/modules/learning-item-editing.md`

## 7. Assumptions and Non-goals

- 不讓 AI 修改標題、類型、語言、CEFR、sense、代表圖片、狀態或複習資料。
- 不新增 AI 編輯歷史、undo、自動 Apply 或新 IPC method。
- 不變更記憶提示的現有安全渲染與資料庫 schema。

## 8. Implementation Record

### Status

Implemented and verified on 2026-09-01.

### Implementation Summary

- `LearningItemEditSnapshot` 與 Controller 暫態草稿現在完整保留 `memoryTip`。
- Controller 將最新 Memory tip 傳給受限 AI thread，並將通過驗證的回傳值
  納入 `hasChanges`、後續編修與明確 Apply。
- 嚴格 `learning-item-edit-result` schema 必須含字串 `memoryTip`；空字串
  代表明確移除，缺失、非字串或額外欄位仍拒絕。
- Repository 在同一個 `itemId + active + baseUpdatedAt` conditional update 中原子寫入
  Markdown、Memory tip、注意事項與 `updated_at`。
- Renderer 在 AI 編輯期間改顯示 snapshot 中的 Memory tip，Apply 前不變更正式項目。
- Bundled skill 要求無關編修原樣保留 Memory tip；明確修改時沿用主要解釋語言、
  優先幫助拼寫／字形回想，並只使用受限行內 Markdown。

### Test Coverage

| Test scenario | Automated basis | Result |
|---|---|---|
| TC1 / TC2 | `learning-item-artifacts.test.ts` | Passed: 新欄位從原 parser 拒絕轉為嚴格完整往返，空字串允許 |
| TC3 | `learning-item-edit-controller.test.ts` | Passed: start/payload/result/hasChanges/apply 皆含 Memory tip |
| TC4 / TC7 | `learning-library-service.test.ts` | Passed: 新值與空值儲存，stale/Trash 依舊拒絕 |
| TC5 | `learning-library-workspace.test.tsx` | Passed: AI 草稿即時取代舊 Memory tip 預覽 |
| TC6 | `learning-item-edit-skill.test.ts` | Passed: 保留、拼寫／字形、語言與 Markdown 契約固定 |

### Changed Files

#### Production code

- `.agents/skills/edit-learning-item/SKILL.md`
- `apps/desktop/src/shared/learning-contracts.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-item-edit-controller.ts`
- `apps/desktop/src/main/learning-library-service.ts`
- `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx`

#### Test code

- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `apps/desktop/src/main/learning-item-edit-controller.test.ts`
- `apps/desktop/src/main/learning-library-service.test.ts`
- `apps/desktop/src/main/learning-item-edit-skill.test.ts`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`

#### Documentation

- `documents/implements/B38-allow-ai-editing-memory-tips.md`
- `documents/modules/learning-item-editing.md`
- `documents/ddd-email-notify.md` (completion ledger only)

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| AI 可修改記憶提示 | Pass | TC2–TC5 |
| AI 可清空記憶提示 | Pass | TC2 / TC4 |
| 無關編修保留記憶提示 | Pass | TC3 / TC6 完整草稿契約 |
| 嚴格信任邊界維持 | Pass | TC2：缺失、非字串、額外 key 拒絕 |
| stale/Trash 受保護儲存不回歸 | Pass | TC7 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | Red 階段 parser/controller/repository/Renderer 均重現欄位斷點 |
| TC2 | Pass | `accepts only...` / `requires a string memory tip...` |
| TC3 | Pass | `keeps one bounded draft transient until explicit apply` |
| TC4 | Pass | `applies only a current active AI draft...` |
| TC5 | Pass | `updates one in-place AI draft...` |
| TC6 | Pass | `keeps editing bounded, language-aware, transient, and schema-safe` |
| TC7 | Pass | `applies only a current active AI draft and rejects stale or trashed cards` |

### Commands Executed

```bash
# Red: 5 files, 6 expected failures, 73 passed
npm test -w @reader/desktop -- --run \
  src/main/learning-item-artifacts.test.ts \
  src/main/learning-item-edit-controller.test.ts \
  src/main/learning-library-service.test.ts \
  src/main/learning-item-edit-skill.test.ts \
  src/renderer/learning-library-workspace.test.tsx

# Target green: 5 files, 79/79 passed
npm test -w @reader/desktop -- --run \
  src/main/learning-item-artifacts.test.ts \
  src/main/learning-item-edit-controller.test.ts \
  src/main/learning-library-service.test.ts \
  src/main/learning-item-edit-skill.test.ts \
  src/renderer/learning-library-workspace.test.tsx

# Full desktop unit suite: 60 files, 584/584 passed
npm test -w @reader/desktop

# Server and desktop typecheck: passed
npm run typecheck

# Server and desktop production build: passed
npm run build

# Electron production build and E2E: 5/5 passed
npm run test:e2e -w @reader/desktop
```

### Hypotheses and Decisions

1. **Confirmed by code inspection:** AI edit artifact, controller draft/payload and repository Apply
   intentionally omit `memoryTip`.
2. **Confirmed by code inspection:** Renderer previews `item.memoryTip` even while an AI draft is active.
3. **Confirmed by code inspection:** the bundled edit skill neither receives nor returns `memoryTip`.
4. **Ruled out by existing tests:** manual editing and SQLite persistence already round-trip `memory_tip`.

### Deferred Items

- 不編輯標題、類型、語言、CEFR、sense、代表圖片、狀態或複習資料。
- 不新增 AI 編輯歷史、undo 或自動 Apply。
- 版本、installer、Git commit、push 與 release 維持未處理。

### Notes

- The existing `LearningMemoryTip` / `LearningItemContent` path was a suitable Renderer test seam.
- No debug instrumentation or throwaway harness remains.
- No architectural issue requiring an RXX was exposed; the existing strict artifact, controller,
  repository, and Renderer boundaries accepted the additional field without a new coupling path.
- DDD completion email sent through verified Gmail sender; message id `1a05bab09c279296`.
