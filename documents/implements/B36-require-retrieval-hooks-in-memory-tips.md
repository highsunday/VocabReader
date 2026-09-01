---
author: Codex
date: 2026-09-01
title: 讓記憶提示優先幫助回想拼寫
uuid: 9a79c6a9-33c4-41f8-ad5d-8a8055989ffa
version: 1.0.0
status: implemented
---

# Bug Fix: 讓記憶提示優先幫助回想拼寫

## 1. Bug Overview

F78 要求 AI 優先產生具體、有動作的心智場景，但沒有要求場景必須以
學習項目的寫法、讀音或可辨識結構作為回想起點。因此 AI 會產生「把釋義改寫成
一個畫面」的句子，例如：

- `damp`：`Picture a towel that is cool and slightly wet but not dripping—that towel is damp.`
- `mingle`：`Picture two colored streams flowing together until their waters mix: they mingle.`

這些句子能示範目標語義，卻沒有說明為什麼看到 `damp` 或 `mingle` 時能想起
該語義；同一場景也可以套用到多個近義詞，所以不是有辨識度的記憶鉤子。

## 2. Fix Objective

記憶提示的首要任務是幫助學習者把目標詞的**正確寫法按順序拼回來**，其次才是
連結目標語義。提示必須建立「**拼寫鉤子 → 可重播的字詞／短句／畫面 → 目標語義**」
的回想橋梁。

方法不設限：可以使用其他簡單字詞、片語、句子、押韻或諧音、共用字母、拆字、
字母替換、詞素／漢字結構、頭字句、節奏、小故事、誇張或天馬行空的畫面，也可以
使用未列出的其他方法。這些都只是靈感而不是白名單；AI 應自由選擇對當前目標最好記、
最容易回想拼寫的做法，不得機械套用任一種模板。可以使用一到數個短句，不限定為
單一形象化句子。

## 3. Acceptance Criteria

- **Scenario 1：正確拼寫必須是主要回想目標**

  - **Given** AI 為新學習項目產生 `memoryTip`
  - **When** 檢查記憶提示的聯想鏈
  - **Then** 提示必須使用可讓學習者按順序重建拼寫的鉤子
  - **And** 鉤子必須再透過字詞、短句或畫面連回目標語義

- **Scenario 2：聯想方法不受限制**

  - **Given** 一個目標詞可與其他簡單字詞、片語或句子建立聯想
  - **When** AI 選擇最容易重建拼寫的方法
  - **Then** AI 可使用任何能改善記憶與拼寫回想的方法，列出的聯想類型不是白名單
  - **And** 不得固定使用諧音、畫面或任何單一模板

- **Scenario 3：拒絕釋義場景化**

  - **Given** 一個只把意思改寫成 `Picture/Imagine ...: that is <target>` 的句子
  - **When** 移除目標詞後，剩餘場景仍然只是完整釋義或一般例句
  - **Then** AI 不得把它當作完成的記憶提示
  - **And** AI 必須改寫為有目標詞觸發點的聯想

- **Scenario 4：聯想必須有辨識度且真實**

  - **Given** 候選聯想可同時套用到多個近義詞，或依賴虛構詞源／牽強讀音
  - **When** AI 進行交付前自檢
  - **Then** AI 必須改用更具詞形辨識度的聯想，且不得暗示字形技巧是真實詞源

- **Scenario 5：透明的好壞範例**

  - **Given** skill 指示 AI 如何寫記憶提示
  - **When** AI 讀取契約
  - **Then** skill 明確標示 `damp` 與 `mingle` 的現有句子為失敗範例
  - **And** skill 提供 `grim` 與 `dim` 押韻、以及 `damp` / `mingle` 拼寫口訣的改寫範例

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | spelling-first 契約 | bundled creation skill | 讀取 Memory Tip Contract | 要求優先重建正確拼寫 | Critical |
| TC2 | 聯想方法契約 | 任一目標詞 | 讀取契約 | 方法不設限且不機械套用單一模板 | Critical |
| TC3 | 移除測試 | 只是畫面化釋義的候選 | 執行交付前自檢 | 明確拒絕並改寫 | Critical |
| TC4 | 辨識度與準確性 | 可套用多個近義詞或虛構聯想 | 執行自檢 | 改用特定且真實的鉤子 | High |
| TC5 | `grim` / `damp` / `mingle` 回歸範例 | 新舊提示 | 比較 skill 內範例 | 好範例可重建拼寫，畫面化釋義被禁止 | High |
| TC6 | bundled skill 交付 | App 啟動並安裝 skill | 讀取 runtime skill | 新契約一併安裝 | High |

## 5. Implementation Notes

- 修正點限於 `.agents/skills/create-learning-items/SKILL.md` 的內容契約與對應文件；
  `memoryTip` 仍為非空字串，不修改 artifact schema、SQLite schema 或 UI。
- App 現有 bundled skill 安裝機制會以內嵌 Markdown 取代舊 runtime skill，不需要額外 migration。
- 品質為語義契約，App 不嘗試以關鍵字機械判斷每一個 AI 產出的聯想是否優良；
  自動測試固定要求、反例、正例與 runtime 安裝邊界。

## 6. Affected Files and Boundaries

- `.agents/skills/create-learning-items/SKILL.md`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B36-require-retrieval-hooks-in-memory-tips.md`

## 7. Assumptions and Non-goals

- 使用者目前要改善的是新建草稿的 AI 產出品質，不是自動重寫已存在的低品質提示。
- 不為了製造形式聯想而捏造詞源，也不要求每個詞都強行拆字。
- 不改變 Memory tip 的顏色、版面、編輯、儲存或複習曝露邊界。

## 8. Implementation Record

### Status

Implemented and verified on 2026-09-01.

### Implementation Summary

- 將 Memory Tip 的首要目標由「畫面化目標語義」改為「幫助學習者按順序重建
  正確拼寫或字形，再連回目標語義」。
- 聯想方法不設白名單；其他字詞、片語、短句、押韻／諧音、字形關係、詞素、
  頭字句、節奏、故事、幽默與天馬行空的畫面都只是可選靈感，AI 可使用任何更有效且
  準確的方法，不機械套用單一模板。
- skill 要求交付前執行拼寫回想、移除目標詞、辨識度與準確性四項檢查；
  單純把釋義改寫為 `Picture/Imagine ...` 場景的提示必須改寫。
- 新增 `damp` / `mingle` 失敗範例，並以 `grim` / `dim`、`DAM + P`、
  `SINGLE → MINGLE` 展示三種可行但非必用的拼寫聯想。
- 保留既有 `memoryTip` artifact、儲存、編輯與 UI 契約；App 啟動時現有 bundled
  skill 安裝機制會自動取代舊 runtime 內容。

### Test Coverage

| Test scenario | Automated basis | Result |
|---|---|---|
| TC1 | `chat-controller.test.ts` 要求 exact written form 為首要目標 | Passed |
| TC2 | 同測試固定方法清單不是白名單，且不強制單一模板 | Passed |
| TC3 | 同測試固定 removal check 與兩個釋義場景反例 | Passed |
| TC4 | skill contract 固定 distinctiveness / accuracy 自檢與禁止虛構關係 | Passed |
| TC5 | 同測試固定 `grim` / `damp` / `mingle` 的拼寫鉤子 | Passed |
| TC6 | `desktop.spec.ts` 從 Electron user-data runtime 讀回已安裝 skill | Passed |

### Changed Files

#### Production behavior

- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/learning-library.md`
- `documents/implements/B36-require-retrieval-hooks-in-memory-tips.md`
- `documents/ddd-email-notify.md` (completion-notification ledger only)

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 正確拼寫為主要回想目標 | Pass | TC1 契約測試 |
| 聯想方法不受限制 | Pass | TC2 契約測試 |
| 拒絕釋義場景化 | Pass | TC3 反例與 removal check |
| 聯想具辨識度且真實 | Pass | TC4 交付前自檢契約 |
| 具有透明的好壞範例 | Pass | TC5 三組正例與兩組反例 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `prioritizes memorable spelling recall without restricting the mnemonic method` |
| TC2 | Pass | 同上；`inspiration, not an allowed-method list` |
| TC3 | Pass | 同上；definition-scene 反例與 removal check |
| TC4 | Pass | Memory Tip Contract 四項交付前自檢 |
| TC5 | Pass | 同上；`GRIM/DIM`、`DAM + P`、`SINGLE/MINGLE` |
| TC6 | Pass | `launches the secure Electron reading shell` runtime skill assertion |

### Commands Executed

```bash
# Red: 1 expected failure, 73 passed
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts

# Target green: 74/74 passed
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts

# Full desktop unit: 60 files, 581/581 passed
npm test -w @reader/desktop

# TypeScript: passed
npm run typecheck -w @reader/desktop

# Production build + Electron E2E: 5/5 passed
npm run test:e2e -w @reader/desktop
```

### Hypotheses and Decisions

- 根因不在 UI 或 `memoryTip` 儲存邊界，而是 bundled creation skill 把心智場景設為
  第一優先，卻沒有要求場景提供拼寫回想路徑。
- 不在 App parser 增加語義關鍵字判斷；一個好記憶法可能故意奇特、跨語言或不符合
  預設分類，機械白名單會拒絕有效結果。
- 第一次 green 執行的唯一失敗來自 Markdown 換行造成的過度精確字串斷言；調整為
  容忍排版換行的 regex 後，行為契約與其餘 73 個測試同時通過。

### Deferred Items

- 不自動重寫已存在學習項目的舊 Memory tip。
- 本次未建立新版本、installer、Git commit 或 GitHub Release；等使用者後續明確要求。

### Notes

- Production build 只有既有的 500 kB chunk size warning，本次無新警告或失敗。
- 實作沒有暴露過度耦合、缺少測試 seam 或責任邊界不清等需要另開 RXX 的架構問題。
