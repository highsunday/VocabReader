---
title: AI 輔助學習項目建立模組
module: learning-item-creation
status: active
last_updated: 2026-07-24
related_implements:
  - F21-ai-assisted-learning-item-creation
  - F22-read-only-learning-item-draft-preview
  - B06-use-explanation-language-for-learning-cards
  - B07-preserve-clarified-learning-item-targets
  - F27-trigger-learning-card-creation-from-natural-language
---

# AI 輔助學習項目建立模組

## 1. Purpose

本模組讓讀者從閱讀頁或生詞庫頁的 AI 對話面板，透過「新增卡片」快捷操作或明確的
自然語言請求，建立單字與片語的
**學習項目草稿批次**。本機程式先用完整標題查出有限候選，AI 只比較這些候選的語義，
再產生可唯讀預覽、排除、恢復及明確提交的草稿。正式資料只有在使用者按下提交後，才以
單一 SQLite 交易寫入生詞庫。

## 2. Product Flow

1. 使用者點「新增學習卡片」，可在提問框以逗號或換行提供多個單字／片語；也可以
   直接輸入 `add this card`、`save this as a flashcard` 或「把這個加入生詞庫」等
   明確請求。自然語言請求保留原文並啟用相同 creation intent，不以命令句解析標題。
2. `LocalLearningLibrary.findDuplicateCandidates()` 以 trim、英文大小寫不敏感、
   完整標題相等查詢 active 與 trashed 候選。
3. `create-learning-items` 只收到請求目標、有限閱讀區段及候選的
   id／title／sense／status／Markdown，負責語義去重、必要澄清及草稿內容。
4. Main 驗證 fenced `learning-item-result`；回傳的草稿標題與 match id 必須落在該
   turn 的受信任範圍。
5. AI 訊息下方顯示批次按鈕。中央 modal 的清單區可捲動，只顯示結構化摘要與安全
   渲染的 Markdown 預覽；使用者可把草稿排除／恢復，但不可編輯草稿內容。
6. 提交時重新以草稿標題查候選。若有候選，以一次隔離 Codex turn 執行
   `learning-item-recheck` 語義分類；不逐卡啟動 AI，也不提供完整生詞庫。
7. 新發現的 active／trashed 重複分別顯示為已存在／垃圾桶；其他 included 草稿由
   `createItemsAtomically()` 在單一 `BEGIN IMMEDIATE` 交易中新增。
8. 提交結果保留在原 AI 訊息，不能再次提交；垃圾桶 match 在提交前後都可明確還原。

## 3. Clarification and Annotation Integration

- 沒有目標時，skill 只詢問要加入什麼。建立請求保存在 user message；
  使用者的下一個直接回答會延續 creation intent，先查候選後再呼叫 skill。
- 已知標題但語義不明時，下一個回答作為該標題的 `senseHint`，同樣重新查候選。
- target、拼字或單字／片語邊界需要澄清時，skill 在問題後附上
  `learning-item-request` typed targets。附件不顯示原始 JSON，並保存在最後一個
  assistant message；使用者回答「都加」「是」等上下文式內容時，Controller 優先沿用
  這組 targets，再把回答附加為 `senseHint`。
- 自然語言 creation intent 沒有 typed targets 時，skill 可依原始請求與同一 AI 對話
  前文提出候選單字／片語，但只能詢問一次聚焦的確認或澄清並輸出
  `learning-item-request`；下一則直接回答確認 targets、完成 exact-title 候選查詢後，
  才能產生草稿批次。
- structured targets 缺席或為空時，使用者直接回答的逗號／換行清單仍作為新標題；
  程式不從 AI 可見文字猜測 targets，也不把含空格的片語任意拆成多個單字。
- `explain-reader-annotations` 在複習表後輸出 `learning-item-invitation`。
  Renderer 顯示「加入生詞庫」，預設一次加入全部 word／phrase targets。
- sentence annotation 不加入，也不拆成句中所有單字；空 targets 接受後進入上述澄清。
- 閱讀區段只供即時判斷，不保存到草稿或正式學習項目。

## 4. Explanation Language

- 建立流程沿用全域**講解語言**設定，不新增卡片專用設定。
- 設定為 `source` 時，以每個 requested target title 本身的語言為準：英文使用英文、
  繁體中文使用繁體中文、日文使用日文。同一批草稿可以逐張使用不同語言，閱讀區段的
  語言不得覆蓋這項判斷。
- 設定為 `zh-TW`、`en` 或 `ja` 時，批次內每張草稿分別固定使用繁體中文、英文或日文。
- 所選語言套用到釋義、用法說明與例句翻譯；title、IPA、英文例句及其他需保留原貌的
  內容不被強制翻譯。
- 結構化 `sense` 維持簡短英文語義識別，確保既有候選查詢與語義去重契約不變。

## 5. Trust Boundaries

- Renderer 只能傳 typed intent、最多 50 個 title／senseHint，不能指定 SQL、資料庫路徑、
  skill 路徑、Codex method 或任意查詢。
- 初次 AI 回傳的 draft title 必須屬於 requested targets；existing／trashed id、標題、
  語義與狀態必須逐一等於程式提供的候選。
- 提交 recheck 必須恰好為每個 included draft 回傳一個 decision；match id 必須來自
  同標題且狀態相符的候選。
- 對話 store、IPC、Controller 與 repository 都重新驗證 enum、必要文字及批次 id。
- 一般問答、引用、否定句不會啟用 creation skill；只有快捷操作、解析邀請、既有澄清
  回答，或明確含建立動作與卡片／生詞庫目的地的英文、繁體中文請求會啟用。
  隔離 turn 禁用工具、網路、plugins、apps、memories 與 skill discovery。

## 6. Persistence and UI

對話 store 使用 version 2 保存 message attachments：

- `learningItemRequest`
- `learningItemInvitation`
- `learningItemBatch`
- `artifactError`

version 1 對話可讀取並在下次保存時遷移。草稿內容、included／excluded、候選 match、
提交時間及 created item ids 都附著於原 assistant message。移除整筆對話會移除草稿，
但不影響已提交的正式項目。

中央 `LearningItemDraftDialog` 固定 header／footer，只有卡片區垂直捲動；Markdown 使用
`react-markdown`、GFM 與 `skipHtml`。確認浮層沒有標題、類型、CEFR、語義或原始
Markdown 的編輯控制；沒有 included 草稿時提交停用。Escape、遮罩及明確關閉按鈕只
關閉 modal，不改變草稿狀態。

## 7. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/create-learning-items/SKILL.md` | 澄清、語義去重、草稿與提交 recheck 契約 |
| `.agents/skills/explain-reader-annotations/SKILL.md` | word／phrase invitation 契約 |
| `apps/desktop/src/main/learning-library-service.ts` | exact-title 候選查詢、atomic create、restore |
| `apps/desktop/src/main/learning-item-artifacts.ts` | result、invitation、recheck JSON 驗證 |
| `apps/desktop/src/main/learning-item-duplicate-classifier.ts` | 有限候選的單次隔離 AI recheck |
| `apps/desktop/src/main/chat-controller.ts` | workflow、turn scope、持久批次 mutation／submit |
| `apps/desktop/src/main/chat-conversation-store.ts` | version 1→2 與 attachments 持久化 |
| `apps/desktop/src/main/chat-ipc.ts` | creation intent 與草稿操作 IPC 驗證 |
| `apps/desktop/src/renderer/LearningItemDraftDialog.tsx` | 批次按鈕、唯讀預覽／排除／還原／提交 modal |
| `apps/desktop/src/renderer/App.tsx` | 閱讀／生詞庫入口、invitation 與 modal 整合 |

## 8. Tests

- `learning-library-service.test.ts`：exact normalized query 與交易新增。
- `learning-item-artifacts.test.ts`：三種 fenced artifact 的嚴格驗證。
- `learning-item-duplicate-classifier.test.ts`：單次有限候選 AI recheck。
- `chat-controller.test.ts`：skill routing、候選範圍、持久澄清、草稿生命週期、重查、
  還原、不可重複提交、自然語言 target 澄清 continuation，以及 source／固定講解
  語言映射。
- `chat-conversation-store.test.ts`：version 1→2 與批次持久化。
- `chat-ipc.test.ts`：intent、targets 與 mutation 邊界。
- `learning-item-draft-dialog.test.tsx`、`App.test.tsx`：批次 UI、快捷／邀請入口，以及
  英文／繁體中文自然語言 creation intent。
- `desktop.spec.ts`：production skill 安裝與 preload bridge 白名單。

## 9. Non-goals

不支援 sentence 卡片、來源追溯、完整生詞庫 AI 搜尋、任意 AI 資料庫工具、自動提交、
背景 AI 意圖分類、間隔複習、匯入／匯出、同步或跨裝置資料。第一版自然語言入口只辨識
明確的英文與繁體中文建立請求；其他語言仍使用快捷操作。
