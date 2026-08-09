---
title: AI 語音、選取朗讀與跟讀示範模組
module: ai-voice
status: active
last_updated: 2026-08-10
related_implements:
  - F56-speak-selected-reader-text
  - F57-ai-selection-speech
  - F58-listen-and-repeat-practice
---

# AI 語音與選取朗讀模組

## 1. Purpose

本模組讓使用者在章節閱讀頁選取單字、句子或連續段落後，以自己套用的 OpenAI AI Voice
設定產生並播放英文語音。它負責 AI Voice 設定、API key 安全保存、OpenAI Speech API
請求、長選取成本提醒、文字分段、PCM 串流播放、停止／取消與暫態音訊快取。

本模組同時供章節原文的**選取朗讀（Selection Speech）**與 Listen & Repeat 的 **AI 示範
語音**共用同一組安全 credential、voice 與 tone。兩個 consumer 的 instructions、format、
cache 與 cancellation 彼此隔離。學習項目詳情中的發音仍由裝置 Web Speech API 提供。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- Settings 中的獨立 AI Voice 分頁，可貼入或替換 OpenAI API key，並以 icon card 選擇四種
  voice 與四種 tone。
- `Apply and preview` 先用候選設定產生固定短句 WAV 預覽；只有預覽成功後才套用 key、voice
  與 tone，避免失敗設定取代原本可用設定。
- 從章節選取旁的 `Pronounce` 懸浮操作或右鍵 `Pronounce selection` 啟動相同的 AI 語音流程。
- 正規化後超過 1,200 字元時，先顯示字數、等待時間與 OpenAI API 額度提醒；確認前與取消後
  都不呼叫 Speech API，剛好 1,200 字元可直接播放。
- Main Process 將本文依自然邊界切成最多 1,000 字元的片段，使用 `gpt-4o-mini-tts` 依序產生
  24 kHz PCM；Renderer 收到首批有效音訊即可開始播放。
- 播放控制把 Generating／Playing、voice／tone 與 Stop 整合在同一個懸浮元件；停止、新播放、
  切章、離開閱讀頁或 App 結束都會取消目前工作並隔離舊事件。
- 相同正規化本文、model、voice 與 tone 的完整音訊可在同一次 App 開啟期間從 32 MiB 記憶體
  LRU 快取重用，不重複產生費用。
- 401／403、429、網路及服務錯誤會轉成安全、可操作的錯誤；不顯示供應商 response body，
  也不自動 fallback 到裝置語音。
- Listen & Repeat 以 exact chunk、語言中性 instructions 產生完整 WAV，依 model、instruction
  revision、voice、tone 與本文 fingerprint 持久化於目前練習；跨 App restart 命中不重送。
- Listen & Repeat 的 Continuous mode 最多準備目前與下一 chunk，停止時取消未完成 request。

## 3. Product and Domain Boundaries

### AI Voice Settings

**AI Voice 設定**是全域使用者偏好，不屬於單本書、章節、標記、學習項目或 AI 對話。
已套用狀態由三部分構成：

- OS 加密保存的 OpenAI API key。
- `settings/settings.json` 中的白名單 `selectionSpeechVoice`。
- `settings/settings.json` 中的白名單 `selectionSpeechTone`。

Renderer 只能取得 `hasApiKey`、voice 與 tone，不會讀回原始 key。設定 UI 中重新開啟的 key
欄位是空的；使用者若不輸入新 key，只更換 voice／tone 時會沿用既有 credential。

### Selection Speech

**選取朗讀**是一次性的暫態操作。本文來自目前章節內經驗證的 Selection，只在使用者明確
播放，且長選取完成額外確認後，才送往 OpenAI。它不保存本文、不建立或修改標記、不改變
START／END 閱讀區段，也不加入 Codex 對話上下文。

Selection 的擷取、章節內 offset 驗證及與標記模式共存仍屬於 Annotation 模組；從
`Pronounce` 開始的設定檢查、外部請求、音訊播放與生命週期則由本模組負責。

### Learning-item Pronunciation

`LearningLibraryWorkspace` 中的學習項目發音是另一個產品能力，固定沿用裝置
`speechSynthesis`、英文 voice、`rate 0.85` 與 `pitch 1`。AI Voice key、tone、快取、錯誤或
移除設定都不得改變它。

### Listen & Repeat AI Model Audio

跟讀示範只接受已驗證 current practice 的 chunk ID；Main 從 store 取得 exact text，Renderer
不能自訂 TTS instructions、model 或 endpoint。instructions 固定要求維持 input 的原語言與
每個字元，再套用相同 tone 意圖。音訊使用 WAV disk cache，不進 Selection Speech 的 PCM
LRU，也不加入 Data Backup。

## 4. Voice and Tone Configuration

voice 與 tone 都是 shared contract 的封閉 enum。Renderer 只能送出白名單值；Main Process
負責把 tone 映射成固定 instructions 與 speed，不能由 Renderer 注入任意 prompt、model、
endpoint 或 request header。

### Voices

| UI | Contract / OpenAI voice | Description |
|---|---|---|
| Cedar | `cedar` | Clear & steady；預設角色 |
| Marin | `marin` | Warm & natural |
| Coral | `coral` | Bright & friendly |
| Onyx | `onyx` | Deep & narrative |

### Tones

| UI | Contract | Speed | Main Process behavior |
|---|---|---:|---|
| Learning | `learning` | `0.78` | 刻意較慢、咬字與字尾清楚、標點停頓明顯；預設語氣 |
| Natural | `natural` | `1.00` | 日常對話式連音、舒適節奏與短停頓 |
| Calm | `calm` | `0.86` | 柔和低能量、平順節奏、逗號與句尾停頓較長 |
| Expressive | `expressive` | `1.12` | 明顯的音高變化、關鍵字重音及問句／驚嘆句對比 |

若 tone 行為或 prompt 改變，必須同步更新快取 instruction revision，避免舊音訊以新設定的
名義重播。目前 cache key 使用 `pcm-v3` 代表這個 revision。

## 5. Apply-and-preview Flow

```text
Settings / AI Voice
  → Renderer 提交 optional new key + whitelisted voice + tone
  → IPC 驗證 key 長度與 enum
  → Main 使用候選設定產生固定短句 WAV
  → 成功：加密保存新 key（若有）並原子保存 voice／tone
  → Renderer 播放 previewAudio、清空 key input、顯示 Configured
```

預覽使用固定英文句，不包含 EPUB 原文。若預覽失敗，正式設定不變；若預覽成功但後續保存
失敗，service 會還原先前 credential。`Remove key` 會取消所有進行中的請求、清空 PCM 快取
並刪除 credential，但保留非敏感 voice／tone 偏好供設定畫面顯示。

## 6. Selection Playback Flow

```text
有效章節 Selection
  → Pronounce 懸浮操作／右鍵選單
  → Renderer 檢查已套用 AI Voice
  → 正規化後字數 > 1,200？
      ├─ 是：顯示成本提醒；Cancel 結束且零 API 呼叫
      └─ 否／已確認：selection-speech:start
  → Main 載入 credential 與已套用 voice／tone
  → memory cache hit？
      ├─ 是：直接回傳 cached PCM
      └─ 否：依自然邊界切成 ≤ 1,000 字元並逐片呼叫 OpenAI
  → selection-speech:event(audio | done | error)
  → Renderer 以 Web Audio 排程 PCM，並在同一浮層提供 Stop
```

### Text normalization and chunking

Renderer 的警告字數與 Main Process 使用相同正規化語義：統一換行、壓縮行內空白、把三個
以上連續換行縮成兩個並移除首尾空白。Main Process 再以段落、句末標點、其他標點、空格
與換行的優先順序找切點；每片上限為 1,000 字元，找不到自然邊界時才硬切。

1,000 是上限而不是保證長度；最後一片或自然邊界片段可以更短。所有片段依原順序產生，
合併後必須等於正規化本文，不得靜默截斷。

### Streaming and playback

OpenAI request 固定使用：

- endpoint：`https://api.openai.com/v1/audio/speech`
- model：`gpt-4o-mini-tts`
- response：選取朗讀使用 raw `pcm`，設定預覽使用 `wav`
- PCM：約定為 24 kHz、16-bit signed little-endian mono

Main Process 以 request ID 與 `AbortController` 管理 active request，並透過固定
`selection-speech:event` 傳送受限 event union。Renderer 使用 request revision 排除已取消的
舊回應，保留跨 network chunk 的單一殘留 byte，再依 `AudioContext.currentTime` 排程
`AudioBufferSourceNode`。API stream 的 `done` 與最後一個 source 播放完成是不同狀態；只有
兩者都完成後才結束播放 UI。

## 7. Credential, IPC, and Data Security

- API key 只在 Main Process 使用 Electron `safeStorage` 加密，保存於 App user data 下的
  `settings/openai-tts-key.bin`；寫入先建立 mode `0600` 的 `.next` 再 rename。
- 安全加密不可用時拒絕保存，不降級成 plaintext。解密失敗視為沒有可用 key。
- 一般 settings snapshot 只回傳 `hasApiKey`，原始 key 不回傳 Renderer、不寫日誌、不進
  錯誤訊息，也不包含在資料備份。
- preload 僅暴露 `getSettings`、`applySettings`、`removeApiKey`、`start`、`cancel` 與可解除
  訂閱的 `onEvent`，不暴露任意 fetch、檔案路徑或 Authorization header。
- IPC 對 key、voice、tone、本文與 request ID 做型別／白名單驗證；單次 start 本文的硬上限
  為 200,000 個 JavaScript 字元。
- 長選取警告是 Renderer 的產品成本護欄，不是 Main Process 的授權證明；Main Process 不保存
  「已確認」狀態。若未來把 start capability 暴露給其他 UI，新的入口也必須實作相同確認。

## 8. Cache and Lifecycle

成功產生的完整 PCM 使用 Main Process 內的 32 MiB LRU：

- cache key 是 model、PCM instruction revision、voice、tone 與正規化本文的 SHA-256；Map key
  不直接保存原文。
- 相同條件命中時直接發送 cached audio 與 `done`，不呼叫 OpenAI。
- 單筆大於 32 MiB 時仍可播放但不進快取；總量超過上限時淘汰最久未使用項目。
- 快取不寫磁碟、不進書庫或備份；移除 key、service dispose 與 App process 結束時清空。

停止或取代播放會 abort 目前正在進行的 request，後續尚未開始的文字片段不再送出。已由
OpenAI 完成產生或已回傳的音訊仍可能已計費，因此 Stop 不能保證把當次費用降為零。

Listen & Repeat 另使用 `listen-repeat-v1` fingerprint 與 current-practice disk cache；voice、
tone、model、instruction revision 或 exact text 不同即 miss。新音訊 metadata 成功後淘汰同
chunk 舊 fingerprint，learner recording 不受影響。建立新練習或 Clear 會刪除整個舊 cache。

## 9. Error Model

| Code | Meaning | UI behavior |
|---|---|---|
| `not-configured` | 沒有可用 credential | 開啟 AI Voice 設定，不使用裝置語音 |
| `secure-storage` | OS 安全儲存不可用 | 拒絕明文保存並顯示安全錯誤 |
| `auth` | OpenAI 回傳 401／403 | 安全訊息、Retry、AI Voice Settings |
| `quota` | OpenAI 回傳 429 | 提醒 rate／credit limit，可 Retry |
| `network` | fetch 或連線失敗 | 提醒檢查網路，可 Retry |
| `service` | 其他 API 或播放失敗 | 一般服務錯誤，可 Retry |

錯誤事件只包含受限 code 與產品文案，不透傳 provider response body。取消造成的 AbortError
不應顯示成晚到錯誤，也不得讓舊 request 覆寫新播放狀態。

## 10. Key Files and Responsibilities

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/settings-contracts.ts` | voice／tone enum、defaults 相關型別與白名單 guard |
| `apps/desktop/src/shared/selection-speech-contracts.ts` | 設定 snapshot、apply input/result、error code、stream event 與 desktop API |
| `apps/desktop/src/main/settings-store.ts` | 非敏感 voice／tone 的預設、驗證與原子保存 |
| `apps/desktop/src/main/selection-speech-service.ts` | credential store、預覽套用、OpenAI request、分段、取消、錯誤與 LRU |
| `apps/desktop/src/main/selection-speech-ipc.ts` | 窄化 IPC route 與輸入驗證 |
| `apps/desktop/src/main/main.ts` | service composition、`safeStorage` 注入與 quit disposal |
| `apps/desktop/src/preload/preload.ts` | context-isolated typed bridge 與 stream unsubscribe |
| `apps/desktop/src/renderer/App.tsx` | AI Voice UI、長選取確認、PCM 排程、播放／錯誤狀態與生命週期 |
| `apps/desktop/src/renderer/styles.css` | 設定卡片、Pronounce／Generating／Playing／Stop 與警告卡視覺 |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.tsx` | 獨立的裝置 Web Speech 學習項目發音；不屬於本模組 |

## 11. Tests and Verification

| Test | Coverage |
|---|---|
| `apps/desktop/src/main/selection-speech-service.test.ts` | tone 差異、候選設定與回滾、安全 credential、PCM、1,000 字元分段、取消、錯誤與 LRU |
| `apps/desktop/src/main/selection-speech-ipc.test.ts` | 設定白名單、固定 event channel、start／cancel 邊界 |
| `apps/desktop/src/main/settings-store.test.ts` | voice／tone defaults、保存、損壞值回退 |
| `apps/desktop/src/renderer/App.test.tsx` | 設定 UI、懸浮／右鍵入口、1,200 字元警告、確認／取消、PCM、停止、生命週期與錯誤 |
| `apps/desktop/src/renderer/LearningLibraryWorkspace.test.tsx` | 學習項目 Web Speech 邊界回歸 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | production preload、AI Voice 設定 UI 與 Selection Speech 基本樣式 |

截至 2026-08-10，Desktop Vitest 為 42 files、439/439 passed，TypeScript typecheck、production
build 與 Electron Playwright 2/2 均通過。Production build 仍有既有的 renderer chunk size
warning，與 AI Voice 正確性無關。

## 12. Known Limitations and Follow-ups

- 沒有精確費用試算、每日預算、帳戶餘額查詢或 App 端 rate limit；目前只在超過 1,200 字元
  時提供一次確認。
- 文字片段按順序向 OpenAI 產生，但沒有以實際播放進度對後續片段施加 backpressure；使用者
  很快 Stop 時，已完成或正在產生的片段仍可能產生成本。
- 沒有暫停／繼續、播放進度拖曳、逐字高亮、音訊匯出、磁碟快取或離線 AI 語音。
- 不支援任意 voice、model、prompt、endpoint、voice cloning 或供應商切換。
- `App.tsx` 目前同時負責 Selection UI、AI Voice 設定與 Web Audio 排程；若再加入進度、
  backpressure 或更多播放控制，應以獨立 Selection Speech controller／hook 降低耦合。

## 13. Related Documents and Update Triggers

- `documents/implements/F56-speak-selected-reader-text.md`：選取入口、Selection 驗證與原本裝置
  Web Speech 行為的歷史規格；章節播放後端已由 F57 取代。
- `documents/implements/F57-ai-selection-speech.md`：目前 AI Voice 功能需求、驗收與實作紀錄。
- `documents/modules/annotation.md`：Selection 擷取、標記模式共存與 Selection Speech 交界。
- `documents/modules/data-backup.md`：備份不包含全域設定、credential 或暫態音訊。

變更 voice／tone、OpenAI model／format、credential 保存、IPC capability、成本門檻、分段、
快取、播放生命週期、學習項目發音邊界或錯誤分類時，必須同步更新本文件與 F57 實作紀錄。
