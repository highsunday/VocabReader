---
title: 閱讀測驗與區段練習模組
module: reading-comprehension-quiz
status: active
last_updated: 2026-08-03
related_implements:
  - F17-reading-segment-comprehension-quiz
  - F18-use-reading-comprehension-skill
  - B04-use-language-setting-for-reading-quiz
  - B05-use-quiz-language-for-open-ended-answers
  - F23-interactive-reading-practice-paper
  - F49-segment-retelling-practice
---

# 閱讀測驗與區段練習模組

## 1. Purpose

本模組實作兩種互補的區段理解活動：**區段練習（Segment Practice）**以閱讀測驗確認理解，**區段復述練習（Segment Retelling Practice）**則讓使用者以原文語言自由重新組織目前 START／END **閱讀區段**。兩者都在 **AI 對話面板**的產生訊息內展開並由同一 **AI 對話**批改。

區段練習用來確認當下理解與練習書面輸出。它不是**複習回合**、不使用到期項目、不建立 Anki 式排程，也不更新學習項目的下次複習時間。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 閱讀頁右側提供紙張造型「閱讀測驗」入口，與「解釋標記」使用相同停用條件。
- 每次點擊都附上最新閱讀區段，即使相同區段先前已在對話提供過。
- 不要求閱讀區段含標記；`<reader-annotation>` 只視為閱讀器 markup，不縮小出題範圍。
- 先估計 CEFR 與主要難點，再依長度與複雜度產生 8–12 題四選一及 1–3 題問答題。
- 第一輪不揭露答案、解析、提示或問答題參考回答。
- AI 以受限 JSON artifact 回傳題目；Renderer 安全驗證後在對應 AI 訊息下方顯示可點擊試卷產物，不自動打斷閱讀。
- 使用者點擊試卷產物後，試卷直接在原 AI 訊息內展開，寬度跟隨 AI 對話欄，不使用浮動面板也不遮住閱讀原文。
- 使用者可隨時收起整份試卷並再次展開；本次工作階段內已填的答案會保留。
- 試卷採 280–640px AI 對話欄的窄欄優先版面：精簡標題、可展開的本卷重點、即時作答進度、獨立題目卡與至少 48px 的答案點擊區。
- 試卷的題名、重點、題目、選項、問答輸入、批改回饋與總結沿用全域 AI 對話文字大小；進度、題號、CEFR、狀態標籤與操作按鈕維持固定尺寸。
- 所有選項固定單欄並依 A、B、C、D 由上到下排列，不因試卷變寬切成雙欄；鍵盤焦點、已選答案與已完成題目皆有可辨識狀態。
- 使用者直接點選 A–D、輸入問答題並一次提交完整答案；未完成所有題目時不可提交。
- 試卷在送出後鎖定答案並顯示批改中狀態；skill 以 matching grade artifact 回傳逐題批改與 final review。
- 完整批改以紅筆批註風格顯示在原題旁；總結預設只顯示分數與摘要列，閱讀理解、書面表達及複習重點可另外展開。不完整、格式錯誤或 quiz id 不相符的 artifact 不會被視為完成。
- 題目、問答題預期作答語言及批改共同遵守全域**講解語言**，直接引文保留原文。
- 題目與批改 artifact 隨 AI 訊息保存在對話文字中；Renderer 作答狀態不另做跨啟動持久化。
- 閱讀頁另提供「Retelling practice」入口；AI 判斷閱讀區段的主要原文語言並產生單一自由文字框，不提供主旨、細節、句數或字數提示。
- 復述批改依序顯示具體理解／遺漏／語言改善意見、**基礎修正版**、只補入少量原文細節的**進階優化版**，以及正確度、完整度、原文語言表達各 0–5 分的**復述評分**。
- 第一次批改後可用空白文字框再復述一次；第二次顯示兩次分數差異，同一練習不提供第三次作答。
- 復述卡沿用閱讀測驗的紙張、折疊、紅筆批改與窄欄視覺語言；原文始終保持可見，也不記錄使用者是否查看。

## 3. Inputs and Preconditions

`SendChatMessageInput` 的測驗 turn 包含：

- `text: "開始閱讀測驗"`
- `intent: "practiceReading"`
- `explanationLanguage: source | zh-TW | en | ja`
- 可選的書名與章節名稱
- 當下 `<reading-segment>`

復述 preparation turn 使用相同有限 context，但 intent 為 `practiceRetelling`；原文主要語言決定作答語言，`explanationLanguage` 只決定作答提示、批改說明、分數理由與比較所使用的講解語言。

Renderer 只在閱讀模式、Codex ready、沒有 active turn 且沒有對話管理操作時提供入口。測驗範圍只由 START／END 決定，不使用滑鼠暫時反白，也不回退為整章。

## 4. End-to-End Flow

1. 使用者調整 START／END，形成非空閱讀區段。
2. Renderer 以 `annotatedReadingSegment()` 安全序列化目前區段；標記可存在，但不是前置條件。
3. 使用者點擊「閱讀測驗」；Renderer 傳送 `practiceReading`、最新區段與目前講解語言。
4. IPC 驗證 intent、語言及 context 型別。
5. `composeCodexInput()` 加入 `$practice-reading-comprehension`、Quiz language、問答題 Answer language、無句數限制與區段外內容禁止規則。
6. `turn/start.input` 加入固定 `practice-reading-comprehension` skill item。
7. Skill 建立第一輪測驗，並在 `reading-practice-quiz` fenced JSON artifact 中提供固定 schema。
8. Renderer 只在 artifact 完整通過驗證後顯示試卷；串流中的半份 JSON、缺欄位或不合法選項安全忽略。
9. 使用者在試卷完成所有題目後提交；Renderer 以固定 `$submit-reading-practice`、quiz id、題目 id 與答案格式送入同一 AI 對話。
10. Thread 已載入的 developer instructions 對該測驗答案延續評量 workflow，即使答案 turn 沒有再次加入 skill item。
11. Skill 在 `reading-practice-grade` artifact 提供完整逐題結果與 final review；Renderer 驗證 quiz id 與每題覆蓋後顯示紅筆批註。

出題或批改不會推進 START／END、修改標記、建立學習項目或更新複習排程。

復述流程與此平行：Renderer 送出 `practiceRetelling` 與最新區段；固定 skill 以 `reading-retelling-task` artifact 提供原文語言與作答提示；使用者以 `$submit-segment-retelling` 提交 attempt 1，AI 回傳 matching `reading-retelling-grade`；第一次完成後可建立空白 attempt 2，第二份 grade 另含兩次分數比較。Parser 會拒絕錯誤 practice id、跳號 attempt、0–5 之外分數及加總不一致的結果。

## 5. Quiz Creation Contract

### 難度評估

- 先估計文章約略 CEFR A1–C2。
- 簡述主要難點，例如詞彙、句構、抽象概念或隱含意思。

### 選擇題

- 依文章長度與複雜度建立 8–12 題。
- 每題固定 A、B、C、D 四個選項，且只有一個最佳答案。
- 平衡使用主旨、重要細節、上下文詞彙、推論、作者態度／目的、改寫，以及有用時的文法或句型。
- 錯誤選項應合理，但不得設陷阱或考不重要細節。

### 問答題

- 依文章長度與複雜度建立 1–3 題。
- 可要求解釋、摘要、比較、提出相關個人意見，或把文中概念套用到真實／想像情境。
- 不限制回答句數，也不因回答本身較短或較長而批評；重點是清楚、切題且表達完整。

### 第一輪保密

在使用者作答前，不提供正確答案、解析、提示、範例答案或問答題參考回答。選擇題答案邀請使用 `1A 2B 3C` 等精簡格式。

## 6. Grading and Final Review Contract

### 選擇題

- 正確答案：簡短說明為何正確。
- 錯誤答案：提供正解、正解理由、所選答案錯因、文章證據、重要詞語與一項可遷移作答策略。

### 問答題

- 評估是否清楚切題。
- 修正文法、詞彙、拼字與用字，並解釋重要錯誤。
- 提供貼近原意的修正版，以及確實有幫助時才提供較自然流暢版本。
- 保留使用者原意與個人語氣，指出一個可學習的表達或句型。

### Final review

- 選擇題分數。
- 閱讀理解簡評。
- 指定回答語言的書面表達簡評。
- `Original | Correction | Reason | Useful pattern` 對應語言的修正表。
- 3–5 個值得複習的詞彙、表達或文法點。
- 一項實用改進建議。

## 7. Language Behavior

Main Process 將同一個 `explanationLanguage` 映射值同時提供給 `Quiz language` 與 `Answer language for open-ended questions`：

| 設定值 | 題面、問答題回答與批改 |
|---|---|
| `source` | 使用目前閱讀區段的原文語言 |
| `zh-TW` | 繁體中文 |
| `en` | English |
| `ja` | 日本語 |

所有問答題本文也使用指定題面語言。只有直接引用閱讀區段、作為證據或學習對象所必需的原文保留來源語言。

## 8. Interactive Paper Contract

- 點擊「閱讀測驗」只開始 AI 出題；有效 quiz artifact 到達後，對應 assistant 訊息下方顯示含標題、題數與作答狀態的試卷產物元件。
- 同一試卷元件在收合摘要卡與訊息內展開試卷之間切換；不使用 fixed／absolute 浮動定位、modal backdrop 或獨立寬度。
- 試卷顯示題名、CEFR、難點、選擇題與問答題；選擇題同題只能選一個 A–D，問答題使用多行輸入。
- 標題區直接顯示題名、題數、CEFR 與題型數量；長難度說明預設收在「本卷重點」，避免壓縮作答區。
- 頂部進度條依非空答案即時顯示已完成題數；已有完整 grade artifact 時顯示全部完成。
- 每題使用獨立卡片；答案點擊區至少 48px，選項具可見 hover、keyboard focus 與 selected 狀態，完成題目的題號另有狀態提示。
- 選項在所有試卷寬度都固定單欄並依 A、B、C、D 由上到下排列，避免長文字在雙欄中被擠壓。
- 「收起試卷」或 Escape 可回到摘要卡；同一產物元件可重開並保留元件工作階段內的答案。
- 所有題目作答完成前提交停用並顯示未作答數；送出成功後答案鎖定，防止重複提交。
- grade artifact 必須和最新 quiz artifact 使用相同 quiz id，且恰好覆蓋每一道選擇題與問答題，才顯示批改完成。
- 批改總結預設收合，只在精簡列顯示分數；展開後才顯示閱讀理解、書面表達與複習重點。
- 紅筆批註只顯示 AI 可提供給學習者的結果、正解、理由、修正與總結，不顯示模型內部推理。

## 8A. Segment Retelling Contract

- task artifact 只提供標題、practice id、主要原文語言與講解語言撰寫的作答提示，不得洩漏主旨、摘要或範例答案。
- 作答區只有一個大型多行文字框；答案非空才可提交，收合與重開保留本次工作階段草稿。
- 批改先呈現正確理解、內容修正、重要遺漏與語言改善，再呈現基礎修正版、進階優化版與分項分數。
- 基礎修正版修正內容誤解及語言問題，但盡量保留使用者已正確的原意與寫法；進階優化版只從基礎版前進一步，不能變成完整標準答案。
- 三項分數皆為 0–5 整數，總分必須等於三項加總；第二次 grade 的每個 delta 必須等於 attempt 2 減 attempt 1。
- 第一次 grade 後只提供一次 Retell again；第二次從空白開始且保留第一次結果，完成後不提供第三次。

## 9. Dependencies and Boundaries

| Dependency | What this module uses |
|---|---|
| `annotation`／`reading-range` | START／END 區段與安全序列化；標記只作 markup |
| `skill-management` | 固定閱讀測驗／復述 skills 安裝、內嵌 instructions、marker gate 與隔離設定 |
| `ai-conversation` | 同一 thread 的出題、後續作答、串流、Markdown 與對話保存 |
| settings | 全域講解語言，以及 AI 對話／試卷可閱讀文字大小的讀取、驗證與持久化 |

本模組不擁有標記資料、題庫、學習項目、回答評估排程或間隔複習資料。它和解釋標記共用 context 與語言設定，但 `practiceReading` turn 不得注入標記解析 skill。

## 10. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/practice-reading-comprehension/SKILL.md` | CEFR、出題、答題格式、逐題批改、語言與 final review 契約 |
| `.agents/skills/practice-reading-comprehension/agents/openai.yaml` | Repo 內 skill 顯示 metadata |
| `.agents/skills/practice-segment-retelling/SKILL.md` | 原文語言判定、兩次復述、雙版本修正、三項評分與比較契約 |
| `apps/desktop/src/renderer/App.tsx` | 「閱讀測驗」入口、最新區段與講解語言送出 |
| `apps/desktop/src/renderer/ReadingPracticePaper.tsx` | AI 訊息內的可折疊試卷、答案狀態、提交鎖定與紅筆批註 |
| `apps/desktop/src/renderer/reading-practice-artifact.ts` | quiz／grade schema 驗證、最新 artifact 選取與答案格式化 |
| `apps/desktop/src/renderer/SegmentRetellingPractice.tsx` | 與閱讀測驗一致風格的自由作答、兩版回饋、分數及二次復述元件 |
| `apps/desktop/src/renderer/segment-retelling-artifact.ts` | task／grade schema、attempt 順序、分數加總、比較 delta 與提交格式驗證 |
| `apps/desktop/src/renderer/reading-range.ts` | START／END 閱讀區段安全序列化 |
| `apps/desktop/src/renderer/styles.css` | 試卷窄欄排版、相對字級、控制尺寸與 container query |
| `apps/desktop/src/shared/chat-contracts.ts` | `practiceReading`／`practiceRetelling` intents 與 context 型別 |
| `apps/desktop/src/main/chat-ipc.ts` | intent、語言與 context 白名單驗證 |
| `apps/desktop/src/main/chat-controller.ts` | marker、題面／回答語言、固定 skill item 與後續 workflow gate |
| `apps/desktop/src/main/bundled-skill.ts` | 閱讀理解 skill 的 runtime 安裝 |

## 11. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/renderer/App.test.tsx` | 按鈕、無標記可用、每次附最新區段、語言設定與 payload |
| `apps/desktop/src/renderer/ReadingPracticePaper.test.tsx` | A–D 單選、問答輸入、作答進度、窄欄資訊層級、全寬度單欄樣式契約、完整提交、鎖定、Escape 與紅筆批註 |
| `apps/desktop/src/renderer/reading-practice-artifact.test.ts` | 串流／錯誤 JSON 隔離、quiz id／逐題覆蓋、最新 artifact 與提交格式 |
| `apps/desktop/src/main/chat-ipc.test.ts` | `practiceReading` 與講解語言白名單 |
| `apps/desktop/src/main/chat-controller.test.ts` | marker、固定 skill item、四種題面／回答語言、一般／解析 turn 隔離及後續 workflow 指令 |
| `apps/desktop/src/main/reading-comprehension-skill.test.ts` | CEFR、8–12／1–3、題型、錯題回饋、雙版本修正、final review 與語言 rubric |
| `apps/desktop/src/main/segment-retelling-skill.test.ts` | 自由作答、原文／講解語言、兩版修正、三項評分及兩次上限契約 |
| `apps/desktop/src/main/bundled-skill.test.ts` | runtime 安裝、略過相同內容及原子更新 |
| `apps/desktop/src/renderer/SegmentRetellingPractice.test.tsx` | 紙張風格、單一文字框、提交鎖定、回饋順序、草稿保留、二次作答及比較 |
| `apps/desktop/src/renderer/segment-retelling-artifact.test.ts` | task／grade 串流容錯、id／attempt、分數範圍、總分、delta 與提交格式 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | production Electron runtime 中的閱讀理解 skill，以及 AI 字體設定套用至試卷可閱讀內容 |

## 12. Known Limitations and Follow-up

- 不把使用者尚未提交的答案做跨啟動持久化；關閉 App 後不保留作答草稿。
- 不建立獨立題庫、成績資料表或歷史趨勢；結構化 artifact 仍是 AI 對話文字的一部分。
- 題數與難度由 skill 自行判斷，沒有使用者設定或可重現的固定演算法。
- quiz id 只存在 AI 訊息 artifact 與提交文字中，不是獨立持久化領域資料；同一對話混入不相關內容時仍主要依 developer instruction gate 約束。
- 試卷沒有獨立字體設定；它刻意沿用 AI 對話文字大小，避免同一 AI 訊息內出現兩套閱讀尺度。
- 復述未提交草稿只存在目前 Renderer 工作階段；沒有獨立歷史頁或長期成績趨勢。
- Renderer `App.tsx` 同時協調閱讀範圍、兩個 AI presets、設定與對話，功能繼續增加前宜評估拆分。

## 13. Related Documents

- `CONTEXT.md`
- `documents/modules/annotation.md`
- `documents/modules/reading-range.md`
- `documents/modules/skill-management.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/F17-reading-segment-comprehension-quiz.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/F23-interactive-reading-practice-paper.md`
- `documents/implements/B04-use-language-setting-for-reading-quiz.md`
- `documents/implements/B05-use-quiz-language-for-open-ended-answers.md`
- `documents/implements/F25-adjustable-reading-and-conversation-font-sizes.md`
- `documents/implements/F49-segment-retelling-practice.md`

變更題數、題型、答案揭露時機、作答／批改語言、後續評量 workflow、preset intent 或 skill marker 時，必須同步更新本文件及 `skill-management`、`ai-conversation` 模組文件。
