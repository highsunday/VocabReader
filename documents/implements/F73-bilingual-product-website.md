---
author: Codex
date: 2026-08-26
title: 建立 VocabReader 雙語產品官網
uuid: 02dc66fa-72d0-4f4b-bf62-e151139d43a3
version: 1.1.0
status: implemented
---

# Feature Specification - VocabReader 雙語產品官網

## 1. Feature Overview

VocabReader 已有完整的 GitHub README、真實產品截圖、操作 GIF、正式 App Icon 與可下載的
Early Preview 安裝包，但缺少一個適合一般使用者快速理解產品並前往下載的獨立產品官網。

本功能在 repository 根目錄建立獨立的 `website/` 前端專案，且將整個資料夾加入
`.gitignore`，避免影響原本 Electron App、server workspace 與現有 root scripts。官網沿用
VocabReader 的米白閱讀底色、深綠主色、襯線閱讀語氣與正式 App Icon，以實際截圖與 GIF
作為主要視覺證據，提供繁體中文與英文完整內容，並導向 GitHub Releases 與 repository。

## 2. Requirements (User Story)

- **As a** 第一次認識 VocabReader 的外語 EPUB 閱讀者
- **I want** 在幾秒內看懂產品、核心學習流程、實際畫面與取得方式
- **So that** 我可以判斷它是否符合自己的學習方式，並立即下載或查看原始碼

## 3. Requirements

### 3.1 隔離與啟動

- 官網位於獨立 `website/` 資料夾，不加入 root npm workspaces、不修改 App runtime。
- `.gitignore` 忽略 `/website/`。
- 官網可獨立執行 dev server 與 production build。

### 3.2 內容與品牌

- 首屏用一句話說明 VocabReader 是結合 EPUB 閱讀、AI 上下文講解與主動練習的桌面 App。
- 頁面包含核心功能、workflow、真實 App 截圖、至少一個實際 GIF、適合使用者與 GitHub／
  Get Started CTA。
- Navbar、Hero 與 favicon 使用現有正式 App Icon
  `apps/desktop/assets/icon/vocabreader-language-learning-v6.png`，不得重新設計品牌 Icon。
- 以產品現有深綠、米白、襯線閱讀排版與克制的細框線為主要視覺語言。
- 首屏與核心功能區必須優先強調 AI 輔助學習、沿用 Codex 登入且文字 AI 不需另外設定
  API key、多語言獨立工作區、建立學習卡，以及 FSRS 間隔重複。
- 使用 repository 既有的多語言切換 GIF 作為真實功能證據，不只用文案宣稱多語言。
- 核心產品畫面依學習路徑呈現：先展示 AI Tutor，接著在同一功能段落並列展示
  學習卡庫與單張學習卡，再展示間隔複習，最後呈現多語言工作區。
- 主要下載 CTA 強調「免費下載」，不將 Early Preview 當作訪客的主要轉換訊息。
- 提供清楚但不喧賓奪主的 GitHub Star 行動，鼓勵使用者前往 repository 給星；不得顯示
  未經 GitHub API 驗證的 star 數字，也不得暗示可在官網直接完成 GitHub 帳戶操作。
- 不加入 testimonial、使用量、客戶 logo 或其他 repository 沒有證據的商業宣稱。

### 3.3 雙語與互動

- 所有主要文案、導航、功能內容、workflow、使用者描述與 CTA 皆有自然的繁體中文與英文。
- 初次進入依瀏覽器語言選擇繁中或英文；使用者切換後寫入 `localStorage`，再次開啟沿用。
- 語言切換控制在桌機與手機版都清楚、可鍵盤操作，切換時同步更新 `html[lang]`、title、
  meta description、aria-label 與完整頁面內容。

### 3.4 Responsive 與品質

- Desktop 與 Mobile 都沒有水平 overflow，圖片可縮放，主要 CTA 保持可見且可點擊。
- 導航、按鈕、語言切換與連結具明確 focus 樣式；支援 `prefers-reduced-motion`。
- 動畫僅限必要 transition 與一次克制的產品展示，不使用 glow、neon、大量漸層、浮動卡片、
  過度圓角或複雜背景效果。

## 4. Acceptance Criteria

- **Scenario 1：首屏清楚呈現產品與行動**
  - **Given** 訪客第一次開啟官網
  - **When** 首屏載入完成
  - **Then** 可看見正式 App Icon、產品一句話、主要產品畫面、Get Started 與 GitHub CTA

- **Scenario 2：完整雙語切換**
  - **Given** 頁面以任一語言載入
  - **When** 訪客切換中文／EN
  - **Then** 全頁主要文案、文件語言、metadata 與可存取名稱同步切換
  - **And** 重新整理後保留最後選擇

- **Scenario 3：依瀏覽器語言設定初始值**
  - **Given** 尚未保存語言偏好
  - **When** 瀏覽器語言為繁體中文或其他語言
  - **Then** 分別載入繁體中文或英文內容

- **Scenario 4：真實素材與品牌一致**
  - **Given** repository 現有正式 App Icon、screenshots 與 GIF
  - **When** 訪客瀏覽產品展示
  - **Then** 官網使用這些真實素材且沒有替代品牌 Icon 或合成產品畫面

- **Scenario 5：Desktop 與 Mobile 可用**
  - **Given** 常見桌機與手機 viewport
  - **When** 訪客瀏覽、切換語言並操作 CTA
  - **Then** 內容順序、層級、圖片、導航與互動維持清楚，沒有水平 overflow

- **Scenario 6：獨立且不影響 App**
  - **Given** 原 repository 與新增官網
  - **When** 執行 root App scripts 與官網 build
  - **Then** App 的 workspace 設定與 runtime 不變，且 `/website/` 被 Git 忽略

- **Scenario 7：核心功能在前段可辨識**
  - **Given** 訪客只瀏覽首屏與緊接的核心能力區
  - **When** 掃描主要標題、短文與功能列表
  - **Then** 可辨識 AI 輔助學習、Codex 免額外文字 AI key、多語言工作區、學習卡與
    FSRS 間隔重複

- **Scenario 8：GitHub Star 行動誠實可用**
  - **Given** 訪客想支持 VocabReader
  - **When** 點選 Star CTA
  - **Then** 在新分頁前往官方 GitHub repository，以便使用者自行完成 Star
  - **And** 官網不顯示虛構 star 數量或宣稱已代替使用者完成 Star

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 官網結構契約 | `website/index.html` | 執行 website contract test | Hero、features、workflow、showcase、audience、CTA 與 footer 皆存在 | Critical |
| TC2 | 雙語內容契約 | website translation dictionary | 檢查兩個 locale | 鍵值對稱且每個主要 section 均有繁中／英文內容 | Critical |
| TC3 | 語言偏好 | language module | 模擬 navigator 與 storage | 正確偵測、保存並更新完整文件語言 | Critical |
| TC4 | 品牌素材 | website public assets | 解析 icon、PNG 與 GIF 引用 | 每個素材存在且 icon 與 App v6 圖素內容一致 | Critical |
| TC5 | 可存取與 responsive 契約 | HTML/CSS | 靜態檢查與瀏覽器驗證 | landmarks、focus、reduced-motion、mobile breakpoint、無 overflow | High |
| TC6 | Production build | website package | 執行 build | Vite build 成功且輸出完整靜態資產 | High |
| TC7 | 原 App 基線 | repository root | 執行 `npm run dev` | server、Vite renderer 與 Electron 可正常啟動 | High |
| TC8 | 核心功能優先級 | HTML 與雙語字典 | 檢查首屏及核心能力區 | 兩語言皆明示 AI、Codex 無額外文字 AI key、多語言、學習卡與間隔重複 | Critical |
| TC9 | GitHub Star CTA | 官網 Navbar 與 CTA | 檢查連結、文案與可存取名稱 | 指向官方 repository、兩語言可切換、不宣稱或顯示未驗證星數 | High |
| TC10 | 產品畫面順序與免費下載 | HTML、素材與雙語字典 | 檢查圖片位置與 CTA 文案 | AI Tutor → 卡片庫／卡片 → 間隔複習 → 多語言，且兩語言均強調免費下載 | Critical |
| TC11 | 適合使用者的學習順序 | HTML 與雙語字典 | 檢查受眾清單的文案與順序 | 閱讀 → 理解 → 間隔複習形成長期記憶 → 寫作與口說運用，且移除本機資料偏好敘述 | High |
| TC12 | 使用者效益導向文案 | 雙語字典 | 檢查 Hero、AI 助教、學習卡、間隔複習與多語言文案 | 兩語言先說明學習效益，誠實說明 ChatGPT／Codex 登入前提，且不以工作區、閱讀範圍或 FSRS 等實作詞彙作為主要訊息 | Critical |
| TC13 | 寫作與跟讀產品畫面尺寸 | CSS 與 responsive layout | 檢查 showcase 結構 | 說明文字置頂，兩張產品畫面使用完整內容寬度並排，手機版再上下堆疊 | High |
| TC14 | 卡片庫與單字卡畫面對齊 | CSS 與 responsive layout | 檢查 learning-card evidence pair | 桌機版兩張同尺寸產品畫面等寬、同高、頂端對齊，手機版上下堆疊 | High |
| TC15 | 放大間隔複習產品展示 | CSS 與 responsive layout | 檢查 spaced-review feature row | 桌機版產品 GIF 取得較寬欄位以呈現操作細節，手機版維持全寬 | High |

## 6. Implementation Notes

- 使用獨立 Vite vanilla 專案，避免把行銷頁 UI 加入 Electron renderer 或 root workspace。
- 以語意化 HTML、集中式 translation dictionary 與無框架 JavaScript 實作，降低雙語頁面
  的 runtime 複雜度。
- 複製必要的正式 icon、選定 screenshot 與 GIF 至 `website/public/`，讓 production build
  不依賴父資料夾相對路徑。
- CTA 連至官方 repository 與 GitHub Releases；不新增外部分析、cookie、表單或追蹤服務。

## 7. Assumptions and Non-goals

### Assumptions

- 首要轉換行動為前往 GitHub Releases 下載 Early Preview；次要行動為查看 GitHub 原始碼。
- 繁體中文介面以 `zh-Hant` 表示，其他未支援瀏覽器語言預設英文。
- 官網是獨立可交付 artifact，本次不部署到 GitHub Pages 或其他 hosting。

### Non-goals

- 不修改 VocabReader App UI、功能、installer 或 release workflow。
- 不新增第三種語言、CMS、後台、newsletter、analytics、登入或付款功能。
- 不建立新的品牌 Icon、合成 App 截圖、testimonial、定價或競品比較宣稱。
- 不加入複雜動畫、3D、WebGL、粒子、glow、neon 或裝飾性背景特效。

## 8. Module Documentation Impact

官網是被 Git 忽略的獨立 artifact，不改變 App domain module、API、資料契約或 runtime；
因此不需新增或更新 `documents/modules/` 文件。`apps/desktop/PRODUCT.md` 記錄跨表面的產品
真相與品牌承諾，供後續設計工作沿用。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-26.

### Implementation Summary

- 於被 Git 忽略的 `website/` 建立獨立 Vite 官網，未加入 root workspaces，也未修改 App runtime。
- 以真實 App Icon、產品截圖與操作 GIF 建立編輯式產品敘事，完整包含 Hero、核心能力、
  workflow、產品展示、適合使用者與 Get Started。
- 核心能力前置 AI 上下文學習、Codex 登入連動與文字 AI 免另設 API key、多語言工作區、
  學習卡與 FSRS 間隔重複，並用真實多語言 GIF 作為證據。
- Navbar 於桌機與手機都提供完整雙語切換與誠實的 GitHub Star CTA；不顯示虛構數字，
  也不暗示官網可代替使用者完成 GitHub 帳戶操作。
- 兩個 locale 共用對稱 translation dictionary；初始語言由瀏覽器偏好決定，手動選擇寫入
  `localStorage`，並同步更新全頁文案、metadata、`html[lang]`、alt 與 aria-label。
- 所有 shipping PNG 已嵌入 repository origin provenance，GIF 使用同名 JSON sidecar，並於
  `website/.impeccable/asset-inventory.md` 記錄素材來源與用途。

### Test Coverage

- TC1–TC6、TC8–TC15：`npm test --prefix website` 通過（14/14）。
- TC7：實作前執行 root `npm run dev`，server、Vite renderer 與 Electron 均成功啟動。
- Production：`npm run build --prefix website` 通過，Vite 成功產出靜態 build。
- Browser QA：在 1440×1000 與 390×844 檢查無水平 overflow、Navbar、CTA、實際截圖與排版。
- i18n：實際切換 EN 後整頁更新，重新整理仍保留英文，再成功切回繁中。
- Provenance：`embed-prompt.mjs --scan website/public/assets` 回報 5 個 PNG、0 個缺失；3 個 GIF
  的 origin 均可透過 `--read` 取回。
- Impeccable finish review：修正能力層級、素材 provenance 與 sticky header 後，獨立審查結論為
  `ship`，未發現視覺或功能回歸。

### Changed Files

- `.gitignore`
- `apps/desktop/PRODUCT.md`
- `documents/implements/F73-bilingual-product-website.md`
- `website/index.html`
- `website/src/main.js`
- `website/src/i18n.js`
- `website/src/styles.css`
- `website/tests/contracts.test.mjs`
- `website/public/assets/*`
- `website/.impeccable/asset-inventory.md`
- `website/DESIGN.md`
- `website/.impeccable/design.json`

### Decisions and Deferred Work

- 產品官網保持無框架、無 analytics、無 cookie 與無外部字體請求，降低維護與隱私成本。
- 本次不包含部署；後續可將 `website/dist/` 部署至 GitHub Pages 或其他靜態 hosting。
