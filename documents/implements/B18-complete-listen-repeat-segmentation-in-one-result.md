---
author: Codex
date: 2026-08-10
title: 以單次精簡結果完成跟讀素材斷句
uuid: 3f60e3de-b301-4099-a9a0-bb387777aef9
version: 1.2.0
status: implemented
---

# Bug Fix: 以單次精簡結果完成跟讀素材斷句

## 1. Bug Overview

逐句跟讀練習目前把整份跟讀素材送入一個隔離 Codex turn，但要求 AI 在結果 JSON 中
逐字重複全部素材。實機處理一份 541 字元素材時，Codex 以預設
`gpt-5.6-sol`、`high` reasoning 執行，先後產生五個中途截斷的結果，第六個結果才完整，
總耗時 82.299 秒。使用者看到的是一次「Create practice with AI」，AI 執行層實際卻為了
輸出完整原文反覆產生結果。

本機 artifact 驗證只需 0–2 ms，含 mocked AI 回覆、驗證與落盤的 controller 測試約
16 ms；等待主要來自重型預設模型、完整代理上下文及重複輸出素材，而不是斷句或存檔。

## 2. Root Cause

- `ListenRepeatController` 沒有指定延遲敏感工作使用的快速模型與 low reasoning，完全繼承
  Codex AI 執行層預設值。
- artifact 要求每個跟讀片段包含完整原文 slice；回覆長度至少等於整份素材，且內容可能
  觸發輸出截斷，使同一 turn 產生多個不完整 agent message。
- Controller 等到 `turn/completed` 才採用最後一筆 agent message，即使較早已收到一筆可用
  結構化結果也不能完成。
- `turn/start` 未使用 app-server 的 `outputSchema`，只能靠 fenced JSON 與提示詞約束格式。

### 2026-08-10 boundary regression

- version 2 把 `materialUnits` 傳成沒有顯式編號的字串陣列，卻要求模型回傳 1-based
  unit count；模型必須自行計數陣列位置。
- 實際 Progressive trace 共有 202 units，Luna 與 Terra 兩次都把全文終點誤算為
  200；第二次還在 200 後追加了倒序的 10，因此本機安全驗證拒絕結果。
- 全文終點是可由 Main Process 得知的恒定條件，不應要求 AI 重複計算與回傳。

## 3. Fix Objective

- 一次把完整跟讀素材送入一個 Codex turn，由 AI 一次回傳完整斷句結果。
- prompt 將素材拆成依原順序排列、可無損重組的 numbered units；AI 只回傳每個長／短
  跟讀片段的內部斷點 unit 編號，不回抄素材文字。
- 每個 unit 在 payload 中顯式攜帶 1-based ID；AI 從已提供的 ID 選擇斷點，
  不自行計數位置。
- AI 只回傳內部長／短斷點；Main Process 固定以 unit count 補上全文及每個
  長片段的最終邊界。
- Main Process 依邊界編號從原始素材切出跟讀片段，繼續執行兩層 exact reconstruction。
- 使用 `outputSchema` 約束單一 JSON 結果，收到第一筆完整 agent message 後即可結束等待。
- 優先使用可用的快速模型與 low reasoning；快速模型不可用時安全沿用 Codex 預設值。

## 4. Acceptance Criteria

- **Scenario 1：完整素材一次送入、一次回傳結果**
  - **Given** 使用者提交一份合法跟讀素材與跟讀練習模式
  - **When** App 建立斷句工作
  - **Then** 只建立一個 `turn/start`
  - **And** 該 turn 的單一 payload 包含可完整重組原文的所有 numbered units
  - **And** 收到第一筆符合 schema 的 agent message 後完成處理，不等待第二份結果

- **Scenario 2：AI 結果不重複輸出素材**
  - **Given** 跟讀素材可能包含長篇或受版權保護的原文
  - **When** AI 回傳斷句結果
  - **Then** 結果只包含 version、practice ID、mode 與數字邊界
  - **And** 結果不包含任何跟讀片段文字

- **Scenario 3：本機從邊界無損建立片段**
  - **Given** AI 回傳合法且嚴格遞增的長片段邊界
  - **When** Main Process 解析結果
  - **Then** 所有長跟讀片段依序重組後逐 code unit 等於原始跟讀素材
  - **And** 漸進跟讀模式的每組短片段也逐 code unit 重組為所屬長片段

- **Scenario 4：拒絕無效邊界且保留既有練習**
  - **Given** AI 回傳越界、重複、倒序、包含已知最終邊界或模式不符的結果
  - **When** Main Process 解析結果
  - **Then** 整份結果被拒絕
  - **And** 既有目前跟讀練習與跟讀錄音不被取代

- **Scenario 5：使用快速低推理模型**
  - **Given** model catalog 提供支援 low reasoning 的 `gpt-5.6-luna` 或
    `gpt-5.6-terra`
  - **When** App 建立斷句 thread／turn
  - **Then** 固定依 Luna、Terra 優先序選擇模型並使用 low reasoning
  - **And** catalog 失敗或沒有候選時仍可沿用 Codex 預設模型完成工作

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 單次 turn 與首份結果完成 | 合法素材、fake app-server | controller process | 一個 `turn/start`，第一筆 agent message 即完成 | Critical |
| TC2 | 邊界型 structured output | 包含多段原文的素材 | 建立 turn | `outputSchema` 只允許數字邊界，response 不含原文 | Critical |
| TC3 | Advanced 無損切分 | 合法遞增 long ends | parse | 長片段完整重組原文 | Critical |
| TC4 | Progressive 無損切分 | 每組合法 short ends | parse | 短片段重組 parent，long 重組素材 | Critical |
| TC5 | 無效邊界矩陣 | 越界、重複、倒序、缺末端、跨 parent | parse/process | 拒絕且不取代目前練習 | Critical |
| TC6 | Luna low 優先 | Luna、Terra 都支援 low | process | thread/turn 使用 Luna low | High |
| TC7 | Terra／default fallback | Luna 不可用或 catalog 失敗 | process | 使用 Terra low 或省略 model/effort | High |
| TC8 | 任意語言與特殊字元 | emoji、組合字、CJK、換行與空白 | unitize + parse | 逐 code unit 完整保留 | High |
| TC9 | 本機補上已知終點 | 202 units、AI 最後內部斷點為 200 | parse | 自動以 202 完成最後片段並 exact reconstruction | Critical |
| TC10 | 顯式 unit ID | 任意跟讀素材 | 建立 turn | payload 以 `[id, exactText]` 傳入連續 1-based ID | Critical |

## 6. Implementation Notes

- numbered units 由 Main Process 使用 `Intl.Segmenter` 的 word granularity 建立；每個 unit
  保存 exact source slice，所有 units 直接串接必須等於原始素材。AI 只看到一次 units
  payload，不取得檔案、工具或其他上下文。
- version 3 Advanced result 使用 ordered `longBreakEnds`；Progressive 另含
  `shortBreakEnds`。兩者都只包含全文的 1-based inclusive 內部斷點，不包含
  unit count 代表的已知最終邊界。
- parser 要求內部斷點嚴格遞增且小於 unit count，並由本機將 unit count
  附加到長邊界；Progressive 再依每個長片段分組全域 short breaks，並本機附加
  parent end。
- `outputSchema` 依 mode 產生，Advanced 不接受 short ends，Progressive 必須提供。
- model catalog 策略沿用 B10：Luna low → Terra low → Codex default；模型選擇只屬於
  Listen Repeat，不改變 AI 對話面板的模型。
- 收到第一個 `item/completed` agent message 後 resolve；若 turn 在結果前失敗仍回傳現有安全
  錯誤。完成後關閉本次 client，避免同一 UI 操作繼續產生後續結果。

## 7. Affected Modules and Files

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `apps/desktop/src/main/listen-repeat-artifacts.ts`
- `apps/desktop/src/main/listen-repeat-artifacts.test.ts`
- `apps/desktop/src/main/listen-repeat-controller.ts`
- `apps/desktop/src/main/listen-repeat-controller.test.ts`
- `apps/desktop/src/main/listen-repeat-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/implements/F58-listen-and-repeat-practice.md`
- `documents/implements/B18-complete-listen-repeat-segmentation-in-one-result.md`

## 8. Assumptions and Non-goals

### Assumptions

- App-server 支援 `turn/start.outputSchema`；目前本機 Codex protocol 已提供此欄位。
- numbered units 是內部傳輸格式，不改變使用者看到的跟讀素材或跟讀片段。
- 實際耗時仍受模型服務狀態影響；本修正以單一 turn、單一精簡結果及快速模型 routing
  作為可自動驗證的效能條件，不承諾固定秒數。

### Non-goals

- 不改變 2,000 grapheme 上限、Progressive／Advanced 產品語意或片段時間 heuristic。
- 不新增手動斷句、片段編輯、斷句歷史或 UI 模型選擇器。
- 不改變目前跟讀練習、跟讀錄音、AI 示範語音、Continuous mode 或 Data Backup 邊界。
- 不重用一般 AI 對話的 thread 或模型選擇狀態。

## 9. Implementation Record

### Status

Implemented on 2026-08-10.

### Implementation Summary

- `Intl.Segmenter` 將完整跟讀素材一次轉為 exact ordered `materialUnits`；prompt 不再另外
  傳送 `material`，並以 `[id, exactText]` 為每個 unit 提供顯式 1-based ID。
- artifact 升級為 version 3 boundary-only JSON。Advanced 只回內部 `longBreakEnds`，
  Progressive 再回全域內部 `shortBreakEnds`；Main Process 本機補上 unit count 與
  parent end，再只從 canonical units 建立 chunk text。
- `turn/start.outputSchema` 限制唯一結構化結果，Controller 收到第一筆 completed agent
  message 後立即完成並關閉一次性 client，不再等待同一 turn 的後續結果。
- 模型 routing 固定 Luna low → Terra low → Codex default；catalog 失敗不阻擋斷句。
- bundled skill、module document、F58 implementation record 與 Electron skill-install assertion
  已同步為 numbered-unit contract。

### Test Coverage

- TC1／TC2：controller fake app-server 驗證單一 `turn/start`、`outputSchema`、素材只存在
  `materialUnits`、第一份 agent message 早於延遲的 `turn/completed` 完成。
- TC3／TC4：artifact tests 驗證 Advanced／Progressive 從數字邊界本機重建 exact chunks。
- TC5：artifact invalid matrix 與 controller preservation test 覆蓋越界、重複、倒序、
  包含已知最終邊界、額外 source-text 欄位與 scope mismatch。
- TC6／TC7：controller tests 覆蓋 Luna 優先、Terra fallback 與 catalog failure default。
- TC8：combining mark、family emoji、CJK、換行與標點 exact reconstruction test。
- TC9：202-unit regression 驗證 AI 最後只回內部斷點 200 時，Main 以 202 補上
  終點並完成長、短兩層 exact reconstruction。
- TC10：controller prompt test 驗證 `materialUnits` 是從 1 開始連續的 `[id, exactText]`。

### Changed Files

#### Production Code

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `apps/desktop/src/main/listen-repeat-artifacts.ts`
- `apps/desktop/src/main/listen-repeat-controller.ts`

#### Test Code

- `apps/desktop/src/main/listen-repeat-artifacts.test.ts`
- `apps/desktop/src/main/listen-repeat-controller.test.ts`
- `apps/desktop/src/main/listen-repeat-skill.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `documents/modules/listen-and-repeat-practice.md`
- `documents/implements/F58-listen-and-repeat-practice.md`
- `documents/implements/B18-complete-listen-repeat-segmentation-in-one-result.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 完整素材一次送入、一次回傳結果 | Pass | controller single-turn／first-message test；真實 trace 只有一筆 agent message |
| AI 結果不重複輸出素材 | Pass | v3 schema 只允許 numeric interior breaks；額外 `text` 欄位拒絕測試 |
| 本機從邊界無損建立片段 | Pass | Advanced、Progressive、Unicode artifact tests |
| 無效邊界保留既有練習 | Pass | invalid matrix 與 controller preservation test |
| 使用快速低推理模型 | Pass | Luna、Terra、default routing tests；真實 trace 為 Luna low |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `finishes from one compact structured result on a fast isolated Codex turn` |
| TC2 | Pass | 同一 controller test 的 `outputSchema` 與 materialUnits assertions |
| TC3 | Pass | `builds Advanced chunks locally from ordered unit boundaries` |
| TC4 | Pass | `builds Progressive children locally from parent-scoped unit boundaries` |
| TC5 | Pass | artifact invalid-boundary matrix、scope/source-field test、controller preserve test |
| TC6 | Pass | Luna priority assertions |
| TC7 | Pass | parameterized Terra low／catalog failure test |
| TC8 | Pass | arbitrary-language code-unit preservation test |
| TC9 | Pass | `adds the canonical final boundary locally when AI only returns interior breaks` |
| TC10 | Pass | controller explicit `[id, exactText]` payload assertion |

### Commands Executed

```bash
npm exec vitest -- run src/main/listen-repeat-artifacts.test.ts src/main/listen-repeat-controller.test.ts src/main/listen-repeat-skill.test.ts --reporter=verbose
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop -- --workers=1
node_modules/.bin/tsx .tmp-listen-repeat-benchmark.ts
git diff --check
```

### Test Results

- 回歸紅燈：9 tests 依預期失敗；舊 parser 不支援 v3 interior breaks，舊 prompt 傳入
  沒有 ID 的字串陣列，舊 skill 仍要求 AI 回傳最終邊界。
- 聚焦 Listen Repeat：14/14 passed。
- Root Vitest：server 3/3、Desktop 480/480 passed。
- Root TypeScript typecheck：passed。
- Root production build：passed；只有既有 renderer chunk-size advisory。
- Electron Playwright E2E：3/3 passed。
- `git diff --check`：passed。

### Real Runtime Benchmark

- Fixture：與實機慢速回報相同的 541 字元素材，Advanced mode。
- Before：`gpt-5.6-sol` high、82.299 秒、六筆 agent messages，最後才有完整 v1 text
  artifact。
- After：`gpt-5.6-luna` low、14.721 秒、一筆 206 字元 v2 boundary result、7 個 long
  chunks，exact reconstruction passed。
- 本次結果約減少 82.1% wall time；實際延遲仍受 Codex 服務狀態影響，不視為固定 SLA。

### Version 3 regression replay

- Fixture：觸發實機錯誤的同一份 541 字元、202-unit Progressive 素材。
- 兩次本機 controller 重播分別於 9.332 秒與 9.836 秒完成；兩次的長、短片段
  都 exact reconstruction passed。
- 可觀測 trace 為 `gpt-5.6-luna` low、單一 agent message、version 3 result；回傳的
  最大內部 short break 可為 201，全文終點 202 仍由 Main 本機補上。

### Hypotheses and Decisions

- 已確認斷句與本機寫檔不是瓶頸；主要成本是重型預設模型及回抄完整素材造成的多次不完整
  output。
- 選擇 numbered units 而非要求模型自行計算 UTF-16 offset，避免任意語言、emoji 與組合字
  的 index 不可靠；AI 只需選擇 App 已提供的 unit number。
- 第一筆 structured agent message 已受 output schema 約束，因此可直接完成並關閉 client；
  不再以 `turn/completed` 作為使用者等待邊界。
- model catalog 屬效能能力，不是正確性依賴，因此查詢失敗 fail open 到 Codex default。
- 回歸假說驗證：Progressive 相對編號假說不成立，因為第一筆 trace 的後續
  `shortEnds` 仍是全域遞增；單純重複邊界假說不成立，因為第一筆沒有重複；
  `Intl.Segmenter` 不一致假說不成立，prompt 與本機重播都是 202 units。
- 確認根因是模型對沒有顯式 ID 的陣列自行計數失敗；兩筆 trace 都在
  202 units 時把終點回傳為 200，第二筆另有倒序 10。
- 修正策略是讓 AI 從顯式 ID 選擇內部斷點，並將已知的最終邊界責任
  收回 Main Process；不放寬越界、重複、倒序與 exact reconstruction 驗證。

### Deferred Items

無。

### Notes

- 未新增 UI、IPC、持久化格式或 migration；既有目前跟讀練習與錄音可直接沿用。
- 修正移除了 AI output 必須重複 canonical material 的耦合，沒有發現需要另開 RXX 的新架構
  問題。
