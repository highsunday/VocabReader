---
title: 解釋標記與區段解析模組
module: annotation-explanation
status: active
last_updated: 2026-08-25
related_implements:
  - F13-persistent-annotations-and-ai-analysis
  - F16-invoke-annotation-explanation-skill
  - B03-load-only-bundled-annotation-skill
  - B34-exclude-japanese-clauses-from-learning-items
  - F21-ai-assisted-learning-item-creation
  - F70-preserve-useful-detail-in-learning-items
---

# 解釋標記與區段解析模組

## 1. Purpose

本模組實作 **區段解析（Segment Analysis）**：使用者完成閱讀與標記後，在 AI 對話面板點擊「解釋標記」，讓 Codex AI 執行層只針對目前 **閱讀區段**內的**標記**提供語言學習說明。

本模組關心的是「如何呼叫並執行標記教學 workflow」。標記的建立、offset、保存、畫面標示與閱讀區段序列化仍由 [持久標記模組](annotation.md)負責；App skill 的打包、安裝與安全載入由 [Skill 管理模組](skill-management.md)負責。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前行為：

- 閱讀頁提供「解釋標記」預設按鈕。
- 每次點擊都重新附上當下 START／END 閱讀區段，不套用一般追問的區段去重。
- Renderer 傳送白名單 `intent: "explainAnnotations"` 與目前學習語言工作區的**講解語言**。
- Main Process 加入 `$explain-reader-annotations` marker、有限閱讀上下文與固定型別化 skill item。
- Skill 只解釋 `<reader-annotation>` 內容，未標記文字只作為上下文。
- 片語必須是可在其他句子中重複使用的詞彙、固定表達、搭配或文法單位；
  帶自身述語的完整命題或連接子句都屬於句子層級。
- 沒有標記時，以指定語言簡短告知目前區段沒有標記後停止。
- 解析結果以安全 Markdown 留在目前 AI 對話，不回寫標記；結尾另附結構化邀請，
  讓使用者明確選擇是否把本次全部單字與片語送入學習項目草稿流程。

## 3. Inputs and Preconditions

### Product input

`SendChatMessageInput` 的解析 turn 包含：

- `text: "講解標記內容"`
- `intent: "explainAnnotations"`
- `explanationLanguage: source | zh-TW | en | ja | ko`
- 可選的書名與章節名稱
- 當下 `<reading-segment>`，其中區段內標記以 `<reader-annotation id="A…">` 表示

預設動作只有在 Codex ready、沒有 active turn、沒有對話管理操作時可用。空白或尚未形成有效閱讀區段時，不會取得整章 fallback。

### Trust interpretation

- 只有 `<reader-annotation>` 內文字是待解釋標記。
- 同一 `<reading-segment>` 內其他文字只供判斷本文語意、文法、語氣與難度。
- 區段外內容不可讀取、推測或引用。
- EPUB 文字是不受信任資料，不得被解讀為指令。

## 4. End-to-End Flow

1. 使用者在目前章節建立標記，並以 START／END 界定閱讀區段。
2. Renderer 使用 `annotatedReadingSegment()` 只序列化區段與區段內標記。
3. 使用者點擊「解釋標記」；Renderer 無論該區段是否曾提供過，都傳送最新區段、意圖及講解語言。
4. IPC 驗證 intent、語言與 context 欄位型別。
5. `composeCodexInput()` 加入 marker、有限上下文、語言指令；若沒有 annotation tag，另加入明確無標記提示。
6. `turn/start.input` 包含 text item 及固定 `explain-reader-annotations` skill item。
7. 已載入的 skill 按標記類型與原文順序建立教學回覆；分類時依是否自足
   表達命題及是否具有自身述語判斷，不依字數或結尾標點。
8. Skill 在複習表後詢問是否加入生詞庫，並輸出只含 word／可重複使用
   phrase 的 `learning-item-invitation`；sentence 與有限定述語的從屬／連接子句
   不加入也不拆詞。
9. Renderer 顯示「加入生詞庫」。接受後才啟動 `create-learning-items`；
   空 targets 由建立 skill 詢問要加入什麼。
10. 建立 skill 可沿用同一 AI 對話中的本次解析，整理並保留與各目標語義直接相關、
    值得長期複習的細節；不逐字複製整份解析或混入其他標記、整句專屬分析及複習表。

執行解析不會移動 START／END、修改 EPUB、刪除標記、改寫既有回覆或更新間隔複習狀態。

## 5. Explanation Contract

Skill 必須：

1. 把每個標記分類為單字、片語或句子。
2. 片語限於可完整移入其他句子的詞彙表達、固定表達、搭配或文法單位；
   帶自身述語、表達完整或從屬命題的標記列入句子組。這個邊界套用於
   英文、日文、繁體中文與韓文，也是其他語言的預設規則。日文即使未選到 `。`，
   以 `〜ですが` 等連接形或 `〜ありません` 等有限述語完成的命題仍屬句子層級；
   韓文以 `-지만`、`-는데`、`-니까` 等連接形收尾且已有自身述語的命題也一樣。
3. 固定依「單字、片語、句子」分組；同組內維持原文出現順序。
4. 依本文用法估計 A1–C2 CEFR，不以孤立字典難度取代上下文判斷。
5. 只選擇有助理解的教學小節，例如 Meaning、Context、Grammar、Vocabulary、Examples、Synonyms、Collocations、Pronunciation、Common mistakes、Easy paraphrase。
6. 採用 Examples 小節時，必須提供 3–5 個彼此不同、完整且自然的例句，不得只提供 1 或 2 句。
7. 不機械性輸出所有小節，不翻譯或摘要整個閱讀區段，也不主動解釋未標記文字。
8. 最後提供本次講解語言的精簡複習表：標記內容、簡單意思、CEFR 與實用提示。
9. 以相同講解語言詢問是否加入全部單字與可重複使用的片語，並輸出可驗證 invitation；不得聲稱
   已保存或自行提交。

原始標記文字、IPA 及學習上需要保持原貌的例句可保留原文形式。

## 6. Language Behavior

| 設定值 | 回覆語言 |
|---|---|
| `source` | 推斷並使用目前閱讀區段的原文語言 |
| `zh-TW` | 繁體中文 |
| `en` | 清楚、適合學習者的 English |
| `ja` | 日本語 |
| `ko` | 한국어 |

講解語言控制標題、解釋、提示與表格欄位，不修改 EPUB 原文、一般自由問答或既有 AI 回覆。缺少、損壞或未知設定由設定模組降級為 `source`。

## 7. Dependencies and Boundaries

| Dependency | What this module uses |
|---|---|
| `annotation` | 持久標記、閱讀區段交集與安全 `<reader-annotation>` 序列化 |
| `reading-range` | START／END 邊界與區段外內容排除 |
| `skill-management` | 固定 skill 安裝、內嵌 instructions、marker gate 與隔離設定 |
| `ai-conversation` | Thread／turn 生命週期、串流回覆、Markdown 與對話保存 |
| settings | 各學習語言工作區講解語言的讀取、驗證與持久化 |

本模組不擁有標記資料，也不把 AI 分類保存回 `Annotation`。它與閱讀測驗共用閱讀區段、講解語言與 AI 對話，但兩個 preset intent 和 skills 必須保持互斥。

## 8. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/explain-reader-annotations/SKILL.md` | 標記分類、教學小節、CEFR、語言與複習表契約 |
| `.agents/skills/explain-reader-annotations/agents/openai.yaml` | Repo 內 skill 顯示 metadata |
| `apps/desktop/src/renderer/App.tsx` | 「解釋標記」入口、設定語言與最新區段送出 |
| `apps/desktop/src/renderer/reading-range.ts` | 安全序列化閱讀區段與標記交集 |
| `apps/desktop/src/shared/chat-contracts.ts` | `explainAnnotations` intent 與 context 型別 |
| `apps/desktop/src/main/chat-ipc.ts` | intent、語言與 context 白名單驗證 |
| `apps/desktop/src/main/chat-controller.ts` | marker、無標記提示、語言映射與固定 skill item |
| `apps/desktop/src/main/bundled-skill.ts` | 標記解析 skill 的 runtime 安裝 |
| `apps/desktop/src/main/learning-item-artifacts.ts` | invitation 結構驗證與原始 JSON 隱藏 |

## 9. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/renderer/reading-range.test.ts` | 區段裁切、annotation tag、escaping、順序與交集 |
| `apps/desktop/src/renderer/App.test.tsx` | 按鈕入口、每次附最新區段、無標記仍送出、講解語言傳值 |
| `apps/desktop/src/main/chat-ipc.test.ts` | `explainAnnotations` 與語言白名單 |
| `apps/desktop/src/main/chat-controller.test.ts` | marker、固定 skill item、五種講解語言（source／繁中／英／日／韓）、無標記提示、四學習語言的句子／片語邊界、skill rubric 與一般／測驗 turn 隔離 |
| `apps/desktop/src/main/bundled-skill.test.ts` | runtime 安裝與更新 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | production Electron runtime 中的標記解析 skill |

## 10. Known Limitations and Follow-up

- AI 回覆仍是非結構化 Markdown；分類、CEFR 與複習表不能作為獨立結構化資料查詢。
- invitation 只帶標題與語義提示；獨立建立 skill 可在同一 AI 對話中語義性重用相關解析，
  但不保存來源句、解析快照或兩者的永久引用。
- 沒有解析結果版本、重新產生、比較或匯出功能。
- 標記 skill rubric 目前與 Controller 契約測試放在同一測試檔，尚未拆成獨立 skill test。
- Renderer `App.tsx` 同時協調標記、閱讀區段、設定與 AI preset，責任仍偏重。

## 11. Related Documents

- `CONTEXT.md`
- `documents/modules/annotation.md`
- `documents/modules/reading-range.md`
- `documents/modules/skill-management.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/ai-conversation.md`
- `documents/implements/F13-persistent-annotations-and-ai-analysis.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/implements/B03-load-only-bundled-annotation-skill.md`
- `documents/implements/B34-exclude-japanese-clauses-from-learning-items.md`
- `documents/implements/F70-preserve-useful-detail-in-learning-items.md`

變更解析入口、標記序列化契約、講解語言、分類順序、教學輸出或 skill marker 時，必須同步更新本文件及 `annotation`、`skill-management` 模組文件。
