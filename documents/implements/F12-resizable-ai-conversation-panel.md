---
author: Codex
date: 2026-07-21
title: 讓 AI 對話面板可拖曳調整寬度
uuid: b8759f517143451386e5bc20178156a4
version: 1.0.0
status: approved
---

# Feature Specification - 讓 AI 對話面板可拖曳調整寬度

## 1. Feature Overview

目前 **AI 對話面板**固定為 360px。較長的 AI 回覆、表格或程式碼需要更寬的閱讀空間時，使用者只能水平捲動或閱讀狹窄排版；若希望把更多畫面留給書籍內容，也無法縮小右側面板。

本功能在 AI 對話面板左邊界加入可拖曳的調整把手，讓使用者即時改變面板寬度。寬度必須限制在安全範圍，避免面板過窄而破壞操作，也避免過寬而壓縮中央閱讀區。既有摺疊／展開功能保持不變，展開後回到本次工作階段最後調整的寬度。

## 2. Requirements (User Story)

- **As a** 使用 AI 對話面板的閱讀者
- **I want** 拖曳面板左邊界調整寬度
- **So that** 我能依 AI 回覆內容與閱讀需求分配書籍和對話的畫面空間

## 3. Acceptance Criteria

- **Scenario 1：拖曳增加 AI 對話面板寬度**
  - **Given** AI 對話面板已展開
  - **When** 使用者把左邊界調整把手向左拖曳
  - **Then** AI 對話面板即時變寬，中央內容區同步縮小

- **Scenario 2：拖曳減少 AI 對話面板寬度**
  - **Given** AI 對話面板已展開且寬於最小值
  - **When** 使用者把調整把手向右拖曳
  - **Then** AI 對話面板即時變窄，但不得小於 280px

- **Scenario 3：限制最大寬度並保護閱讀區**
  - **Given** 使用者持續把調整把手向左拖曳
  - **When** AI 對話面板將使中央內容區小於 520px，或面板將超過 640px
  - **Then** 系統停止增加面板寬度，畫面不產生水平溢出

- **Scenario 4：摺疊與展開保留調整寬度**
  - **Given** 使用者已調整 AI 對話面板寬度
  - **When** 使用者摺疊後再展開右側欄
  - **Then** 摺疊時維持 48px，展開後恢復本次工作階段最後調整的寬度

- **Scenario 5：摺疊時不顯示調整把手**
  - **Given** AI 對話面板已摺疊
  - **When** 使用者查看右側欄
  - **Then** 寬度調整把手不可操作，也不攔截中央內容區的指標事件

- **Scenario 6：鍵盤可調整寬度**
  - **Given** AI 對話面板已展開且調整把手取得焦點
  - **When** 使用者按方向鍵左或右
  - **Then** 面板以固定步進增加或減少寬度，並遵守相同最小／最大限制

- **Scenario 7：取消拖曳恢復原寬度**
  - **Given** 使用者正在拖曳調整把手
  - **When** 系統收到 pointercancel
  - **Then** 面板恢復這次拖曳開始前的寬度

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 向左拖曳變寬 | 初始寬度 360px | pointermove 從 x=920 到 x=820 | workspace 右欄寬度變為 460px | Critical |
| TC2 | 向右拖曳變窄 | 初始寬度 360px | pointermove 超過最小界線 | 寬度停在 280px | Critical |
| TC3 | 最大寬度保護 | workspace 可用寬度有限 | pointermove 遠離左側 | 寬度不超過 640px，中央欄保留 520px | Critical |
| TC4 | 摺疊後恢復 | 已拖曳至 460px | 摺疊再展開 | 依序顯示 48px 與 460px | High |
| TC5 | 摺疊隱藏把手 | 右側欄摺疊 | 查找 separator | separator 不存在 | High |
| TC6 | 鍵盤方向鍵 | separator 聚焦 | ArrowLeft／ArrowRight | 寬度以 16px 步進增減 | High |
| TC7 | 取消拖曳 | 從 360px 開始拖曳 | pointercancel | 恢復 360px | High |

## 5. Implementation Notes

- Renderer 在 `.workspace` 設定 `--right-sidebar-width`，CSS grid 繼續使用同一變數，不改動 Main、Preload 或 Codex 協定。
- 調整把手放在 `.assistant-panel` 左邊界，使用 `role="separator"`、`aria-orientation="vertical"`、`aria-valuenow`、`aria-valuemin` 與動態 `aria-valuemax`。
- 展開寬度下限為 280px、絕對上限為 640px；動態上限同時扣除左側欄寬度並保留中央內容區至少 520px。
- pointermove 期間停用 grid transition 與文字選取，避免拖曳延遲和誤選文字。
- 寬度只保存在目前 Renderer 工作階段，不新增本機設定檔或 IPC。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 使用者所說的「可拖動」指拖曳 AI 對話面板左邊界調整寬度，不是把整個面板移到其他位置。
- 第一版不跨重啟保存寬度，但摺疊／展開和畫面模式切換不會重設。
- 預設展開寬度維持現有 360px。

### Open Questions

- 無。最小／最大值採用與現有 520px 中央欄及 360px 預設寬度相容的安全預設。

### Non-goals

- 不允許把 AI 對話面板移到左側、浮動顯示或脫離主視窗。
- 不同步或跨重新啟動保存面板寬度。
- 不變更 AI 對話、模型、回覆停止或閱讀區段邏輯。

## 7. Affected Modules and Files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/ai-conversation.md`

## 8. Implementation Record

已於 2026-07-21 完成：

- Renderer 以工作階段狀態保存 AI 對話面板的展開寬度，預設為 360px。
- 面板左邊界新增可聚焦的垂直 separator；支援指標拖曳及 ArrowLeft／ArrowRight 每次 16px 調整。
- 展開寬度限制於 280–640px，並依 workspace 與左側欄寬度動態保留至少 520px 中央閱讀區。
- 拖曳期間停用 grid transition 與文字選取；pointercancel 會還原拖曳開始前的寬度。
- 右側欄摺疊時使用 48px 並移除 separator；重新展開後恢復先前調整寬度。
- 新增 Renderer 單元測試覆蓋拖曳、最小／最大值、鍵盤、取消拖曳及摺疊恢復；Electron E2E 驗證實際視窗中的調寬流程。

驗證結果：

- 全專案 Vitest：Server 3/3、Desktop 89/89 passed。
- 全專案 TypeScript typecheck：passed。
- 全專案 production build：passed。
- Electron Playwright：2/2 passed。
