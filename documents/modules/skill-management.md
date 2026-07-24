---
title: App 內建 Skill 管理模組
module: skill-management
status: active
last_updated: 2026-07-25
related_implements:
  - F16-invoke-annotation-explanation-skill
  - F18-use-reading-comprehension-skill
  - F21-ai-assisted-learning-item-creation
  - B03-load-only-bundled-annotation-skill
  - F28-ai-graded-spaced-review-paper
  - F34-route-multilingual-learning-item-intent-with-ai
---

# App 內建 Skill 管理模組

## 1. Purpose

本模組管理 LingoShelf 隨桌面 App 發布的受信任 AI skills，負責把 skill 指令從原始碼帶入 production bundle、安裝到 Electron user data 的 Codex runtime，並交由一般 **AI 對話**或專用暫態 Controller 在單次 turn 啟用符合產品動作的 skill。

它是 **Codex AI 執行層**的技術邊界，不是使用者可自行安裝或選擇任意 skill 的管理介面。Renderer 只能送出白名單內的產品意圖，不能指定 skill 名稱、內容、路徑或 developer instructions。

## 2. Current Implementation Status

狀態：**已實作，可在本機與 production build 使用**

目前管理四份 App 內建 skills：

| Skill | 產品意圖 | Marker | 功能模組 |
|---|---|---|---|
| `explain-reader-annotations` | `explainAnnotations` | `$explain-reader-annotations` | [解釋標記模組](annotation-explanation.md) |
| `practice-reading-comprehension` | `practiceReading` | `$practice-reading-comprehension` | [閱讀測驗模組](reading-comprehension-quiz.md) |
| `create-learning-items` | `createLearningItems` | `$create-learning-items` | [學習項目建立模組](learning-item-creation.md) |
| `practice-spaced-review` | 專用生成／批改 | `$practice-spaced-review` | [間隔複習模組](spaced-review.md) |

四份 skill 的完整 `SKILL.md` 都由 App bundle 提供。一般 AI 問答不注入 skill item，也不套用任一預設 workflow；間隔複習不進入一般對話 thread。

## 3. Module Boundary and Responsibilities

本模組負責：

- 維護受信任 App skill 名單及固定 runtime 路徑。
- 在 build 時把 repo 內的 `SKILL.md` 以文字資產內嵌到 Electron Main bundle。
- 啟動 App 時安裝、略過相同版本或原子替換舊版 runtime skill。
- 驗證四份內嵌 skill 指令皆非空。
- 把完整 skill 指令與 marker gate 組成 `developerInstructions`。
- 在 `thread/start` 與 `thread/resume` 使用相同指令與隔離設定。
- 依受限產品意圖，在 `turn/start.input` 加入正確的型別化 skill item。
- 關閉一般 skill discovery、Codex bundled skills、plugins、apps、memories 與 web search。

本模組不負責：

- 決定 START／END **閱讀區段**、建立**標記**或序列化 EPUB 原文。
- 定義標記解析、閱讀測驗、學習卡片建立或間隔複習的教學／輸出規則；這些規則由各自 skill 擁有。
- 管理一般 AI 對話的訊息呈現、模型選擇、額度或對話持久化。
- 提供第三方 skill 市集、使用者安裝、啟停、版本選擇或權限設定介面。

## 4. Skill Source and Runtime Lifecycle

1. Repo 以 `.agents/skills/<skill-name>/SKILL.md` 保存可版本管理的完整教學契約；`agents/openai.yaml` 保存 UI metadata，但目前不安裝到 App runtime。
2. Desktop build 使用 esbuild Markdown text loader，把四份 `SKILL.md` 內嵌到 Electron Main bundle。
3. Electron Main 在 `app.whenReady()` 建立 `userData/codex-runtime`。
4. `bundled-skill.ts` 把內容寫入 `.agents/skills/<skill-name>/SKILL.md`：
   - 目標不存在：`installed`
   - 內容完全相同：`unchanged`
   - 內容不同：先寫 `SKILL.md.next`，再 rename 為正式檔案，回傳 `updated`
5. Main 把固定安裝路徑與同一份 bundle 內指令交給 `ChatController` 或
   `SpacedReviewController`。runtime 檔案供型別化 skill item 指向；bundle 字串供
   developer instructions 使用，兩者不從 Renderer 或任意工作目錄取得。

## 5. Thread and Turn Activation Flow

### Thread 層

`composeDeveloperInstructions()` 內嵌三份一般對話 skills，並聲明：

- 一般對話只有這三份 App skills 可用。
- 不得探索、載入或使用其他 skill。
- 標記解析只在輸入含對應 marker 時啟用。
- 閱讀測驗在 marker turn 建立題目後，同一 AI 對話中的相關答案 turn 可繼續使用批改 workflow；不相關 turn 不得套用。
- 一般對話每輪依語義判斷任何語言的明確學習項目建立意圖，只輸出受驗證的
  `learning-item-intent` targets；不得在 routing 階段直接套用 creation skill 或建立 batch。

新建 thread 與恢復既有 thread 都取得同一份 developer instructions、`approvalPolicy: never`、read-only sandbox 與相同隔離設定。

`practice-spaced-review` 不加入可恢復的一般對話 instructions。專用 Controller 每次
生成或批改建立一次性 thread，只內嵌這一份 skill，完成後立即關閉。

### Turn 層

| 輸入類型 | Text marker | Skill item |
|---|---|---|
| 一般問答 | 無 | 無 |
| 解釋標記 | `$explain-reader-annotations` | 固定名稱與固定安裝路徑的標記 skill |
| 閱讀測驗 | `$practice-reading-comprehension` | 固定名稱與固定安裝路徑的閱讀 skill |
| 閱讀測驗後續作答 | 通常無新 marker | 由同一 thread 已載入的評量 workflow 延續，不重新注入任意 skill |
| 新增學習卡片 | `$create-learning-items` | 固定名稱與固定安裝路徑的建立 skill |
| AI 路由後自動建立 | `$create-learning-items` | Controller 查完 exact-title 候選後啟動的內部固定建立 skill |
| 建立 workflow 澄清回答 | Controller 重新加入 marker | 先查同標題候選，再延續固定建立 skill |
| 間隔複習生成／批改 | `$practice-spaced-review` | 專用一次性 thread 的固定 skill |

Marker 與型別化 skill item 共同形成明確呼叫；marker gate 負責避免已載入指令在錯誤 turn 被誤用。
自然語言的第一階段 routing turn 不含 skill item。只有 AI 回傳非空且通過驗證的 targets
後，Controller 才能自動啟動第二階段固定 creation skill；快捷、invitation 與既有澄清
仍可直接進入第二階段。

## 6. Trust and Security Constraints

- `SendChatMessageInput.intent` 只允許 `explainAnnotations | practiceReading | createLearningItems`；IPC 會拒絕其他值。
- Renderer 的普通自然語言訊息不得自行附加 `createLearningItems`；多語建立意圖由
  developer instructions 約束的 AI routing artifact 表達，Main 再驗證最多 50 個 targets。
- Renderer 不可提供 skill path、skill markdown、developer instructions、工作目錄、sandbox、approval policy 或 Codex method。
- Codex runtime 工作目錄固定在 Electron user data，不指向專案 repo 或使用者任意資料夾。
- Skill 指令要求不執行工具、不讀寫檔案、不使用網路，並只使用產品明確提供的閱讀區段與既有對話。
- EPUB 內容一律視為不受信任資料，不得把書中文字當成 skill 指令。
- App 不啟用一般 skill catalog；新增 skill 時必須同步擴充固定名單、安裝入口、適用
  Controller 的 instructions、turn routing 與測試。

## 7. Key Files

| File | Responsibility |
|---|---|
| `.agents/skills/explain-reader-annotations/SKILL.md` | 區段解析的完整 AI workflow |
| `.agents/skills/practice-reading-comprehension/SKILL.md` | 區段練習的出題與批改 workflow |
| `.agents/skills/create-learning-items/SKILL.md` | 有限候選去重、澄清、草稿與提交 recheck workflow |
| `.agents/skills/practice-spaced-review/SKILL.md` | 例句生成與四級語義批改 workflow |
| `.agents/skills/*/agents/openai.yaml` | Repo 內 skill 顯示 metadata；目前不屬於 runtime 安裝內容 |
| `apps/desktop/src/main/bundled-skill.ts` | 固定 skill 名單、runtime 路徑及原子安裝／更新 |
| `apps/desktop/src/main/main.ts` | 內嵌 Markdown、啟動安裝並把路徑與指令交給 Controller |
| `apps/desktop/src/main/chat-controller.ts` | developer instructions、marker gate、隔離設定與 turn skill item routing |
| `apps/desktop/src/main/spaced-review-controller.ts` | 專用暫態 thread、review skill 注入與隔離 |
| `apps/desktop/src/shared/chat-contracts.ts` | 三種預設 intent 與 message attachments 的共享型別 |
| `apps/desktop/src/main/chat-ipc.ts` | intent 與講解語言的 IPC 白名單驗證 |
| `apps/desktop/package.json` | esbuild Markdown text loader 與 desktop build／test 命令 |

## 8. Testing Notes

| Test file | Coverage |
|---|---|
| `apps/desktop/src/main/bundled-skill.test.ts` | 四份 skills 的首次安裝、相同內容略過與舊版原子替換 |
| `apps/desktop/src/main/chat-controller.test.ts` | 新建／恢復 thread instructions、隔離 config、typed fast path、多語 AI routing、自動 creation continuation 與 skills 互斥 |
| `apps/desktop/src/main/chat-ipc.test.ts` | intent 與語言 enum 白名單，拒絕任意輸入 |
| `apps/desktop/tests/e2e/desktop.spec.ts` | production Electron 啟動後四份 runtime `SKILL.md` 確實存在且內容正確 |
| `apps/desktop/src/main/reading-comprehension-skill.test.ts` | 閱讀 skill rubric 與 UI metadata |
| `apps/desktop/src/main/spaced-review-controller.test.ts` | review skill 的一次性隔離 thread 與受信任 scope |

## 9. Known Limitations and Follow-up

- Skill 名單目前以 TypeScript union、三個 installer 函式與 Controller options 明確列出；數量增加時會產生重複修改點，可另開 RXX 評估固定 registry。
- 更新判斷使用完整文字比較，沒有獨立版本欄位、checksum manifest、遷移紀錄或安裝失敗 telemetry。
- `agents/openai.yaml` 只受 repo 測試覆蓋，沒有隨 App 安裝到 runtime；目前 runtime 僅需要 `SKILL.md`。
- 沒有使用者可見的 skill 清單、版本、健康狀態或重新安裝操作。

## 10. Related Documents

- `CONTEXT.md`
- `documents/modules/ai-conversation.md`
- `documents/modules/annotation.md`
- `documents/modules/annotation-explanation.md`
- `documents/modules/reading-comprehension-quiz.md`
- `documents/modules/spaced-review.md`
- `documents/implements/F16-invoke-annotation-explanation-skill.md`
- `documents/implements/F18-use-reading-comprehension-skill.md`
- `documents/implements/B03-load-only-bundled-annotation-skill.md`
- `documents/implements/F28-ai-graded-spaced-review-paper.md`

變更 App skill 名單、bundle 來源、runtime 路徑、marker、developer instructions、隔離設定或 turn routing 時，必須同步更新本文件與相關功能模組文件。
