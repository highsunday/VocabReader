# VocabReader

Electron + React 桌面前端與 Node.js 後端骨架。

產品包含兩套分離的學習機制：

- 章節閱讀：閱讀、劃線標記、AI 解析、加入生詞庫、章末選擇題。
- Anki 式複習：從生詞庫選取到期項目、AI 產生填空／造句題、評估回答、更新複習間隔。

## 開始使用

    npm install
    npm run dev

開發時：

- Electron renderer：http://127.0.0.1:5173
- 後端 API：http://127.0.0.1:4317
- 健康檢查：GET http://127.0.0.1:4317/health

## 驗證

    npm run typecheck
    npm test
    npm run test:e2e
    npm run build

## 專案結構

    apps/
    ├── desktop/   Electron main、preload、React renderer 與桌面冒煙測試
    └── server/    Fastify API 與 Codex AI gateway 邊界

目前 AI gateway 使用「未設定」實作，呼叫聊天 API 時會明確回傳 503。待 Codex Server App 的正式通訊協定確認後，只需替換 gateway，不需要改動路由與產品領域邊界。
