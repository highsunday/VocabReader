<p align="center">
  <a href="README.md">English</a> · <strong>繁體中文</strong>
</p>

<h1 align="center">VocabReader</h1>

<p align="center">
  <strong>把每一次讀不懂，變成真正記得住、用得出的學習內容。</strong><br />
  VocabReader 是結合 EPUB 閱讀、AI 講解、生詞管理與主動練習的桌面 App。<br />
  從理解原文到間隔複習、造句與跟讀，不必在閱讀器、字典和卡片工具之間來回切換。
</p>

<p align="center">
  <img alt="Early Preview" src="https://img.shields.io/badge/status-early_preview-C66A32?style=flat-square" />
  <img alt="macOS and Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-315F4B?style=flat-square" />
  <img alt="Codex powered" src="https://img.shields.io/badge/AI-Codex_powered-315F4B?style=flat-square&logo=openai&logoColor=white" />
  <img alt="No API key for text AI" src="https://img.shields.io/badge/text_AI-no_API_key-315F4B?style=flat-square" />
  <img alt="Free and open source" src="https://img.shields.io/badge/app-free_%26_open_source-C66A32?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/highsunday/VocabReader/releases"><strong>下載 macOS／Windows 版本</strong></a>
  ·
  <a href="#主要功能"><strong>查看主要功能</strong></a>
  ·
  <a href="https://github.com/highsunday/VocabReader/issues"><strong>提供意見</strong></a>
</p>

![VocabReader 書庫中已匯入 Harry Potter and the Sorcerer's Stone 與 Harry Potter and the Chamber of Secrets](docs/readme-assets/library-overview.png)

## 讓閱讀真正累積成語言能力

閱讀原文最可惜的情況，不是遇到不會的字，而是當下查懂之後很快又忘記。一般閱讀器可以顯示書籍，字典可以提供釋義，聊天工具可以回答問題，卡片 App 可以安排複習；但這些資訊分散在不同地方，整理成本往往高到讓學習停在「查過」而沒有變成「學會」。

VocabReader 把這段流程接在一起：

**匯入 EPUB → 閱讀並標記疑問 → 取得上下文講解 → 建立學習項目 → 間隔複習 → 造句與跟讀**

它不是用 AI 取代閱讀，也不是替使用者自動翻譯整本書。設計重點是保留自己閱讀與思考的過程，只在需要時取得針對性的幫助，再把真正值得學的內容帶進後續練習。

### 核心特色

- **AI 助教幫助學習**：針對正在閱讀的段落，詢問單字、片語、文法或內容。
- **把想學的內容存下來**：將閱讀中遇到的單字和片語加入生詞庫，保留解釋與例句。
- **在同一個 App 複習與練習**：提供間隔複習、閱讀測驗、造句和跟讀，不用另外切換工具。
- **資料保存在本機**：書籍、閱讀進度、標記、生詞與複習紀錄都保存在目前裝置，也可以手動備份。

## 主要功能

### 1. AI 助教幫助學習

閱讀 EPUB 時，可以直接詢問目前段落的意思、單字或片語的用法、句子結構與文法。AI Tutor 會參考正在閱讀的內容回答，不需要每次複製原文或重新說明背景。

回答後可以繼續追問，例如先確認整段意思，再深入詢問其中一句的文法或語氣。原文與 AI 對話會留在同一個畫面，方便一邊閱讀、一邊對照。

![AI Tutor 根據目前閱讀區段回答內容與文法問題](docs/readme-assets/ask-ai-context.gif)

### 2. 標記不懂的內容並一次解釋

閱讀時可以標記多個不熟悉的單字、片語或完整句子。讀完目前段落後，再讓 AI 一次整理與講解，不需要每遇到一個問題就停下來查詢。

AI 會依照原文順序與內容類型整理結果：

- 單字與片語會說明在本文中的意思、常見用法、搭配和例句。
- 完整句子會拆解句型、文法關係與語氣，必要時提供較簡單的改寫。
- 解釋只針對使用者標記的內容，其餘原文只用來判斷上下文。

標記會保留在原文位置，之後重新開啟書籍時仍可看到。

![AI 依上下文分類並講解閱讀時建立的標記](docs/readme-assets/explain-reader-annotations.gif)

### 3. 從解釋或對話建立學習卡片

標記解釋完成後，可以挑選想繼續學習的單字和片語，建立成類似 Anki 的學習卡片。AI 會先整理卡片草稿，確認後才加入生詞庫（Learning Library），不需要手動複製解釋或另外製作卡片。

也可以直接在 AI 對話中說明想加入哪個單字或片語。系統會使用目前的閱讀內容判斷該詞在文章中的意思，而不是只保存最常見的字典解釋。

每個需要學習的意思都是一張獨立卡片，可以保存詞義、類型、CEFR 程度、發音、常見搭配、例句與使用提醒。卡片會集中顯示在生詞庫，並依學習狀態進入後續的間隔複習。

![把標記講解整理成可持續複習的學習項目](docs/readme-assets/add-cards-from-explanation.gif)

![透過自然語言從 AI 對話建立學習項目](docs/readme-assets/add-card-with-command.gif)

生詞庫會顯示所有卡片，以及 New、Studying、Familiar、Strong 等學習狀態。也可以搜尋、篩選、排序或查看下一次複習時間。

![VocabReader 生詞庫頁面，顯示學習卡片、學習狀態、搜尋與篩選功能](docs/images/learning-library.png)

點開卡片後，可以查看完整詞義、發音、常見搭配、例句與複習排程，也可以手動修改或請 AI 協助調整內容。

![展開一張學習卡片，查看詞義、發音、常見搭配、例句與複習排程](docs/images/learning-card.png)

### 4. 使用間隔複習回顧卡片

生詞庫會依間隔複習排程，選出今天需要學習或回顧的卡片。每次複習時，AI 都會根據卡片記錄的詞義產生新的情境句，使用者需要從句子內容推斷標記字詞的意思。

同一個單字或片語會在不同句子與情境中出現，讓使用者看到它如何和其他字詞搭配、如何放進完整句子使用，而不是只單獨背字詞和解釋。

提交後，AI 會逐題檢查答案、提供說明與參考答案。使用者最後可以選擇 `Forgotten`、`Hard`、`Good` 或 `Easy`，系統再依結果安排下一次複習時間。

每日新卡片數量、複習數量與每份試卷題數都可以調整。複習紀錄和過去答案會保留，尚未完成的試卷也可以稍後繼續。

![依排程作答、取得 AI 回饋並確認熟悉程度](docs/readme-assets/spaced-review-workflow.gif)

> [!IMPORTANT]
> **一張卡片只學一個意思**
>
> VocabReader 的卡片會和特定意思綁定，不會把同一個字的所有解釋放進一張卡片。例如 `bank` 表示「銀行」和「河岸」時，會建立兩張不同的卡片；每張卡片只保存其中一個意思，以及符合該意思的搭配和例句。
>
> 複習時，AI 會依照這張卡片指定的意思產生情境句，使用者再從句子判斷是哪一個意思。兩張卡片也會分開記錄學習狀態與安排複習，因此記得「銀行」不代表已經學會「河岸」。

### 5. 跟讀與發音練習

在 Listen & Repeat 貼上一段想練習的文字後，AI 會依句意和朗讀節奏切成適合跟讀的片段。每個片段都可以播放 AI 示範、錄下自己的聲音，再分別回放比較。

可以先從短片語逐步練到完整句子，也可以直接練習較長片段。Continuous mode 會自動依序播放示範、倒數、錄音並前往下一段，適合連續練習。

App 會記錄每日目標與完成量。錄音保存在目前裝置；目前不會自動替發音評分。AI 示範語音需要自行設定 OpenAI API key。

![將原文切成自然片段，播放 AI 示範並錄音回放](docs/readme-assets/listen-and-repeat.gif)

### 6. 使用收藏內容造句

Sentence Practice 會從已開始複習的單字和片語中選出一組練習項目。使用者需要在同一篇故事或短文中使用全部指定內容，再交給 AI 檢查。

AI 會確認是否漏掉指定用詞、意思是否正確、詞形是否自然，以及整篇文字的文法與搭配。若有問題，可以保留原稿修改後再次送出；完成後會提供修正版、修改說明，以及每個單字或片語在文中的用法。

需要參考時，也可以請 AI 使用同一組項目產生三篇範例。App 會另外記錄每日造句目標與近期完成量，不會改變卡片的間隔複習時間。

![在同一篇短文中使用多個學習項目並取得 AI 批改](docs/readme-assets/sentence-practice.gif)

## 在同一個 App 裡閱讀與學習

VocabReader 也包含 EPUB 書庫、章節列表、閱讀進度保存與版面調整。重新開啟 App 後，可以從上次閱讀的位置繼續。

閱讀時可以決定要交給 AI 的段落範圍。讀完後，還能使用同一段內容產生閱讀理解題，或用自己的話復述並取得回饋。這些功能是閱讀流程的補充，不需要另外準備教材。

VocabReader 支援標準 EPUB 2／3 的常見文字、圖片、表格與清單。受 DRM 保護的內容，以及依賴複雜互動、影音或自訂排版的 EPUB，不保證能完整呈現。

## 與一般 AI 聊天工具的差異

| 一般 AI 聊天工具 | VocabReader |
|---|---|
| 每次提問都要重新貼上原文與背景 | AI Tutor 直接使用明確界定的目前閱讀區段 |
| 回答結束後，內容留在聊天紀錄裡 | 解釋可以轉成學習項目並進入後續練習 |
| 容易得到與本文無關的常見釋義 | 學習項目保存該詞在來源原文中的目標語義 |
| 一般對話不負責記憶排程 | FSRS 依實際複習結果安排下一次出現時間 |
| 閱讀、整理、複習與輸出分散 | 同一個 App 串起理解、記憶、寫作與跟讀 |

## 文字 AI 不需要另外設定 API key

VocabReader 是免費開源軟體。如果你的 ChatGPT 帳號可以使用 Codex，VocabReader 會沿用本機的 Codex 登入狀態。AI 對話、標記講解、建立與修改學習項目、間隔複習、閱讀測驗、復述、造句批改，以及跟讀文本切分，都不需要另外申請或輸入 OpenAI API key。

> [!NOTE]
> 你需要已登入的 Codex Desktop 或 Codex CLI。只有可選的 AI 示範語音／選取朗讀功能需要自行提供 OpenAI API key；不使用這項語音功能，就不必設定 API key。

## 支援的學習語言

VocabReader 提供 **英文、日文、繁體中文與韓文** 四個獨立的學習空間。每種語言都有自己的書庫、生詞庫、閱讀進度、複習紀錄與 AI 對話，不會把不同語言的內容混在一起。

講解語言可以另外設定。例如閱讀日文時，可以選擇用繁體中文取得說明。其他語言的 EPUB 也可以嘗試匯入和閱讀，但卡片分類、語音與完整練習流程目前主要針對上述四種語言設計。

![在不同語言的文章中標記、取得上下文解釋並建立學習項目](docs/readme-assets/japanese-learning-workflow.gif)

![切換學習語言時載入各自獨立的書庫與生詞庫](docs/readme-assets/switch-learning-language.gif)

## 適用情境

VocabReader 適合以下需求：

- 想用小說、非虛構作品或專業書籍作為語言學習材料的人。
- 閱讀原文時經常被生字、片語、複雜長句或文法中斷的人。
- 不想只收藏生詞，而是希望系統依實際複習結果安排後續練習的人。
- 想從真實閱讀脈絡建立自己的學習內容，而不是使用通用單字表的人。
- 想同時練習閱讀理解、復述、整合造句、發音與跟讀的人。
- 同時學習多種語言，希望書籍、進度與生詞彼此隔離的人。
- 已有可使用 Codex 的 ChatGPT 帳號，希望沿用登入狀態而不另外設定文字 AI API key 的人。

### 目前的產品邊界

VocabReader 目前是桌面版 Early Preview，專注於使用者主動閱讀與練習，因此不提供整本自動翻譯、手機 App、即時雲端同步或完全離線的 AI 功能。資料可以手動匯出為 ZIP 備份，再到另一台裝置完整還原；這是資料移轉機制，不是雙向同步或合併匯入。

## 安裝與使用

1. 從 [GitHub Releases](https://github.com/highsunday/VocabReader/releases) 下載 macOS Apple Silicon、macOS Intel 或 Windows 64-bit 版本。
2. 確認 Codex Desktop／CLI 已安裝，並登入能使用 Codex 的 ChatGPT 帳號。
3. 開啟 VocabReader，選擇學習語言，匯入一本你有權使用的 EPUB。

> [!IMPORTANT]
> VocabReader 目前是 Early Preview，安裝程式尚未完成開發者簽章。macOS 或 Windows 第一次開啟時，可能出現「無法驗證開發者」或「發布者未驗證」的提醒。請從本專案的官方 Releases 頁面下載，並確認檔名符合你的電腦版本。

<p align="center">
  <a href="https://github.com/highsunday/VocabReader/releases"><strong>下載 VocabReader</strong></a>
</p>

<details>
<summary><strong>資料儲存與傳送方式</strong></summary>

| 資料 | 處理方式 |
|---|---|
| EPUB、書庫、閱讀進度、標記、生詞庫、複習紀錄與 AI 對話 | 保存在本機 Electron user data，不建立 VocabReader 雲端帳號。 |
| 跟讀素材、使用者錄音與 AI 示範語音 | 保存在目前裝置，不建立雲端錄音庫，也不轉錄使用者語音。 |
| AI 解釋、出題、批改與文本切分 | 只有執行相關功能時，才把該操作需要的閱讀區段、學習項目、作答或練習文本傳送給 Codex。 |
| 選取朗讀與 AI 示範語音 | 只有明確要求播放時，才使用使用者設定的 OpenAI API key 傳送需要朗讀的文字。 |
| 備份 | 手動匯出書庫、生詞庫、複習資料、活動統計與共用設定為可攜 ZIP；AI 對話、目前試卷、跟讀素材與音訊不包含在內。還原會完整取代目標裝置資料，不是雲端同步。 |

</details>

<details>
<summary><strong>從原始碼啟動與開發</strong></summary>

你需要 Node.js、npm，以及可以執行 `codex app-server` 的 Codex 安裝。

```bash
git clone https://github.com/highsunday/VocabReader.git
cd VocabReader
npm install
npm run dev
```

VocabReader 使用 Electron、React、TypeScript、Fastify、SQLite、`ts-fsrs`、Codex App Server、Vitest 與 Playwright。

```text
apps/
├── desktop/   Electron main、preload、React renderer 與桌面測試
└── server/    Fastify Reader Server 與 API 邊界
```

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

若要在目前平台建立 installer，可使用 desktop workspace 的 `dist:mac:arm64`、`dist:mac:x64` 或 `dist:win:x64` script。正式 Release 由 GitHub Actions 在對應的原生 runner 建置。

</details>

## 參與專案

- Star 這個 repository 以追蹤後續版本。
- 在 [Issues](https://github.com/highsunday/VocabReader/issues) 回報問題或提出建議。
- Fork 專案、建立分支並送出 Pull Request。

## License

VocabReader 採用 [MIT License](LICENSE)。
