---
author: Codex
date: 2026-09-01
title: 建立可索引的英文與繁體中文產品首頁
uuid: bf20aeeb-5135-4989-8797-cb1183f006b5
version: 1.0.0
status: implemented
---

# Feature Specification - 可索引的英文與繁體中文產品首頁

## 1. Feature Overview

VocabReader 產品官網目前在同一個 `/` URL 依瀏覽器語言與 JavaScript 替換英文或繁體中文內容。
這對訪客操作簡單，但搜尋引擎無法用穩定 URL 分別辨識兩個語言版本。本功能保留目前首頁的
內容、視覺與簡單語言切換，同時新增 `/en/` 與 `/zh-tw/` 兩個可直接輸出完整語言內容的靜態
首頁。

這是使用者確認的簡化第一階段：不建立 AI EPUB reader、EPUB 閱讀生詞學習、間隔重複或
閱讀時學單字指南等獨立主題頁；下載安裝導覽仍共用既有 `/download/`。

## 2. Requirements (User Story)

- **As a** 透過英文或繁體中文搜尋認識 VocabReader 的訪客
- **I want** 搜尋結果和分享網址直接開啟對應語言的完整產品首頁
- **So that** 我不必先依賴 JavaScript 切換內容，Google 也能分別索引兩個語言版本

## 3. Requirements

### 3.1 Locale URLs and static content

- 英文首頁使用 `/en/`，繁體中文首頁使用 `/zh-tw/`。
- 兩個 URL 在 JavaScript 尚未執行時，就必須具有對應語言的 `html[lang]`、title、description、
  H1、主要正文、圖片替代文字與 aria label。
- 兩頁共用現有 `index.html` 結構與 `src/i18n.js` 字典，由建置前腳本產生，不維護兩份手寫首頁。
- 現有 `/` 保留為 `x-default` 首頁，繼續依已儲存偏好或瀏覽器語言顯示內容，不強制轉址。

### 3.2 Search metadata

- `/` canonical 指向 `https://www.vocabreader.site/`。
- `/en/` canonical 指向 `https://www.vocabreader.site/en/`。
- `/zh-tw/` canonical 指向 `https://www.vocabreader.site/zh-tw/`。
- 三個首頁都宣告英文、繁體中文與 `x-default` alternate URL；繁中 hreflang 使用 `zh-Hant`。
- sitemap 收錄 `/`、`/en/`、`/zh-tw/` 與既有 `/download/`，且 locale entries 的 alternate
  關係與 HTML 一致。

### 3.3 Language navigation

- 首頁語言選擇必須是可爬取的真實 `<a>` 連結，而不是只執行 JavaScript 的按鈕。
- 在 `/en/` 或 `/zh-tw/` 上，頁面語言由 URL 決定，不得被舊 localStorage 或瀏覽器語言覆寫。
- 點擊語言連結仍保存偏好，讓回到 `/` 時保留使用者選擇。
- localized 首頁的下載 CTA 必須繼續導向共用的 `/download/`，不能錯誤解析成
  `/en/download/` 或 `/zh-tw/download/`。

### 3.4 Build and compatibility

- `npm run dev`、`npm test` 與 `npm run build` 在執行前自動產生 locale HTML entries。
- production build 必須產生 `dist/index.html`、`dist/en/index.html`、
  `dist/zh-tw/index.html` 與既有 `dist/download/index.html`。
- 現有首頁內容、真實產品素材、download guide、reduced-motion、responsive、安全說明與
  installer links 不退化。

## 4. Acceptance Criteria

- **Scenario 1：英文首頁可直接索引**
  - **Given** JavaScript 尚未執行
  - **When** 讀取產生後的 `/en/` HTML
  - **Then** `lang`、metadata、H1 與主要正文皆為英文，canonical 指向 `/en/`

- **Scenario 2：繁中首頁可直接索引**
  - **Given** JavaScript 尚未執行
  - **When** 讀取產生後的 `/zh-tw/` HTML
  - **Then** `lang`、metadata、H1 與主要正文皆為繁體中文，canonical 指向 `/zh-tw/`

- **Scenario 3：語言關係可被爬取**
  - **Given** 任一首頁 HTML 與 production sitemap
  - **When** 檢查語言選擇、canonical 與 hreflang
  - **Then** 英文、繁中與 x-default URL 一致且可透過真實連結到達

- **Scenario 4：URL 語言優先於瀏覽器偏好**
  - **Given** 使用者直接開啟 `/en/` 或 `/zh-tw/`
  - **When** 頁面 JavaScript 初始化
  - **Then** 顯示 URL 指定的語言，點擊另一語言連結才導覽並保存新偏好

- **Scenario 5：建置輸出完整且既有行為不退化**
  - **Given** 官網原始碼
  - **When** 執行完整 contract tests 與 production build
  - **Then** 四個 HTML entry 都存在，localized CTA 指向共用下載頁，既有 contracts 全數通過

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 產生英文靜態首頁 | shared homepage 與英文字典 | 執行 locale generator | 輸出完整英文內容與 `/en/` canonical | Critical |
| TC2 | 產生繁中靜態首頁 | shared homepage 與繁中字典 | 執行 locale generator | 輸出完整繁中內容與 `/zh-tw/` canonical | Critical |
| TC3 | canonical／hreflang／sitemap 對應 | 三個首頁與 sitemap | 執行 contracts | 所有 locale 與 x-default 關係一致 | Critical |
| TC4 | 語言連結與 URL locale | 首頁導覽及 `main.js` | 執行 contracts | links 可爬取且 pathname locale 優先 | Critical |
| TC5 | shared download route | localized 首頁 | 檢查 CTA links | 所有 CTA 都導向 `/download/` | High |
| TC6 | Vite multi-page build | 已產生 locale entries | 執行 production build | 四個 HTML entry 皆產生 | Critical |
| TC7 | 既有官網回歸 | 原有 contract suite | 執行 `npm test` | 原有內容、安全與無障礙 contracts 全數通過 | Critical |

## 6. Implementation Notes

- locale generator 應是無網路依賴的 Node ESM 腳本，從唯一 `index.html` 和既有 translation
  dictionary 產生忽略版本控制的 `en/index.html`、`zh-tw/index.html`。
- generator 必須對 HTML text／attribute 做 escaping，且在遇到 template 中不存在的翻譯 key 時
  明確失敗，避免悄悄輸出不完整頁面。
- `/download/` 此階段不拆語言 URL，仍沿用既有 JavaScript 語言切換。

## 7. Assumptions and Non-goals

### Assumptions

- 使用者說「先採用這個簡單方案」即批准本文件所描述的兩個 locale 首頁範圍。
- 正式 canonical origin 維持 `https://www.vocabreader.site/`，不是舊 GitHub Pages URL。

### Non-goals

- 不建立四個主題或八個內容頁。
- 不拆分下載頁的語言 URL。
- F77 原始實作不以 production 發布作為驗收條件；後續使用者另行要求 push 時才觸發部署。
- 不操作 Search Console、不更新外部 repository metadata。
- 不改寫首頁產品定位、視覺設計或真實產品證據。
- 不新增 CMS、analytics、backend、cookie tracking 或自動翻譯。

## 8. Module Documentation Impact

更新 `documents/modules/product-website.md` 的 public surfaces、architecture、locale flow、key files、
testing notes 與 known limitations；不新增 domain module。

## 9. Implementation Record

### Status

Implemented, pushed, and production-verified on 2026-09-01.

### Implementation Summary

新增 build-time locale generator，從唯一 `index.html` 與 `src/i18n.js` 產生完整的英文與繁中
靜態首頁。根首頁維持 x-default 與原有偏好偵測；`/en/`、`/zh-tw/` 則以 pathname 為唯一
初始語言來源。語言控制改成真實連結，下載 CTA 統一使用 `/download/`。

三個首頁均宣告互相對應的 canonical／hreflang，sitemap 收錄 root、兩個 locale URL 與既有
download URL。Vite production build 已能產生四個 HTML entries。

### Test Coverage

- F77 TC1–TC2：英文與繁中 generated HTML 的 lang、title、canonical、H1、正文與下載連結。
- F77 TC3：三個首頁與 sitemap 的 canonical／hreflang／x-default 對應。
- F77 TC4：pathname locale 優先、真實語言連結與偏好保存。
- F77 TC6：dev／test／build generation scripts 與 Vite locale inputs。
- 完整官網 contract suite：44/44 通過。

### Changed Files

#### Production code

- `.gitignore`
- `website/index.html`
- `website/package.json`
- `website/public/sitemap.xml`
- `website/scripts/generate-localized-homepages.mjs`
- `website/src/i18n.js`
- `website/src/main.js`
- `website/src/styles.css`
- `website/vite.config.js`

#### Test code

- `website/tests/contracts.test.mjs`

#### Documentation

- `documents/implements/F77-indexable-localized-homepages.md`
- `documents/modules/product-website.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 英文首頁可直接索引 | Pass | F77 TC1；generated `/en/` HTML |
| 繁中首頁可直接索引 | Pass | F77 TC2；generated `/zh-tw/` HTML |
| 語言關係可被爬取 | Pass | F77 TC3；HTML alternates 與 sitemap |
| URL 語言優先於瀏覽器偏好 | Pass | F77 TC4；pathname helper 與 browser QA |
| 建置輸出完整且既有行為不退化 | Pass | 44/44 contracts、production build、桌機／手機 QA |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `F77 TC1-TC2 emits complete...` English assertions |
| TC2 | Pass | `F77 TC1-TC2 emits complete...` Traditional Chinese assertions |
| TC3 | Pass | `F77 TC3 exposes consistent canonical, hreflang...` |
| TC4 | Pass | `F77 TC4 makes pathname locale authoritative...` |
| TC5 | Pass | localized HTML `/download/` assertions and existing TC17 |
| TC6 | Pass | F77 TC6 contract and `npm run build` output |
| TC7 | Pass | complete `npm test` 44/44 |

### Commands Executed

```bash
node --test --test-name-pattern='F77' tests/contracts.test.mjs  # RED: 0/4
npm run generate-localized-homepages
node --test --test-name-pattern='F77' tests/contracts.test.mjs  # GREEN: 4/4
npm test                                                        # 44/44
npm run build                                                   # success; 4 HTML entries
```

Browser QA：1440×1000 英文首頁與 390×844 繁中首頁皆無水平 overflow；語言連結導覽、root
偏好、canonical、H1、download links 正確，console 無 error 或 warning。

Production：commit `bc458dbfa07e22c4adb0eb48b1b0763ee5c4e247` 已推送至 `origin/main`；
`https://www.vocabreader.site/en/` 與 `https://www.vocabreader.site/zh-tw/` 均回傳 HTTP 200，
現網 HTML 的 lang、H1、canonical、hreflang 與 sitemap locale entries 均已驗證。

### Hypotheses and Decisions

- 採用 shared template + build-time generation，避免維護兩份首頁結構。
- `/` 保留為 x-default；下載頁維持共用 URL。
- generated `website/en/`、`website/zh-tw/` 維持 ignored，由 dev／test／build 自動重建。
- 第一次 green 執行發現部分 `data-i18n-aria-label` 元素原本沒有 fallback `aria-label`；generator
  改為在 attribute 不存在時安全加入，而不是要求 template 預先重複文案。

### Deferred Items

- 主題內容頁未納入本功能，且目前沒有建立四個主題／八個頁面的執行工作。
- Search Console sitemap 提交與索引要求。

### Notes

原始碼、測試、建置、responsive QA、push 與 Vercel production 驗證皆已完成；尚未向
Search Console 提交 sitemap 或要求新 locale URLs 建立索引。
