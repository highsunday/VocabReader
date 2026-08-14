---
author: Codex
date: 2026-08-11
title: 選擇漸進跟讀模式的短片段長度
uuid: 21f1313a-4ba5-47ba-8bbc-42726b511273
version: 1.1.0
status: implemented
---

# Feature Specification - Progressive Short-chunk Length Preference

## 1. Feature Overview

目前**漸進跟讀模式**只提供一種偏短的切分方式，適合工作記憶負擔較高或正在熟悉新聲音的
使用者，但已能保留較長語音的使用者仍可能希望在保有「短片段 → 長片段」階層的前提下，
減少短片段數量並練習較完整的節奏。

本功能新增**短片段長度偏好**。使用者選擇 Progressive 後，可透過具有三個吸附位置的
拉桿選擇 `Short`、`Medium` 或 `Long`；目前行為成為預設且建議的 `Short`，另外兩檔依序
要求 AI 選擇較長的自然短片段。偏好是自然斷句的軟性目標，不是精確秒數切割，也不改變
長片段、Advanced、原文忠實度、錄音解鎖或完整朗讀母帶的既有規則。

## 2. Requirements (User Story)

- **As a** 使用漸進跟讀模式練習任意語言素材的學習者
- **I want** 用簡潔而美觀的拉桿選擇短片段的相對長度
- **So that** 我能依目前工作記憶與跟讀能力，在相同的漸進流程中練習更短或更完整的語意群

## 3. Confirmed Product Rules

### 3.1 三檔短片段長度偏好

- 提供三個離散且會吸附的檔位，不提供任意連續秒數：
  - `Short`：沿用目前約 0.75–1.5 秒的短片段目標，標示 `Recommended`。
  - `Medium`：約 1.5–2.5 秒。
  - `Long`：約 2.5–4 秒。
- 初次使用及讀取未保存此欄位的舊資料時一律使用 `Short`，確保既有行為相容。
- 秒數只描述相對密度；AI 仍優先選擇自然語意、韻律、呼吸與停頓邊界，不得切斷緊密
  詞組、隔離功能詞或產生只有標點／空白的片段。
- 三檔只影響 Progressive 的短片段；長片段仍以約 5–10 秒為目標。

### 3.2 拉桿互動與顯示

- 只有選擇 Progressive 時，模式卡片下方才顯示獨立的 `Phrase length` 控制區。
- 控制區使用原生 range 語意的三段拉桿，具有清楚的軌道、已選進度、滑塊、三個定位點，
  並在下方顯示 `Short`、`Medium`、`Long` 標籤。
- 目前檔位同時以文字顯示名稱與約略秒數，不能只靠滑塊位置或顏色表達。
- 拉桿支援滑鼠、觸控及鍵盤操作；其 accessible name 必須清楚描述為 Progressive phrase
  length，並透過目前值文字讀出檔位。
- 切換至 Advanced 時隱藏控制區但保留目前選擇；同一份草稿切回 Progressive 時恢復。
- AI 處理進行中，拉桿與素材、模式一起鎖定。

### 3.3 傳遞、保存與重新處理

- Renderer、Preload、IPC 與 Main Process 以 allowlist 驗證 `short`、`medium`、`long`，不得
  接受任意字串或秒數。
- 草稿及處理成功的目前練習保存短片段長度偏好，跨 workspace 與 App restart 恢復。
- Progressive 的隔離 AI payload 明確包含已選偏好；App-bundled skill 依檔位使用對應指引。
- Advanced 不把短片段長度偏好當成切分條件，仍只產生 long boundaries。
- 改變偏好不修改已產生的跟讀片段；只有使用者按 `Create practice with AI` 重新處理後，
  新偏好才產生新的片段結構，並沿用既有錄音取代確認與原子安裝規則。

## 4. Acceptance Criteria

- **Scenario 1：Progressive 顯示三段拉桿並預設 Short**
  - **Given** 使用者開啟尚未處理的跟讀素材且選擇 Progressive
  - **When** 素材表單顯示
  - **Then** 顯示三段 Phrase length 拉桿，`Short` 為目前值且標示 Recommended
  - **And** 文字顯示約 0.75–1.5 秒

- **Scenario 2：選擇較長檔位並交給 AI**
  - **Given** Progressive 與合法素材已選定
  - **When** 使用者把拉桿移至 Medium 或 Long 並建立練習
  - **Then** process request 與隔離 AI payload 帶入對應 allowlisted 偏好
  - **And** skill 對 Medium 使用約 1.5–2.5 秒、對 Long 使用約 2.5–4 秒的短片段指引

- **Scenario 3：Advanced 隱藏且忽略短片段偏好**
  - **Given** 使用者已把 Progressive 拉桿設為 Long
  - **When** 切換至 Advanced
  - **Then** Phrase length 控制區隱藏，Advanced 仍只要求長片段
  - **When** 同一草稿切回 Progressive
  - **Then** 拉桿恢復 Long

- **Scenario 4：草稿、目前練習與舊資料相容**
  - **Given** 使用者保存 Medium 草稿或以 Long 建立目前練習
  - **When** 切換 workspace 或重新啟動 App
  - **Then** 素材表單恢復相同偏好
  - **Given** `current.json` 沒有短片段長度偏好
  - **When** App 載入舊資料
  - **Then** 對外 snapshot 與後續重新處理一律視為 Short，原有素材、片段與錄音仍可用

- **Scenario 5：處理鎖定與無障礙操作**
  - **Given** Progressive AI 處理尚未完成
  - **When** 使用者檢查或操作 Phrase length
  - **Then** 拉桿停用且不能改變已送出的偏好
  - **And** 螢幕閱讀器可從 slider name、value text 與可見文字辨識目前檔位

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 預設拉桿 | 空白 Progressive 草稿 | 開啟素材表單 | slider=`Short`、Recommended 與 0.75–1.5 秒可見 | Critical |
| TC2 | 選擇 Medium | 合法 Progressive 素材 | slider 移至 Medium 並送出 | saveDraft/process 均收到 `medium` | Critical |
| TC3 | Long AI 指引 | Progressive + `long` | Main 建立隔離 turn | payload 含 `long`；skill 定義 2.5–4 秒 | Critical |
| TC4 | Advanced 隱藏 | 已選 `long` | 切 Advanced 再切回 | Advanced 時無 slider；切回仍為 `long` | High |
| TC5 | IPC 拒絕非法值 | raw request 含任意長度字串 | 呼叫 draft/process | 邊界同步拒絕且不執行 controller | Critical |
| TC6 | 持久化 | Medium 草稿／Long ready practice | 建立新 store instance | snapshot 保留原檔位 | Critical |
| TC7 | 舊 metadata | `current.json` 無新欄位 | store 載入 | 公開值為 `short`，原資料不遺失 | Critical |
| TC8 | 處理鎖定 | process promise 未完成 | 嘗試操作 slider | slider disabled，request 值保持送出時檔位 | High |
| TC9 | 既有切分回歸 | Short／Medium／Long 結果 | parser 驗證 | 原文與 parent reconstruction 規則不變 | Critical |

## 6. Impact Scope

- `CONTEXT.md`：新增短片段長度偏好的領域定義。
- `apps/desktop/src/shared/listen-repeat-contracts.ts`：偏好型別、驗證與 draft/process/snapshot 契約。
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`、`styles.css`：三段拉桿與狀態傳遞。
- `apps/desktop/src/preload/preload.ts`、`apps/desktop/src/main/listen-repeat-ipc.ts`：窄型 IPC 邊界。
- `apps/desktop/src/main/listen-repeat-controller.ts`：偏好驗證與隔離 AI payload。
- `apps/desktop/src/main/listen-repeat-store.ts`：偏好持久化與舊 metadata 預設。
- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`：三檔自然切分指引。
- 相關 Controller、Store、IPC、Skill 與 Renderer 測試。
- `documents/modules/listen-and-repeat-practice.md`：同步目前行為、state flow 與測試覆蓋。

## 7. Non-goals and Assumptions

- 不讓使用者輸入精確秒數、固定字數或手動片段邊界。
- 不改變 Advanced、長片段目標、片段階層、錄音解鎖、TTS／alignment 或完成判定。
- 不保證生成片段的實際音訊秒數；在首次 TTS 前只能以語言與自然結構推估。
- 不將此偏好加入全域 Settings；它屬於目前跟讀練習／草稿。

## 8. Implementation Record

### Status

Implemented（2026-08-11）。

### Implementation summary

- Progressive 素材表單新增原生 range 語意的三段吸附拉桿，顯示 Short／Medium／Long、
  目前約略秒數、Recommended、已選軌道、定位點、hover／focus 與 disabled 狀態。
- Renderer 在草稿 debounce 與 process request 傳遞 allowlisted preference；Advanced 隱藏控制
  但保留 state，Controller 只在 Progressive 的隔離 AI payload 放入該偏好。
- App-bundled segmentation skill 對三檔使用 0.75–1.5、1.5–2.5、2.5–4 秒軟性指引，並保留
  自然語意、韻律、呼吸與停頓邊界優先規則。
- Store 在 draft 與 ready metadata 保存偏好；舊 `current.json` 缺少欄位時公開為 `short`，
  不改動既有片段或錄音。
- Preload、IPC 與 Controller 都限制值為 `short | medium | long`；任意秒數或字串同步拒絕。
- Electron 實際畫面檢查後調整定位點層級：未選定位點顯示在軌道上，目前定位點隱藏於滑塊
  下方，避免滑塊中央出現多餘視覺雜點。

### Test coverage

- `ListenRepeatWorkspace.test.tsx`：TC1、TC2、TC4、TC8；預設／文字語意、三檔切換、Advanced
  隱藏與恢復、process request、處理中鎖定。
- `listen-repeat-controller.test.ts`：TC3、TC5；Progressive payload、Advanced omission、非法值。
- `listen-repeat-store.test.ts`：TC6、TC7；draft／ready restart 與 legacy default。
- `listen-repeat-ipc.test.ts`、`listen-repeat-contracts.test.ts`：TC5；allowlist 與窄型 request。
- `listen-repeat-skill.test.ts`：TC3；三檔時間指引及既有自然斷句護欄。
- `listen-repeat-artifacts.test.ts`：TC9；沿用既有 exact reconstruction 與 malformed boundary
  regression coverage。
- `desktop.spec.ts`：真實 Electron shell 中 slider 可見、預設值及 `aria-valuetext`。

### Changed files

#### Production code

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `apps/desktop/src/shared/listen-repeat-contracts.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/main/listen-repeat-controller.ts`
- `apps/desktop/src/main/listen-repeat-ipc.ts`
- `apps/desktop/src/main/listen-repeat-store.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test code

- `apps/desktop/src/main/listen-repeat-contracts.test.ts`
- `apps/desktop/src/main/listen-repeat-controller.test.ts`
- `apps/desktop/src/main/listen-repeat-ipc.test.ts`
- `apps/desktop/src/main/listen-repeat-skill.test.ts`
- `apps/desktop/src/main/listen-repeat-store.test.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `apps/desktop/src/renderer/listen-repeat-flow.test.ts`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documents

- `CONTEXT.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/implements/F60-select-progressive-short-chunk-length.md`

### Acceptance criteria verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| AC1 Progressive 預設三段拉桿 | Pass | Renderer 預設 slider 測試及 Electron E2E |
| AC2 Medium／Long 傳入 AI | Pass | Renderer request、Controller payload、Skill contract 測試 |
| AC3 Advanced 隱藏且忽略偏好 | Pass | Renderer mode round-trip；Controller Advanced payload omission |
| AC4 持久化與舊資料相容 | Pass | Store restart 與 legacy metadata 測試 |
| AC5 處理鎖定與無障礙 | Pass | Renderer processing disabled、role/name/value text；Electron E2E |

### Test scenario verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `shows the recommended Short phrase-length slider...` |
| TC2 | Pass | `sends a selected Medium phrase length...` |
| TC3 | Pass | Controller selected payload + bundled skill ranges |
| TC4 | Pass | Renderer Advanced hide／Progressive restore |
| TC5 | Pass | Contracts、IPC、Controller invalid allowlist tests |
| TC6 | Pass | Store ready／draft restart tests |
| TC7 | Pass | Store legacy metadata defaults to Short |
| TC8 | Pass | Renderer deferred process disables slider |
| TC9 | Pass | Existing artifact reconstruction suite; full Desktop regression |

### Commands executed

```bash
# Expected Red (first command used the wrong workspace-relative filter; see decisions)
npm test -w @reader/desktop -- src/renderer/ListenRepeatWorkspace.test.tsx

# Target Green
npm test -w @reader/desktop -- src/renderer/ListenRepeatWorkspace.test.tsx \
  ../main/listen-repeat-contracts.test.ts \
  ../main/listen-repeat-controller.test.ts \
  ../main/listen-repeat-store.test.ts \
  ../main/listen-repeat-ipc.test.ts \
  ../main/listen-repeat-skill.test.ts

# Full verification
npm test -w @reader/desktop
npm run typecheck
npm run build
npx playwright test
```

Results: target 31/31 passed；Desktop 52 files／502 tests passed；root server + Desktop
typecheck passed；root production build passed（只有既有 renderer chunk-size advisory）；Electron
Playwright 3/3 passed。

### Hypotheses and decisions

- 第一次 Red 指令錯把 repo-relative path 傳給已切換到 `apps/desktop` 的 workspace script，
  Vitest 因此回報 no test files。驗證假說後改用 `src/renderer/...`，測試如預期因找不到 slider
  失敗；根因是 filter path，不是環境或測試內容。
- request 型別允許缺少新欄位以相容舊 Renderer／直接 Controller 呼叫，但所有新 UI request
  都明確傳值；Main 缺值時統一正規化為 `short`，非法非空值仍拒絕。
- Advanced 的 App request 可攜帶隱藏偏好以便保留狀態，但 Controller 不把它放入 Advanced
  AI payload，也不產生 short boundaries。
- AI 尚未產生音訊時無法量得實際秒數，因此三檔是可測試的 allowlisted intent 與 prompt
  contract，不對模型結果施加不可靠的硬秒數驗證。

### Deferred items

None。

### Notes

- 既有 Vite renderer chunk-size advisory 與本功能無關，本次沒有擴張套件依賴或架構邊界。
- 實作未發現需要另開 RXX 的模組耦合或責任邊界問題。

## Appendix: TDD Implementation Checklist

1. 先新增契約、Controller、Store、IPC、Skill 與 Renderer 的失敗測試。
2. 實作最小 allowlisted end-to-end data path 與三段拉桿。
3. 執行相關 Vitest、Desktop typecheck 與 production build。
4. 將本文件狀態改為 `implemented`，更新 Implementation Record 與模組文件。
