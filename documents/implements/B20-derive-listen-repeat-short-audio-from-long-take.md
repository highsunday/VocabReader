---
author: Codex
date: 2026-08-11
title: 讓跟讀短片段與長片段共用同一次朗讀語氣
uuid: 6c5b9115a2ca431d9b29c4b022f0e861
version: 1.2.0
status: implemented
---

# Bug Fix: 讓跟讀短片段與長片段共用同一次朗讀語氣

## 1. Bug Overview

Progressive 逐句跟讀練習目前為每個短片段與長片段分別發出獨立 TTS 請求。
TTS 模型只看到當前片段，因此容易把中間短片段說成一個已結束的話語；但同一文字在完整
長片段中會使用延續語調、連音與不同的重音。使用者先模仿的短片段因而與最後完整長片段
的示範不一致。

現有 Progressive UI 雖在 group header 顯示長片段文字，但真正的 `Full sentence`
播放與錄音卡放在所有短片段之後，並重複顯示一次長片段文字，未反映「長片段母帶
→ 短片段切片」的關係。

## 2. Root Cause

- `ListenRepeatVoiceService` 以當前 chunk exact text 為每個 short／long 分別發出
  `/v1/audio/speech` 請求，沒有 parent 韻律上下文。
- TTS 回應只有 WAV 音訊，現有服務沒有建立文字與音訊時間的對齊層。
- AI audio fingerprint 與磁碟快取均以單一 chunk 為單位，不知道短片段應隸屬於哪一份
  parent long take。
- Renderer 的 Progressive 階層把長片段操作卡排在 children 之後，並把每個
  chunk 當成獨立準備中的音訊。

## 3. Fix Objective

- Progressive 模式每個長片段只產生一份 canonical AI Model Audio；它同時是長片段
  播放來源與所有短片段的音訊母帶。
- 使用 OpenAI `whisper-1` word timestamps 將已知長片段原文與 canonical WAV
  對齊，只在確認所有 short boundaries 可安全對應時切出短片段。
- 短片段切片使用共用邊界、短靜音 padding 與 fade，不重新合成短片段。
- 對齊失敗時顯示可重試的安全 service error，不靜默退回成語氣不一致的
  獨立短片段 TTS。
- Progressive UI 改為長片段 parent 操作卡在上、短片段 children 在下；
  完整長片段文字只顯示一次。
- 保留現有 Progressive 錄音解鎖與 Continuous sequence：先完成短片段錄音，
  再錄完整長片段。

## 4. Acceptance Criteria

- **Scenario 1：短片段由長片段母帶導出**
  - **Given** Progressive 長片段含多個短片段且尚無 AI audio cache
  - **When** 使用者首次播放任一短片段
  - **Then** Main 只以完整長片段文字發出一次 TTS，再以 word timestamps
    一次產生並快取所有短片段切片

- **Scenario 2：長短片段使用同一次朗讀**
  - **Given** parent alignment 成功
  - **When** 分別播放短片段與長片段
  - **Then** 長片段回傳 canonical WAV，短片段回傳由該 WAV sample range 導出的
    音訊，不發出任何短片段 TTS 請求

- **Scenario 3：對齊與 WAV 切片安全性**
  - **Given** TTS 回傳 PCM WAV 且 transcription 回傳 ordered word timestamps
  - **When** service 對齊 short text boundaries
  - **Then** 每個邊界對應到 transcript word boundary，切片是可解碼 WAV，且含安全的
    邊緣靜音與 fade

- **Scenario 4：對齊失敗不建立錯誤切片**
  - **Given** transcript 無法無損對應已知長片段與短片段邊界
  - **When** 使用者要求短片段音訊
  - **Then** service 回傳可重試的安全錯誤，不保存部分切片，也不發出獨立
    short TTS

- **Scenario 5：快取、去重與設定變更**
  - **Given** 相同 parent 組同時或重複要求多個片段
  - **When** voice／tone／model／instructions／alignment revision 未改變
  - **Then** TTS 與 alignment 在 parent group 去重且重用磁碟快取；上述任一輸入
    變更時整組 miss 並重建

- **Scenario 6：Progressive parent-first UI**
  - **Given** 已完成切分的 Progressive 練習
  - **When** 頁面顯示一個長片段 group
  - **Then** 可播放／錄音的長片段 parent 卡在上，短片段 children 在下，
    完整長片段文字只顯示一次，且錄音解鎖規則不變

- **Scenario 7：Advanced 與 Continuous 不回歸**
  - **Given** Advanced 練習或 Progressive Continuous mode
  - **When** 播放、預取、取消與錄音
  - **Then** Advanced 仍直接使用各長片段 TTS；Continuous 仍以 children → parent
    的錄音順序進行，同一 parent 的預取不重複產生母帶

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Parent-only TTS | Progressive group cache miss | prepare first short | one speech request whose input is parent text | Critical |
| TC2 | All children derived | valid PCM WAV and exact word timestamps | alignment completes | every short cache is a valid slice; parent remains original WAV | Critical |
| TC3 | Concurrent group dedupe | two children requested together | prepare both | one parent TTS and one transcription request | Critical |
| TC4 | Persistent derived cache | service recreated with same settings | replay child and parent | no TTS or transcription request | High |
| TC5 | Invalid alignment | mismatched transcript or non-PCM WAV | prepare child | safe service error, no invalid parent/child cache, no short TTS | Critical |
| TC6 | Fingerprint invalidation | voice or tone changes | replay child | parent group and slices are rebuilt | High |
| TC7 | Parent-first hierarchy | Progressive snapshot | render workspace | parent operation card precedes children and long text renders once | Critical |
| TC8 | Recording unlock regression | incomplete then complete child recordings | render/save | parent record remains locked then unlocks | High |
| TC9 | Advanced regression | Advanced long chunk | prepare/render | direct long TTS and one non-duplicated sentence card | High |
| TC10 | Continuous regression | Progressive group | flatten/prefetch/run | children → parent sequence and cancellation remain valid | High |

## 6. Implementation Notes

- 保留現有 IPC contract；Renderer 仍以 requested chunk ID 呼叫 `prepareAiAudio`，Main 在
  store context 中解析 parent group。
- 新增 store read model，一次回傳 requested chunk、parent 與 ordered children exact text；
  Renderer 不取得這份 Main-only context。
- TTS 固定使用 `gpt-4o-mini-tts` WAV；alignment 固定使用 `whisper-1`、
  `verbose_json` 與 word timestamps。
- 只接受 RIFF/WAVE PCM audio format 1；切片以 sample frame 為邊界，不以文字數
  比例猜測時間。
- OpenAI Speech 的 streaming WAV 可將 RIFF／data declared length 寫成 `0xFFFFFFFF`；parser
  會以實際收到的 data bytes 驗證與切片。Whisper 的單字時間戳允許 `start === end`，但仍要求
  全體時間有序、完整文字相等且所有 child boundaries 可證明落在 word boundary。
- alignment normalization 可移除 Unicode punctuation／separator 並統一 case，但不得
  用模糊對齊掩蓋文字不等；任一 short boundary 落在 transcript word 內部時整組拒絕。
- 短片段 derived fingerprint 包含 parent TTS fingerprint、ordered short texts 與
  alignment／slicing revision。
- 錯誤訊息不包含 provider response body、API key 或 transcript content。

## 7. Affected Modules and Files

- `apps/desktop/src/main/listen-repeat-voice-service.ts`
- `apps/desktop/src/main/listen-repeat-voice-service.test.ts`
- `apps/desktop/src/main/listen-repeat-store.ts`
- `apps/desktop/src/main/listen-repeat-store.test.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `apps/desktop/src/renderer/styles.css`
- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/modules/ai-voice.md`

## 8. Assumptions and Non-goals

### Assumptions

- `gpt-4o-mini-tts` WAV 回應是可驗證的 PCM WAV。
- 每個 long chunk 約 5–10 秒，遠低於 transcription file-size limit。
- 跟讀素材已允許傳給 OpenAI TTS；對齊只把該 TTS 產生的同份音訊
  送至 OpenAI transcription，不包含 Learner Recording。

### Non-goals

- 不對 Learner Recording 進行 ASR、發音評分或音素對齊。
- 不新增 Play All、手動切分編輯、音訊匯出或雲端歷史。
- 不改變 Advanced 的 long-only 產品語意。
- 不改變 Progressive 的 children 完成後才解鎖 parent 錄音規則。

## 9. Implementation Record

### Status

Implemented on 2026-08-11.

### Implementation Summary

- Progressive `prepareAiAudio(shortId)` 現在先從 store 取得 requested chunk、parent long 與
  ordered children context；只以 parent exact text 呼叫一次 `gpt-4o-mini-tts`。
- Main 將 canonical parent WAV 送入 `whisper-1` verbose JSON word timestamps，以 Unicode
  normalization 驗證完整 transcript 與每個 child boundary，再從共享 sample boundaries 切出
  所有 short WAV。切片含 60 ms edge silence 與 8 ms fade。
- parent TTS 與 child alignment 各自在 parent group 去重；parent／child fingerprints 包含
  voice、tone、model、instruction／alignment revision 與完整 group 文字。所有 child cache
  以 batch metadata transaction 安裝，跨 App restart 可直接重用。
- unsafe transcript、落在 word 內部的 child boundary 或非 16-bit PCM WAV 都回傳安全 service
  error；Progressive parent 會在寫入快取前驗證，失敗時不會留下 parent 或部分 child cache，
  也不會發出 short TTS。
- 修正 live OpenAI 回應相容性：接受 Speech API streaming WAV 的未知長度 sentinel，並接受
  `whisper-1` 偶爾產生、但仍保持有序的 zero-duration word timestamp。錯誤提示改為 sticky，
  即使使用者已捲到句卡位置也不會像按鈕沒有反應。
- Progressive UI 現在把唯一可操作的 `Full sentence` parent 卡放在 children 上方，完整長句
  文字只顯示一次；group 準備期間在 parent 卡顯示單一 status 並停用同組播放動作。
- 現有 children → parent Continuous sequence、錄音解鎖、Advanced long-only、IPC 與 preload
  contract 保持不變。

### Test Coverage

- TC1／TC2／TC3：`creates one parent take and derives every Progressive child from it` 驗證兩個
  child concurrent prepare 只產生一個 parent speech request、一個 transcription request，並
  接受 `0xFFFFFFFF` streaming WAV length 與 zero-duration boundary timestamp，將兩個 child
  保存為可解碼 RIFF WAV。
- TC4：`reuses persisted parent and derived child audio without another alignment` 驗證 service
  restart 後不再 fetch。
- TC5：unsafe transcript 與 non-PCM parent response 測試驗證安全拒絕，且壞的 parent 與 child
  cache 都保持空白。
- TC6：`rebuilds the Progressive parent take and slices after tone changes` 驗證整組 fingerprint
  invalidation；既有 learner recording regression test 保持通過。
- TC7：`shows Progressive hierarchy, progress and locked long recording` 驗證單一長句文字與
  parent-before-child DOM；Electron E2E 在 production preload 再驗證相同階層。
- TC8／TC9／TC10：既有 store unlock、Advanced renderer／voice 與 listen-repeat flow／Continuous
  測試全部保持通過。

### Changed Files

#### Production Code

- `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md`
- `apps/desktop/src/main/listen-repeat-audio-alignment.ts`
- `apps/desktop/src/main/listen-repeat-store.ts`
- `apps/desktop/src/main/listen-repeat-voice-service.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx`
- `apps/desktop/src/renderer/styles.css`

#### Test Code

- `apps/desktop/src/main/listen-repeat-skill.test.ts`
- `apps/desktop/src/main/listen-repeat-voice-service.test.ts`
- `apps/desktop/src/renderer/ListenRepeatWorkspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

#### Documentation

- `CONTEXT.md`
- `documents/modules/listen-and-repeat-practice.md`
- `documents/modules/ai-voice.md`
- `documents/implements/B20-derive-listen-repeat-short-audio-from-long-take.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| short 由 parent 母帶導出 | Pass | parent-take concurrent child service test |
| 長短片段使用同一份朗讀 | Pass | parent input assertion、derived RIFF slices、零 short speech request |
| 安全 word-boundary 與 PCM WAV slicing | Pass | timestamp／slice assertions與 non-PCM rejection test |
| unsafe alignment 不建立錯誤切片 | Pass | mismatched transcript、non-PCM tests 與空 parent／child cache assertions |
| group cache、去重與設定 invalidation | Pass | concurrent、restart cache、tone-change tests |
| Progressive parent-first UI | Pass | Renderer DOM order／single-text test與 Electron E2E |
| Advanced／Continuous 不回歸 | Pass | full related suites 及 Electron E2E |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `creates one parent take and derives every Progressive child from it` |
| TC2 | Pass | 同一測試的 parent full WAV、child RIFF 與 size assertions |
| TC3 | Pass | concurrent `Promise.all` request-count assertions |
| TC4 | Pass | restart derived-cache test |
| TC5 | Pass | unsafe transcript 與 non-PCM parent tests |
| TC6 | Pass | Progressive tone-change group rebuild test |
| TC7 | Pass | Progressive hierarchy Renderer test與 E2E |
| TC8 | Pass | store unlock regression與 locked parent UI assertion |
| TC9 | Pass | existing Advanced voice／Renderer tests |
| TC10 | Pass | existing flow、Continuous UI、cancellation tests |

### Commands Executed

```bash
npm exec vitest -- run src/main/listen-repeat-voice-service.test.ts src/renderer/ListenRepeatWorkspace.test.tsx --reporter=dot
npm exec vitest -- run src/main/listen-repeat-skill.test.ts src/main/listen-repeat-artifacts.test.ts src/main/listen-repeat-store.test.ts src/main/listen-repeat-controller.test.ts src/main/listen-repeat-ipc.test.ts src/main/listen-repeat-voice-service.test.ts src/renderer/listen-repeat-flow.test.ts src/renderer/ListenRepeatWorkspace.test.tsx --reporter=dot
npm test
npm run typecheck
npm run build
npm run test:e2e -w @reader/desktop
git diff --check
```

### Hypotheses and Decisions

- 已確認根因是 short／long 獨立 TTS，而非 Renderer playback speed 或音高修改。
- 只在 short prompt 加入 parent text 只能改善、無法保證兩次獨立生成的語氣一致，
  因此不採用為主修正。
- TTS Speech response 不提供文字對齊 metadata；依官方 Audio API contract 使用 `whisper-1`
  word timestamps 做 bounded parent WAV alignment。
- alignment 採 fail-closed：只有完整 normalized text 與所有 child boundary 可證明對應時才切片；
  不以字元比例或模糊 transcript 猜測切點。
- 現有 chunk-scoped IPC 已足以表達操作；parent group orchestration 留在 Main，沒有擴大 Renderer
  capability 或暴露 transcript／檔案路徑。

### Deferred Items

- 2026-08-11 已以 live OpenAI Speech／Transcription 回應重現並驗證 streaming WAV 與
  zero-duration timestamps；為避免持續產生 API 費用，完整 live call 不放入自動測試，改以
  captured response characteristics 建立 deterministic regression fixture。
- OpenAI transcription 若未能忠實回傳 canonical take 的文字／word boundaries，使用者需 Retry；
  本次刻意不加入不可靠 fallback。

### Notes

- Production build 只有既有 renderer chunk-size advisory，不影響建置成功。
- 沒有新增 public IPC，parent audio context 與 transcript 都維持 Main-only。
