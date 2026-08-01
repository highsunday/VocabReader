---
title: 整合造句練習模組
module: sentence-practice
status: active
last_updated: 2026-08-01
related_implements:
  - F46-integrated-sentence-practice
  - F47-generate-sentence-practice-examples
---

# 整合造句練習模組

## 1. Purpose

本模組提供獨立的**整合造句練習（Integrated Sentence Practice）**。系統從已完成至少
一次確認複習的英文學習項目隨機抽取必要用詞，讓使用者以一篇多句故事或短文運用全部
項目；AI 先驗證每個項目與目標語義，再提供保留原意的**造句批改結果**。

本模組不屬於單一章節，也不是間隔複習回合。它不產生評級、不更新 FSRS、不新增
`learning_review_events`，且不保存永久寫作歷史。

## 2. Current Implementation Status

狀態：**已實作，可在本機使用**

目前支援：

- 側欄獨立 Sentence Practice 入口與中央工作區。
- 顯示符合資格的 active、英文、`review_count > 0` 項目數。
- 每輪可設定 2 至 10 個項目，預設 5 個；可用數不足時向下限制，少於 2 個時不啟動。
- Main process 以 SQLite `RANDOM()` 從可信任資格集合抽取不重複項目。
- 從既有 Markdown `Meaning` heading 擷取第一段簡明解釋，沒有有效內容時 fallback 至
  英文目標語義。
- 一個多句短文輸入區，空白內容不可提交。
- App-bundled AI skill 接受自然時態、單複數與其他合理詞形，並依 item `sense` 判定語義。
- 遺漏、錯誤語義或不自然詞形以結構化 revision issues 回傳，原稿保留並可重送。
- 正式結果包含完整修正版、逐項文法／搭配修改、選用自然口語建議與全部必要用詞用法。
- 練習頁可要求 AI 產生恰好三篇造句用法範例；每篇使用本輪全部必要用詞，並在具名
  對話卡片中顯示，不取代使用者草稿。
- 必要用詞可開啟既有唯讀學習項目詳情與複習摘要。
- 同一次 App 開啟期間跨工作區保留目前項目、草稿、問題與結果；明確確認新一輪後重抽。
- 關閉 App 後不恢復，也不寫入生詞庫或複習歷史。

## 3. Module Boundary

### LocalLearningLibrary

生詞庫只負責資格查詢與抽取：

- `getSentencePracticeEligibleCount()` 只計算 active、`language = en` 且 schedule
  `review_count > 0` 的項目。
- `selectSentencePracticeItems(count)` 在 Main process 驗證 2–10 邊界，再從相同資格集合
  隨機抽取指定數量；實際可用數不足時拒絕建立不完整回合。
- `sentencePracticeMeaning()` 只讀取已保存 Markdown，不執行 HTML 或呼叫 AI。
- 這些操作都是 read-only，不接觸 review events、FSRS card 或 due time。

### SentencePracticeController

Main-owned controller 負責可信任 scope 與暫態生命週期：

- 建立不可由 Renderer 指定 item ids 的一輪練習。
- 保存本輪完整 source items 與只供 Renderer 顯示的 bounded snapshot。
- 組合 item id、標題、類型、CEFR、sense、Markdown、講解語言與使用者短文，傳給隔離 AI。
- 新一輪替換舊 session；舊 AI 回覆因 session id 不符而不得覆蓋新 session。
- AI／artifact 失敗時保留原稿並轉為可重試 error phase。
- 以獨立 example-generation state 保存產生中、三篇範例與可重試錯誤；範例產生與草稿
  批改不得同時執行。
- 不依賴 `confirmReviewSession()` 或任何排程 mutation。

### AI artifact boundary

`practice-integrated-sentences` 在無工具、無網路、唯讀 sandbox 的獨立 Codex turn 執行。
AI 輸出只能有一個 `sentence-practice-result` fenced JSON：

- `needs-revision`：至少一個本輪 item issue；kind 固定為 `missing | wrong-sense |
  unnatural-form`。
- `completed`：非空 revised text、changes、選用 conversational suggestions，以及恰好覆蓋
  全部本輪 items 的 usages。

Artifact parser 拒絕錯誤 session id、未知或重複 item id、標題不符、缺少 usage、未知 kind、
空必要文字，以及 revision／completed 欄位混合的結果。

範例產生使用獨立的 `sentence-practice-examples` fenced JSON，固定包含三篇不同英文短文；
每篇 usage 必須恰好覆蓋本輪全部必要用詞。Parser 拒絕缺篇、重複本文、空文字、未知／
重複 item、標題不符或 coverage 不完整的結果。

### Electron IPC and Preload

Renderer 只可使用四個窄化操作：

- `sentence-practice:snapshot`
- `sentence-practice:start`
- `sentence-practice:submit`
- `sentence-practice:examples`

IPC 再次驗證 item count、session id、draft 與 explanation language。Renderer 無法提供 item
scope、SQL、language、review count 或 AI workflow 設定。

### Renderer

`SentencePracticeWorkspace` 負責：

- setup、數量設定、資格不足、writing、checking、needs-revision、completed 與 error UI。
- 必要用詞卡片、簡義與 issue highlight。
- 單一多句短文 textarea、空白 submit 防護與重送。
- 結構化完整修正版、修改原因、自然口語建議與必要用詞 coverage。
- 寫作操作列左側的「Show 3 examples」按鈕、右側提交按鈕、產生／錯誤／重試狀態，
  以及包含三篇範例的具名對話卡片；不顯示草稿字數計數。
- 新一輪具名 confirmation dialog，並允許在確認前改變新一輪項目數。
- 重用 `LearningItemDialog` 的 read-only capability。
- 由 `App` 保持 component mounted；非 active 時只停止渲染，不丟棄 local draft state。

## 4. State Flow

```text
open page
  → Main counts eligible reviewed English items
  → user chooses 2–10 and starts
  → Main randomly selects trusted items
  → writing (local draft)
      ├─ request examples → generating → ready (3 examples) / retryable error
  → submit bounded payload to isolated AI
      ├─ missing / wrong sense / unnatural form → needs-revision → edit and retry
      ├─ valid full result → completed feedback
      └─ runtime / malformed artifact → retryable error with draft preserved
  → explicit confirmed new round replaces transient session
```

Switching workspaces keeps the mounted controller and Renderer state. App termination clears both.

## 5. Shared Data

| Type | Meaning |
|---|---|
| `SentencePracticeItem` | bounded id、title、type、CEFR、sense 與 simple meaning |
| `SentencePracticeIssue` | 某必要用詞的 missing／wrong-sense／unnatural-form 修稿原因 |
| `SentencePracticeFeedback` | revised text、changes、conversational suggestions 與 usages |
| `SentencePracticeExample` | 一篇完整英文範例與本輪全部必要用詞 usages |
| `SentencePracticeExampleGeneration` | idle／generating／ready／error、三篇範例與錯誤 |
| `SentencePracticeSession` | session id、項目、draft、phase、issues、feedback 與 error |
| `SentencePracticeSnapshot` | eligible count 與 nullable transient session |
| `SentencePracticeDesktopApi` | snapshot、start、submit、generate examples 四個 Renderer 操作 |

## 6. Security and Privacy

- SQLite 與完整 eligibility rules 只存在 Main process。
- AI 只取得本輪 2–10 個學習項目與一篇使用者短文，不可任意查詢生詞庫或 EPUB。
- 所有 payload 內容都被 developer instructions 標示為 untrusted data，不得成為 AI 指令。
- Codex turn 關閉 tools、network、plugins、apps、memories 與額外 skills。
- AI result 經 deterministic parser 驗證後才進入 Renderer。

## 7. Key Files

| File | Responsibility |
|---|---|
| `apps/desktop/src/shared/sentence-practice-contracts.ts` | Main／Preload／Renderer 契約 |
| `apps/desktop/src/main/learning-library-service.ts` | 資格 count、隨機抽取與 Meaning 擷取 |
| `apps/desktop/src/main/sentence-practice-artifacts.ts` | AI union artifact 驗證 |
| `apps/desktop/src/main/sentence-practice-controller.ts` | 暫態 session、trusted scope 與 isolated Codex turn |
| `apps/desktop/src/main/sentence-practice-ipc.ts` | 四個 IPC 白名單與輸入驗證 |
| `.agents/skills/practice-integrated-sentences/SKILL.md` | 三篇範例生成、必要用詞驗證與保留原意的批改規則 |
| `apps/desktop/src/renderer/SentencePracticeWorkspace.tsx` | setup、writing、revision、feedback 與 detail UI |
| `apps/desktop/src/renderer/App.tsx` | 側欄入口與跨工作區 mounted lifecycle |
| `apps/desktop/src/renderer/styles.css` | 練習頁 layout、cards、editor 與 feedback 樣式 |

## 8. Testing Notes

| Test file | Coverage |
|---|---|
| `learning-library-service.test.ts` | eligibility、隨機 bounded selection、Meaning fallback、無排程副作用 |
| `sentence-practice-artifacts.test.ts` | 三篇範例、revision／completed contract、coverage 與未知 scope 拒絕 |
| `sentence-practice-controller.test.ts` | 範例生命週期、AI 互斥、重送、malformed retry、隔離 Codex turn |
| `sentence-practice-ipc.test.ts` | 四個白名單 operation 與惡意 payload 拒絕 |
| `SentencePracticeWorkspace.test.tsx` | 三篇範例卡片、草稿隔離、重試、跨頁草稿、revision 與完整 feedback |
| `App.test.tsx` | 側欄入口與獨立工作區切換 |

最近驗證（2026-08-01）：

- Desktop Vitest：361/361 passed。
- Desktop TypeScript typecheck：passed。
- Desktop production build：passed。

## 9. Known Limitations and Follow-up

- 不保存歷史作文、AI 詳細回饋、完成次數或學習成就。
- 不提供主題、故事情境、手動 item selection、deck 或標籤篩選。
- 必要用詞的自然詞形與目標語義由 AI 判斷，不提供本機英文形態分析器。
- Meaning 提示沿用項目已保存的語言；變更全域講解語言不會即時翻譯既有內容。

## 10. Related Documents

- `CONTEXT.md`
- `documents/implements/F46-integrated-sentence-practice.md`
- `documents/modules/learning-library.md`
- `documents/modules/spaced-review.md`
