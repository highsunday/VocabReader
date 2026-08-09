---
title: 逐句跟讀練習模組
module: listen-and-repeat-practice
status: active
last_updated: 2026-08-10
related_implements:
  - F58-listen-and-repeat-practice
---

# 逐句跟讀練習模組

## 1. Purpose

本模組提供獨立的 **Listen & Repeat Practice**。使用者貼上任意語言原文後，Codex 只決定
自然跟讀邊界；使用者逐片聽取 AI 示範、錄製與回放自己的語音，或用 Continuous mode
自動完成「示範 → 倒數 → 錄音 → 保存 → 下一片」。

本模組不是自由復述、寫作或發音評分工具。它不轉錄學習者語音、不產生分數、不更新
Spaced Review，也不提供 Play All 或跨片段音訊串接。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- Sidebar 中位於 Sentence Practice 後方的 `Listen & Repeat` 獨立 workspace。
- 任意語言／混合語言素材與 2,000 Unicode grapheme 上限；超限不截斷。
- `Progressive` 的 long → short 階層與 `Advanced` 的 long-only 結構。
- 準備與練習採互斥兩階段：處理成功後只顯示 `02` 練習區；使用者按 `Back to material`
  才回到 `01`，並可用 `Return to practice` 返回既有結果。
- 片段卡採緊湊資訊層級；Advanced 每個句子只顯示一個可操作卡，不重複外層句子文字或
  `Full sentence` 元件。
- Codex 斷句等待期間顯示動態活動文案、實際經過時間與 1–2 分鐘長等待提示，不使用無法
  驗證的百分比進度；本次素材與模式在處理完成前鎖定。
- 所有 long chunks 重組為完整原文；Progressive children 重組為所屬 parent 的 deterministic
  artifact 驗證。
- 每個 short／long chunk 獨立的 AI 示範、錄音、重錄與 learner audio 回放。
- Progressive 所有 child 錄音完成後永久解鎖 parent long recording。
- 麥克風先等候人聲；人聲後約 1.5 秒 sustained silence 自動停止，8 秒無聲不保存，30 秒
  maximum-duration guard。
- 可從任一合格片段開始的 Continuous mode、3–2–1 倒數、清楚 phase、mic level、錄音時間、
  Stop、錯誤停留與 retry。
- 一個 chunk ahead 的 TTS 預取與 Stop cancellation。
- 唯一目前練習跨 workspace／App restart 保存；無歷史列表。
- 明確重新處理、Continuous overwrite 與永久 Clear 確認。

## 3. Module Boundary

### ListenRepeatController

Main-owned controller 負責：

- Main-side 素材與 mode 驗證。
- 建立新的 practice ID，執行一次隔離 Codex turn，解析 artifact 後才提交 store transaction。
- 重新處理前檢查是否有 learner recordings，要求 `replaceConfirmed`。
- 協調 current snapshot、recording、AI audio 與 clear；Renderer 不直接取得檔案路徑。
- malformed、rewritten、timeout 或 runtime failure 時不呼叫 `replacePractice()`，舊練習保持可用。

### AI artifact boundary

App-bundled `prepare-listen-and-repeat-practice` skill 在 read-only、無 tools、network、plugins、
apps、memories 或其他 skills 的獨立 thread/turn 中執行。素材和素材內的文字都標為 untrusted
data。

唯一允許輸出是 `listen-repeat-result` fenced JSON：

- `advanced`：一個以上 long text，不能含有效 short chunks。
- `progressive`：每個 long text 都有一個以上 ordered short text。
- version、practice ID 與 mode 必須符合 request。
- chunk 不得空白；陣列數量受 canonical material 長度約束。
- long concatenation 必須逐 JavaScript code unit 等於 canonical material。
- 每個 short concatenation 必須逐 code unit 等於 parent long text。

Parser 不修復、不 trim、不猜測空白歸屬；任何不相等都整份拒絕。

### LocalListenRepeatStore

store 只管理 `userData/listen-and-repeat`：

```text
current.json
recordings/<main-generated-id>.<allowlisted-extension>
ai-audio/<chunk-id>-<fingerprint>.wav
```

- `current.json` 以 unique `.next` + rename 並經 serialized write queue 原子更新。
- startup 清理 metadata temporary files、孤立音訊，並移除引用不存在音訊的 stale summary。
- learner recording 先寫新 revision，metadata 成功後才刪舊 revision。
- IPC／store 驗證 practice ID、chunk ID、recording eligibility、MIME 與 24 MiB byte limit。
- Progressive parent unlock 寫入 metadata；child re-record 不會重新鎖定。
- `Clear` 等待 metadata write queue 後，只遞迴刪除專用 root。

### ListenRepeatVoiceService

本服務和 Selection Speech 共用同一個 encrypted API key store 與 Settings voice／tone，但有
獨立 request instructions、AbortController、fingerprint 與 disk cache：

- model 固定 `gpt-4o-mini-tts`，format 使用 WAV。
- instructions 要求使用 input 的相同語言、逐字保留 exact text，再套用 tone 風格。
- fingerprint 包含 model、`listen-repeat-v1` instructions revision、voice、tone 與 exact text。
- cache hit 直接從 store 回傳；miss 才呼叫 OpenAI。
- 同 chunk 進行中的 prepare 會去重；Stop 可取消指定 chunk 或整個 practice。
- 401／403、429、network 與 service error 使用和 AI Voice 相同的安全錯誤分類，不透傳
  response body 或 API key。

### Renderer and recording

`ListenRepeatWorkspace` 負責素材、mode、progress、chunk cards、dialogs、audio playback、mic 與
focus view。`listen-repeat-flow.ts` 保存可獨立測試的 domain UI 邏輯：

- 頁面以 prepare／practice 互斥 stage 呈現，避免有效結果出現後仍佔用高度顯示素材表單。
- Codex process 尚未回傳時，以 `role=status` 呈現經過秒數和分段式等待說明；這只表示請求
  仍在進行，不假造 server 端百分比或精確完成時間。
- Advanced long chunk 直接使用唯一 sentence card；Progressive 才保留 parent／children 階層。

- Progressive sequence：每組 children → parent long → 下一組。
- Advanced sequence：ordered long chunks。
- Resume：第一個未完成且可錄音 chunk。
- overwrite scope：指定起點及其後是否已有 learner recording。
- VAD：voice threshold、speech-started、1.5 秒 silence、8 秒 no-speech 與 30 秒 guard。

Renderer 使用 Chromium `getUserMedia`、`MediaRecorder` 與 Web Audio analyser。完整 blob 才經
narrow IPC 傳給 Main；不把 learner audio 傳給 Codex、OpenAI TTS 或其他服務。Unmount／Stop
會關閉 MediaStream tracks、AudioContext、RAF 與未完成 AI audio request。

## 4. State Flow

```text
draft material + mode
  → Main validates grapheme/mode
  → isolated Codex segmentation
      Renderer: live elapsed time + honest long-wait guidance; material/mode locked
  → exact artifact validation
      ├─ invalid/error → keep previous current practice
      └─ valid → atomically replace current practice
  → manual chunk practice
      AI audio (lazy persistent cache) ↔ learner recording (one revision)
  → or Continuous mode from any eligible chunk
      Preparing → AI playback → Countdown → Recording → Saving → next
      no speech/error/Stop → pause at current chunk
  → every long recording exists → practice complete (no score)
```

## 5. Electron Boundary

Preload 暴露 frozen `listenRepeat` API：

- `getSnapshot`
- `saveDraft`
- `process`
- `saveRecording`
- `getRecording`
- `prepareAiAudio`
- `cancelAiAudio`
- `clear`

IPC 不接受 Renderer 檔案路徑、model、endpoint、instructions、API key 或任意 filesystem
operation。音訊 bytes、MIME、ID 與 material/mode 都在 Main 再次驗證。

## 6. Persistence and Backup Boundary

- 只保存一份 current practice；新 valid segmentation 才取代。
- Material、hierarchy、unlock、recordings 與 AI audio 跨 restart 保存。
- AI Voice settings 改變時，fingerprint miss 只重建 AI audio；learner recordings 不變。
- 專用 root 不在 Data Backup export inputs 內；restore 只交換 library 與 learning-library，
  不觸碰 listen-and-repeat。
- 沒有 cloud sync、history、Trash、undo 或 audio export。

## 7. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/listen-repeat-contracts.ts` | grapheme、模式、snapshot、audio 與 Desktop API |
| `apps/desktop/src/main/listen-repeat-artifacts.ts` | fenced artifact 與 exact reconstruction |
| `apps/desktop/src/main/listen-repeat-controller.ts` | 隔離 Codex turn 與 orchestration |
| `apps/desktop/src/main/listen-repeat-store.ts` | current metadata、recording、AI cache 與 cleanup |
| `apps/desktop/src/main/listen-repeat-voice-service.ts` | 語言中性 TTS、fingerprint、dedupe 與 cancellation |
| `apps/desktop/src/main/listen-repeat-ipc.ts` | 8 個 narrow IPC operations |
| `.agents/skills/prepare-listen-and-repeat-practice/SKILL.md` | 只斷句、不改文與 artifact schema |
| `apps/desktop/src/renderer/listen-repeat-flow.ts` | sequence、resume、overwrite scope 與 VAD |
| `apps/desktop/src/renderer/ListenRepeatWorkspace.tsx` | 完整頁面、錄音與 Continuous mode |
| `apps/desktop/src/renderer/App.tsx` | Sidebar、workspace lifecycle 與 AI Voice settings 跳轉 |

## 8. Testing Notes

| Test file | Coverage |
|---|---|
| `listen-repeat-contracts.test.ts` | Unicode grapheme 與 2,000/2,001 邊界 |
| `listen-repeat-artifacts.test.ts` | Advanced/Progressive exact reconstruction 與拒絕案例 |
| `listen-repeat-controller.test.ts` | atomic install/preserve、confirm、isolated Codex turn |
| `listen-repeat-store.test.ts` | restart、unlock、recording replace、ID/MIME、temporary cleanup、clear |
| `listen-repeat-voice-service.test.ts` | language-neutral request、restart cache、fingerprint、cancel |
| `listen-repeat-ipc.test.ts` | narrow operations 與 malformed payload |
| `listen-repeat-skill.test.ts` | skill contract 與 runtime install |
| `listen-repeat-flow.test.ts` | sequence、resume、overwrite scope 與 VAD guards |
| `ListenRepeatWorkspace.test.tsx` | stage exclusivity、compact Advanced、processing feedback、material UI、limit、hierarchy、AI Voice、overwrite、clear |
| `App.test.tsx` | Sidebar order 與 independent workspace |
| `data-backup-service.test.ts` | export/restore 排除 current practice |
| `desktop.spec.ts` | production bundle、skill install、preload 與真實頁面入口 |

最近驗證（2026-08-10）：

- Root Vitest：server 3/3、Desktop 475/475 passed。
- Root TypeScript typecheck：server、Desktop passed。
- Root production build：server、Desktop passed（只有既有 renderer chunk-size advisory）。
- Electron Playwright E2E：3/3 passed；既有 center-scroll 案例曾偶發逾時，單獨與完整重跑皆通過。

## 9. Known Limitations

- VAD threshold 與時間常數是跨裝置基準，極端噪音環境可能需要後續調校。
- TTS 實際秒數受語言、voice、tone 與內容影響；2–4／5–10 秒是 segmentation heuristic。
- 不進行 ASR、音素對齊或發音評分。
- 不提供 Play All、歷史、雲端、備份、匯出或手動 chunk boundary 編輯。
- Codex 斷句只有 request-level 狀態，尚無 server 回傳的細部階段或 determinate percentage；
  UI 因此只顯示實際經過時間與正常等待說明。Main 端仍以 120 秒 timeout 防止無限等待。

## 10. Related Documents

- `CONTEXT.md`
- `documents/implements/F58-listen-and-repeat-practice.md`
- `documents/modules/ai-voice.md`
- `documents/modules/data-backup.md`
