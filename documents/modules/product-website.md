---
title: 產品官網與下載安裝導覽模組
module: product-website
status: active
last_updated: 2026-08-31
related_implements:
  - F71-create-github-project-page
  - F72-publish-mit-installers
  - F73-bilingual-product-website
  - F74-add-safe-download-and-install-guide
  - F75-add-mp4-workflow-media
  - F76-deploy-product-website-to-vercel
---

# 產品官網與下載安裝導覽模組

## 1. Purpose

本模組是 VocabReader 對一般訪客的公開產品取得介面。首頁用真實 App 畫面說明從 EPUB
閱讀、AI 上下文講解、學習卡到間隔複習與主動輸出的學習循環；下載頁再協助使用者選擇
Windows 或 macOS 安裝檔、理解未簽章警告、完成限定範圍的系統確認，並安裝及登入 Codex。

產品官網不是 VocabReader 的 Web 版，不提供 EPUB 閱讀、學習資料存取或 AI 對話。
所有實際學習功能仍由本機 Electron App 提供。

## 2. Current Implementation Status

狀態：**已實作並發布**

- 正式首頁：`https://www.vocabreader.site/`
- 下載與安裝頁：`https://www.vocabreader.site/download/`
- `https://vocabreader.site/` 由 Vercel 以 308 轉向 `www` canonical origin。
- 舊 GitHub Pages 網址保留為逐頁搬家入口，不再提供完整重複內容。
- 首頁與下載頁皆提供完整繁體中文／英文內容，共用同一語言偏好。
- 首頁兩個主要下載 CTA 先進入站內安裝導覽，不直接把一般使用者送往 GitHub Releases。
- 下載頁依瀏覽器資訊預選 Windows 或 macOS，並支援滑鼠及 Left／Right／Home／End 鍵盤切換。
- Windows 提供 x64 installer；macOS 提供 Apple Silicon 與 Intel DMG。
- 正式靜態檔由 Vercel 提供；Vite build base 為 `/`，專案建置根目錄為 `website/`。

## 3. Public Surfaces

### 3.1 Product Homepage

首頁負責：

- 用一句主要價值主張介紹 VocabReader。
- 依學習路徑呈現 AI Tutor、學習卡、生詞庫、間隔複習、多語工作區、造句與跟讀的真實截圖或操作錄影。
- 3 個首頁操作錄影優先播放 H.264 MP4，使用靜態 WebP poster，並保留 GIF 作為不支援 video
  時的 fallback；使用者偏好 reduced motion 時停留在 poster。
- 說明文字 AI 沿用本機 Codex／ChatGPT 登入，且需要具 Codex 存取權的 ChatGPT 方案。
- 提供免費下載、GitHub repository、Star、Releases 與回饋入口。
- 在主要下載行動附近誠實預告目前安裝檔未簽章，並導向完整安裝說明。

### 3.2 Download and Installation Guide

下載頁負責：

- 依平台顯示官方 GitHub Release 的 Windows x64、macOS arm64 或 macOS x64 資產。
- Windows 說明 SmartScreen「其他資訊」→「仍要執行」；下載按鈕已固定導向官方 Release，
  因此操作步驟不再要求一般使用者自行辨識 GitHub 來源。兩張實際畫面以紅圈依序標示操作目標，
  桌機並排、手機上下排列。
- macOS 說明 DMG 安裝及「系統設定」→「隱私權與安全性」→「強制打開」（部分版本顯示
  「仍要打開」），並以實際系統設定截圖標示按鈕位置。
- 明確說明 Windows installer 尚無 Authenticode 發行者簽章，macOS App 尚無 Apple
  Developer ID 簽署與 notarization。
- 提供 OpenAI 官方 Codex CLI 安裝指令、`codex login`、ChatGPT 登入與重開 VocabReader 流程。
- 提供 repository、MIT License、GitHub Actions、GitHub Releases 與官方平台文件作為可查驗證據。

## 4. Architecture and Build Boundary

```text
website/index.html + website/download/index.html
  → Vite multi-page build
  → website/dist/index.html
  → website/dist/download/index.html
  → Vercel production deployment
  → https://www.vocabreader.site/
```

- `website/` 由 repository `main` 分支追蹤，但仍是獨立的 vanilla JavaScript／Vite 專案，
  不屬於 root npm workspaces。
- `vite.config.js` 設定兩個 HTML input 與 `/` base；站內頁面使用相對 URL，靜態資產由
  Vite 改寫至 hostname 根目錄的 `/assets/`。
- 網站沒有 server-side application、database、App IPC、service worker 或 Electron bridge。
- `main.js` 處理首頁雙語內容；`download.js` 處理下載頁雙語、平台分頁與 Release 更新。
- 視覺系統沿用 warm paper、forest ink、editorial serif、細線與真實產品素材；首頁與下載頁
  共用 `styles.css`。

## 5. Locale, Platform, and Release Flow

### 5.1 Locale

```text
saved locale → browser languages → default English
  → normalize to zh-Hant or en
  → update html[lang], metadata, content, aria labels
  → persist manual choice as vocabreader-website-locale
```

- 網站只支援繁體中文與英文介面。
- 語言切換唯一持久狀態是瀏覽器 `localStorage` 中的語言偏好；儲存失敗不阻止當次切換。
- 首頁與下載頁使用不同 translation dictionary，但 key 在各自頁面內維持中英文對稱。

### 5.2 Platform

- `detectPlatform()` 將含 `mac` 的 browser platform／user agent 判為 macOS，其餘目前預選 Windows。
- 自動判斷只決定初始可見分頁；使用者可以隨時手動切換。
- macOS 架構不自動推測，頁面同時提供 Apple Silicon 與 Intel，並說明如何查看晶片。

### 5.3 Release Assets

```text
static v0.1.2 official asset URLs
  → page remains immediately downloadable
  → fetch public latest-release API
  → match filename suffix by platform
  → replace only successfully resolved official URLs
  → API failure keeps static fallback
```

解析契約目前依賴下列檔名後綴：

- `windows-x64-setup.exe`
- `mac-arm64.dmg`
- `mac-x64.dmg`

若 Release 改變檔名或平台組合，必須同步更新 resolver、靜態 fallback、頁面文案與 TC19。

## 6. Trust, Security, and Privacy Boundary

- 所有 installer 下載只指向 `highsunday/VocabReader` 官方 GitHub Releases，不提供第三方鏡像。
- 頁面只說明未簽章造成的發行者／信譽警告，不宣稱安裝檔已由 Apple、Microsoft 或網站
  完成惡意軟體驗證。
- Windows 與 macOS 指引只建立單一 installer／App 的例外，不提供停用 SmartScreen、
  Gatekeeper、防毒軟體或廣泛移除 quarantine 的命令。
- 網站不要求或保存 ChatGPT 密碼、Codex token、OpenAI API key、書籍或學習資料。
- 網站沒有帳號、analytics 或 cookie tracking。AI 資料傳送只發生在使用者安裝後主動使用
  桌面 App 的 AI 功能，並不經過本網站。
- 公開 GitHub API 只用來查詢 latest Release，不使用私人 token；失敗時安全降級為靜態連結。

## 7. Deployment

- Vercel project 為 `highsundays-projects/vocabreader`；正式 canonical origin 為
  `https://www.vocabreader.site/`，apex `https://vocabreader.site/` 以 308 轉向 `www`。
- `https://vocabreader.vercel.app/` 保留為 Vercel 技術 alias，不得出現在 canonical、sitemap、
  robots 或 `WebSite` structured data。
- `main` 追蹤 `website/` 的 source、tests 與 public assets；`node_modules/`、`dist/`、
  `.vercel/` 與本機設計檢查輸出維持忽略。
- `website/vercel.json` 固定 `npm run build`、`dist` output 與 trailing-slash 路由。
- Git integration 以 repository 的 `website/` 為 Root Directory；後續推送 `main` 時由
  Vercel 自動建置 production deployment，其他一般分支產生 preview deployment；
  `git.deploymentEnabled` 明確排除只負責 GitHub Pages 搬家頁的 `gh-pages` 分支。
- `website/legacy-github-pages/` 追蹤可重現的舊站搬家模板。舊 `gh-pages` 分支保留首頁、
  下載頁、Google 驗證檔、robots 與 sitemap；首頁與下載頁使用 0 秒 meta refresh、canonical、
  JavaScript fallback 與可點擊連結，分別直接導向對應的新網址。

## 8. Key Files

| File | Responsibility |
|---|---|
| `website/index.html` | 產品首頁結構與主要 CTA |
| `website/download/index.html` | 下載、安裝、Codex 與信任說明結構 |
| `website/public/assets/macos-privacy-security-force-open.png` | macOS「隱私權與安全性」及「強制打開」位置圖解 |
| `website/public/assets/windows-smartscreen-more-info.png` | Windows SmartScreen「其他資訊」畫面圖解 |
| `website/public/assets/windows-smartscreen-run-anyway.png` | Windows SmartScreen「仍要執行」畫面圖解 |
| `docs/readme-assets/*.mp4` | 9 個與公開 GIF 同名的 H.264 操作錄影版本 |
| `scripts/build-public-gifs.sh` | 從原始錄影同步產生公開 GIF、MP4 與官網 WebP poster |
| `website/public/assets/*.{mp4,gif,webp}` | 官網操作錄影、相容 fallback 與 reduced-motion poster |
| `website/src/i18n.js` | 首頁翻譯、locale normalization 與 storage key |
| `website/src/download-i18n.js` | 下載頁繁中／英文完整文案 |
| `website/src/main.js` | 首頁語言套用與 header state |
| `website/src/download.js` | 下載頁語言、平台 tabs、latest Release 更新 |
| `website/src/download-helpers.js` | 可獨立測試的平台偵測與 Release asset resolver |
| `website/src/styles.css` | 兩個頁面的視覺系統、responsive 與 accessibility states |
| `website/vite.config.js` | Vercel root base 與 multi-page build inputs |
| `website/vercel.json` | Vercel build、output 與 trailing-slash 設定 |
| `website/public/favicon.png` | Google 與瀏覽器可從 hostname 根目錄取得的 96×96 品牌 favicon |
| `website/public/robots.txt` | crawler 規則與 production sitemap 位置 |
| `website/public/sitemap.xml` | production 首頁與下載頁 URL |
| `website/legacy-github-pages/` | 舊 GitHub Pages 首頁、下載頁、robots 與 sitemap 搬家模板 |
| `website/tests/contracts.test.mjs` | 內容、雙語、連結、build、平台、安全與 responsive contracts |
| `website/DESIGN.md` | 官網視覺語言與設計約束 |
| `website/PRODUCT.md` | 官網受眾、目的、證據與產品原則 |
| `.gitignore` | 排除官網 dependencies、build output、本機 Vercel 與設計檢查狀態 |

## 9. Testing Notes

從 `website/` 執行：

- `npm test`：40 項 contract tests，涵蓋首頁、雙語、真實資產、MP4 漸進增強、reduced motion、CTA、平台分頁、未簽章
  指引、Windows SmartScreen 雙圖、macOS「強制打開」圖解、Codex 指令、信任說明、Vercel root base、favicon、自訂網域 canonical、sitemap、robots、`WebSite` structured data、舊站逐頁搬家與 responsive／accessibility contracts。
- `npm run build`：必須同時產生 `dist/index.html` 與 `dist/download/index.html`，且資產 URL
  使用 hostname 根目錄的 `/assets/`。
- repository root 的 `npm run test:media`：6 項媒體契約，驗證 GIF 色彩、MP4 codec／尺寸／
  duration／檔案大小，以及 README／官網資產同步。
- 發布前另以 1440px 桌機與 390px 手機檢查繁中長文、鍵盤分頁、focus、console error 與
  水平 overflow。
- 發布後確認自訂網域首頁、下載頁、favicon、robots、sitemap 及 hashed assets 皆回傳 HTTP 200；
  apex 必須以 308 轉向 `www`，canonical 只指向 `www.vocabreader.site`，舊 GitHub Pages 首頁
  與下載頁必須仍回傳 HTTP 200 並即時前往對應的新網址。

## 10. Known Limitations and Follow-up

- Google 搜尋結果中的 favicon 與網址更新仍由 Google 重新檢索決定；Vercel 上線不保證立即
  改變既有搜尋結果。可在 Search Console 為新 URL prefix 提交 sitemap 並要求重新建立索引。
- 舊 GitHub Pages 專案路徑無法提供跨 hostname 的 HTTP 301，目前以 Google 可辨識的 0 秒
  meta refresh 作為 client-side 永久搬家訊號；`gh-pages` 應至少保留一年並持續監測舊 URL。
- Vercel Hobby 目前只用於免費開源 Early Preview；若產品改為商業用途，需重新確認 Vercel
  方案與使用條款。
- installer 尚未購買 Windows／Apple 開發者簽章，也尚未完成 macOS notarization；網站只能
  誠實引導單一 App 例外，不能消除作業系統警告。
- latest Release 查詢受公開 GitHub API 可用性與 rate limit 影響；靜態 fallback 版本需隨發行
  策略維護。
- 目前只提供 Windows x64、macOS Apple Silicon 與 macOS Intel；未提供 Windows arm64、Linux、
  Microsoft Store 或 Mac App Store。
- 網站不顯示 installer checksum 或簽章驗證值；使用者目前以官方 repository、Actions、Release
  來源與公開原始碼查驗。
- `website/.impeccable/design.json` 與 `DESIGN.md` 的基準版本目前不一致，後續重新產生設計設定時
  應先以 `DESIGN.md` 與正式頁面為準。

## 11. Related Documents

- `CONTEXT.md`
- `documents/implements/F71-create-github-project-page.md`
- `documents/implements/F72-publish-mit-installers.md`
- `documents/implements/F73-bilingual-product-website.md`
- `documents/implements/F74-add-safe-download-and-install-guide.md`
- `documents/implements/F75-add-mp4-workflow-media.md`
- `documents/implements/F76-deploy-product-website-to-vercel.md`
- `website/DESIGN.md`
- `website/PRODUCT.md`

變更官網路由、Vercel production hostname、下載來源、平台資產命名、Codex 安裝流程、未簽章安全
說明、語言 storage key 或發布方式時，必須同步更新本文件與相關 FXX 文件。
