---
author: Codex
date: 2026-08-09
title: 使用可套用的 AI 語音設定朗讀章節選取內容
uuid: ae0e08f8-ba44-4073-acfa-02d8328b5bb5
version: 1.2.0
status: implemented
---

# Feature Specification - 使用可套用的 AI 語音設定朗讀章節選取內容

## 1. Feature Overview

F56 已讓使用者從章節原文的懸浮操作或右鍵選單朗讀完整文字選取，但播放由裝置的
Web Speech API 提供，聲音品質、節奏與裝置差異較大。本功能將**選取朗讀**改為使用
OpenAI `gpt-4o-mini-tts` 產生自然英文語音，並讓使用者在 Settings 的獨立 **AI Voice**
分頁提供自己的 API key、選擇語音角色與語氣，明確套用且通過預覽後才啟用。

本功能只取代章節原文的選取朗讀。**學習項目**詳情中的發音按鈕維持既有裝置語音，
不使用 API key、AI 語音設定或外部語音服務。

## 2. Requirements (User Story)

- **As a** 閱讀英文原文的語言學習者
- **I want** 先套用自己的 AI 語音角色與語氣，再以該設定朗讀選取的句子或段落
- **So that** 我能聽見較自然且一致的原文節奏與語調，同時自行控制 API 憑證與費用

## 3. Confirmed Product Rules

### 3.1 AI Voice 設定與套用

- Settings 新增獨立 `AI Voice` 分頁，包含密碼型 API key 欄位、角色、語氣、設定狀態、
  預覽／套用、移除 key 與非敏感費用提示。
- 第一組設定必須輸入 API key；既有 key 已設定時，可以只更換角色或語氣。
- 按下 `Apply and preview` 後，以候選 key、角色與語氣產生固定短句預覽；只有 API 呼叫
  成功且取得可播放音訊時，候選設定才成為已套用設定。失敗時保留原本已套用設定。
- 套用成功後清空 Renderer 中的 key 輸入內容，只顯示 `API key configured`；Main Process
  不得把原始 key 回傳給 Renderer。
- API key 以作業系統安全儲存能力加密保存，不得寫入一般 `settings.json`、日誌、錯誤訊息、
  AI 對話或資料備份。安全儲存不可用時不得降級成明文保存。
- 使用者可以更換或移除 key；移除後選取朗讀立即回到未設定狀態，非敏感的預設角色與
  語氣仍可顯示於表單。
- 設定畫面與播放狀態必須清楚揭露語音由 AI 生成，並提示使用的是使用者自己的 OpenAI
  API 額度。

### 3.2 角色與語氣

角色固定提供四個易辨識選項：

| UI label | OpenAI voice | 產品描述 |
|---|---|---|
| Clear & Steady | `cedar` | 清楚沉穩，預設角色 |
| Warm & Natural | `marin` | 自然溫暖 |
| Bright & Friendly | `coral` | 明亮親切 |
| Deep & Narrative | `onyx` | 低沉敘事 |

語氣固定提供四個受限 preset；Renderer 只傳 enum，Main Process 負責映射成固定英文
instructions：

| Tone | 行為 |
|---|---|
| Learning | 稍慢、咬字清楚、保留自然句子重音，預設語氣 |
| Natural | 一般自然英文閱讀速度與節奏 |
| Calm | 平穩柔和，在標點處自然停頓 |
| Expressive | 較有敘事情緒與動態，但不誇張 |

### 3.3 選取朗讀入口與未設定狀態

- F56 的 `Pronounce` 懸浮操作與 `Pronounce selection` 右鍵選單入口維持不變，仍只接受
  目前章節內的有效非空白選取。
- 尚未套用有效 AI Voice 設定時，入口仍顯示；使用者按下後不呼叫裝置語音或外部服務，
  而是顯示 `Set up AI Voice in Settings` 並直接開啟 Settings 的 AI Voice 分頁。
- 已套用設定時，兩個入口使用相同的 OpenAI TTS 流程與當次選取本文。
- 選取朗讀只在使用者明確按下播放時傳送該次選取文字，不會因選取、建立標記或開啟
  Settings 自動送出。

### 3.4 串流、分段、停止與錯誤

- Main Process 固定呼叫 OpenAI Speech API 的 `gpt-4o-mini-tts`；Renderer 不直接連線，
  也不取得 API key。
- 選取朗讀使用低延遲 PCM 串流；取得第一批有效音訊後即可開始播放，不等待完整文字全部
  生成。預覽可以使用適合一次性播放的 WAV。
- 正規化後超過 1200 字元的長選取，在任何 Speech API 呼叫前先顯示費用警告，包含選取
  字元數及使用 OpenAI API 額度的提示。只有使用者明確選擇繼續產生才可開始請求；取消
  或關閉提示時不得呼叫 Speech API。
- 每個 Speech API 片段最多 1000 字元；更長文字依段落、句末標點、其他標點及空格的
  優先順序切分，依原順序連續串流，且不得靜默截斷本文。1000 字元位於使用者指定的
  800–1200 字元成本控制區間內。
- 播放中按鈕顯示停止狀態；停止、開始新選取朗讀、切換章節、離開閱讀頁或 App unmount
  時，中止目前網路請求、PCM 播放及所有尚未開始的片段。
- 斷網、認證／額度、服務或播放錯誤不自動退回裝置語音。介面保留當次選取與入口，顯示
  可理解的錯誤及 `Retry`；認證相關錯誤另提供 `Open AI Voice Settings`。
- 錯誤訊息不得包含 API key、Authorization header 或未受限的供應商 response body。

### 3.5 暫態音訊快取

- 完全相同的正規化文字、角色、語氣及模型在同一次 App 開啟期間可重用已產生音訊，避免
  重複 API 費用。
- 快取只存在 Main Process 記憶體，不寫入硬碟、書庫、學習資料、設定或備份；key 使用
  不可反推原文的摘要，不以完整選取本文當 Map key。
- 快取總音訊上限為 32 MiB，採 least-recently-used 淘汰；正在播放的項目不可在播放期間
  被淘汰。單筆大於上限時可播放但不加入快取。
- 關閉 App 後快取自然清除。切章不要求清除快取，但選取本文本身不得另行持久保存。

### 3.6 學習項目邊界

- `LearningLibraryWorkspace` 的學習項目發音維持既有 `speechSynthesis`、英文裝置 voice、
  `rate 0.85` 與 `pitch 1`。
- AI Voice 設定、API 錯誤、移除 key、選取朗讀停止或快取都不得改變學習項目發音。

## 4. Acceptance Criteria

- **Scenario 1：安全套用第一組 AI Voice 設定**
  - **Given** 尚未設定 API key
  - **When** 使用者貼上 key、選擇角色與語氣並按 Apply and preview
  - **Then** Main Process 以候選設定產生並播放預覽
  - **And** 成功後加密保存 key、套用非敏感偏好並只回傳已設定狀態

- **Scenario 2：預覽失敗不覆寫已套用設定**
  - **Given** 已有可用 AI Voice 設定
  - **When** 使用者以無效新 key 或失敗設定套用
  - **Then** 顯示不洩漏憑證的錯誤
  - **And** 原本 key、角色及語氣仍為已套用設定

- **Scenario 3：未設定時導向 AI Voice**
  - **Given** 沒有已套用 API key
  - **When** 使用者從任一選取朗讀入口要求播放
  - **Then** 不呼叫 Speech API 或 Web Speech API
  - **And** 開啟 Settings 的 AI Voice 分頁並顯示設定提示

- **Scenario 4：串流播放完整選取**
  - **Given** AI Voice 設定已套用
  - **When** 使用者朗讀一段有效選取
  - **Then** Main Process 只傳送該次選取及受限 voice／instructions 給 Speech API
  - **And** Renderer 從首批 PCM 開始播放，顯示 AI-generated voice 狀態

- **Scenario 5：長選取先警告再分段**
  - **Given** 正規化後的選取文字超過 1200 字元
  - **When** 使用者要求選取朗讀
  - **Then** 在零 Speech API 呼叫的狀態下顯示字元數與 API 額度警告
  - **And** 只有明確確認後才把本文切成不超過 1000 字元的合法片段依序播放
  - **And** 所有非空白原文都被播放，不被截斷或重排

- **Scenario 6：停止與新播放取代舊播放**
  - **Given** 音訊仍在下載、分段或播放
  - **When** 使用者停止、開始另一段、切章或離開閱讀頁
  - **Then** 目前請求、聲音及剩餘佇列全部取消
  - **And** 舊事件不得覆寫較新的播放狀態

- **Scenario 7：失敗時保留 AI 邊界**
  - **Given** 發生斷網、認證、額度或服務錯誤
  - **When** 選取朗讀失敗
  - **Then** 顯示 Retry 與適當設定入口
  - **And** 不自動播放裝置語音、不洩漏 key、不阻斷閱讀與標記工具

- **Scenario 8：記憶體快取有界重用**
  - **Given** 相同文字、角色與語氣已成功產生音訊
  - **When** 同一次 App 開啟期間再次播放
  - **Then** 直接重用記憶體音訊而不呼叫 API
  - **And** 快取超過 32 MiB 時依 LRU 淘汰且不寫入硬碟

- **Scenario 9：學習項目發音不變**
  - **Given** 任意 AI Voice 設定狀態
  - **When** 使用者在學習項目詳情按發音
  - **Then** 仍由裝置 Web Speech API 朗讀項目標題
  - **And** 不呼叫 OpenAI Speech API

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 初次套用成功 | 無 key；Speech API 成功 | 貼 key、選 Cedar／Learning 並套用 | 播放預覽；回傳 masked status；加密保存 | Critical |
| TC2 | 更換角色／語氣 | 已有 key | 不重貼 key，改 Marin／Calm 並套用 | 使用既有 key 預覽並套用新偏好 | High |
| TC3 | 套用失敗回滾 | 已有有效設定 | 用無效候選 key 套用 | 顯示安全錯誤；原設定仍有效 | Critical |
| TC4 | 移除 key | 已有設定 | 明確移除 | 憑證刪除；選取朗讀成為未設定 | Critical |
| TC5 | 未設定入口 | 無 key且有有效選取 | 點懸浮／右鍵朗讀 | 開啟 AI Voice tab；零 TTS／Web Speech 呼叫 | Critical |
| TC6 | PCM 串流 | 設定完成、API 分批回傳 | 點 Pronounce | 首批後開始播放；完成後回到可播放狀態 | Critical |
| TC7 | 長選取警告 | 正規化本文超過 1200 字元 | 點選取朗讀 | 顯示字數／額度警告；確認前零 API 呼叫；取消維持零呼叫 | Critical |
| TC7a | 長文切分 | 本文超過 1000 字元且已確認 | 繼續產生 | 每片不超過 1000 字元、順序與合併本文一致、無截斷 | Critical |
| TC8 | 停止／取代 | 請求或播放進行中 | Stop 或播放新選取 | abort 舊請求、停止 sources、忽略 stale events | Critical |
| TC9 | 錯誤分類 | 401／429／斷網／5xx | 播放 | 安全訊息、Retry；認證錯誤有設定入口；無 fallback | High |
| TC10 | 快取命中 | 相同文字／voice／tone 已生成 | 再次播放 | 零 API 呼叫、直接串流 cached PCM | High |
| TC11 | 32 MiB LRU | 多筆音訊超過上限 | 加入新音訊 | 淘汰最久未用；單筆過大不快取；不寫檔 | High |
| TC12 | 標記模式共存 | 標記模式選取有效本文 | 自動標記後播放 | 標記照常保存；暫存本文送 TTS | Critical |
| TC13 | 生命週期取消 | 正在播放 | 切章／離開閱讀頁／unmount | 網路與聲音取消；狀態清理 | High |
| TC14 | 學習項目回歸 | AI key 有／無 | 點學習項目發音 | 仍呼叫 `speechSynthesis`；零 Speech API 呼叫 | Critical |
| TC15 | 安全儲存不可用 | OS encryption unavailable | 嘗試套用 | 拒絕保存並顯示錯誤；無 plaintext file | Critical |

## 6. Implementation Notes

- API key 使用獨立 credential store 與窄化 IPC；一般 `AppSettings` 只保存受限的 voice／tone
  或其他非敏感狀態，Renderer 只取得 `hasApiKey`／`configured`。
- 由 Main Process 組成 `Authorization: Bearer` 與固定 `gpt-4o-mini-tts` request。Renderer
  不得傳任意 model、instructions、endpoint 或 header。
- 選取朗讀 stream 使用 request ID 與白名單 event union；preload 只暴露 get settings、apply、
  remove key、start、cancel 及 unsubscribe-capable event listener。
- PCM 為 24kHz、16-bit signed little-endian mono；Renderer 必須處理跨 chunk 的殘留 byte、
  依序排程 AudioBufferSource，並把 API stream 完成與實際播放完成分開。
- Main Process 以 AbortController 管理每次朗讀與分段佇列。快取 key 至少包含正規化本文、
  model、voice、tone instruction revision；使用 SHA-256 等摘要避免以原文作索引鍵。
- 長文切分抽成純函式，使用 Unicode-aware 邊界並保證每段非空白、不超過 1000 字元，
  合併後等於正規化輸入。
- Renderer 以正規化後字元數判定長選取；警告只負責取得本次明確確認，不保存本文、不
  改變 AI Voice 設定，也不讓 Main Process 接受繞過既有 start IPC 的任意請求欄位。
- 預覽固定使用簡短英文學習句，不傳送 EPUB 內容；候選設定驗證成功前不得更新正式設定。

## 7. Affected Modules and Files

### Production code

- `apps/desktop/src/shared/settings-contracts.ts`
- `apps/desktop/src/shared/selection-speech-contracts.ts`（新增）
- `apps/desktop/src/main/settings-store.ts`
- `apps/desktop/src/main/settings-ipc.ts`
- `apps/desktop/src/main/selection-speech-service.ts`（新增）
- `apps/desktop/src/main/selection-speech-ipc.ts`（新增）
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/main/settings-store.test.ts`
- `apps/desktop/src/main/settings-ipc.test.ts`
- `apps/desktop/src/main/selection-speech-service.test.ts`（新增）
- `apps/desktop/src/main/selection-speech-ipc.test.ts`（新增）
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/src/renderer/learning-library-workspace.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documentation

- `CONTEXT.md`
- `documents/implements/F56-speak-selected-reader-text.md`
- `documents/implements/F57-ai-selection-speech.md`
- `documents/modules/annotation.md`

## 8. Assumptions and Non-goals

### Assumptions

- 第一階段仍是本機 Electron 桌面 App，API key 由單一裝置的使用者自行提供。
- 角色的男／女描述只屬主觀聽感；UI 使用聲音特色與 OpenAI voice 名稱，不宣稱官方性別。
- 使用 OpenAI API 的費用與 Codex 帳戶／額度分開；AI Voice 頁面會明確提示使用者自己的
  OpenAI API key 與用量。
- 「套用」表示預覽請求成功後才提交整組 key、角色與語氣；表單修改但未套用不影響播放。

### Non-goals

- 不改變學習項目發音。
- 不使用 Codex App Server 產生或轉送音訊。
- 不提供任意自訂 prompt、任意 OpenAI voice/model/endpoint 或自訂語音複製。
- 不提供磁碟音訊快取、朗讀歷史、音訊匯出、跨裝置同步或把 API key 放進資料備份。
- 不提供逐字高亮、播放進度拖曳或暫停後續播；第一版只提供開始、串流播放、停止與重試。
- 不保證離線 AI 朗讀，也不在 AI 失敗時自動降級成裝置朗讀。

### Open Questions

- 無阻擋實作的未決問題。

### 1.2 Cost guardrail extension

- 長選取警告門檻固定為正規化後大於 1200 字元；1200 字元本身可直接播放。
- Main Process 片段上限由 4096 調整為 1000 字元。
- 警告同時適用懸浮與右鍵選取朗讀入口；取消警告不會清除使用者目前的文字選取目標。
- 本次不加入可設定門檻、精確費用試算、每日預算或逐片播放 backpressure。

## 9. Implementation Record

### Status

Implemented on 2026-08-09. Cost guardrail extension implemented on 2026-08-10.

### Implementation Summary

- Settings 新增獨立 AI Voice 分頁，可貼入 OpenAI API key，選擇 Cedar、Marin、Coral、
  Onyx 與 Learning、Natural、Calm、Expressive，並以固定短句成功預覽後才原子套用。
- API key 由 Main Process 透過 Electron `safeStorage` 加密保存於獨立 credential file；一般
  settings、Renderer snapshot 與資料備份都不含原始 key，安全儲存不可用時拒絕明文降級。
- 新增受限的 Selection Speech contracts、IPC 與 preload bridge。Main Process 固定呼叫
  `gpt-4o-mini-tts`、固定 endpoint／instructions／PCM 格式，不接受 Renderer 自訂 request。
- 正規化後超過 1,200 字元的選取會先在原朗讀位置顯示字數、等待時間與 OpenAI 額度提醒；
  取消時不呼叫 API，只有明確按下 Generate voice 才繼續。1,200 字元本身可直接播放。
- 確認後，選取原文經正規化與最多 1,000 字元的邊界切分後串流；Renderer 將 24 kHz、
  16-bit little-endian PCM 依序排程播放，支援停止、取代、切章清理、舊事件隔離、錯誤重試
  與認證錯誤導回設定。
- 同一正規化本文、model、角色與語氣的音訊使用 Main Process 32 MiB 記憶體 LRU；不寫磁碟，
  移除 key 時立即清除，App process 結束後自然釋放。
- 尚未套用時，懸浮與右鍵入口會開啟 AI Voice 設定且不呼叫裝置語音；AI 失敗也不自動
  fallback。學習項目詳情仍完整保留既有 Web Speech 發音。

### Test Coverage and Results

- Red：AI Voice tab、設定套用表單、未設定導向與 AI PCM 選取播放測試，均先因功能不存在
  而失敗，再由最小實作逐項轉綠。
- `selection-speech-service.test.ts`：14/14 passed，覆蓋 encrypted credential、無 plaintext
  fallback、預覽後提交、失敗不覆寫、PCM stream、取消、長文切分、LRU、快取及
  auth／quota／network／service 安全錯誤分類。
- `selection-speech-ipc.test.ts`：7/7 passed，覆蓋設定／播放路由、白名單 enum、文字長度與
  request ID 驗證。
- `App.test.tsx`：88/88 passed；Selection Speech 案例覆蓋懸浮、右鍵、未設定導向、停止／
  取代、標記模式、生命週期、PCM 播放、auth retry／settings、無裝置語音 fallback，以及
  超過 1,200 字元時確認前／取消後零 API 呼叫、確認後才產生語音的成本警告。
- Desktop Vitest：42 files、439/439 passed；其中學習項目既有 Web Speech 回歸仍通過。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed；保留既有 renderer chunk-size warning。
- Electron Playwright E2E：2/2 passed，包含 production preload／IPC 與 AI Voice 設定 UI。
- `git diff --check`：passed。

### Hypotheses and Decisions

1. 首次 service 測試解析失敗不是產品行為，而是測試中的換行 type assertion 觸發 ASI；
   將 assertion 以括號包住後，測試才真正進入實作紅燈。
2. Unicode 句界 regex 初版在 character class 內錯誤跳脫雙引號，造成 parser failure；移除
   無效跳脫後，長文切分測試驗證合併本文不遺失；成本護欄延伸再把每段上限收斂至
   1,000 字元。
3. 串流採 PCM 而非 MP3，避免每個 network chunk 都需要容器解碼；Renderer 保留跨 chunk
   的單一殘留 byte，並把「API stream done」與「最後一個 AudioBuffer 播完」分開處理。
4. 套用必須先使用候選設定取得 WAV 預覽，再保存 key／voice／tone；若保存偏好失敗，則
   還原先前 credential，避免 UI 顯示與實際播放設定分裂。

### Changed Files

- 新增 `apps/desktop/src/shared/selection-speech-contracts.ts`。
- 新增 `apps/desktop/src/main/selection-speech-service.ts`、
  `selection-speech-service.test.ts`、`selection-speech-ipc.ts` 與
  `selection-speech-ipc.test.ts`。
- 更新 Main Process composition、settings contracts／store／IPC、preload 與 Renderer env。
- 更新 `App.tsx`、`App.test.tsx`、`styles.css` 與 Electron E2E。
- 更新 `CONTEXT.md`、F56 與 `documents/modules/annotation.md`，並新增
  `documents/modules/ai-voice.md` 作為 AI Voice／Selection Speech 的主要工程模組文件。

### Architectural Observations

- `App.tsx` 已同時承擔 Selection 擷取、標記、AI 對話、設定與串流音訊排程；本次可沿用
  既有 request revision／生命週期接縫安全完成，但下一次擴張朗讀控制時，宜以 RXX 抽出
  `useSelectionSpeech` 或獨立 controller，降低章節 UI 與 AudioContext／IPC 的耦合。
- Key、API request、快取與錯誤分類已集中在 Main Process service，未把外部服務細節擴散
  至 Annotation domain；這個邊界應保留。

## Appendix: TDD Implementation Checklist

1. 先為 credential store、設定套用／回滾、長文切分、串流、取消、錯誤分類及 32 MiB LRU
   建立 failing Main Process tests。
2. 完成受限 shared contracts、Main Process service／IPC 與 preload bridge，使服務測試轉綠。
3. 新增 Settings AI Voice tab、預覽、未設定導向、PCM 播放與選取入口 component tests。
4. 保留 F56 的 Selection 驗證、懸浮／右鍵入口、標記模式及生命週期語義，改以 AI stream
   取代 Web Speech，並讓目標 Renderer tests 轉綠。
5. 執行 Desktop tests、typecheck、build、Electron E2E 與 `git diff --check`。
6. 回填本文件 Implementation Record，標示 F56 的播放後端已由本文件取代，並同步
   `documents/modules/annotation.md`。
