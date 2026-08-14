---
author: Codex
date: 2026-07-24
title: 讓新增學習卡片遵守講解語言設定
uuid: 9cfe784dad3d400ca24a1b46a38d7a2b
version: 1.1.0
status: implemented
---

# Bug Fix Specification - 新增學習卡片的原文語言判斷錯誤

> 例句本體固定為英文的舊契約已由
> `B19-use-learning-item-language-for-examples` 取代；B06 仍作為講解語言來源判定的
> 歷史實作紀錄。

## 1. Bug Overview

「新增學習卡片」已傳送全域**講解語言**設定，但 Main Process 目前把 `source`
固定翻譯成「使用目前閱讀區段的語言」。當使用者從生詞庫建立卡片、目前沒有閱讀區段，
或一次加入不同語言的目標時，AI 無法依卡片標題本身正確選擇解釋語言。

這使學習卡片與「解釋標記」看似共用同一設定，實際上卻沒有完整遵守使用者選擇。

## 2. Root Cause

- `composeCodexInput()` 共用一份 `source` 語言文字，沒有區分區段解析／區段練習與
  AI 輔助建立。
- `create-learning-items` skill 只要求遵守 requested explanation language，沒有明定
  `source` 必須逐張依單字／片語本身辨識語言。
- 現有測試只覆蓋區段解析與區段練習的四種語言映射，沒有建立卡片的專屬映射測試。

## 3. Expected Behavior

- `source`：逐筆根據 requested learning-item target 的文字語言產生卡片。
  - 英文單字／片語使用英文解釋，例句翻譯也使用英文。
  - 中文詞語使用繁體中文解釋與翻譯。
  - 日文單字／片語使用日文解釋與翻譯。
  - 同一批次含多種語言時，各張卡片可以使用不同語言。
- `zh-TW`：批次內所有卡片都使用繁體中文解釋與例句翻譯。
- `en`：批次內所有卡片都使用英文解釋與例句翻譯。
- `ja`：批次內所有卡片都使用日文解釋與例句翻譯。
- 卡片標題、英文例句、IPA 等本來需要保留原貌的內容不被強制翻譯。
- `sense` 繼續使用簡短英文語義識別，避免影響既有去重資料契約。
- 區段解析與區段練習的 `source = 目前閱讀區段語言` 行為維持不變。

## 4. Acceptance Criteria

- **Scenario 1：原文設定依卡片目標逐筆判斷**
  - **Given** 講解語言為 `source`
  - **When** 使用者建立英文、中文或日文單字／片語
  - **Then** Main input 明確要求逐筆偵測 target title 的語言
  - **And** 不要求使用目前閱讀區段的語言

- **Scenario 2：原文設定支援同批多語**
  - **Given** 一個批次同時包含英文、中文與日文 targets
  - **When** 系統呼叫 `create-learning-items`
  - **Then** skill 允許每張卡依自己的 target language 使用不同講解語言

- **Scenario 3：指定語言套用整批**
  - **Given** 講解語言分別為 `zh-TW | en | ja`
  - **When** 系統組成建立卡片 input
  - **Then** explanation language 分別固定為繁體中文、英文與日文
  - **And** 不受 target 或閱讀區段語言影響

- **Scenario 4：既有語言與去重行為不回歸**
  - **Given** 使用者執行解釋標記、閱讀測驗或新增學習卡片
  - **When** Main Process 組成對應 turn input
  - **Then** 前兩者的 source mapping 維持閱讀區段語言
  - **And** 建立 skill 的候選查詢、語義去重、結構化輸出及提交流程不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 英文原文卡片 | `source` + English target | 組成 creation input | 指示使用 target 的 English | Critical |
| TC2 | 中文原文卡片 | `source` + 中文 target | 組成 creation input | 指示使用 target 的繁體中文 | Critical |
| TC3 | 日文原文卡片 | `source` + 日本語 target | 組成 creation input | 指示使用 target 的日本語 | Critical |
| TC4 | 同批多語 | `source` + 三種語言 targets | 組成 creation input | 明定逐張判斷、允許批內語言不同 | Critical |
| TC5 | 三種固定語言 | `zh-TW / en / ja` + 任意 targets | 組成 creation input | 整批固定使用所選語言 | Critical |
| TC6 | Skill 語言契約 | bundled creation skill | 驗證 rubric | source 逐張辨識；固定設定整批一致 | High |
| TC7 | 既有 workflow 回歸 | annotation／quiz／creation | 執行完整測試 | 原有 routing、去重與結構驗證通過 | High |

## 6. Implementation Notes

- 沿用既有 `ExplanationLanguage` enum、設定持久化、Renderer 傳值與 IPC 契約。
- 在 `composeCodexInput()` 中為 `createLearningItems` 使用專屬語言映射；不要修改
  annotation／quiz 共用的閱讀區段映射。
- `source` prompt 必須以 target title 為判斷基準，而非 user message、候選內容或
  reading segment；同批多語時逐筆套用。
- 更新 `create-learning-items` skill 的 Input／Draft Contract，明確規範講解與例句翻譯
  語言，並保留 `sense` 為英文識別。
- 不新增語言自動偵測程式庫；具體語言判斷由已取得 targets 的 AI 執行。

## 7. Implementation Record

### Status

Implemented.

### Implementation Summary

- `composeCodexInput()` 現在把 AI 輔助建立與閱讀區段流程的 source 規則分開。
- `source` 明確要求逐筆依 requested target title 判斷英文、繁體中文或日文，
  並允許同批草稿使用不同語言。
- `zh-TW`、`en`、`ja` 明確要求整批使用固定語言。
- `create-learning-items` skill 新增語言契約，並保留 title、IPA、英文例句及英文
  `sense` 的既有資料語意。
- 沒有新增設定值、IPC 欄位、資料庫欄位或語言偵測相依套件。

### Test Coverage

- Red：新增 creation 專屬 source、多語批次、三種固定語言及 skill 契約測試；
  初次執行共 5 項如預期失敗。
- Green：`chat-controller.test.ts` 43 項通過。
- Renderer 回歸：`App.test.tsx` 51 項通過。
- 完整回歸：server 3 項、desktop 164 項，共 167 項通過。
- `create-learning-items` skill validator 通過。
- TypeScript typecheck 與 production build 通過。

### Acceptance Verification

| Scenario | Result |
|---|---|
| 原文設定依卡片目標逐筆判斷 | Passed |
| 原文設定支援同批多語 | Passed |
| 指定繁體中文／英文／日文套用整批 | Passed |
| annotation／quiz source mapping 與建立、去重、提交流程不回歸 | Passed |

### Changed Files

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `.agents/skills/create-learning-items/SKILL.md`
- `documents/modules/learning-item-creation.md`
- `CONTEXT.md`
- `documents/implements/B06-use-explanation-language-for-learning-cards.md`

### Architectural Observation

建立卡片的語言基準屬於 target，而區段解析／練習的語言基準屬於 reading segment。
把兩種 source 語意在 Main input 組裝處分離後，責任已清楚，未發現需要另開 RXX 的
架構問題。

## Appendix: TDD Fix Workflow

1. 先新增 creation 專屬四種語言映射與 skill rubric 的失敗測試。
2. 最小修改 Main prompt 與 bundled skill。
3. 執行聚焦測試、skill validator、完整回歸、typecheck、build 與 diff check。
4. 更新本文件、learning-item-creation 模組與 `CONTEXT.md`。
