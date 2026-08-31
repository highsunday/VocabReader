---
author: Codex
date: 2026-08-31
title: 將 VocabReader 產品官網遷移至 Vercel
uuid: 4e2c4c65-75b4-4f7d-8f46-de4d95a2f95e
version: 1.1.0
status: implemented
---

# Feature Specification - 將 VocabReader 產品官網遷移至 Vercel

## 1. Feature Overview

VocabReader 產品官網目前發布於 GitHub Pages 專案路徑
`highsunday.github.io/VocabReader/`。該網址可被 Google 索引，但 Google 將 favicon 與
網站名稱以 hostname 為單位，不支援專案子目錄的獨立網站身分。本功能將官網
發布到 Vercel 的獨立 production hostname，使 VocabReader 的 favicon、canonical URL、
sitemap 與搜尋結果來源具有一致的網站根目錄。

版本 1.1 將使用者既有的 `vocabreader.site` 接到 Vercel，選定
`https://www.vocabreader.site/` 為唯一 canonical origin，並將保留的 GitHub Pages 首頁與
下載頁改為對應的新網址搬家入口，避免 GitHub Pages、`vercel.app` 與自訂網域形成三份
可索引的重複內容。

官網原始碼將改由現有 `highsunday/VocabReader` repository 的 `main` 分支追蹤，
Vercel 只以 `website/` 為建置根目錄。它仍是獨立的 Vite 靜態網站，不加入 root
workspaces，不匯入 Electron App 或 server runtime。舊 GitHub Pages 網站在新站通過驗證
前保留，本功能不自動下架或破壞現有網址。

## 2. Requirements (User Story)

- **As a** 從 Google 搜尋結果認識 VocabReader 的潛在使用者
- **I want** 官網使用可獨立識別的 production hostname 與正確品牌 icon
- **So that** 我能在點擊前辨識這是 VocabReader 正式產品官網，並在點擊後安全取得安裝檔

## 3. Requirements

### 3.1 原始碼治理

- `website/` 必須納入現有 repository 的 `main` 分支版本控制。
- 官網維持獨立 `package.json`，不加入 root npm workspaces，不改變 App runtime。
- Vercel 專案只建置 `website/`，不建置 Electron App 或 server。
- Vercel 本機連結資料與 build output 不得寫入 repository。

### 3.2 根網址建置

- Vite production base 必須改為 `/`，所有 hashed asset、首頁與 `/download/` 可在
  Vercel hostname 根目錄正常載入。
- 站內導覽維持相對 URL，直接開啟 `/download/` 必須回傳完整頁面。
- Vercel production deployment 必須使用穩定專案網址，不得把單次 commit preview
  URL 寫入 canonical 或 sitemap。

### 3.3 搜尋與品牌資訊

- 首頁與下載頁 canonical 必須指向 `https://www.vocabreader.site/` 的對應正式頁面。
- sitemap 必須只列出 `https://www.vocabreader.site/` 的首頁與下載頁。
- 首頁與下載頁都必須宣告正式 VocabReader favicon，favicon 必須在網站根目錄
  具有穩定、可直接讀取的 URL。
- 首頁必須提供 `WebSite` structured data，明確宣告 `VocabReader` 網站名稱與 canonical URL。
- robots 的 sitemap、建置輸出與 Google metadata 不得殘留 `/VocabReader/` GitHub Pages base、
  `vocabreader.vercel.app` 或舊 canonical。

### 3.4 發布安全與保留邊界

- 新 Vercel 站必須在發布後通過 HTTP 200、HTML metadata、favicon、hashed assets 與
  `/download/` 現網驗證。
- 舊 GitHub Pages 站在新站通過驗證前不得下架或覆寫。
- 自訂網域通過 DNS、TLS 與內容驗證後，舊 GitHub Pages 首頁與下載頁必須使用 0 秒
  meta refresh、canonical、JavaScript fallback 與可點擊連結，直接導向各自對應的新網址。
- `gh-pages` 分支與 Google 驗證檔必須保留；搬家頁不得加入 `noindex`，不得把下載頁錯誤
  導向新首頁。
- GitHub Releases 維持安裝檔唯一來源；搬遷不得複製 installer 到 Vercel。
- 網站不新增 analytics、cookie tracking、帳號、後端或私密 token。

## 4. Acceptance Criteria

- **Scenario 1：官網可從 Vercel hostname 根目錄建置**
  - **Given** `website/` 官網原始碼
  - **When** 執行 contract tests 與 production build
  - **Then** base 為 `/`，首頁與下載頁的 assets 不含 `/VocabReader/` prefix

- **Scenario 2：搜尋資訊一致指向 production hostname**
  - **Given** Vercel 穩定 production hostname
  - **When** 檢查首頁、下載頁、sitemap 與 favicon
  - **Then** canonical 與 sitemap 只指向該 hostname，兩頁都宣告可讀取的品牌 favicon

- **Scenario 3：官網原始碼可被持續發布**
  - **Given** 現有 VocabReader repository
  - **When** 檢查 Git 與 Vercel 建置邊界
  - **Then** `website/` 不再被忽略、不屬於 root workspace，本機 Vercel 資料與 `dist/`
    維持被忽略

- **Scenario 4：新站通過現網驗證且舊站未被破壞**
  - **Given** Vercel production deployment 完成
  - **When** 請求首頁、下載頁、favicon 與 hashed assets
  - **Then** 必要資源皆回傳 HTTP 200，metadata 與建置輸出一致
  - **And** 舊 GitHub Pages 首頁仍回傳 HTTP 200

- **Scenario 5：自訂網域成為唯一搜尋來源**
  - **Given** `www.vocabreader.site` 已通過 Vercel DNS 與 TLS 驗證
  - **When** 檢查新站 metadata 與舊 GitHub Pages 搬家頁
  - **Then** 新站 canonical、sitemap、robots 與 `WebSite` structured data 只使用自訂網域
  - **And** 舊首頁與下載頁分別即時導向對應的新網址

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | Vercel 根路徑建置契約 | `vite.config.js` 與 build output | 執行 contract tests 與 build | base 為 `/`，輸出無 `/VocabReader/` prefix | Critical |
| TC2 | canonical 與 sitemap 契約 | 首頁、下載頁、sitemap | 執行 contract tests | 所有正式 URL 一致使用 `www.vocabreader.site` | Critical |
| TC3 | favicon 搜尋契約 | 兩個 HTML entry 與 public assets | 執行 contract tests | 兩頁都宣告 root favicon，檔案為方形且可建置 | Critical |
| TC4 | Git/Vercel 發布邊界 | `.gitignore`、root package、Vercel config | 執行 contract tests | website 可追蹤、仍與 App workspace 隔離、本機輸出被忽略 | Critical |
| TC5 | production build 可部署 | Vercel project settings | 執行 `npm run build` | `dist/index.html` 與 `dist/download/index.html` 皆存在且 assets 可從根路徑解析 | Critical |
| TC6 | production 現網驗證 | Vercel production URL | 請求公開資源 | 首頁、下載頁、favicon 與 hashed assets 回傳 HTTP 200 | Critical |
| TC7 | 舊站保留 | GitHub Pages URL | Vercel 驗證完成後請求舊首頁 | 舊首頁仍回傳 HTTP 200 | High |
| TC8 | Google 網站名稱契約 | 首頁 structured data | 執行 contract tests | `WebSite` name 與 URL 明確且可解析 | High |
| TC9 | 舊站逐頁搬遷契約 | tracked legacy redirect templates | 執行 contract tests | 首頁與下載頁各自使用對應 canonical、0 秒 refresh、JS fallback 且無 noindex | Critical |

## 6. Implementation Notes

- Vercel project name 優先使用 `vocabreader`；若平台表示已被佔用，使用穩定且品牌可識別的
  fallback，並在實作紀錄填寫最終 URL。
- Vercel 建置指令為 `npm run build`，輸出目錄為 `dist`，專案 root directory 為
  `website`。
- 使用 Vite 原生 multi-page build，不加入 SPA rewrite，避免將錯誤 URL 誤回傳為首頁。

## 7. Assumptions and Non-goals

### Assumptions

- 使用者已授權在現有 Vercel 帳號建立並發布 VocabReader 專案。
- 本機 Vercel CLI 已登入可發布的帳號。
- Vercel Hobby 依目前免費開源 Early Preview 用途使用；未來收費或轉為商業運作時
  需重新確認方案。

### Non-goals

- 本功能不購買新網域；只設定使用者已擁有的 `vocabreader.site`。
- 不建立 `highsunday.github.io` 根網站。
- 不下架 GitHub Pages 或刪除 `gh-pages` 分支；只把可索引頁改為對應的新網址搬家入口。
- 不變更頁面視覺、產品文案、安裝說明、installer 連結或 App 功能。
- 不新增 analytics、CMS、backend、帳號或 tracking cookie。

## 8. Module Documentation Impact

更新 `documents/modules/product-website.md` 與 `CONTEXT.md` 的官網發布、URL、建置與治理
邊界；不新增 domain module。

## 9. Implementation Record

### Status

Implemented and production-verified on 2026-08-31.

### Production Result

- Vercel project: `highsundays-projects/vocabreader`
- Canonical production URL: `https://www.vocabreader.site/`
- Apex redirect: `https://vocabreader.site/` → `https://www.vocabreader.site/` (HTTP 308)
- Vercel technical alias retained: `https://vocabreader.vercel.app/`
- Vercel Root Directory: `website`
- Git integration: `https://github.com/highsunday/VocabReader`, with `main` as the production branch
- First Git-triggered production commit: `af6a515a132ae399d3f446ddee7ae7fadba6c297`
- Build command: `npm run build`
- Output directory: `dist`
- Legacy redirect site retained: `https://highsunday.github.io/VocabReader/`

### Files Changed

- `.gitignore`
- `CONTEXT.md`
- `documents/modules/product-website.md`
- `website/.gitignore`
- `website/index.html`
- `website/download/index.html`
- `website/vite.config.js`
- `website/vercel.json`
- `website/public/favicon.png`
- `website/public/robots.txt`
- `website/public/sitemap.xml`
- `website/legacy-github-pages/index.html`
- `website/legacy-github-pages/download/index.html`
- `website/legacy-github-pages/robots.txt`
- `website/legacy-github-pages/sitemap.xml`
- `website/tests/contracts.test.mjs`
- previously local `website/` source, tests, design guidance, and public assets are now tracked by `main`

### TDD and Verification Record

1. RED：`node --test --test-name-pattern='F76' tests/contracts.test.mjs`
   - 6 個 F76 contracts 全部先失敗，分別確認舊 GitHub Pages base／canonical／sitemap、
     缺少 root favicon／robots，以及 `website/` 仍被忽略。
2. GREEN：實作 root base、Vercel config、production metadata、favicon、robots 與 Git 邊界後，
   F76 contracts 6/6 通過。
3. Regression：`npm test` 通過 38/38。
4. Build：`npm run build` 通過，產生首頁、`download/index.html`、root favicon、robots、
   sitemap 與 hashed assets。
5. Browser QA：以 1440×1000 與 390×844 檢查首頁和下載頁；兩個 viewport 都無水平
   overflow，canonical／favicon 正確，console 無 error 或 warning。
6. Production：首頁、下載頁、favicon、robots 與 sitemap 均回傳 HTTP 200；production HTML
   宣告 `https://vocabreader.vercel.app/` canonical 與 `/favicon.png`。
7. Legacy：舊 GitHub Pages 首頁仍回傳 HTTP 200，未刪除或覆寫 `gh-pages`。

### Version 1.1 Custom Domain and Legacy Migration

- RED：將 canonical、sitemap、robots、`WebSite` structured data 與逐頁 legacy redirect
  契約改為自訂網域後，F76 測試 5 項依預期失敗。
- GREEN：新增 custom-domain metadata 與 tracked legacy templates 後，F76 contracts 8/8
  通過；完整 `npm test` 通過 40/40，`npm run build` 通過。
- Main deployment：commit `a4e75d8` 觸發 Vercel Git production deployment
  `dpl_9QosamvjtRMebBa4FT9ry6TYPYNg`，狀態 READY，aliases 包含 apex、`www` 與
  `vocabreader.vercel.app`。
- Production verification：apex 回傳 308 至 `www`；首頁、下載頁、favicon、robots、sitemap
  與 Google HTML 驗證檔回傳 HTTP 200；production HTML 只宣告 `www.vocabreader.site`
  canonical，首頁 `WebSite` JSON-LD 可解析。
- Legacy deployment：`gh-pages` commit `63067e0` 成功發布。舊首頁與下載頁維持 HTTP 200，
  各自提供對應新網址 canonical、0 秒 meta refresh、JavaScript fallback 與可點擊連結；
  legacy robots 與 sitemap 只引用自訂網域，原 Google 驗證檔保留。
- Manual follow-up：Google Search Console 的 Domain property 與 DNS TXT ownership
  verification 必須由使用者在 Google／Namecheap 帳號中完成，之後提交新 sitemap 並要求
  首頁與下載頁重新建立索引。

### Diagnostic Notes

- 第一次執行 `vercel --prod` 上傳失敗。假說依序為：舊 CLI 不支援目前 upload endpoint、
  網站內容或大小造成上傳失敗、認證失效。Vercel 明確回報最低需要 47.2.2，而本機為
  41.3.0；改用 Vercel CLI 59.10.0 後，同一份 24 MB source 成功上傳並建置，排除內容與
  認證問題。
- 初次 Git connect 後 Vercel project 的 Root Directory 顯示 `.`。若直接保留，GitHub
  push 會在 Electron repository root 執行錯誤的網站建置。將 project Root Directory 更新為
  `website` 後重新 inspect，確認 Vite build boundary 正確。
- favicon 初次縮圖命令因工作目錄已在 `website/` 卻再次加上 `website/` prefix 而找不到來源；
  修正為 `public/assets/vocabreader-icon.png` 後成功產生 96×96 RGBA PNG。
- 第一次推送含媒體的 commit 時，Git HTTPS smart protocol 在送出 pack 後回報 HTTP 400，遠端
  commit 比對確認實際未更新。HTTP/1.1 單獨重試仍失敗；加大單次 post buffer 後，同一 commit
  成功推送。遠端 `main` 與本機 commit 相符，隨後 Vercel Git integration 自動產生 READY 的
  production deployment，排除 branch protection 或 Vercel webhook 問題。

### Acceptance Result

TC1–TC9 全部通過。Vercel custom-domain production site 與 GitHub Pages 逐頁搬家入口已可使用；Google 搜尋結果何時改用新 favicon
仍取決於 Google 對新 hostname 的檢索與重新建立索引，不屬於部署成功的同步保證。
