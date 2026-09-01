---
author: Codex
date: 2026-09-01
title: 正規化自然語言新增卡片的 intent targets
uuid: 35d83b92-c779-476d-a24f-c243933c9197
version: 1.0.0
status: implemented
---

# Bug Fix: 正規化自然語言新增卡片的 intent targets

## 1. Bug Overview

使用者在 **AI 對話面板**輸入 `add dormitory` 或多個單字／片語時，AI 已正確
辨識建立意圖及 dictionary forms，卻將 `learning-item-intent.targets` 輸出為
string array。Main 只接受 `{title}` object array，因此顯示
`Invalid learning-item creation intent`，沒有進入草稿準備階段。

BUG-003 的 raw session 證據顯示單一、四個與六個 targets 都穩定出現同一 shape；
數量限制、Renderer targets 拆分與舊 bundle 均已排除。

## 2. Fix Objective

- 明示 routing artifact 的 target object contract，降低模型輸出 shape drift。
- 安全接受已觀測、語義無歧義的 string targets，正規化為 `{title}`。
- 保留既有欄位白名單、非空 title 與最多 50 targets 的驗證邊界。
- 確認 ordinary natural-language turn 仍會自動進入受信任的草稿準備 turn。

## 3. Acceptance Criteria

- **Given** ordinary turn 的 AI 回傳 `targets: ["dormitory"]`
  **When** Main 解析 intent，**Then** 目標成為 `[{"title":"dormitory"}]` 並啟動草稿準備。
- **Given** prompt 要求產生 learning-item intent，**Then** contract 必須提供
  `{title}` 與 `{title,senseHint}` 範例並禁止 bare strings。
- **Given** 空字串或 51 個 string targets，**Then** artifact 仍被拒絕。
- **Given** 真實六目標輸入，**Then** Electron 完成候選查詢、第二階段建立與可審查草稿。

## 4. Implementation

- `composeDeveloperInstructions()` 加入明確的 object-shape routing contract。
- `parseLearningItemArtifacts()` 僅在 `learning-item-intent` 邊界把 string element
  映射為 `{title}`，再交由既有 `learningItemInvitationFromUnknown()` 驗證。
- 沒有改變 batch trusted scope、候選查詢或 learning-library 寫入邊界。

## 5. Red → Green Record

- 紅燈：prompt contract、真實 6-target parser replay 與 Controller 自動 routing
  共 3 個目標測試失敗；parser 回傳現場錯誤指紋，Controller 沒有查詢 candidates。
- 綠燈：修正後目標測試 4/4；string targets 正規化成功，candidate query 執行一次，
  空字串與 51 targets 仍拒絕。
- 相關 suites：189/189 passed。
- 完整回歸：Server 3/3、Desktop 590/590 passed；typecheck 與 build passed。
- 現場驗收：真實 6-target ordinary turn 正規化後完成第二個 creation turn，
  辨識 1 個 existing item 並產生 5 個 drafts。

## 6. Changed Files

- `apps/desktop/src/main/chat-controller.ts`
- `apps/desktop/src/main/chat-controller.test.ts`
- `apps/desktop/src/main/learning-item-artifacts.ts`
- `apps/desktop/src/main/learning-item-artifacts.test.ts`
- `documents/modules/learning-item-creation.md`
- `documents/bugs/BUG-003-natural-language-card-intent-rejected.md`

## 7. Deferred Items

- 未對任意新 intent shape 做寬鬆 coercion；若未來觀測到其他 shape，需先取得 raw
  artifact 並個別評估，不以通用猜測取代 schema 驗證。
- build 的既有 bundle-size warning 不屬於本案。
