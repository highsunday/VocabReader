---
author: Codex
date: 2026-08-11
title: 縮短中日文與其他語言的跟讀短片段
uuid: cd8d30be-d990-4ea2-94a5-baaa578867c0
version: 1.1.0
status: implemented
---

# Bug Fix: 縮短中日文與其他語言的跟讀短片段

## 1. Bug Overview

漸進跟讀模式的 `Short` 對英文已有 1–4 個 lexical words 的明確護欄，但對中文、
日文與其他不以空白分詞的語言，只有秒數與「完整語意／主詞不分」等軟性提示。AI 因此
容易把完整子句當成最小短片段，導致中、日文 `Short` 明顯長於英文的練習負荷。

## 2. Root Cause

- `prepare-listen-and-repeat-practice` 只為 whitespace-delimited languages 定義可數的
  lexical-word 密度，沒有對其他書寫系統定義等價的朗讀負荷。
- 「不分開主詞與謂語」被寫成接近絕對的規則，對日文 SOV 及可自然停頓的主題結構
  特別容易造成過長片段。
- Prompt 未明確說明「可獨立跟讀」不等於「完整子句」，也未要求超出目標負荷時
  回找更早的可辯識自然邊界。

## 3. Fix Objective

- 以正常朗讀時間與語言自身的 spoken timing units 定義跨語言的相同練習負荷。
- 對空白分詞、漢字為主、日文 mora／文節及其他語言提供可操作的等價 heuristic，
  並保留一個不依賴已知語言名稱的 fallback。
- 讓 `Short` 優先找「最短而可獨立模仿」的韻律／語意群，不要求每個短片段都是完整子句。
- 保留原文、boundary-only artifact、Medium／Long、long chunks 與後續音訊對齊契約。

## 4. Acceptance Criteria

- **Scenario 1：不以完整子句作為 Short 必要條件**
  - **Given** 一個完整子句內含多個可獨立模仿的自然韻律群
  - **When** AI 以 `short` 切分
  - **Then** prompt 要求使用最短可用的群，並允許在有自然停頓時分開主題／主詞

- **Scenario 2：非空白語言有等價短度護欄**
  - **Given** 素材為中文、日文或任一不以空白分詞的語言
  - **When** AI 估計 `short` 的朗讀負荷
  - **Then** prompt 以 syllables、morae、語言自身的 lexical／prosodic units 建立等價指引，
    不以 Unicode 字元或英文單字數作為唯一尺度

- **Scenario 3：超出 Short 目標時回找邊界**
  - **Given** 候選短片段明顯超過 0.75–1.5 秒或等價 spoken-unit 負荷
  - **When** 前方有較弱但可辨識的語法、韻律或呼吸邊界
  - **Then** prompt 要求選擇較早邊界，不因等到強句界或完整子句而合併過長

- **Scenario 4：原有契約不回歸**
  - **Given** 任意語言與任一短片段長度偏好
  - **When** AI 回傳邊界
  - **Then** 只回傳原文內部 unit IDs，不改寫原文，且現有 JSON schema 不變

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Short 不需完整子句 | 含多個自然群的子句 | 檢查 bundled skill | 明訂 independently repeatable need not be a complete clause | Critical |
| TC2 | 跨書寫系統負荷 | whitespace、漢字、mora 與 fallback | 檢查 bundled skill | 各有可操作估算方式 | Critical |
| TC3 | 過長候選回找 | Short 超出目標 | 檢查 bundled skill | 要求回找較早可辨識邊界 | Critical |
| TC4 | 過長合併防護 | 完整子句內有較弱自然邊界 | 檢查 bundled skill | 不得只為完整子句而合併 | High |
| TC5 | 契約回歸 | 既有 skill 與 artifact parser | 執行相關測試 | boundary-only schema 與 exact reconstruction 保持通過 | Critical |

## 6. Implementation Notes

- 只修正 App-bundled segmentation skill 及其 contract test；不新增語言偵測 API、不改變 payload
  或 parser。
- `Short` 以「正常說話速度下的最小可模仿韻律群」為主；word、syllable、mora
  只是無音訊時的估算工具。
- 不對所有語言套用單一字元數上限；未列舉語言使用 syllabic timing units 與
  prosodic boundaries 的 fallback。

## 7. Affected Modules and Files

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `apps/desktop/src/main/listen-repeat-skill.test.ts`
- `documents/modules/listen-and-repeat-practice.md`

## 8. Assumptions and Non-goals

- 秒數仍是 AI 在 TTS 前的估計，本次不對產出結果實施字元數硬拒絕。
- 不變更 `Medium`、`Long` 或 parent long chunk 的產品秒數。
- 不新增中文、日文專用模式；同一套 prompt 必須能處理混合與未來擴充語言。

## 9. Implementation Record

### Status

Implemented on 2026-08-11.

### Implementation Summary

- `Short` 現在明確以正常小心朗讀的時間與發音估算負荷，而不以 Unicode 字元數
  或完整子句作為切分基準。
- whitespace-delimited 語言使用 lexical words／syllables；主要漢字書寫的語言使用
  lexical units／spoken syllables；mora-timed 語言使用文節型韻律群／morae；其他
  或混合語言使用最近的 spoken timing units fallback。
- 超出 `Short` 目標的候選片段必須回找前一個可用的語法、韻律或呼吸邊界；不得
  只為等到完整子句而合併。主題、主詞或其他 constituent 在有真實口語邊界且可獨立
  模仿時可單獨成為 short chunk，但仍不隔離功能詞、助詞、affix 或其他 bound element。
- Medium、Long、parent long chunk、boundary-only JSON schema 與 exact-source reconstruction 維持不變。

### Test Coverage

- TC1／TC2／TC3／TC4：`listen-repeat-skill.test.ts` 檢查非完整子句規則、四類語言負荷
  heuristic、過長回找邊界、禁止為完整子句合併與可獨立主題／主詞規則。
- TC5：`listen-repeat-skill.test.ts`、`listen-repeat-artifacts.test.ts` 與
  `listen-repeat-controller.test.ts` 保留 bundled install、boundary-only output、exact reconstruction
  與隔離 payload 契約。

### Changed Files

#### Production Code

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`

#### Test Code

- `apps/desktop/src/main/listen-repeat-skill.test.ts`

#### Documentation

- `documents/implements/B21-balance-multilingual-listen-repeat-short-chunks.md`
- `documents/modules/listen-and-repeat-practice.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| Short 不以完整子句為必要條件 | Pass | skill contract 的 independently repeatable 與 subject/topic assertions |
| 非空白語言有等價短度護欄 | Pass | Han、mora-timed、generic/mixed fallback assertions |
| 超出 Short 目標時回找邊界 | Pass | backward-boundary 與 complete-clause anti-merge assertions |
| 原有契約不回歸 | Pass | skill、artifact 與 Controller 相關測試 16/16；Desktop full suite 506/506 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `An independently repeatable group does not need to be a complete clause` contract assertion |
| TC2 | Pass | whitespace、Han、mora-timed、other/mixed heuristic contract assertions |
| TC3 | Pass | `search backward for the nearest earlier defensible boundary` assertion |
| TC4 | Pass | complete-clause anti-merge 與 subject/topic short-chunk assertions |
| TC5 | Pass | 3 個相關測試檔 16/16，Desktop full suite 52 files／506 tests |

### Commands Executed

```bash
# Expected Red: 1 failed, 1 passed
npm test -w @reader/desktop -- src/main/listen-repeat-skill.test.ts

# Target Green: 2/2 passed
npm test -w @reader/desktop -- src/main/listen-repeat-skill.test.ts

# Related regression: 3 files, 16/16 passed
npm test -w @reader/desktop -- src/main/listen-repeat-skill.test.ts \
  src/main/listen-repeat-artifacts.test.ts \
  src/main/listen-repeat-controller.test.ts

# Full verification: 52 files, 506/506 passed; typecheck and diff check passed
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
git diff --check

# Root regression: server 3/3 and Desktop 506/506 passed
npm test
```

### Hypotheses and Decisions

- 根因已從現有 prompt 對空白／非空白語言的不對稱護欄確認，不需要改動 parser
  或 Renderer。
- 未對中文或日文加入獨立 mode；列舉漢字與 mora 是為了提供等價估算尺度，最後
  仍有一條以發音與韻律單位為主的任意語言 fallback。
- 原「不分主詞與謂語」是造成中日文過長的關鍵限制；新規則改為只在無真實口語邊界
  或會產生 bound fragment 時不分，保留自然性同時不強迫完整子句。
- 本次未執行 live AI 斷句，避免把非 deterministic 的模型輸出當成自動契約；已以
  prompt contract 與現有 parser／Controller 回歸覆蓋驗證。

### Deferred Items

None.

### Notes

- 未發現新的模組耦合、缺少測試切入點或責任邊界問題，不需要另開 RXX。
- DDD 完成通知未寄送：本次請求沒有明確授權對外傳送實作與測試摘要。

## Appendix: TDD Fix Workflow

1. 先為多語言負荷、不要求完整子句與過長回找規則新增失敗契約測試。
2. 最小修改 bundled skill prompt，使目標測試通過。
3. 執行 skill、artifact reconstruction 與 Controller prompt 相關測試。
4. 更新本文件 Implementation Record 與逐句跟讀練習模組文件。
