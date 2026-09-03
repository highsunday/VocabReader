---
author: Codex
date: 2026-09-04
title: 為間隔複習加入安全的語音回答與清楚的語音設定
uuid: ca510385-754f-4346-a7c8-a73df0a647e0
version: 1.1.0
status: implemented
---

# Feature Specification - 間隔複習語音回答

## 1. Feature Overview

間隔複習目前只能用鍵盤輸入自由作答。這使想用口說回想、正在使用行動式裝置，
或不方便持續打字的學習者產生額外操作負擔。

本功能在回答欄加入按一下即可開始的錄音入口。App 在本機偵測使用者是否開始說話
與何時停頓；錄音停止後才把單一短音檔送到 OpenAI transcription API，並把逐字稿填回
原本的答案欄。使用者可以先編輯文字，再沿用既有的 Submit answer 流程。

同時把 Settings 的 `AI Voice` 更名為 `Voice & Speech`，清楚區分 Codex 提供的文字 AI
與使用者另外設定的 OpenAI API 語音功能，並將語音播放和語音辨識放在同一個可理解的
入口中。

## 2. Requirements (User Story)

- **As a** 使用間隔複習進行主動回想的語言學習者
- **I want** 用短暫錄音把口說內容辨識成可編輯的答案
- **So that** 我不必每一題都打字，仍能確認文字並自行決定何時提交

## 3. Confirmed Product Rules

### 3.1 錄音生命週期

- 使用者必須明確按下麥克風按鈕才開始錄音；同一時間最多一段錄音或一個辨識請求。
- 使用者說話後連續安靜 1.5 秒時自動停止；也可再次按按鈕提早停止。
- 開始後 8 秒仍未偵測到語音時取消並顯示可重試訊息，不送 API。
- 每段錄音有 15 秒硬上限。離開間隔複習、切換題目或元件卸載時停止媒體軌、捨棄
  尚未送出的錄音，並取消進行中的辨識請求。
- 不進行背景錄音、串流辨識、自動重試或自動開始下一段錄音。

### 3.2 辨識、隱私與費用保護

- 錄音停止後才將單一音檔送往 OpenAI transcription API；API key 只由 Electron Main
  從既有加密憑證儲存讀取，不暴露給 Renderer。
- Main 僅接受固定 MIME 類型、最多 15 秒與最多 2 MiB 的音檔，且使用固定模型與固定
  transcription prompt；Renderer 不可指定 endpoint、model 或任意 prompt。
- 固定 prompt 可提示答案可能混用繁體中文、英文、日文或韓文，但只要求逐字轉錄，
  不翻譯、不修正、不回答問題，也不傳送題目、正確答案或學習項目內容。
- 不顯示累計用量或施加 App 端每日分鐘上限；成本風險由明確手動啟動、單次 15 秒、
  安靜自停、單一 active request 與不自動重試共同限制。
- API 失敗不自動重試，錯誤必須說明可恢復方式，且原本的鍵盤輸入永遠可用。

### 3.3 作答行為

- 辨識成功只將逐字稿填入目前題目的文字欄，不觸發 Submit answer、不進行批改，也不
  改變 FSRS 狀態。
- 使用者可自由修改逐字稿；成功狀態顯示 `Transcribed with OpenAI · Edit before submitting`。
- 錄音與轉錄中顯示 `Listening… Stops after silence` 與
  `Converting speech to text…`，並透過可存取的 live status 公告狀態。
- 麥克風權限拒絕、無語音、格式不支援、API key 未設定、網路、驗證與額度
  錯誤都只影響語音入口，不清除已輸入文字。

### 3.4 Voice & Speech 設定資訊架構

- Settings tab 由 `AI Voice` 更名為 `Voice & Speech`。
- 頁首明確說明 OpenAI API key 與 Codex 登入／方案分開；同一把 key 支援選取文字朗讀、
  Listen & Repeat 的 AI model audio，以及 Spaced Review voice answers。
- 憑證狀態使用 `Configured`／`Not configured`；貼入尚未保存的值立即顯示 `Not saved`，
  不以 `Required` 暗示整個 App 必須設定。
- API key 輸入框旁提供 `Save & enable voice features`，成功後原地顯示啟用結果；頁尾
  `Save voice & preview` 只保存已啟用 key 下的播放 voice／tone，不兼任 credential 啟用。
- 頁面分成 `AI-generated speech` 與 `Speech recognition`：前者管理播放聲音與語調；後者
  只說明 voice answers 的用途及單次錄音保護，不顯示會造成額度焦慮的累計進度條。
- 未設定 key 時點擊複習麥克風，顯示精簡設定提示，提供 `Open Voice & Speech settings`
  與 `Keep typing`；並說明複習生成與批改仍使用 Codex。
- Account 頁提供跨頁說明：Codex 處理文字 AI，語音功能使用另一組 OpenAI API key，並
  可前往 Voice & Speech 管理。

## 4. Acceptance Criteria

### AC1：安全開始與自動停止

- **Given** 已設定 OpenAI API key 且目前題目可作答
- **When** 使用者按麥克風並開始說話
- **Then** App 錄製單一短音檔，說話後安靜 1.5 秒或錄音達 15 秒時停止
- **And** 錄音期間顯示明確 listening 狀態，且不允許同時啟動第二段錄音

### AC2：無語音不產生 API 請求

- **Given** 錄音已開始
- **When** 8 秒內沒有偵測到語音
- **Then** App 停止並捨棄錄音、顯示可重試訊息
- **And** 不呼叫 transcription API

### AC3：逐字稿可編輯且不自動提交

- **Given** 一段合法錄音已停止
- **When** OpenAI 回傳非空逐字稿
- **Then** 逐字稿填入目前答案欄並顯示來源與可編輯提示
- **And** 題目仍為 answering 狀態，直到使用者自行提交

### AC4：Main 單次請求邊界

- **Given** Renderer 要求語音辨識
- **When** MIME、byte size、duration 或同時請求不合法
- **Then** Main 在呼叫外部 API 前拒絕請求並回傳安全、可行動的錯誤
- **And** 合法請求只使用固定 OpenAI endpoint、model 與 prompt

### AC5：離開時完整清理

- **Given** 正在錄音或轉錄
- **When** 使用者離開複習、切換到下一題或元件卸載
- **Then** 媒體軌與音訊分析資源停止，未送出的錄音被捨棄，進行中請求被取消
- **And** 不會在背景繼續錄音、重試或把結果寫入其他題目

### AC6：沒有 key 時仍可完成複習

- **Given** OpenAI API key 尚未設定
- **When** 使用者按下複習麥克風
- **Then** App 解釋 voice answers 使用獨立 OpenAI API，文字複習仍由 Codex 支援
- **And** 使用者可前往 Voice & Speech 設定或關閉提示後繼續打字

### AC7：設定頁能正確建立心智模型

- **Given** 使用者開啟 Settings
- **When** 查看 Voice & Speech 與 Account
- **Then** UI 清楚區分 Codex 文字 AI 與 OpenAI API 語音功能
- **And** 顯示播放／辨識的用途、憑證狀態與單次錄音安全限制，不顯示累計額度

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 合法短音檔 | key configured | Main transcribe | fixed endpoint/model/prompt，回傳 trim text | Critical |
| TC2 | Main payload guard | MIME／duration／bytes invalid | transcribe | external fetch 未呼叫 | Critical |
| TC3 | 無累計上限 | 前一筆合法錄音已完成 | 再次明確錄音 | 第二筆可送出，不受每日計量阻擋 | High |
| TC4 | 單一請求與取消 | request pending | 第二次 request／cancel | 第二次拒絕，原請求 abort | High |
| TC5 | 無語音 | recording 8s without speech | VAD advances | recorder stops, API 未呼叫 | Critical |
| TC6 | 停頓自動停止 | speech then 1.5s silence | VAD advances | 單次 upload | High |
| TC7 | 逐字稿填入 | API returns text | render completes | textarea 更新且未 submit | Critical |
| TC8 | 離開清理 | recording/transcribing | deactivate/unmount | tracks stop and cancel called | Critical |
| TC9 | 無 key 提示 | key absent | click microphone | setup explanation and both actions visible | High |
| TC10 | Settings copy | open Voice & Speech / Account | inspect UI | boundaries, capabilities and status visible; no usage meter | High |

## 6. Affected Modules and Files

- `CONTEXT.md`
- `apps/desktop/src/shared/voice-transcription-contracts.ts`
- `apps/desktop/src/main/voice-transcription-service.ts`
- `apps/desktop/src/main/voice-transcription-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應 Main、IPC、Renderer 與 flow 測試
- `documents/modules/spaced-review.md`
- `documents/modules/ai-voice.md`

## 7. Assumptions and Non-goals

- 本功能沿用 AI Voice 現有加密 OpenAI API key，不新增第二把 key，也不改用 Codex
  登入憑證呼叫 OpenAI API。
- 第一期使用雲端 transcription API，不內建 Whisper 模型、不做即時逐字顯示、不做發音
  分數，也不保存或播放學習者錄音。
- 不提供 App 端每日額度或帳單估算；每次 transcription 仍會使用使用者的 OpenAI API 額度。
- Voice answers 只支援自由文字答案欄；選擇題或非 answering 階段不顯示可啟動的錄音。
- 文字輸入是完整 fallback，不因麥克風權限、API key、網路或額度狀態被停用。

## 8. Implementation record

### Status

Implemented on 2026-09-04.

### Implementation summary

Spaced Review 的自由文字答案現在具有可選的麥克風入口。Renderer 使用 MediaRecorder 與
Web Audio analyser 在本機偵測人聲；說話後安靜 1.5 秒自動停止，8 秒沒有語音直接取消，
另以獨立 timer 保證 15 秒硬停止，即使視窗最小化也不依賴 animation frame。離開試卷或
元件卸載時停止媒體軌、關閉 AudioContext、捨棄錄音並取消進行中的 Main request。

停止後，Renderer 才經 typed preload bridge 提交音檔。Main 驗證白名單 MIME、非空、最多
2 MiB 與最多 15 秒，並強制固定 OpenAI endpoint、`gpt-4o-transcribe` 與不翻譯／不回答的
多語逐字稿 prompt；題目與正確答案不進 request。每次只允許一個 active request、不自動
重試，也不在 App 端累計或顯示每日分鐘數。

成功逐字稿只填回目前 textarea，顯示 OpenAI 來源並保留人工編輯與 Submit paper 決定點。
未設定 key、權限、無語音、網路、驗證或額度錯誤都不清除文字，也不影響鍵盤作答。

Settings 的 `AI Voice` 已更名為 `Voice & Speech`，頁首先說明 OpenAI API 與 Codex 分開，
再列出 key 的三個用途；Speech recognition 排在 AI-generated speech 前並顯示安全限制與
單次錄音行為。Account 也提供相同邊界說明及直接管理入口。這次 Impeccable pass 保留既有紙張
色、墨綠動作、圓角與排版層級，並補齊 loading、success、error、disabled、focus 與 reduced
motion 狀態。

後續 UX 回饋指出 credential 欄位與頁尾套用按鈕相距過遠，容易把「已貼入」誤認為「已
啟用」。修正後 key 區塊會在輸入時顯示 `Not saved`，並就地提供明確的保存／啟用按鈕與
成功或錯誤回饋；替換流程則標示目前 key 仍有效並提供 Cancel。頁尾操作不會讀取未保存的
key，只負責已啟用狀態下的 voice／tone 與預覽。

另一輪 UX 回饋指出常駐的「今日用量／10 分鐘」進度條會被理解成即將耗盡的配額並造成
不必要焦慮。因此已移除進度條、usage API、裝置用量檔與每日硬限制；設定頁只保留單次
錄音的可預期行為。防止意外持續費用仍由手動開始、安靜自停、15 秒硬停止、單一 active
request 與零自動重試負責。

### Test coverage

- Main service：固定 endpoint/model/prompt、合法請求、MIME／duration／2 MiB 邊界、
  not-configured／auth、連續明確請求、單一 active request 與取消。
- IPC／preload：只接受 audio、mimeType、durationMs，剝除 renderer 的 model／prompt，並只
  暴露 transcribe／cancel capability。
- 錄音 flow：8 秒無語音、1.5 秒停頓與 15 秒硬上限。
- Renderer：無 key 的 Codex／OpenAI 說明、typing fallback、轉錄回填、不自動提交、卸載取消、
  Settings 資訊架構、key 的未保存／啟用／替換狀態、無 usage meter 與 Account 跨頁說明。
- Electron E2E：production preload capability 與 Voice & Speech 設定的實際可見性。

### Changed files

- `CONTEXT.md`
- `apps/desktop/src/shared/voice-transcription-contracts.ts`
- `apps/desktop/src/main/voice-transcription-service.ts`
- `apps/desktop/src/main/voice-transcription-ipc.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/selection-speech-service.ts`
- `apps/desktop/src/main/listen-repeat-voice-service.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/voice-answer-recording.ts`
- `apps/desktop/src/renderer/ReviewVoiceAnswer.tsx`
- `apps/desktop/src/renderer/SpacedReviewWorkspace.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- 對應 Main、IPC、flow、component、workspace、App 與 Electron E2E 測試
- `documents/modules/ai-voice.md`
- `documents/modules/spaced-review.md`

### Commands executed

- Red Main：`npm test -- --run src/main/voice-transcription-service.test.ts src/main/voice-transcription-ipc.test.ts`
  — 2 suites 因缺少 module 如預期失敗。
- Red recording：`npm test -- --run src/renderer/voice-answer-recording.test.ts`
  — 1 suite 因缺少 module 如預期失敗。
- Red component：`npm test -- --run src/renderer/ReviewVoiceAnswer.test.tsx`
  — 1 suite 因缺少 component 如預期失敗。
- Green targeted：7 個相關 test files，76/76 passed。
- Full desktop unit：`npm test` — 64 files，615/615 passed。
- TypeScript：`npm run typecheck` — passed。
- Production build：`npm run build` — passed（只有既有 500 kB renderer chunk warning）。
- Electron E2E：`npm run test:e2e` — 5/5 passed。
- Visual QA：以 production Electron 1180×820 實際渲染 Voice & Speech；Speech recognition、
  key scope 與 AI-generated speech 建立清楚層級，內容可在設定 panel 捲動。
- Activation UX red：輸入 key 後找不到 `Not saved` 與 key 區塊內的啟用按鈕，測試如預期
  失敗；修正後 App 97/97、完整 Desktop 617/617、typecheck、build 與 Electron E2E 5/5 通過。
- Activation visual QA：在 production Electron 1180×820 輸入候選 key，`Not saved`、就地
  `Save & enable voice features` 與用途說明均同時可見，不需捲到頁尾。
- Usage-meter removal red：服務仍讀取 usage store、IPC 仍暴露 get-usage、Renderer 仍組合
  usage 結果且設定頁仍顯示進度；四項回歸測試如預期失敗。
- Usage-meter removal green：連續明確錄音不受累計上限阻擋，Desktop 64 files／615 tests、
  typecheck、production build 與 Electron E2E 5/5 通過；production 1180×820 畫面已確認
  Speech recognition 僅保留單次錄音說明。
