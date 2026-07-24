---
author: Codex
date: 2026-07-24
title: 顯示複習例句真實完成數
uuid: 0bc76899-90bc-4e62-88d6-1bceabf46a42
version: 1.1.0
status: implemented
---

# Feature Specification - 顯示複習例句真實完成數

## 1. Feature Overview

複習試卷生成狀態卡目前只有不確定進度條與等待秒數，使用者無法判斷最多 10 道
間隔複習題已完成多少。過去模型輸出的 `Preparing n/10` 只是文字宣告，不代表對應
題目已完整生成，因此不能直接當作可信進度。

本功能從 Codex 串流中的 `review-paper` artifact 計算已完整收到的題目物件，顯示
「已完成 X／N 題例句」並以確定比例更新進度條。題目內容仍須等整份複習試卷通過
Main 驗證後才顯示。

## 2. Requirements (User Story)

- **As a** 正在等待 AI 生成複習試卷的學習者
- **I want** 看見已完成的例句題數與總題數
- **So that** 我能確認生成工作仍有進展，而不會誤以為程式卡住

## 3. Acceptance Criteria

- **Scenario 1：顯示真實完成數**
  - **Given** 本回合共有 N 個到期項目
  - **When** 串流 artifact 已完整收到 X 個題目物件
  - **Then** 狀態卡顯示「已完成 X／N 題例句」
  - **And** 進度條以 X／N 顯示確定比例

- **Scenario 2：只計算完整且位於 questions 陣列的題目**
  - **Given** 串流包含尚未閉合的題目物件、字串中的大括號或 artifact 外文字
  - **When** Main 計算完成數
  - **Then** 只計算 `questions` 陣列內已閉合的頂層題目物件
  - **And** 完成數不得超過本回合總題數

- **Scenario 3：全部例句完成後維持後續階段**
  - **Given** X 等於 N
  - **When** Main 尚在等待完整 artifact 並驗證試卷
  - **Then** 狀態卡切換為「例句已完成，正在組裝並檢查試卷」
  - **And** 進度條維持 100%，直到正式試卷顯示

- **Scenario 4：不暴露未驗證題目**
  - **Given** artifact 正在串流
  - **When** Renderer 接收進度事件
  - **Then** 事件只包含階段、完成數與總題數
  - **And** 不包含例句、答案、學習項目標題或原始 JSON

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 串流完整題目計數 | 兩題 artifact 分段輸入 | 第一題與第二題依序閉合 | 依序送出 1／2、2／2 | Critical |
| TC2 | 部分物件與括號字串 | 題目尚未閉合且文字含 `{}` | 計算進度 | 不提前增加完成數 | Critical |
| TC3 | IPC 安全邊界 | Controller 發布 typed progress | IPC 傳至 Renderer | payload 只有 phase、completedCount、totalCount | Critical |
| TC4 | Renderer 確定進度 | 收到 3／10 | 呈現狀態卡 | 顯示完成數，progressbar 值為 3／10 | Critical |
| TC5 | 全部完成後組裝 | 收到 10／10 assembling | 試卷 Promise 尚未完成 | 顯示組裝文案且進度維持 100% | High |
| TC6 | 動畫偏好 | 使用者偏好 reduced motion | 顯示確定進度 | 不依賴動畫表達完成比例 | Medium |

## 5. Implementation Notes

- 在 Main 使用字串狀態機尋找 `review-paper` fence、`questions` 陣列及其頂層物件；
  正確處理 JSON string 與跳脫字元，不解析或傳送半完成題目。
- `ReviewGenerationProgress` 新增 `completedCount` 與 `totalCount`。
- `preparing` 階段使用 determinate progressbar；完成數等於總數後改為 `assembling`。
- Renderer 以 CSS width 呈現比例，保留等待秒數與取消操作。
- 移除 skill 與 prompt 要求的 `Preparing` 文字行；它不再是進度資料來源。

## 6. Affected Modules and Files

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應 Controller、IPC、Renderer 與 bundled skill tests
- `documents/modules/spaced-review.md`

## 7. Assumptions and Non-goals

- 「完成」代表一個題目 JSON 物件已完整抵達 Main，不代表整份試卷已通過驗證。
- 串流 delta 若一次包含多題，數字可以一次跳過多個值；不製造逐秒假進度。
- 不提前顯示例句內容、不提供 ETA、不持久保存進度。
- 不改變試卷題數、生成內容、批改、FSRS、取消行為或右側 AI 對話。

## 8. Implementation Record

### Status

Implemented on 2026-07-24.

### Implementation Summary

- `SpacedReviewController` 在 generation delta 中尋找 fenced artifact 的
  `questions` 陣列，以處理 JSON string／escape 的字串狀態機計算已完整閉合的
  頂層題目物件。
- 進度從 `{ phase, completedCount, totalCount }` 的 typed boundary 傳至發起視窗，
  完成數固定限制於本回合題數，不傳送模型文字或題目內容。
- Renderer 顯示「已完成 X／N 題例句」、確定比例 progressbar 與對應 ARIA 值；
  全數到達後維持 100% 並切換組裝驗證文案。
- 移除 generation prompt 與 bundled skill 的額外 learner-facing progress lines，
  讓模型直接開始輸出正式 artifact。

### Test Coverage

- TC1／TC2：Controller test 將兩題 artifact 分四段輸入，驗證未閉合物件不計數、
  字串內 `{literal}` 不干擾，並依序發布 0／2、1／2、2／2。
- TC3：IPC test 驗證 typed payload 原樣送往發起 Renderer，且序列化內容不含
  `paperId` 或題目資料。
- TC4／TC5：Workspace test 驗證 1／4 顯示 25%、ARIA current/max，以及 4／4
  組裝階段維持 100%。
- TC6：production CSS 的 reduced-motion 規則停用 width transition，比例仍由
  inline width 表達。

### Changed Files

#### Production Code

- `.agents/skills/practice-spaced-review/SKILL.md`
- `apps/desktop/src/shared/review-contracts.ts`
- `apps/desktop/src/main/spaced-review-controller.ts`
- `apps/desktop/src/main/spaced-review-ipc.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/spaced-review-controller.test.ts`
- `apps/desktop/src/main/spaced-review-ipc.test.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.test.tsx`

#### Documents

- `documents/implements/F30-show-completed-review-exercise-count.md`
- `documents/modules/spaced-review.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 顯示真實完成數與確定比例 | Pass | Controller streaming test、Workspace progress test |
| 只計算 questions 內完整物件 | Pass | partial object／brace-in-string test |
| 全數完成後顯示組裝階段 | Pass | Controller 2／2 與 Workspace 4／4 test |
| 不暴露未驗證題目 | Pass | typed contract、IPC payload assertion |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `reports only fully streamed review questions as completed` |
| TC2 | Pass | 同一測試的 partial object 與 `{literal}` case |
| TC3 | Pass | `registers only typed review operations and rejects malformed payloads` |
| TC4 | Pass | `keeps AI generation feedback inside one staged status card` |
| TC5 | Pass | 同一 Workspace test 的 assembling assertions |
| TC6 | Pass | CSS reduced-motion rule、build verification |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/spaced-review-controller.test.ts src/main/spaced-review-ipc.test.ts src/renderer/SpacedReviewWorkspace.test.tsx
npm run typecheck
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/practice-spaced-review
npm test
npm test -w @reader/desktop -- --run src/renderer/App.test.tsx -t "shows the Codex account email in settings without exposing it in the sidebar"
npm test
npm run build -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

1. 不使用模型自行宣告的 `Preparing n/N`，因為宣告可能在正式題目物件產生前快速完成。
2. 不逐題解析半完成 JSON；只有頂層物件閉合才增加數字，最終合法性仍由既有
   `parseReviewPaper()` 完整驗證。
3. 計數放在 Controller，讓 IPC 與 Renderer 永遠只接觸最小 typed progress，
   延續既有 AI 暫態資料邊界。
4. 沒有新增跨模組耦合或缺少測試 seam，不需要另開 RXX。
5. 第一次完整測試中，既有 Codex 帳號 App test 單次停留在「尚未連線」而失敗；
   本次 diff 未觸及連線狀態。該案例單獨重跑通過，第二次完整套件亦全數通過，
   判定為既有非同步測試 flake，未修改無關產品或測試邏輯。

### Deferred Items

- 不估算剩餘時間；缺乏足夠 telemetry 時避免顯示不可靠 ETA。
- 不保證每次只增加一題；delta batching 可能讓完成數一次跳升。

## Appendix: TDD Implementation Checklist

1. 新增 Controller 計數與 IPC typed payload 的 failing tests。
2. 新增 Renderer determinate progress 的 failing test。
3. 實作最小串流計數與 UI。
4. 執行 focused tests、完整測試、typecheck、build、skill validation 與 diff check。
5. 更新本文件及 `documents/modules/spaced-review.md`。
