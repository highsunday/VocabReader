---
author: Codex
date: 2026-08-03
title: 在閱讀區段加入可批改與再次作答的復述練習
uuid: 691e7ffd-36cc-4ff7-82c4-fd4b8016c975
version: 1.2.0
status: implemented
---

# Feature Specification - 閱讀區段復述練習

## 1. Feature Overview

目前閱讀頁右側的 **AI 對話面板**可以解析標記及建立互動式閱讀測驗，但使用者仍缺少一個
把「看得懂」轉成「能以原文語言自行提取並重新組織」的練習入口。本功能新增獨立的
**區段復述練習**：使用者完成一段閱讀後，從右側快捷功能啟動練習，並在 AI 訊息內展開的
單一大型文字框中，以目前**閱讀區段**的原文語言自由復述。

AI 批改時必須把內容理解和語言表達分開處理。它先指出內容誤解、重要遺漏與可改善的語言
表達，再提供同時修正理解及表達、但盡量保留使用者寫法的**基礎修正版**；之後只能在基礎
修正版上補入少量重要原文細節，形成**進階優化版**。最後以內容正確度、內容完整度及語言
表達各 0–5 分組成**復述評分**，總分為 15 分。

每份練習第一次批改後提供一次「再復述一次」。第二次使用新的空白文字框，仍以同一閱讀
區段作答；完成後顯示第二份完整批改及兩次分數比較。同一份練習最多兩次作答，若要繼續
練習，使用者可再次點擊右側入口建立新練習。

原文在整個練習期間維持可見；系統不模糊原文、不禁止查看，也不追蹤使用者是否查看。
本功能屬於單一閱讀區段內的暫態主動輸出練習，不建立學習項目、不更新複習排程，也不新增
跨啟動成績歷史。

## 2. Requirements (User Story)

- **As a** 閱讀書籍並想把被動理解轉成主動表達的學習者
- **I want** 針對目前閱讀區段自由復述、取得分項批改，並在閱讀回饋後再作答一次
- **So that** 我可以辨認自己是理解錯誤、遺漏內容，還是尚未能以原文語言清楚組織意思

## 3. Acceptance Criteria

- **Scenario 1：右側顯示復述練習入口**
  - **Given** 使用者位於章節閱讀頁且目前有非空閱讀區段
  - **When** AI 對話面板展開
  - **Then** 右側快捷功能顯示可辨識的「Retelling practice」入口
  - **And** Codex 未就緒、正在回覆、正在管理對話或沒有非空閱讀區段時入口停用
  - **And** 既有標記解析、Add cards 與 Reading quiz 入口維持原行為

- **Scenario 2：依原文語言建立自由作答區**
  - **Given** 復述練習入口可用
  - **When** 使用者點擊入口
  - **Then** 系統只把目前閱讀區段、書籍與章節上下文送給固定復述 skill
  - **And** AI 判斷閱讀區段的主要原文語言
  - **And** 有效 task artifact 在產生它的 AI 訊息下方顯示可展開的練習元件
  - **And** 展開後明確提示應使用的原文語言，例如「請使用英文表達原意或復述」
  - **And** 只提供一個大型多行文字框，不要求主旨、支持細節、句數或字數
  - **And** 卡片、折疊、紙張質感、間距、批改色彩與窄欄互動風格應和既有閱讀測驗一致

- **Scenario 3：原文保持可見且可自由參考**
  - **Given** 使用者正在撰寫復述
  - **When** 使用者查看左側閱讀內容、收合或重新展開練習元件
  - **Then** 目前章節原文及閱讀區段不被模糊、遮蔽或鎖定
  - **And** 系統不記錄或標示使用者是否查看原文
  - **And** 收合後重新展開仍保留本次工作階段尚未提交的文字

- **Scenario 4：提交第一次復述並等待批改**
  - **Given** 第一次文字框含有非空答案
  - **When** 使用者提交復述
  - **Then** 系統把 practice id、attempt 1 與原始答案送回產生練習的同一 AI 對話
  - **And** 送出後鎖定第一次答案並顯示 AI 批改中
  - **And** 空白答案不可提交，重複點擊不得重複送出
  - **And** 若送出或批改失敗，答案仍保留並顯示可理解的錯誤

- **Scenario 5：先提供具體修改意見**
  - **Given** AI 收到第一次或第二次復述答案
  - **When** AI 比對答案與目前閱讀區段
  - **Then** 批改結果先指出已正確傳達的部分
  - **And** 分開列出內容誤解或無原文依據的陳述、重要遺漏，以及語言組織、遣詞、搭配、
    文法或自然度的改善建議
  - **And** 每項建議具體對應使用者實際答案，不以答案長短本身判定表達品質
  - **And** 批改說明使用提交練習時的全域講解語言

- **Scenario 6：提供基礎修正版**
  - **Given** 使用者答案包含內容誤解或語言問題
  - **When** AI 產生基礎修正版
  - **Then** 修正版改正與原文衝突或無依據的內容
  - **And** 修正妨礙正確、清楚或自然表達的語言問題
  - **And** 盡量保留使用者原本句型、表達方式及已正確傳達的意思
  - **And** 修改說明明確區分內容理解修正與語言修正
  - **And** 基礎修正版使用閱讀區段的原文語言

- **Scenario 7：提供只前進一步的進階優化版**
  - **Given** 已有內容正確的基礎修正版
  - **When** AI 產生進階優化版
  - **Then** 進階優化版以基礎修正版為唯一底稿
  - **And** 只補入少量、對理解最重要且可由閱讀區段直接支持的細節
  - **And** 不加入區段以外的知識、推論或虛構內容
  - **And** 不重寫成完整標準答案，也不以更高階文法或詞彙取代使用者全部表達
  - **And** 清楚列出本版額外補入的細節
  - **And** 進階優化版使用閱讀區段的原文語言

- **Scenario 8：顯示三項復述評分**
  - **Given** AI 已完成一次復述批改
  - **When** App 取得有效 grade artifact
  - **Then** 顯示內容正確度、內容完整度及語言表達各 0–5 分
  - **And** 顯示三項相加的 0–15 總分
  - **And** 每一分項附有符合該分數的簡短理由
  - **And** 內容正確度只反映誤解、扭曲或無依據內容
  - **And** 內容完整度只反映主旨、關鍵關係與重要細節的涵蓋及遺漏
  - **And** 語言表達只反映清楚度、組織、用詞、搭配、自然度及文法
  - **And** 三項分數均為整數且總分必須等於三項相加

- **Scenario 9：回饋後再復述一次**
  - **Given** 第一次批改已完成
  - **When** 使用者點擊「Retell again」
  - **Then** 元件顯示新的空白大型文字框，不預填第一次答案、基礎修正版或進階優化版
  - **And** 作答語言提示、閱讀區段及批改講解語言與第一次相同
  - **And** 第一次答案、批改與分數仍可查看
  - **And** 第二次提交使用相同 practice id 與 attempt 2

- **Scenario 10：完成第二次批改並比較進步**
  - **Given** 第二次復述已提交
  - **When** AI 回傳有效的第二次 grade artifact
  - **Then** 顯示第二次的完整修改意見、基礎修正版、進階優化版及三項評分
  - **And** 顯示兩次各分項及總分的差異
  - **And** 比較只描述可由兩次答案與分數支持的進步或仍需注意之處
  - **And** 不再顯示第三次作答入口
  - **And** 使用者仍可由右側快捷功能建立另一份新練習

- **Scenario 11：維持 artifact、對話與安全邊界**
  - **Given** AI 正在建立或批改復述練習
  - **When** App 接收串流訊息與 fenced JSON artifact
  - **Then** 只有完整且符合固定 schema 的 task／grade artifact 能改變練習狀態
  - **And** grade 的 practice id、attempt 與必要欄位必須匹配目前練習
  - **And** 無效或不完整 artifact 不造成崩潰、不解鎖錯誤步驟，也不覆寫有效結果
  - **And** 原始 AI 與使用者訊息仍保存在同一 AI 對話
  - **And** Renderer 不能指定任意 skill、prompt、路徑、工具或 Codex 權限

- **Scenario 12：維持區段練習與複習排程邊界**
  - **Given** 使用者建立並完成區段復述練習
  - **When** 一次或兩次批改完成
  - **Then** 系統不建立學習項目、不建立複習歷史，也不更新 FSRS 或下一次複習時間
  - **And** 不新增復述資料表、跨啟動草稿或成績趨勢

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 復述入口 | 閱讀頁、非空區段且 Codex ready | 查看右側快捷功能 | 顯示可用 Retelling practice；忙碌或空區段時停用 | Critical |
| TC2 | 建立練習 | 點擊復述入口 | AI 回傳有效 task artifact | AI 訊息下顯示可展開練習元件與明確原文語言提示 | Critical |
| TC3 | 自由作答區 | 展開練習 | 查看表單 | 只有單一大型文字框，沒有主旨／細節欄位或長度要求 | Critical |
| TC3A | 閱讀測驗一致風格 | 復述練習展開或完成批改 | 查看元件與窄欄排版 | 沿用閱讀測驗的卡片、紙張、折疊、間距與紅筆批改視覺語言 | High |
| TC4 | 原文可見 | 練習展開或收合 | 查看閱讀頁 | 原文不模糊、不遮蔽、不追蹤查看狀態，草稿可保留 | High |
| TC5 | 第一次提交 | attempt 1 有非空答案 | 點擊提交 | 送出固定 practice id／attempt／answer，鎖定並顯示批改中 | Critical |
| TC6 | 改善意見 | 答案含誤解、遺漏與語言問題 | 解析 grade | 先顯示正確處、內容修正、遺漏及語言改善建議 | Critical |
| TC7 | 基礎修正版 | grade 完整 | 查看批改 | 修正內容及語言、保留使用者寫法，並區分兩類修改 | Critical |
| TC8 | 進階優化版 | 基礎修正版完成 | 查看進階版本 | 只加入少量有原文依據的細節，列出新增內容且不自由重寫 | Critical |
| TC9 | 三項評分 | grade 完整 | 查看分數 | 三項皆為 0–5 整數，總分正確且各有理由 | Critical |
| TC10 | 再復述 | 第一次 grade 完成 | 點擊 Retell again | 顯示空白 attempt 2，保留第一次結果，不預填任何版本 | Critical |
| TC11 | 第二次比較 | 第二次 grade 完成 | 查看結果 | 顯示完整第二次批改、三項差異與總分差異，不提供第三次 | Critical |
| TC12 | 作答與講解語言 | 原文與講解語言不同 | 建立及批改 | 答案提示／兩版修訂使用原文語言，批改說明使用講解語言 | Critical |
| TC13 | 無效 artifact | 串流半份、錯誤 schema、錯誤 id／attempt／總分 | 解析訊息 | 忽略無效 artifact 並保留既有練習狀態 | High |
| TC14 | 既有功能隔離 | 使用標記解析、Add cards 或閱讀測驗 | 完成功能流程 | 不建立、提交或覆寫復述練習 | High |
| TC15 | 無持久化與排程影響 | 完成兩次復述 | 檢查 contracts 與資料層 | 無復述資料表、複習事件、FSRS 或學習項目變更 | High |

## 5. Implementation Notes

- 新增 App bundled skill `.agents/skills/practice-segment-retelling/SKILL.md`，明確區分
  preparation mode、attempt 1 grading mode 與 attempt 2 grading mode。Skill 只能使用目前
  `<reading-segment>` 及同一練習先前回合，不可推測區段外內容。
- `SendChatMessageInput.intent` 新增受限的 `practiceRetelling`，並同步更新 Renderer、IPC
  白名單、`ChatController` 的 fixed skill injection、Main bundle import／install 與測試。
- 點擊入口時由 preparation turn 判斷原文語言，回傳固定 `reading-retelling-task` fenced
  JSON。Task 至少包含 version、kind、practiceId、answerLanguage 與使用講解語言撰寫的
  answerInstruction；不得包含主旨、提示答案或原文摘要。
- 提交時使用固定 `$submit-segment-retelling` payload，包含 practice id、attempt 及未修改的
  使用者答案。Renderer 不接受 artifact 提供任意 intent、skill 名稱或 prompt。
- 批改回傳固定 `reading-retelling-grade` fenced JSON。Grade 至少包含 practiceId、attempt、
  使用講解語言的具體改善意見、基礎修正版、進階優化版、新增細節、三項整數分數、各項
  理由與總分；attempt 2 另含兩次比較。Parser 必須驗證 id、attempt、分數範圍與總分。
- 建議新增獨立 `SegmentRetellingPractice.tsx` 與 `segment-retelling-artifact.ts`，沿用
  `ReadingPracticePaper` 的 AI 訊息內可折疊 artifact、送出鎖定、錯誤保留與窄欄排版模式，
  但不把兩種不同 schema 塞入既有閱讀測驗元件。
- 同一 AI 對話只把最新有效 task artifact 視為目前復述練習；第二次 grade 必須匹配同一
  practice id，且 attempt 1 已存在。建立新練習後，舊練習的訊息仍在對話中但不再成為目前
  可互動元件。
- 草稿只保存在 Renderer 元件工作階段；AI 訊息、已提交答案與 grade artifact 仍沿用目前
  `LocalChatConversationStore` 的 AI 對話保存。此版本不新增獨立 repository 或 migration。
- UI 文字沿用目前桌面 App 的英文介面；由 AI 產生、需要教學解讀的 answerInstruction、
  修改意見、評分理由與比較則使用全域講解語言。

## 6. Assumptions, Non-goals, and Open Questions

### Assumptions

- 閱讀區段具有可判定的主要原文語言；少量引用、專有名詞或混合語句不改變主要語言。
- 使用者可能邊看原文邊復述；是否查看原文不參與任何分數。
- 答案長度沒有最低字數，但空白答案不構成一次可批改的嘗試。
- 「少量重要細節」是相對於使用者目前表現的一步增量，由 AI 依區段與答案判斷；不可退化為
  完整標準答案。

### Non-goals

- 不隱藏、模糊或遮蔽原文，也不記錄使用者是否查看原文。
- 不提供主旨、支持細節、句數、字數、句型或詞彙模板。
- 不接受語音錄製、語音轉文字或口說流暢度評分。
- 不提供第三次以上的同一份練習嘗試。
- 不保存未提交草稿至下一次 App 啟動，不建立復述歷史頁、統計圖或成績趨勢。
- 不建立學習項目、不更新間隔複習排程，也不改變閱讀測驗題型或評分。
- 不顯示模型內部推理或 chain-of-thought；「批改中」只呈現一般進度狀態。

### Open Questions

- 無阻擋實作的未決問題。

## 7. Affected Modules and Files

### Production code

- `.agents/skills/practice-segment-retelling/SKILL.md`（新增）
- `.agents/skills/practice-segment-retelling/agents/openai.yaml`（新增）
- `apps/desktop/src/shared/chat-contracts.ts`
- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-ipc.ts`
- `apps/desktop/src/main/bundled-skill.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/SegmentRetellingPractice.tsx`（新增）
- `apps/desktop/src/renderer/segment-retelling-artifact.ts`（新增）
- `apps/desktop/src/renderer/styles.css`

### Test code

- `apps/desktop/src/main/segment-retelling-skill.test.ts`（新增）
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/chat-ipc.test.ts`
- `apps/desktop/src/main/bundled-skill.test.ts`
- `apps/desktop/src/renderer/SegmentRetellingPractice.test.tsx`（新增）
- `apps/desktop/src/renderer/segment-retelling-artifact.test.ts`（新增）
- `apps/desktop/src/renderer/App.test.tsx`
- `apps/desktop/tests/e2e/desktop.spec.ts`

### Documentation

- `CONTEXT.md`
- `documents/implements/F49-segment-retelling-practice.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/skill-management.md`

## 8. Implementation Record

### Status

Implemented on 2026-08-03.

### Implementation Summary

- Added a fixed `practice-segment-retelling` bundled skill with preparation, first-attempt grading,
  and second-attempt comparison contracts. The skill derives the answer language from the bounded
  source segment, uses the current explanation-language setting for teaching feedback, and treats
  the supplied book text as untrusted content rather than instructions.
- Added the allowlisted `practiceRetelling` intent through shared contracts, IPC validation, bundled
  skill installation, Main startup, and `ChatController` fixed-skill injection. Renderer input cannot
  select a path, skill, prompt, or Codex permission.
- Added strict task/grade artifact parsing. It rejects partial streams, malformed schemas, mismatched
  practice ids or attempt order, scores outside 0–5, incorrect totals, and inconsistent second-attempt
  deltas.
- Added an inline, collapsible `SegmentRetellingPractice` using the existing reading-paper visual
  language. It provides one large freeform textarea, preserves an unsubmitted draft while folded,
  locks submitted answers, shows four feedback groups, two revision levels, three scores plus total,
  permits one blank second attempt, and then shows the score comparison without a third-attempt action.
- Integrated the shortcut with the current START/END reading segment while leaving the source visible
  and avoiding learning-item, review-history, FSRS, database, and migration changes.

### Test Coverage

- Added parser tests for valid artifacts, streaming/malformed input, score invariants, attempt order,
  practice-id matching, and comparison deltas.
- Added component tests for a single freeform field, draft retention, duplicate-submit prevention,
  complete feedback rendering, blank second attempt, second-attempt comparison, and the two-attempt cap.
- Added App integration tests for shortcut availability/order, bounded current-segment submission,
  source visibility, inline expansion, and explanation-language propagation.
- Added Main tests for skill installation, intent validation, fixed instruction injection, source-language
  handling, and bounded payload composition.
- Updated Electron E2E coverage to verify the new runtime skill is installed. While restoring the full
  E2E suite, refreshed exact existing annotation-tool CSS expectations and current learning-card
  accessible names; the sticky-toolbar assertion now runs after first-window card interactions so its
  bottom-scroll state cannot invalidate later virtualized-card locators.

### Changed Files

- Production: `.agents/skills/practice-segment-retelling/`, shared chat contracts, Main bundled-skill /
  controller / IPC / startup wiring, Renderer App integration, artifact parser, practice component,
  and retelling-only styles.
- Tests: Main skill / controller / IPC / installer tests, Renderer parser / component / App tests, and
  Electron E2E.
- Documentation: `CONTEXT.md`, this F49 record, and the reading-comprehension, AI-conversation, and
  skill-management module documents.

### Commands Executed

- `npm test`: passed — server 3/3 and desktop 379/379 tests across 37 files.
- `npm run typecheck`: passed for server and desktop.
- `npm run build`: passed for server, Electron Main/Preload, and Vite Renderer production bundles.
- `npm run test:e2e`: passed — 2/2 Electron scenarios.
- `git diff --check`: passed.

### Acceptance Criteria Verification

- Scenarios 1–12 verified. The shortcut is range-gated; task and grade artifacts are message-bound and
  schema-validated; the source remains visible; both attempts use one freeform field; feedback language
  follows Settings; revisions use the source language; scores are exact; and no persistent learning or
  scheduling state is written.

### Test Scenario Verification

- TC1–TC5: covered by App and component integration tests for availability, preparation, freeform UI,
  visible source, draft retention, submission locking, and error preservation.
- TC6–TC12: covered by skill-contract, parser, and component tests for feedback order, both revision
  levels, scoring, language separation, blank second attempt, and comparison.
- TC13–TC15: covered by parser rejection tests, existing-feature regression tests, and the absence of
  repository / database / FSRS mutations in the fixed intent path.
- TC3A: covered by component class assertions, retelling-scoped CSS, production build, and Electron E2E.

### Deferred Items

- Cross-restart draft persistence, a standalone retelling-history or trend view, voice input, and a third
  or later attempt remain explicit non-goals.

### Known Limitations

- A draft exists only while its Renderer component remains mounted in the current App session. Submitted
  user/AI messages continue to use the existing local conversation store.
- Source-language detection and pedagogical grading are model-produced; the strict artifact layer
  validates structure, identity, order, and arithmetic but cannot independently prove semantic quality.
- Bundled chat-skill registration remains repeated across a typed union, installer wiring, Main startup,
  controller options, and related tests. This pre-existing pattern is a reasonable future RXX candidate
  if more chat skills are added, but it does not block F49.

## Appendix: TDD Implementation Checklist

1. 先依 TC1–TC15 建立 intent、skill contract、artifact parser、元件互動與 App 整合的失敗測試。
2. 實作最小固定 skill、controller／IPC 白名單、artifact parser 與互動元件使測試通過。
3. 在綠燈後整理共用的 chat artifact 呈現模式，但不強迫閱讀測驗與復述共用不同的 schema。
4. 執行 Desktop 全套測試、TypeScript typecheck、production build、Electron E2E 與
   `git diff --check`。
5. 更新本文件 Implementation Record，並同步三份受影響 module 文件。
