---
author: Codex
date: 2026-07-24
title: 讓自然語言請求直接觸發新增學習卡片流程
uuid: 7f0c77b42d154ef0a0b43e09d224d6e3
version: 1.1.0
status: implemented
---

# Feature Specification - 自然語言觸發新增學習卡片

## 1. Feature Overview

右側 **AI 對話面板**目前只有點擊「新增卡片」快捷操作時，才會送出受信任的
`createLearningItems` intent。使用者若直接輸入 `add this card`、`save this as a
flashcard` 或「把這個加入生詞庫」等明確建立請求，訊息仍會被當成一般問答，無法進入
既有的 **AI 輔助建立**流程。

本功能讓提問框送出的明確自然語言建立請求也能啟動相同 workflow。自然語句只負責
表達建立意圖；如果句中沒有受信任的單字或片語目標，AI 必須依既有對話提出一個聚焦的
確認或澄清，並以結構化 targets 延續 exact-title 候選查詢。所有去重、草稿預覽、
排除／恢復及明確提交規則維持不變。

## 2. Requirements (User Story)

- **As a** 正在 AI 對話面板中討論單字或片語的讀者
- **I want** 直接說出「add this card」之類的自然語言請求
- **So that** 我不必先找到並點擊快捷按鈕，也能開始建立學習項目草稿

## 3. Acceptance Criteria

- **Scenario 1：英文自然語言請求啟動建立流程**
  - **Given** AI 對話面板可送出訊息
  - **When** 使用者輸入 `add this card`、`save this as a flashcard` 或同類明確請求
  - **Then** Renderer 以原始顯示文字送出 `createLearningItems` intent
  - **And** 同時使用目前的講解語言設定
  - **And** 不把完整命令句直接當成學習項目標題

- **Scenario 2：中文自然語言請求啟動建立流程**
  - **Given** AI 對話面板可送出訊息
  - **When** 使用者輸入「把這個加入生詞庫」或「幫我做成學習卡片」
  - **Then** 系統啟動與「新增卡片」按鈕相同的 AI 輔助建立流程

- **Scenario 3：代名詞請求先建立受信任 targets**
  - **Given** 使用者以 `this`、`it` 或「這個」指向前文內容
  - **When** 自然語言建立 turn 沒有明確提供受信任 targets
  - **Then** creation skill 依使用者請求與既有對話提出一個聚焦的確認或澄清
  - **And** 回覆附上 `learning-item-request` targets
  - **And** 在 targets 經下一則直接回答確認前，不建立草稿批次或查寫學習項目

- **Scenario 4：自然語言確認延續既有 targets**
  - **Given** 前一個 creation turn 已附上澄清後 targets
  - **When** 使用者以 `add both cards`、`yes` 或「都加」直接回答
  - **Then** 系統沿用澄清後 targets 查詢 exact-title 候選
  - **And** 不把確認句本身當成新的卡片標題

- **Scenario 5：一般問答與否定句不誤觸發**
  - **Given** 使用者輸入一般問題、引用文字或否定建立請求
  - **When** 訊息為 `What does "add this card" mean?`、`I can't add this card`、
    `don't add this card` 或「不要新增這張卡片」
  - **Then** 訊息維持一般 AI 對話
  - **And** 不附上 `createLearningItems` intent

- **Scenario 6：既有安全與提交邊界不變**
  - **Given** 自然語言已啟動 AI 輔助建立
  - **When** AI 產生澄清、重複判斷或草稿
  - **Then** 仍使用最多 50 個 typed targets、有限 exact-title 候選及 turn scope 驗證
  - **And** 只有使用者明確提交草稿清單後才寫入生詞庫

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 英文命令 | ready 的 AI 對話面板 | 送出 `add this card` | 原文搭配 creation intent 與目前講解語言送出，不附整句 target | Critical |
| TC2 | 英文禮貌請求 | ready 的 AI 對話面板 | 送出 `Could you save this as a flashcard?` | 啟動 creation intent | High |
| TC3 | 中文命令 | ready 的 AI 對話面板 | 送出「把這個加入生詞庫」 | 啟動 creation intent | Critical |
| TC4 | 非建立敘述 | ready 的 AI 對話面板 | 送出一般問題、引用或否定句 | 維持一般訊息 | Critical |
| TC5 | 無 target 的 skill input | creation intent 沒有 targets | 組成 Codex input | 要求從請求與前文提出 typed targets，且不得建立 batch | Critical |
| TC6 | 自然語言確認 | 已有 assistant clarification targets | 送出 `add both cards` | 沿用既有 targets 與 sense hint，不覆蓋為空 request | Critical |
| TC7 | 建立流程回歸 | 按鈕、邀請與澄清入口 | 執行既有測試 | typed intent、去重、草稿及提交行為不變 | High |

## 5. Implementation Notes

- 在 Renderer 對提問框文字做小型、可測試的建立意圖辨識，只接受明確動作動詞與
  卡片／生詞庫目的地的組合；避免把單獨出現的 `card`、引用、說明問題或否定句當成
  建立請求。
- 自然語言觸發時保留使用者原始訊息作為對話顯示文字，附上
  `intent: "createLearningItems"` 與目前 `explanationLanguage`，但不嘗試以正則表達式
  從任意句子抽取學習項目標題。
- 無 typed targets 時，`create-learning-items` 只能從當前請求與前文提出
  `learning-item-request`，等待直接回答後再查候選；不得在沒有 exact-title 候選 scope
  的同一 turn 建立可提交 batch。
- `ChatController` 在收到沒有 targets 的 creation intent 時仍應套用既有澄清 continuation，
  讓 `add both cards` 之類的明確確認不會略過上一輪的 structured targets。

## 6. Assumptions, Open Questions and Non-goals

### Assumptions

- 「直接觸發」代表不必點擊快捷按鈕即可進入 AI 輔助建立；它不代表省略語義澄清、
  草稿確認或最後提交。
- 第一版辨識英文與繁體中文的明確建立請求；其他語言仍可使用既有快捷按鈕。
- 含 `this`、`it` 或「這個」的請求允許 AI 使用同一 AI 對話前文辨識候選目標，但
  App 仍以 typed artifact 建立受信任範圍。

### Open Questions

- 無。

### Non-goals

- 不以關鍵字直接從命令句建立或提交正式學習項目。
- 不新增背景式意圖分類 AI turn、外部 NLP 服務或任意生詞庫搜尋。
- 不讓一般問答自動寫入生詞庫，不移除「新增卡片」快捷操作。
- 不改變 sentence 卡片、來源追溯、去重、草稿預覽或明確提交規則。

## 7. Affected Modules and Files

### Modules

- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`

### Expected production files

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/main/chat-controller.ts`
- `.agents/skills/create-learning-items/SKILL.md`

### Expected test files

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/main/chat-controller.test.ts`

## 8. Implementation Record

### Status

Implemented.

### Implementation Summary

- 提問框送出時會辨識明確的英文與繁體中文建立請求，保留使用者原始訊息並附上
  `createLearningItems` intent 與目前講解語言。
- 英文支援 add／create／make／save／turn／convert 搭配 card、flashcard、
  learning library 或 vocabulary list 等明確目的地，也支援 please、can／could you、
  `I want to` 等請求前綴；繁體中文支援新增、加入、建立、製作、做成、存成、轉成搭配
  卡片、學習卡片或生詞庫。
- 引用開頭、what／why／how 等說明問題、can't／cannot 等無法敘述，以及
  don't／不要／別／請勿等否定句維持一般對話。
- 無 trusted targets 的自然語言 creation turn 會要求 skill 依原始請求與前文提出
  `learning-item-request`，不得直接產生 batch；下一則明確 creation 確認即使未附新
  targets，也會沿用上一輪 structured targets 查詢 exact-title 候選。
- 既有快捷操作、解析 invitation、候選 scope、草稿、去重、還原與明確提交流程不變。

### Test Coverage

- TC1–TC4：`App.test.tsx` 的
  `starts learning-card creation from explicit English and Chinese requests`
  覆蓋四種英文／中文建立請求，以及一般問題、無法敘述、英文／中文否定句。
- TC5：`chat-controller.test.ts` 的
  `asks for typed targets when natural-language creation has no trusted target`
  驗證無 targets prompt 必須提出 typed request，且禁止直接產生 result。
- TC6：`chat-controller.test.ts` 的
  `keeps clarified targets when an explicit creation confirmation has no new targets`
  驗證 `add both cards` 沿用 apple／banana 並執行候選查詢。
- TC7：完整桌面 201 項與 server 3 項回歸通過。

### Changed Files

#### Production code

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/main/chat-controller.ts`
- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/main/chat-controller.test.ts`

#### Documents

- `CONTEXT.md`
- `documents/implements/F27-trigger-learning-card-creation-from-natural-language.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/learning-item-creation.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 英文自然語言請求啟動建立流程 | Pass | Renderer 英文 add／save 請求測試 |
| 中文自然語言請求啟動建立流程 | Pass | Renderer 加入生詞庫／做成學習卡片測試 |
| 代名詞請求先建立受信任 targets | Pass | Controller 無 target prompt 測試與 skill 契約 |
| 自然語言確認延續既有 targets | Pass | Controller `add both cards` continuation 測試 |
| 一般問答與否定句不誤觸發 | Pass | Renderer 四種 non-trigger 測試 |
| 既有安全與提交邊界不變 | Pass | 115 項相關回歸與完整 204 項專案測試 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `add this card` 保留原文、creation intent、source 語言、無 target |
| TC2 | Pass | `Could you save this as a flashcard?` |
| TC3 | Pass | 「把這個加入生詞庫」與「幫我做成學習卡片」 |
| TC4 | Pass | What 問句、can't、don't 與「不要」維持普通訊息 |
| TC5 | Pass | 無 trusted target 的 Codex input 契約 |
| TC6 | Pass | 明確 creation confirmation 沿用 assistant targets |
| TC7 | Pass | App／Controller／artifact／store／IPC 與完整專案回歸 |

### Commands Executed

```bash
npm run test -w @reader/desktop -- src/renderer/App.test.tsx src/main/chat-controller.test.ts -t 'starts learning-card creation from explicit|asks for typed targets when natural-language|keeps clarified targets when an explicit creation confirmation'
npm run test -w @reader/desktop -- src/renderer/App.test.tsx src/main/chat-controller.test.ts src/main/learning-item-artifacts.test.ts src/main/chat-conversation-store.test.ts src/main/chat-ipc.test.ts
python /Users/highsunday/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/create-learning-items
npm test
npm run typecheck
npm run build
git diff --check
```

Red phase：三個目標測試如預期失敗，分別顯示自然語句沒有 creation intent、無 target
prompt 未提出 structured targets，以及帶 creation intent 的確認句未沿用前一輪 targets。

Green／acceptance phase：三個目標測試、115 項相關回歸、Server 3 項、Desktop 201 項、
全專案 typecheck、production build 與 skill validator 全部通過。

### Hypotheses and Decisions

- 選擇在 Renderer 做小型 deterministic intent 辨識，因為既有 UI 已負責產生 typed
  intent，且這條路徑不需要額外 AI turn、網路服務或新的 IPC 權限。
- 不從自然命令抽取 title；`add this card` 的 `this` 需要同一 AI 對話語意，正則只判斷
  是否是明確建立請求。AI 提出的 target 必須先成為 `learning-item-request` attachment，
  下一 turn 才進入候選 scope。
- 明確 creation intent 但沒有 targets 時仍套用既有 clarification continuation，避免
  `add both cards` 因 intent 已存在而略過 apple／banana。
- 未發生非預期測試失敗，不需要啟動 diagnose。

### Deferred Items

- 日文及其他語言的自然語言 intent 辨識未納入第一版，仍可使用既有快捷操作。
- 不支援 `remember this`、`keep this` 等未明示卡片／生詞庫目的地的寬鬆語句，避免
  一般對話誤觸發。

### Architectural Notes

- 自然語言辨識仍位於既有 Renderer typed intent 邊界，沒有新增服務、store、IPC 或
  AI 權限；未發現需要另立 RXX 的責任耦合。

## Appendix: TDD Implementation Checklist

1. 為英文／中文自然語言建立請求與非建立句新增 Renderer 失敗測試。
2. 為無 target prompt 與 creation clarification continuation 新增 Controller 失敗測試。
3. 實作最小意圖辨識、prompt 契約與 continuation 行為。
4. 執行目標測試、完整桌面測試、型別檢查、build 與文件同步。
