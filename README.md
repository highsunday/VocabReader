<h1 align="center">VocabReader</h1>

<p align="center">
  <strong>結合 AI 的英文原文書閱讀與練習工具。</strong><br />
  閱讀時可以直接詢問內容、解釋標記，並把需要練習的單字或片語保存成卡片。<br />
  保存後的內容可以接著用於間隔複習、跟讀與造句練習。
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

VocabReader 將 EPUB 閱讀、AI 對話、學習卡片和練習放在同一個桌面 App。上圖的書庫已匯入兩本 Harry Potter；選擇書籍後，可以從章節列表開始閱讀，原文和 AI Tutor 會保留在同一個畫面。

## 主要功能

### 1. 閱讀時直接詢問 AI

AI Tutor 會讀取目前的閱讀段落，再回答使用者提出的問題。詢問「這段英文的意思是什麼？」時，回答會說明該段內容；詢問「請解釋這句的文法。」時，回答會引用句中的結構，不是脫離文章的一般文法說明。

![依序詢問段落意思與句子文法，AI 根據目前文章上下文回答](docs/readme-assets/ask-ai-context.gif)

### 2. 標記不懂的內容並一次解釋

同一個閱讀範圍可以標記多個單字、片語和句子，再交給 AI 統一整理。下方示範包含 `mysterious`、`nonsense`、`beefy`、`mustache` 四個單字，`perfectly normal`、`hardly any neck` 兩個片語，以及一個較長的完整句子。

解釋結果會依項目區分意思、程度、用法和句子結構，原文仍留在閱讀畫面中，方便對照。

![標記四個單字、兩個片語與一個長句，並查看 AI 分項解釋](docs/readme-assets/explain-reader-annotations.gif)

### 3. 從解釋或對話建立學習卡片

標記內容解釋完成後，可以點擊 `Add to Learning Library`，把選定的單字和片語整理成卡片。操作完成後，Learning Library（卡片庫）會顯示剛新增的項目、詞義、類型、CEFR 程度和複習狀態。

![從標記解釋點擊 Add to Learning Library，再到 Card Library 查看新增結果](docs/readme-assets/add-cards-from-explanation.gif)

也可以直接在對話輸入欄輸入 `add mysterious`。AI Tutor 會依照目前閱讀內容準備該項目的卡片資料；新增後可在 Learning Library 查看保存的解釋與主要欄位。

![在對話輸入 add mysterious，並在 Card Library 查看卡片](docs/readme-assets/add-card-with-command.gif)

### 4. 使用間隔複習回顧卡片

新增的卡片會進入間隔複習。Review 會依卡片的目前狀態安排題目，讓使用者在句子情境中回想指定意思；提交答案後，AI 會提供意義判斷和可參考的答案。

使用者最後可以把熟悉程度設為 `Forgotten`、`Hard`、`Good` 或 `Easy`，系統再更新下一次複習時間。這採用與 Anki 類似的間隔複習概念，但題目、AI 回饋和最後評分都是 VocabReader 自己的操作流程。

![開始 Review、回答題目、查看 AI 回饋並選擇熟悉程度](docs/readme-assets/spaced-review-workflow.gif)

### 5. 跟讀與發音練習

在 Listen & Repeat 輸入一段練習文本後，可以選擇短片語或完整句子的練習方式。AI 示範語音和使用者錄音是兩份不同的音訊：先播放 `Play AI`，再用 `Record`／`Re-record` 錄下自己的跟讀，最後用 `Play mine` 回放並逐段比較。

目前版本提供示範語音、錄音、並列回放與完成進度，不會產生自動發音準確度分數。AI 示範語音需要使用者自行設定 OpenAI API key；使用者錄音保存在目前裝置。

![輸入跟讀文本，進入練習後播放 AI 示範、錄音並回放自己的聲音](docs/readme-assets/listen-and-repeat.gif)

### 6. 使用收藏內容造句

Sentence Practice 會從已收藏並進入學習流程的單字和片語中選出練習項目。使用者需要在同一段文字中使用所有指定內容，再交給 AI 檢查文法、用字和每一項是否使用正確。

下方示範使用 `beefy`、`perfectly normal`、`mysterious`、`hardly any neck` 和 `nonsense`。提交後可以看到修訂結果、整體回饋，以及各單字或片語在文章中的實際用法。

![使用五個已收藏的單字與片語完成短文，再查看 AI 檢查結果](docs/readme-assets/sentence-practice.gif)

## 在同一個 App 裡閱讀與學習

使用一般工具閱讀原文時，通常需要在閱讀器、字典、AI 聊天工具、筆記和卡片 App 之間切換。查詢過的內容也需要另外整理，才能用於後續複習。

VocabReader 把這些功能整合在同一個 App。除了上面的六項主要功能，閱讀畫面也提供以目前段落為範圍的閱讀理解測驗和復述練習。

## 與一般 AI 聊天工具的差異

| 一般 AI 聊天工具 | VocabReader |
|---|---|
| 需要手動提供原文和背景 | AI Tutor 會讀取指定的閱讀範圍 |
| 查詢結果不會連結到學習資料 | 解釋可以接著加入卡片、複習與練習 |
| 同一個字的不同意思需要自行區分 | 卡片會記錄該字在目前原文中的意思 |
| 閱讀、卡片和練習分散在不同工具 | 閱讀、卡片和練習整合在同一個 App |

## 文字 AI 不需要另外設定 API key

VocabReader 是免費開源軟體。如果你的 ChatGPT 帳號可以使用 Codex，VocabReader 會沿用本機的 Codex 登入狀態。標註與解釋、加入卡片、快閃卡片複習、閱讀測驗、復述和寫作回饋都不需要另外申請或輸入 OpenAI API key。

> [!NOTE]
> 你需要已登入的 Codex Desktop 或 Codex CLI。只有可選的 AI 示範語音／選取朗讀功能需要自行提供 OpenAI API key；不使用這項語音功能，就不必設定 API key。

## 支援的學習語言

VocabReader 可以處理不同語言的 EPUB 內容。EPUB 文字可以正常讀取時，AI 會依照上下文提供解釋。

目前完整提供 **英文、日文和繁體中文** 三種獨立學習空間。每種語言都有個別的書庫、進度和卡片庫。其他語言的 EPUB 也可以匯入、閱讀和詢問 AI，但卡片分類、語音等功能尚未針對每一種語言調整。

下方示範在日文文章中標記內容、取得解釋，再把需要複習的項目加入日文卡片庫。

![在日文文章中標記內容、查看解釋並建立日文學習卡片](docs/readme-assets/japanese-learning-workflow.gif)

從 Settings 切換學習語言時，App 會進入該語言獨立的書庫與卡片庫，不會把不同語言的學習內容混在一起。

![從設定切換學習語言，並查看該語言獨立的卡片庫](docs/readme-assets/switch-learning-language.gif)

## 適用情境

VocabReader 適合以下需求：

- 想用小說、非虛構作品或專業書籍作為語言學習材料的人。
- 閱讀原文時，需要查詢生字、片語或長句的人。
- 想把閱讀中遇到的內容整理成卡片並定期複習的人。
- 想使用閱讀材料進行理解、復述、跟讀或寫作練習的人。
- 已有可使用 Codex 的 ChatGPT 帳號，希望沿用登入狀態而不另外設定文字 AI API key 的人。

VocabReader 目前不提供整本自動翻譯、手機 App、雲端同步或完全離線的 AI 功能。

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
| EPUB、書庫、閱讀進度、標註、卡片與快閃卡片複習紀錄 | 保存在本機 Electron user data。 |
| 跟讀錄音與 AI 示範語音 | 保存在目前裝置，不建立雲端錄音庫。 |
| AI 解釋、出題與批改 | 執行相關操作時，會把該操作需要的閱讀內容或卡片傳送給 Codex。 |
| 選取朗讀與 AI 語音 | 只有你明確要求播放時，才使用你設定的 OpenAI API key 傳送所選文字。 |
| 備份 | 手動匯出為可攜 ZIP；還原會完整取代目標裝置的學習資料，不是雲端同步。 |

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
