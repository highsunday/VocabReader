---
bug-id: BUG-003
title: 右側欄自然語言新增卡片被拒絕
status: resolved
severity: high
created: 2026-09-01
updated: 2026-09-01
related-bxx: B43
---

# BUG-003 排查軌跡：右側欄自然語言新增卡片被拒絕

## 狀態快照（接手者先讀這一段）

- **已確認根因：** prompt 未明示 target object shape，AI 穩定輸出 bounded string array；Main 僅接受 object array，因而拒絕語義正確的 artifact。
- **已排除（別再找）：** 舊 Electron bundle；Renderer 快捷按鈕 targets 拆分；50-target 上限。
- **下一步要做什麼：** 無；若相同錯誤指紋復發，先擷取新的 raw intent shape 再另案處理。
- **進度：** 已做 3 次實驗；raw replay、Controller flow 與真實 Electron 流程皆通過，相關 189/189、完整 590/590、typecheck 與 build 通過。

## 1. Bug 描述

使用者在 **AI 對話面板**以 ordinary chat message 輸入 `add` 加多個單字／片語，
送出後系統本應辨識明確建立意圖、查詢 targets 的有限候選並準備草稿，
實際連續兩次都顯示 artifact 驗證錯誤，沒有產生可審查草稿。

**錯誤指紋（用來辨識復發）：**

```text
Invalid learning-item creation intent
```

## 2. 重現步驟

```text
# 環境：macOS，Electron dev App，@reader/desktop-dev user data
1. 啟動 `npm run dev -w @reader/desktop`。
2. 在 AI 對話面板送出 ordinary message：
   add dormitory foul slugs
   menacing shrill piped up
3. 等待 AI turn 完成。
4. 預期顯示草稿；實際顯示錯誤指紋。
```

出現頻率：目前現場 2/2 穩定發生。

## 3. 完成條件 (Done)

| 指標 | 基準值（現在） | 目標值（修好後） | 目前最佳 |
| ---- | -------------- | ---------------- | -------- |
| 真實 ordinary `add` 輸入產生可審查草稿 | 0/2 | 現場 1/1 | 1/1 |
| 真實失敗 artifact replay | 0/2 現場失敗 | 3/3 自動測試執行成功路由 | 3/3 |
| ordinary valid/invalid intent 回歸 | 自動測試通過 | 全數通過 | 全數通過 |

## 4. 已確認事實（建立後視為真，不再重測）

| 事實 | 如何被確認 | 日期 |
| ---- | ---------- | ---- |
| 失敗輸入的 user bubble 是 `add ...`，不是 Renderer 快捷產生的 `Add cards: ...` | 使用者兩張截圖與 `App.tsx` 快捷文字對照 | 2026-09-01 |
| 目前 dev Electron 於 19:46:52 啟動，執行 bundle 含 B42 `acceptIntent` | process start time、bundle mtime 與 `main.cjs` 內容比對 | 2026-09-01 |
| 錯誤指紋只會由 `learning-item-intent` 解析分支產生 | `learning-item-artifacts.ts` 錯誤字串唯一性搜尋 | 2026-09-01 |
| 真實 AI 對 4 或 6 targets 都輸出 JSON string array，並正確還原單複數／片語原型 | Codex session raw `response_item` 與 `task_complete.last_agent_message` | 2026-09-01 |
| 單一 `add dormitory` 也輸出 `targets:["dormitory"]` 並失敗 | 使用者第三張截圖與 raw session turn `01a05ccc-596f-7180-b232-a9c8f71c1240` | 2026-09-01 |
| 修正後真實 6-target ordinary turn 完成兩階段路由與草稿準備 | conversation store、raw session turns `01a05cd3-705e-7dc3-af04-3873327a7f45` 與 `01a05cd3-8a44-7fd2-a851-9e36c463a371` | 2026-09-01 |

## 5. 調查範圍

### 5.1 已排除 — 確認非原因

| 範圍 / 元件 | 排除依據 | 日期 |
| ----------- | -------- | ---- |
| 舊 dev bundle／未重啟 | 執行中 bundle 晚於 B42 build 且包含修正字串 | 2026-09-01 |
| Renderer 快捷 targets 拆分 | 失敗 user bubble 不是快捷產生的文字；此 turn 未提供 typed intent | 2026-09-01 |
| 50-target 數量上限 | 現場輸入僅 6 個 targets | 2026-09-01 |

### 5.2 可疑點

| 優先 | 範圍 / 元件 | 懷疑理由 | 狀態 |
| ---- | ----------- | -------- | ---- |
| 🔴 | developer prompt 未明示 target object shape | 真實模型多次穩定選擇簡潔 string array | 已確認並修正 |
| 🔴 | parser 拒絕語義等價的 bounded strings | string targets 已是合法 canonical titles，但在 object validator 失敗 | 已確認並修正 |

### 5.3 未調查

- [ ] 修正後是否還有其他真實 intent shape 失敗指紋。

## 6. 當前假說

根因假說已由 raw session trace 證實：prompt 只說明「at most 50 targets」，
沒有要求每個 target 是 `{ "title": "..." }` object；AI 因而輸出語義等價的
string array。修正需同時收緊生成契約與容忍這個已觀測、可安全正規化的
bounded shape，避免單靠模型格式穩定性。

## 7. 實驗紀錄

### EXP-001 — 2026-09-01

- **假說：** 使用者仍在執行 B42 修正前的 Electron main bundle。
- **修改內容：** 無；唯讀比對 process start time、source／dist mtime 與 bundle 內容。
- **測試指令：** `ps -axo pid,lstart,command`、`stat`、`rg acceptIntent apps/desktop/dist-electron/main.cjs`。
- **指標變化：** 現場成功率 0/2 → 0/2（無修改）。
- **結果：** ❌ 假說被推翻；執行中 dev App 已包含 B42。
- **觀察 / 新線索：** 截圖 user bubble 證明失敗是 ordinary turn，不是 typed fast path。

### EXP-002 — 2026-09-01

- **假說：** dev 對話 store 或 Codex thread history 保留失敗 turn 的原始 assistant artifact。
- **修改內容：** 無；唯讀搜尋 `@reader/desktop-dev` 對話 store 與對應 Codex session JSONL。
- **測試方式：** 以截圖 targets 搜尋 user-data store，再檢查 raw agent message。
- **指標變化：** raw artifact 待擷取 → 已取得兩次相同 string-array shape；歷史失敗也相同。
- **結果：** ✅ 根因完全確認。
- **觀察 / 新線索：** AI 已正確將 `slugs` 還原為 `slug`、`piped up` 還原為 `pipe up`，只是容器 shape 不合。

### EXP-003 — 2026-09-01

- **假說：** 明示 target object prompt，並將無歧義 string targets 正規化為
  `{title}`，可使真實 artifact replay 通過，同時不放寬額外欄位、空字串或
  50-target 邊界。
- **已完成的測試修改：**
  - `learning-item-artifacts.test.ts` 加入真實 6-target string-array replay。
  - `chat-controller.test.ts` 加入單一 `add dormitory` 的 routing → candidate query
    → draft preparation 整合 replay，並固定 prompt object-shape 契約。
- **紅燈結果：** 3/3 目標測試按預期失敗；parser 回傳精確錯誤指紋，
  Controller 沒有查詢 candidates，prompt 沒有 object example。
- **預計 production 修改：** `chat-controller.ts` 明示 `{title}` JSON shape；
  `learning-item-artifacts.ts` 只在 intent 邊界將非空 string target 正規化為 object，
  並將正規化後資料交給既有 50-target／title validator。
- **production 修改內容：**
  - `chat-controller.ts` 加入 `{title}` / `{title,senseHint}` 明示範例及「不得使用 bare strings」。
  - `learning-item-artifacts.ts` 將 intent 內的 string elements 正規化為
    `{title}`，後續仍使用原 `learningItemInvitationFromUnknown()` validator。
- **測試指令：** `npm run test -w @reader/desktop -- src/main/chat-controller.test.ts src/main/learning-item-artifacts.test.ts -t 'matching App skill|real AI string-target|normalizes the real AI string-target|empty or excessive string-target'`
- **指標變化：** 目標測試 0/3 → 4/4；Controller candidate query 0 → 1；
  raw 6-target replay 成功正規化；空 target 與 51 targets 仍拒絕。
- **結果：** ✅ 自動 replay 完全修復。
- **觀察 / 新線索：** 只要輸入元素可以無歧義轉為 title，就不需要將可恢復的模型 shape drift 顯示為產品錯誤。
- **完整驗證：**
  - 相關 `learning-item-artifacts` / `chat-controller` / `App` suites：189/189 passed。
  - 完整 Server：3/3 passed；Desktop：590/590 passed。
  - `npm run typecheck`：passed。
  - `npm run build`：passed（僅既有 bundle-size warning）。
  - 第一次完整測試曾出現一次無關 Listen & Repeat debounce timer
    unhandled error；所有 590 assertions 仍通過，單獨重跑完整測試後沒有再現。
  - Electron dev App 已於 19:54 重啟，新 Main bundle 已載入。
- **現場驗收：** Electron dev App 收到真實模型輸出的 6-target string array 後，
  正規化為 6 個 `{title}` targets，自動啟動第二個 `$create-learning-items` turn；
  最終狀態為 `completed`，辨識既有 `dormitory` 並產生其餘 5 張草稿。
- **結果：** ✅ 完成。

## 8. 解決方案

- 在 routing developer contract 明示每個 target 必須是 `{title}` 或
  `{title,senseHint}` object，禁止 bare string。
- 在 Main 的 intent 邊界將已觀測的 string target 正規化為 `{title}`，再交給原有
  invitation validator；空字串、額外欄位與超過 50 targets 的輸入仍照舊拒絕。
- 新增真實 artifact replay、Controller 兩階段整合測試與邊界回歸。

本案由 B43 實作並於 2026-09-01 經真實 Electron 兩階段流程驗收完成。
