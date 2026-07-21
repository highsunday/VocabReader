---
title: 結構化學習卡提案模組
module: learning-card-proposals
status: active
last_updated: 2026-07-22
related_implements:
  - F20-structured-ai-learning-proposals
---

# 結構化學習卡提案模組

此 Main-process workflow 是獨立於一般 AI 對話的短暫兩段 App Server thread。它只接收 Renderer 提供的非空閱讀區段與區段內可接受標記，使用 `turn/start.outputSchema` 先分類 word/phrase 候選，再由 `LocalLearningLibrary` 以 source、canonical form、type 和 aliases 查詢最多六筆候選，最後產生 create/update/unchanged/create-distinct-sense 的可審閱提案。

AI 沒有資料庫、檔案、網路或任意工具存取權；thread 使用空 environments、無 dynamic tools 並停用 plugins/apps/memories/web。Main 以 matching `item/completed` notification 等待每個 structured turn，設定兩分鐘 timeout，逾時會請求 interrupt 並關閉 client，不使用忙碌輪詢。Main 驗證 JSON、必要欄位、action、item id 與 in-segment source，並自行計算欄位 diff。此模組絕不寫入 SQLite；Q01-04 才能套用提案。

Key files: `learning-proposal-controller.ts`, `learning-proposal-ipc.ts`, `learning-library-service.ts`, `learning-proposal-controller.test.ts`, `.agents/skills/generate-learning-cards/SKILL.md`.
