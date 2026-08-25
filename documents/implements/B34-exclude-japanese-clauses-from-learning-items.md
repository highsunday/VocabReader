---
author: Codex
date: 2026-08-25
title: 排除被誤判為片語的跨語言句子與子句
uuid: f6e0eae0-35a2-499c-a704-5f23d3f1ee78
version: 1.1.0
status: implemented
---

# Bug Fix: 排除被誤判為片語的跨語言句子與子句

## 1. Bug Overview

區段解析會把某些日文完整句或從屬子句誤分為「片語」，並放入
`learning-item-invitation.targets`。例如：

- `部分も多少はあるのですが、コミュニケーションが取れないほど大きな違いはありません`
- `外国語を学ぶ動機は人それぞれですが`

這些標記都含有自己的述語並表達一個完整命題或從屬命題，不是可作為
單字／固定表達長期複習的片語。誤分後，「Add to Learning Library」會把
它們連同真正的片語（如 `理論上`、`私の経験上`）一起送入學習項目草稿流程。

## 2. Fix Objective

- 將「片語」收斂為可獨立學習、可在其他句子中重複使用的詞彙表達、
  固定表達、搭配或文法單位。
- 任何含有自己述語並表達命題的完整句或從屬子句，不因缺少句號、
  選取範圍停在句中或長度較短而改判為片語。
- 日文有限定述語的獨立命題，以及以 `〜ですが`、`〜けれど`、`〜ので`、
  `〜から`、`〜なら`、`〜たら`、`〜ても` 等連接形收尾且已表達子句命題的內容，
  一律作為句子層級，不進入學習項目邀請。
- `create-learning-items` 再次檢查 App 交付的每個 target；即使前一階段
  已誤標為片語，也不得為句子或子句產生草稿、重複命中或垃圾桶命中。
- 不使用單純字數或句尾字串作為唯一判斷，以避免排除合法的長片語或
  固定文法表達。
- 同一適格性邊界必須明確套用於目前四個學習語言工作區：英文 `en`、
  日文 `ja`、繁體中文 `zh-TW` 與韓文 `ko`。未來的其他語言也先套用語言中立的
  predicate/proposition 原則，不得在缺少語言特例時放行整句。

## 3. Acceptance Criteria

- **Scenario 1：日文完整命題不是片語**
  - **Given** 標記為 `部分も多少はあるのですが、コミュニケーションが取れないほど大きな違いはありません`，且選取文字未含 `。`
  - **When** AI 產生區段解析與學習項目邀請
  - **Then** 該標記作為句子說明，不出現於 invitation targets

- **Scenario 2：日文連接子句不是片語**
  - **Given** 標記為 `外国語を学ぶ動機は人それぞれですが`
  - **When** AI 分類標記並組裝 invitation
  - **Then** 該標記作為句子層級的從屬子句，不出現於 invitation targets

- **Scenario 3：真正片語維持可建立**
  - **Given** 同一批含 `理論上`、`私の経験上` 與句子層級標記
  - **When** AI 產生區段解析與 invitation
  - **Then** 只有兩個可重複使用的片語進入 targets，原始順序保留

- **Scenario 4：草稿階段二次防護**
  - **Given** App 因既有回覆或上游誤分而交付同時含片語與日文子句的 targets
  - **When** `create-learning-items` 準備草稿
  - **Then** 只對真正的單字／片語產生 draft／existing／trashed 結果，不對句子或子句產生任何項目

- **Scenario 5：跨語言原則不退化**
  - **Given** 英文、日文、繁體中文或韓文的合法單字、固定片語或文法表達
  - **When** 長度較長或含有表面上類似句尾的字串
  - **Then** AI 仍依「是否自足表達命題」判斷，不以字數或正則硬切片語

- **Scenario 6：英文句子與從屬子句不進入學習項目**
  - **Given** 同一批含 `in theory`、`in my experience`、
    `There is no difference large enough to prevent communication` 與
    `Although motivations for learning a language differ from person to person`
  - **When** 解析 skill 產生 invitation，且 creation skill 重驗 targets
  - **Then** 只有兩個可重複使用片語可建立，英文完整句與從屬子句都排除

- **Scenario 7：繁體中文句子與從屬子句不進入學習項目**
  - **Given** 同一批含 `理論上`、`依我的經驗`、`差異並沒有大到無法溝通的程度`
    與 `雖然學習外語的動機因人而異`
  - **When** 解析 skill 產生 invitation，且 creation skill 重驗 targets
  - **Then** 只有兩個可重複使用片語可建立，繁中完整句與從屬子句都排除

- **Scenario 8：韓文句子與連接子句不進入學習項目**
  - **Given** 同一批含 `이론상`、`제 경험상`、`의사소통이 불가능할 정도로 큰 차이는 없습니다`
    與 `외국어를 배우는 동기는 사람마다 다르지만`
  - **When** 解析 skill 產生 invitation，且 creation skill 重驗 targets
  - **Then** 只有兩個可重複使用片語可建立，韓文完整句與 `-지만` 連接子句都排除

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 無句號的日文完整句 | `…違いはありません` | 解析 skill 分類 | 明確要求歸為 sentence 且排除 invitation | Critical |
| TC2 | 日文連接子句 | `…人それぞれですが` | 解析 skill 分類 | 明確要求視為 sentence-level clause | Critical |
| TC3 | 日文真正片語 | `理論上`、`私の経験上` | 解析 skill 分類 | 明確保留為 reusable phrases | Critical |
| TC4 | 草稿二次篩選 | 受信 targets 混合片語與子句 | creation skill 準備結果 | 要求重新驗證並排除句子／子句 | Critical |
| TC5 | 非機械式邊界 | 長片語、固定文法表達或無標點子句 | 兩個 skill 判斷 | 依命題與可重複使用性判斷，不依字數或標點 | High |
| TC6 | 既有學習項目契約 | 合法 word／phrase target | 產生草稿 | 繼續符合原型化、去重、語言、CEFR 與 Markdown 契約 | High |
| TC7 | 英文混合標記 | 固定片語、完整句與 although 從屬子句 | 兩個 skill 分類／重驗 | 只保留固定片語 | Critical |
| TC8 | 繁中混合標記 | 固定片語、完整句與雖然從屬子句 | 兩個 skill 分類／重驗 | 只保留固定片語 | Critical |
| TC9 | 韓文混合標記 | 固定片語、完整句與 `-지만` 連接子句 | 兩個 skill 分類／重驗 | 只保留固定片語 | Critical |
| TC10 | 韓文建立契約 | `ko` 工作區的適格 word／phrase | creation skill 產生草稿 | 允許 `language: ko`、韓文例句與韓文 source explanation | Critical |

## 5. Implementation Notes

- 首層修正放在 `.agents/skills/explain-reader-annotations/SKILL.md`，讓區段解析
  在分類與 invitation 組裝前先執行 clause/sentence eligibility check。
- 第二層修正放在 `.agents/skills/create-learning-items/SKILL.md`，不將 App-supplied target
  當成已驗證的 item type，避免舊對話附件或第一階段誤分直接變成草稿。
- 不在 Renderer／Main 加入任何語言的句尾正則或字數上限；該類機械規則
  無法可靠分辨子句、固定表達與文法型。
- 兩個 skill 必須同時提供英文、日文、繁體中文與韓文的混合正反例，並宣告
  同一原則套用於所有其他語言。
- 韓文工作區已在共用 contract 與 Main/Renderer 實作中使用 `ko`，creation skill
  的允許語言、source explanation 與例句語言清單必須同步包含韓文。

## 6. Affected Files and Boundaries

- `.agents/skills/explain-reader-annotations/SKILL.md`
- `.agents/skills/create-learning-items/SKILL.md`
- `apps/desktop/src/main/chat-controller.test.ts`
- `documents/modules/annotation-explanation.md`
- `documents/modules/learning-item-creation.md`
- `documents/implements/B34-exclude-japanese-clauses-from-learning-items.md`

## 7. Assumptions and Non-goals

- 本次不新增 `sentence` 學習項目類型，也不把句子拆成其中所有單字。
- 句子與子句仍在區段解析中取得語法與上下文說明，只是不進入生詞庫。
- 本次不修改現有 SQLite schema、artifact schema、Renderer 草稿 UI 或已正式建立的
  學習項目。
- 修正不溯及刪除使用者過去已提交的誤分學習項目。

## 8. Implementation Record

### Status

Implemented on 2026-08-25.

### Implementation Summary

- `explain-reader-annotations` 現在明確以「是否含自身述語並表達命題」區分
  可重複使用片語與句子層級內容，不以字數或句號作為單一判準。
- 日文有限述語與連接子句取得專門邊界；截圖中的 `…違いはありません`
  與 `外国語を学ぶ動機は人それぞれですが` 被明確排除於 invitation，
  `理論上`與`私の経験上`維持適格。
- `create-learning-items` 不再把 App-supplied target 視為已通過類型驗證；
  混合批次在草稿、active match 與 trash match 三種結果中都排除句子／子句。
- 模組文件已同步新的分類邊界與兩層防護。
- v1.1 將同一邊界擴充為語言中立原則，並為英文、日文、繁體中文、韓文
  四個現有學習語言工作區加入完整句、連接／從屬子句與可重複使用片語正反例。
- 韓文 `ko` 已同步到 creation skill 的草稿允許語言、source 講解與例句語言契約；
  `-지만` 等形式只在連著自身述語形成命題時視為子句，單獨標記的文法單位仍可建立。

### Test Coverage

| Test scenario | Automated basis | Result |
|---|---|---|
| TC1 | `chat-controller.test.ts` Japanese proposition contract assertions | passed |
| TC2 | `chat-controller.test.ts` Japanese connective-clause assertions | passed |
| TC3 | `chat-controller.test.ts` reusable `理論上`／`私の経験上` assertions | passed |
| TC4 | `chat-controller.test.ts` creation target revalidation assertions | passed |
| TC5 | both skill contracts reject character-count and punctuation-only classification | passed |
| TC6 | full desktop Vitest, typecheck and production build | passed |
| TC7 | English sentence/dependent-clause and reusable-phrase contract assertions | passed |
| TC8 | Traditional Chinese sentence/dependent-clause and reusable-phrase contract assertions | passed |
| TC9 | Korean sentence/`-지만` connective-clause and reusable-phrase contract assertions | passed |
| TC10 | Korean skill language contract plus Main `language: ko` artifact parser test | passed |

### Changed Files

#### Production behavior

- `.agents/skills/explain-reader-annotations/SKILL.md`
- `.agents/skills/create-learning-items/SKILL.md`

#### Test code

- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/learning-item-artifacts.test.ts`

#### Documentation

- `documents/implements/B34-exclude-japanese-clauses-from-learning-items.md`
- `CONTEXT.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/learning-item-creation.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/learning-language-workspace.md`
- `documents/modules/data-backup.md`
- `documents/modules/learning-library.md`
- `documents/modules/sentence-practice.md`
- `documents/ddd-email-notify.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 日文完整命題不是片語 | Pass | explanation skill 明確以自身述語／命題判斷，並收錄截圖回歸案例 |
| 日文連接子句不是片語 | Pass | `〜ですが`等連接形及截圖子句都納入 sentence-level 邊界 |
| 真正片語維持可建立 | Pass | skill 將 `理論上`、`私の経験上` 列為可重複使用正例 |
| 草稿階段二次防護 | Pass | creation skill 要求重驗每個 target，句子／子句不得產生任何三類結果 |
| 跨語言原則不退化 | Pass | 兩個 skill 都禁止只用字數或標點判斷；全套件與 build 通過 |
| 英文句子與從屬子句不進入學習項目 | Pass | 兩個 skill 含英文完整句、although 子句與兩個片語正反例 |
| 繁體中文句子與從屬子句不進入學習項目 | Pass | 兩個 skill 含繁中完整句、「雖然」子句與片語正反例 |
| 韓文句子與連接子句不進入學習項目 | Pass | 兩個 skill 含韓文完整句、`-지만` 子句與片語正反例 |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `classifies Japanese propositions and connective clauses as sentences` |
| TC2 | Pass | same test checks `ですが` and the exact connective-clause regression text |
| TC3 | Pass | same test checks `理論上` and `私の経験上` positive examples |
| TC4 | Pass | `revalidates trusted targets and excludes sentences or clauses from drafts` |
| TC5 | Pass | both contract tests require semantic/syntactic classification rather than length/punctuation |
| TC6 | Pass | desktop Vitest 576/576, typecheck and production build |
| TC7 | Pass | `revalidates sentence boundaries in every supported learning language` and matching explanation test |
| TC8 | Pass | same tests assert Traditional Chinese sentence, clause and phrase examples |
| TC9 | Pass | same tests assert Korean sentence, `-지만` clause and phrase examples |
| TC10 | Pass | `supports Korean learning-item drafts and examples`; artifact parser preserves `language: ko` |

### Commands Executed

```bash
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts -t "revalidates trusted targets|classifies Japanese propositions"
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts -t "every supported learning language|supports Korean learning-item"
npm test -w @reader/desktop -- --run src/main/chat-controller.test.ts src/main/learning-item-artifacts.test.ts
npm test -w @reader/desktop
npm run typecheck -w @reader/desktop
npm run build -w @reader/desktop
```

Results:

- original Japanese target red: 2 expected failures because neither skill defined the required boundary.
- multilingual/Korean expansion red: 3 expected failures because English, Traditional Chinese and Korean examples plus the Korean draft contract were absent.
- multilingual/Korean target green: 3/3 passed.
- related `chat-controller` and artifact suites: 85/85 passed.
- desktop full suite: 59 files, 576 tests passed.
- desktop TypeScript typecheck: passed.
- desktop production build: passed; Vite emitted the pre-existing large-chunk advisory only.

### Hypotheses and Decisions

根據截圖，上游區段解析已將帶有完整述語的日文內容列入「片語」組，
且 invitation 直接保留這些原文為 targets。現行 skill 只要求「classify as word,
phrase, or sentence」，未定義 phrase 的句法邊界；creation skill 也把受信 target 直接當成
可用的 word／phrase，沒有第二道語意適格性檢查。

修正選擇 AI 語意／句法邊界而不在 Main 加入日文 regex，因為同一個句尾可出現於
句子、從屬子句或固定文法表達中；只有「是否已表達命題」能對應產品的
學習項目邊界。使用兩層 skill 防護則可同時防止新 invitation 與舊對話附件。

多語擴充時另確認共用 TypeScript contract、Main、Renderer 與 artifact parser 已支援 `ko`，
但 creation skill 的語言清單與工程文件仍停在舊三語狀態。本次以現行程式 contract
為準同步韓文，並以 `language: ko` artifact 測試固定 Main 邊界。

### Deferred Items

- 過去已提交的誤分項目仍由使用者透過現有生詞庫操作處理。

### Architectural Observation

分類責任維持在兩個受限 AI skill，現有 Main artifact 驗證、Renderer 與 SQLite
契約不需增加語言特定分支。但支援語言清單分散於 TypeScript contract、Controller、
skill Markdown 與模組文件，韓文擴充已暴露同步漂移風險；後續可以 RXX 評估集中產生
這些 contract 的可行性，但不阻擋本次修正。
