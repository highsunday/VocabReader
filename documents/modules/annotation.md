---
title: 持久標記與 AI 標記解析模組
module: annotation
status: active
last_updated: 2026-08-09
related_implements:
  - F13-persistent-annotations-and-ai-analysis
  - F14-sticky-annotation-tool
  - F15-polish-annotation-tool-ui
  - F16-invoke-annotation-explanation-skill
  - F17-reading-segment-comprehension-quiz
  - B03-load-only-bundled-annotation-skill
  - B04-use-language-setting-for-reading-quiz
  - F18-use-reading-comprehension-skill
  - B05-use-quiz-language-for-open-ended-answers
  - F25-adjustable-reading-and-conversation-font-sizes
  - F38-export-and-restore-data-backup
  - F56-speak-selected-reader-text
  - F57-ai-selection-speech
---

# 持久標記與 AI 標記解析模組

## 1. Purpose

本模組讓使用者在 EPUB 章節原文上建立持久的**標記（Annotation）**，並在右側目前選取的 AI 對話中，以預設動作「講解標記內容」要求 AI 解讀，或以「閱讀測驗」進行**區段練習**。標記代表使用者主動指出的困難文字；START／END **範圍標籤（Range Marker）**只界定 AI 可讀的上下文邊界，兩者是不同領域概念。

章節文字選取也支援暫態的**選取朗讀（Selection Speech）**。使用者先在 AI Voice 設定
套用自己的 OpenAI API key、角色與語氣，之後可串流播放選取的單字、句子或連續段落。
它不保存選取本文、不建立標記，也不加入 AI 對話上下文；只有使用者明確按下朗讀時才把
該次選取本文送至 OpenAI。標記模式仍可在自動建立標記後接續朗讀同一份暫存文字。
學習項目詳情中的發音不屬於 Selection Speech，仍使用裝置 Web Speech。

標記的資料模型、保存與序列化仍以本文件為主；兩個 AI 預設 workflow 的細節分別記錄於 `annotation-explanation.md` 與 `reading-comprehension-quiz.md`，App skills 的打包、安裝與隔離記錄於 `skill-management.md`。

AI 只取得 START／END 內的原文與標記交集。一般提問維持正常多輪問答；只有預設動作會要求 AI 自動判斷單字、片語或句子，並依該類型順序分組說明。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 章節閱讀頁的持續標記模式；開啟後可連續選取文字直接建立標記，再次點擊、切章或離開閱讀頁時關閉。
- 選取章節原文後，在選取範圍附近顯示 Pronounce 懸浮操作，並在既有右鍵功能選單提供 Pronounce selection；兩個入口都能播放單字、句子或連續段落。
- 選取朗讀使用已套用的 OpenAI AI Voice，提供 Cedar、Marin、Coral、Onyx 與 Learning、
  Natural、Calm、Expressive；以 24 kHz PCM 串流播放，長文自動切分，播放中可停止，新選取
  會取消舊播放，切章或離開閱讀頁也會取消。
- API key 由 OS secure storage 加密保存；Renderer 只取得是否已設定，key 不進一般設定、
  日誌或資料備份。未設定時直接開啟 AI Voice 設定，失敗時可重試，且不 fallback 到裝置語音。
- 標記模式自動建立標記並清除 DOM Selection 後，仍保留剛才的暫存文字與朗讀入口；朗讀不改變標記、START／END、書庫資料或 AI context。
- 閱讀內容右上角提供捲動時保持可見的緊湊螢光筆膠囊工具；以「標記／標記中」文字、右上角數量徽章（包含 `0`）、淡暖白與淡黃色單色呈現，不使用漸層，也不顯示額外操作提示。
- 選取原文後透過既有右鍵選單建立標記。
- 在標記上開啟右鍵選單後直接移除，不顯示確認視窗，也不改寫既有 AI 對話。
- 以章內純文字 `start`／`end` 保存標記，依書籍及章節持久化。
- 空白、章節外或與既有標記重疊的選取會靜默忽略；相鄰且不重疊的標記可分開建立。
- 以 `<reading-segment>` 包住閱讀區段，並以 `<reader-annotation id="A1">…</reader-annotation>` 依原語序標出區段內標記。
- START／END 或標記新增、移除後，下一則 AI 訊息會取得最新版本；一般未變追問不重傳相同上下文。
- 「講解標記內容」每次都附上當下區段，避免先前一般問答的上下文去重使解析意圖看不到標記。
- 「閱讀測驗」每次也附上當下區段，明確呼叫 App 內建閱讀理解 skill，依區段長度與複雜度產生 8 至 12 題四選一及 1 至 3 題問答題；題面、問答題回答與批改使用目前講解語言，不要求已有標記，第一輪不揭露答案、解析或提示。
- AI 解析明確呼叫 App 內建並安裝到 user data 的 `explain-reader-annotations` skill，固定依單字、片語、句子分組，同組依原文位置排列，並依標記本文用法提供 CEFR 與複習表；分類只存在於 AI 回覆，不回寫標記。
- 全域講解語言可選原文語言、繁體中文、English 或日本語，預設為原文語言並持久保存；後續標記解析、閱讀測驗題面、問答題回答要求及批改共用這項設定。

## 3. Domain Data and Invariants

### Annotation

| Field | Meaning |
|---|---|
| `id` | Renderer 建立的不可變章內識別碼；AI payload 會另依本次區段重新編為 A1、A2…… |
| `start` | 標記在安全章節純文字中的起始 offset，包含此位置 |
| `end` | 標記終止 offset，不包含此位置 |
| `text` | 建立當下的原文，用於保存與驗證／診斷 |

核心不變量：

- `0 <= start < end`，offset 必須是整數。
- `text` 不可為空。
- 同章標記不得重疊；`candidate.start < existing.end && candidate.end > existing.start` 即視為重疊。
- `end === next.start` 的相鄰標記合法。
- AI 分類不是標記資料的一部分。

`LibraryBook.chapterAnnotations` 以 `chapterId` 為鍵保存 `Annotation[]`。舊索引沒有此欄位時正規化為空集合；損壞項目與重疊項目在載入時安全排除。

## 4. Selection and Rendering Flow

1. 使用者開啟標記模式，或先選取原文再打開右鍵選單。
2. Renderer 確認 Selection 的 anchor／focus 都位於目前章節 `article`。
3. DOM 起終點轉為章內純文字 offset，反向選取會正規化，邊界空白會移除。
4. Renderer 先檢查空範圍與重疊；無效時不改狀態、不保存、不顯示訊息。
5. 有效選取建立標記並樂觀更新畫面，再呼叫窄化的 `library.saveAnnotations()`。
6. Main process 再次驗證書籍、章節、資料格式及非重疊條件，與閱讀狀態、閱讀範圍共用書庫的串行原子寫入。
7. Renderer 依 offset 將一或多個文字節點包成 `<mark data-annotation-id>`；重新渲染前先移除既有標示並還原文字節點，EPUB 安全內容本身不被持久修改。

### Selection Speech

1. 每次章節原文 mouseup 後，Renderer 沿用 `annotationRangeFromSelection()` 驗證 Selection 完整位於目前章節、移除邊界空白並取得完整本文。
2. 有效選取以 Range viewport rect 建立暫態本文與懸浮位置；空白、collapsed 或章節外選取不建立入口。
3. 一般模式只顯示 Pronounce；標記模式先保存合法標記並清除 DOM Selection，但暫態朗讀本文維持可用。
4. 右鍵功能選單重新讀取同一份有效 Selection，並同時提供 Pronounce selection 與既有範圍／標記操作。
5. 播放前確認 AI Voice 已套用；未設定時開啟 AI Voice 分頁，不呼叫 OpenAI 或裝置語音。
6. Renderer 經窄化 preload／IPC 只送出選取本文；Main Process 正規化並以 4096 字元上限
   依段落／句子邊界切分，固定使用 `gpt-4o-mini-tts`、已套用 voice／tone instructions 與 PCM。
7. Main Process 以 request ID 串流 PCM；Renderer 處理 16-bit little-endian sample、跨 chunk
   殘留 byte 與連續排程。request revision 和 request ID 共同隔離已取消的舊事件。
8. 播放自然結束、使用者停止、播放失敗、切章、離開閱讀頁或 App unmount 時清理播放狀態；
   auth 錯誤提供 Retry 與 AI Voice Settings，其他錯誤提供 Retry，均不阻斷閱讀或裝置 fallback。

## 5. AI Context Serialization

`annotatedReadingSegment(text, range, annotations)` 是標記版 AI 上下文的唯一序列化入口：

1. 先把 START／END 限制在章節文字範圍並移除區段邊界空白。
2. 只保留與區段相交的標記；跨界標記裁成區段內交集。
3. 依原文位置排序標記，重新配置只供本次 payload 使用的 `A1`、`A2`。
4. EPUB 原文中的 `&`、`<`、`>` 先轉成 entity，再插入閱讀器專屬標籤。
5. 區段外文字永遠不進入 payload；空區段不回退為整章。

範例：

```text
<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation> to admit <reader-annotation id="A2">that the plan had failed.</reader-annotation></reading-segment>
```

Renderer 以書籍、章節、START、END、標記 revision 與序列化區段建立上下文版本。普通訊息成功送出後，相同版本的普通追問可省略 context；保存或 bridge 送出失敗時不可把版本誤記為已提供。「講解標記內容」與「閱讀測驗」都是顯式預設動作，因此即使版本未變也會重新附上當下區段。

## 6. Trusted Preset Intents

Renderer 只能傳送型別化的 `intent: "explainAnnotations"` 與受限講解語言，不能提供任意系統 prompt 或 skill 路徑。Main process 以 `$explain-reader-annotations` 文字標記及型別化 skill input 明確注入 App 安裝在 user data 的固定 skill。該 skill 的解析規則為：

- 只把 `<reader-annotation>` 內文字視為標記。
- 自動判斷單字、片語、句子，固定依此順序分組，同組依原文順序排列。
- 句子可說明句型、文法與上下文語意。
- 每個標記依本文用法提供約略 CEFR；Meaning、Context、Grammar、Vocabulary、Examples、Synonyms、Common collocations、Pronunciation、Common mistakes、Easy paraphrase 等小節只在有助理解時使用；採用 Examples 時必須提供 3–5 個彼此不同、完整且自然的例句，不得只給 1 或 2 句。
- 回覆最後提供本次講解語言的精簡複習表。
- 不翻譯整段、不自行選取未標記文字。
- 沒有標籤時明確回覆目前沒有標記內容。
- 依 `source | zh-TW | en | ja` 決定本次講解語言。

Renderer 也可以傳送白名單內的 `intent: "practiceReading"` 與相同受限講解語言。Main process 加入 `$practice-reading-comprehension` marker 及指向 App user data 固定路徑的型別化 skill input。skill 先估計 CEFR，再依區段長度與複雜度產生 8 至 12 題 A–D 四選一及 1 至 3 題問答題，並在後續答案 turn 逐題批改與提供 final review。標題、題目、選項、問答題、作答說明、問答題預期回答及批改依 `source | zh-TW | en | ja` 使用原文語言、繁體中文、English 或日本語；直接引用閱讀區段時保留原文，問答題不限制句數。第一輪不揭露答案、解析、參考回答或提示。這個意圖不注入標記解析 skill，且標記只作為閱讀器邊界資訊，不改變出題範圍。

一般輸入沒有此 intent，即使上下文含標籤也只是正常 AI 問答。預設動作沿用目前右側 AI 對話及 Codex thread；空白對話仍在送出時才建立。

## 7. Settings Boundary

講解語言、字體、AI Voice 角色與語氣都是全域應用程式偏好，不屬於單本書、單章或單一
AI 對話。Main process 的 `LocalSettingsStore` 只把受限非敏感設定保存到 Electron user data
的 `settings/settings.json`，串行寫入 `.next` 再原子替換。AI Voice 預設為 Cedar／Learning。
OpenAI API key 則由獨立 credential store 使用 Electron `safeStorage` 加密保存；一般設定 API
只回傳 `hasApiKey`，不回傳原始 key。按下 Apply and preview 會先以候選設定播放固定短句，
成功後才提交；移除 key 時也會中止播放並清除 32 MiB 記憶體音訊快取。

講解語言只影響之後的「講解標記內容」以及「閱讀測驗」的題面、問答題回答要求與批改。兩項字體偏好只影響 AI 對話訊息正文與 EPUB 章節內容的呈現；三者都不修改介面語言、EPUB 原文或既有 AI 回覆內容。

## 8. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/library-contracts.ts` | `Annotation`、`chapterAnnotations` 與保存 API |
| `apps/desktop/src/main/library-service.ts` | 標記正規化、驗證、每章持久化與串行原子寫入 |
| `apps/desktop/src/main/library-ipc.ts` | `library:save-annotations` 窄化 IPC |
| `apps/desktop/src/renderer/reading-range.ts` | Selection offset、重疊判斷、原文標示與安全 AI 序列化 |
| `apps/desktop/src/renderer/App.tsx` | 標記模式、右鍵操作、狀態、AI context revision 與預設動作 |
| `apps/desktop/src/shared/settings-contracts.ts` | 講解語言、字體大小範圍及設定 API 型別 |
| `apps/desktop/src/main/settings-store.ts` | 全域偏好載入、降級與原子保存 |
| `apps/desktop/src/main/settings-ipc.ts` | 設定值 IPC enum、整數與範圍驗證 |
| `apps/desktop/src/shared/selection-speech-contracts.ts` | AI Voice 設定 snapshot、受限 IPC 與 stream event union |
| `apps/desktop/src/main/selection-speech-service.ts` | encrypted key、候選預覽、OpenAI TTS、長文切分、PCM stream、取消、錯誤與 32 MiB LRU |
| `apps/desktop/src/main/selection-speech-ipc.ts` | AI Voice 設定與選取朗讀的窄化 IPC 驗證 |
| `apps/desktop/src/preload/preload.ts` | Selection Speech invoke 與 unsubscribe-capable stream bridge |
| `apps/desktop/src/main/chat-controller.ts` | 兩個 App skills 的 instructions、marker gate、可信任標記解析與區段練習 input 組成 |
| `.agents/skills/explain-reader-annotations/SKILL.md` | 標記解析 workflow、動態講解語言、CEFR 與複習表規則 |
| `.agents/skills/practice-reading-comprehension/SKILL.md` | 閱讀測驗 CEFR、8–12／1–3 題、指定語言批改與 final review workflow |
| `apps/desktop/src/main/bundled-skill.ts` | 將 build 內嵌的 skill 安裝／更新到其他電腦的 user data runtime |
| `apps/desktop/src/renderer/styles.css` | 標記模式、原文標示與設定視窗樣式 |

`App.tsx` 持有選取朗讀的暫態本文、懸浮定位、AudioContext 排程與錯誤狀態；外部請求、
credential 與記憶體快取位於 Main Process，沒有 Reader Server 或 Codex App Server 邊界。

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/renderer/reading-range.test.ts` | 選取 offset、反向與空白正規化、重疊、revision、安全標籤與邊界裁切 |
| `apps/desktop/src/renderer/App.test.tsx` | 固定小工具、章節標記總數、模式、連續建立、切章隔離、右鍵建立／移除、靜默重疊、上下文刷新／去重、預設解析、區段練習及語言設定 |
| `apps/desktop/src/main/library-service.test.ts` | 跨章保存、移除、舊索引相容、無效與重疊資料 |
| `apps/desktop/src/main/library-ipc.test.ts` | 標記 IPC 路由與輸入驗證 |
| `apps/desktop/src/main/settings-store.test.ts` | 預設、保存、舊檔相容與逐欄損壞／未知值降級 |
| `apps/desktop/src/main/settings-ipc.test.ts` | 設定 IPC 路由、enum、整數與範圍驗證 |
| `apps/desktop/src/main/selection-speech-service.test.ts` | 加密 credential、候選預覽／回滾、長文切分、PCM stream、取消、錯誤分類與 LRU |
| `apps/desktop/src/main/selection-speech-ipc.test.ts` | AI Voice 設定、播放、取消 IPC 與輸入白名單 |
| `apps/desktop/src/main/chat-controller.test.ts` | 一般 context、兩個 App skills 載入與其他 skills 隔離、既有 thread 恢復、空標記、四種講解語言與型別化 skill input 契約 |
| `apps/desktop/src/main/reading-comprehension-skill.test.ts` | 閱讀理解 skill 的 CEFR、題型、題數、批改、語言與 final review rubric |
| `apps/desktop/src/main/bundled-skill.test.ts` | 兩份 App 內建 skills 的首次安裝、無變更略過與升級替換 |
| `apps/desktop/src/main/chat-ipc.test.ts` | 標記解析／區段練習 intent 與講解語言白名單 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | preload 白名單、設定選項與 Electron 啟動回歸 |

`App.test.tsx` 另覆蓋選取朗讀的懸浮與右鍵入口、跨文字節點本文、未設定導向、PCM 排程、
停止與取代、舊 request 隔離、標記模式共存、切章清理、無效選取、auth retry／settings 及
無裝置語音 fallback；Electron E2E 驗證 production preload、AI Voice 設定與安全 Electron 啟動。

## 10. Constraints and Follow-up

- 第一版不支援重疊、巢狀、顏色、手動分類、筆記或標記清單。
- 標記依保存時原文 offset 定位；EPUB 內容本身變更時不做文字錨點遷移。
- AI 分類及 Markdown 回覆不轉成結構化資料，也不建立生詞或 Anki 學習項目。
- 標記會隨完整書庫進入資料備份並可完整還原；不提供個別標記匯出、合併、搜尋、
  自動同步或復原／重做。
- Renderer 的 `App.tsx` 目前同時協調閱讀範圍、標記、AI 對話與設定；功能繼續擴張前宜另開 RXX 拆分協調邊界。
- 選取朗讀只提供四個固定 OpenAI voice 與四種受限語氣，不提供任意 prompt、model、endpoint、
  自訂語音／複製、逐字高亮、播放進度、暫停後續播、朗讀歷史或音訊匯出；音訊不寫磁碟。

## 11. Related Documents

- `CONTEXT.md`
- `documents/modules/book-library.md`
- `documents/modules/reading-range.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/skill-management.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/implements/F13-persistent-annotations-and-ai-analysis.md`
- `documents/implements/F14-sticky-annotation-tool.md`
- `documents/implements/F15-polish-annotation-tool-ui.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/B03-load-only-bundled-annotation-skill.md`
- `documents/implements/B04-use-language-setting-for-reading-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/B05-use-quiz-language-for-open-ended-answers.md`
- `documents/implements/F25-adjustable-reading-and-conversation-font-sizes.md`
- `documents/implements/F38-export-and-restore-data-backup.md`
- `documents/implements/F56-speak-selected-reader-text.md`
- `documents/implements/F57-ai-selection-speech.md`
- `documents/modules/data-backup.md`

變更標記資料、不重疊規則、Selection offset、選取朗讀、AI 序列化、預設 intent 或講解語言時，必須同步更新本文件與相關 FXX 實作紀錄。
