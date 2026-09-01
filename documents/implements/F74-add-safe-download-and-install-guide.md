---
author: Codex
date: 2026-08-26
title: 新增雙語安全下載與安裝導覽頁
uuid: 2a417cd8-ec1e-4cdc-8e92-0a3fd1ad0276
version: 1.4.0
status: implemented
---

# Feature Specification - VocabReader 下載與安裝導覽

## 1. Feature Overview

VocabReader 官網目前的主要下載 CTA 直接進入 GitHub Releases。對不熟悉 GitHub、
Windows SmartScreen、macOS Gatekeeper 或 Codex CLI 的一般學習者而言，這條路徑
容易因為選錯安裝檔、看到未簽章警告或遺漏 Codex 登入而中斷。

本功能將官網首頁主要 CTA 改為站內 `/download/`，新增一個雙語、以任務為導向
的安裝頁：先選擇 Windows 或 macOS 與正確架構，再從官方 GitHub Release 直接
下載，依作業系統完成限定範圍的安全確認，最後安裝並登入 Codex。頁面必須
在引導略過警告之前先誠實說明未購買付費開發者簽章的原因，並以公開原始碼、
MIT License、GitHub Actions 與官方下載來源降低疑慮，不宣稱 Apple 或 Microsoft
已驗證發行者。

## 2. Requirements (User Story)

- **As a** 想直接下載 VocabReader 的一般語言學習者
- **I want** 在官方網站得到符合自己作業系統的下載、安裝、安全確認與 Codex 設定引導
- **So that** 我不需要理解 GitHub 介面或自行搜尋警告處理方法，也能完成安裝並開始使用文字 AI

## 3. Requirements

### 3.1 首頁導流

- Hero 與 Get Started 的主要下載 CTA 必須改為站內 `/download/`。
- 首頁保留 GitHub repository 為次要行動，但不再把 GitHub Releases 當作一般使用者的主要安裝說明。
- 首頁以一句克制說明預告安裝程式尚未開發者簽章，並指向完整安裝導覽。
- 下載頁 Hero 使用平實的任務文字，直接說明「下載與安裝 VocabReader」，不使用「安心」、
  「信心」等宣傳式或情緒性措辭。

### 3.2 平台選擇與下載

- `/download/` 依瀏覽器平台預選 Windows 或 macOS，但必須允許使用者键盤操作並手動切換。
- Windows 提供 x64 NSIS `.exe`。
- macOS 同時提供 Apple Silicon `arm64` 與 Intel `x64` DMG，並說明如何在「關於這台 Mac」查看晶片。
- 下載連結以 `highsunday/VocabReader` 官方 GitHub Release 為唯一來源。靜態頁必須保留可用版本連結，
  並可在不使用私人 token 的情況下從公開 GitHub API 解析更新版本。

### 3.3 Windows 安裝引導

- 先說明警告來自「尚無 Windows Authenticode 發行者簽章」，而不是宣稱系統已判定檔案含有惡意軟體。
- 引導使用者在「Windows 已保護您的電腦」時選擇「其他資訊」→「仍要執行」。
- 在步驟下方並排顯示兩張實際 SmartScreen 畫面：第一張標示「其他資訊」，第二張標示
  「仍要執行」；圖片具有雙語替代文字與圖說，手機版改為上下排列。
- 下載按鈕已由本頁固定導向官方 Release；操作步驟不得再要求一般使用者自行辨識或確認 GitHub 下載來源。
- 不得指示使用者關閉 SmartScreen、防毒軟體或全局安全設定。

### 3.4 macOS 安裝引導

- 說明將 App 從 DMG 拖曳至 Applications，並在首次開啟被阻擋後使用「系統設定」→「隱私權與安全性」
  →「強制打開」（部分 macOS 版本顯示「仍要打開」）完成單一 App 例外。
- 在 macOS 第 3 步旁顯示實際「隱私權與安全性」畫面，清楚指出 VocabReader 右側「強制打開」按鈕的位置；
  圖片必須有中英文對等的替代文字與說明，並在手機版保持可讀、不可造成水平 overflow。
- macOS 圖解在桌機版應縮窄並置中，不得佔滿整個 1180px 內容寬度；手機版仍使用可用寬度。
- 下載按鈕已由本頁固定導向官方 Release；警告說明不得要求一般使用者在按「強制打開」前自行查驗 GitHub 來源。
- 說明警告來自尚無 Apple Developer ID 與 notarization。
- 不得指示使用者停用 Gatekeeper、執行 `spctl --master-disable` 或對廣泛路徑移除 quarantine。

### 3.5 Codex 安裝與登入

- Windows 與 macOS 分別提供 OpenAI 官方 Codex CLI standalone installer 指令。
- 引導執行 `codex login`，在瀏覽器選擇具 Codex 存取權的 ChatGPT 帳號完成登入。
- 說明 VocabReader 沿用這個本機 Codex 登入處理文字 AI，不要求使用者把 ChatGPT 密碼或 API key
  輸入 VocabReader。選用 AI 語音才需要另外設定 OpenAI API key。
- 連結至 OpenAI 官方 Codex CLI 與 authentication 文件。

### 3.6 信任與安全說明

- 明示 MIT License、公開原始碼、GitHub Actions 建置紀錄、官方 Release 來源與本機資料邊界。
- 清楚區分「未驗證發行者」與「已完成惡意軟體掃描」；頁面不得宣稱後者。
- 指示使用者只從官方網站連出的 `highsunday/VocabReader` 下載，不提供第三方鏡像。

### 3.7 雙語與無障礙

- 繁體中文與英文必須具有對等完整的下載、警告、Codex 與信任說明。
- 語言偏好與官網首頁共用同一 `localStorage` key，切換後同步更新 metadata、`html[lang]`、aria-label 與內容。
- 平台選擇、下載連結與步驟導覽必須可鍵盤操作、具有清楚 focus，並在桌機與手機無水平 overflow。

## 4. Acceptance Criteria

- **Scenario 1：官網首頁進入安裝導覽**
  - **Given** 使用者開啟官網首頁
  - **When** 點選 Hero 或 Get Started 的「免費下載」
  - **Then** 進入官方站內 `/download/`，不直接進入 GitHub Releases

- **Scenario 2：選擇正確平台與檔案**
  - **Given** 使用者開啟下載頁
  - **When** 頁面偵測或使用者切換 Windows／macOS
  - **Then** 只顯示該平台的下載與安裝步驟，且 macOS 可分別下載 Apple Silicon 與 Intel DMG

- **Scenario 3：安全且誠實地處理未簽章警告**
  - **Given** 使用者啟動未簽章安裝程式
  - **When** 閱讀 Windows 或 macOS 導覽
  - **Then** 先看到未簽章原因，再得到單一 App 的系統確認步驟；頁面本身負責提供官方下載連結，不把來源辨識責任轉交給一般使用者
  - **And** 頁面不建議關閉系統整體安全保護

- **Scenario 6：依 macOS 畫面找到「強制打開」**
  - **Given** 使用者首次開啟 VocabReader 後被 macOS 阻擋
  - **When** 閱讀 macOS 第 3 步
  - **Then** 可從實際系統設定截圖看出「隱私權與安全性」與 VocabReader 右側「強制打開」的位置
  - **And** 圖片在繁中、英文與手機版皆有可理解的文字替代

- **Scenario 7：以平實 Hero 與 Windows 雙圖完成安裝確認**
  - **Given** 使用者開啟下載頁或在 Windows 遇到 SmartScreen
  - **When** 閱讀 Hero 與 Windows 安裝步驟
  - **Then** Hero 直接說明下載與安裝，不使用宣傳式安心措辭
  - **And** 兩張並排圖片依序指出「其他資訊」與「仍要執行」，手機版改為上下排列

- **Scenario 4：完成 Codex 連線前置**
  - **Given** 使用者尚未安裝或登入 Codex
  - **When** 依平台複製並執行官方指令，再執行 `codex login`
  - **Then** 使用者可完成 ChatGPT 瀏覽器登入，重開 VocabReader 後由本機 Codex 提供文字 AI

- **Scenario 5：來源與隱私界線可驗證**
  - **Given** 使用者對未簽章安裝檔有疑慮
  - **When** 閱讀「為什麼可以信任這個下載」
  - **Then** 可前往官方 repository、Actions、Release 與 MIT License，並了解本機資料與主動 AI 傳送邊界

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC17 | 首頁 CTA | `website/index.html` | 檢查兩個主要下載 CTA | 兩者皆連至 `/download/` | Critical |
| TC18 | Vite 多頁建置 | website build config | 執行 build | 同時產生 `dist/index.html` 與 `dist/download/index.html` | Critical |
| TC19 | 平台下載 | download HTML/JS | 檢查平台控制與連結 | Windows x64、Mac arm64、Mac x64 皆來自官方 Release | Critical |
| TC20 | 未簽章安裝引導 | 兩個 locale | 檢查平台說明 | 包含 SmartScreen 與 Privacy & Security 單 App 步驟，不含全局停用建議 | Critical |
| TC21 | Codex 設定 | 兩個 locale 與 download HTML | 檢查指令與官方連結 | 安裝、`codex login`、ChatGPT 登入與重開 App 完整 | Critical |
| TC22 | 信任說明 | 兩個 locale | 檢查信任與隱私文案 | 公開原始碼、MIT、Actions、官方 Release 與 AI 邊界完整 | High |
| TC23 | 雙語對稱 | download translation dictionary | 比對 zh-Hant/en | 鍵值對稱且無空文案 | Critical |
| TC24 | Responsive 與無障礙 | download HTML/CSS | 靜態與瀏覽器檢查 | 可鍵盤切換、focus 清楚、reduced motion、無水平 overflow | High |
| TC25 | GitHub Pages 子路徑 | Vite config 與站內連結 | 建置並檢查導覽 | 所有頁面與資產保留在 `/VocabReader/`，首頁與下載頁可互相返回 | Critical |
| TC26 | macOS 強制打開圖解與簡明文案 | download HTML、asset 與兩個 locale | 檢查圖片、替代文字與警告說明 | 顯示實際系統設定截圖、清楚指向「強制打開」，且不要求使用者再次確認 GitHub 來源 | Critical |
| TC27 | 平實 Hero 與 Windows SmartScreen 雙圖 | download HTML、CSS、兩張 asset 與兩個 locale | 檢查文案、圖片、標示與 responsive | Hero 採平實任務文案；桌機兩圖並排、手機上下排列，依序標示「其他資訊」與「仍要執行」；Mac 圖不佔滿桌機內容寬度 | Critical |

## 6. Implementation Notes

- 沿用現有 Vite vanilla、`src/main.js`、`src/i18n.js` 與 `src/styles.css`，新增 `download/index.html`、
  download-specific JS 與 Vite multi-page input，不把安裝頁加入 Electron runtime。
- 沿用 `DESIGN.md` 的 warm paper、forest ink、editorial rules 與克制動效。安裝頁屬 Read／Operate
  表面，以連續步驟與官方證據代替行銷式功能卡。
- 靜態 HTML 先嵌入目前 `v0.1.2` 可用資產作為 fallback；瀏覽器可從 GitHub latest-release API
  依後綴解析新版本，API 失敗不得使下載按鈕失效。
- Codex 指令與登入敘述以 OpenAI 官方文件當日內容為準。

## 7. Assumptions and Non-goals

### Assumptions

- 官網會部署在可以穩定提供 `/download/` 路徑的靜態 hosting。
- 目前 latest Release 為 `v0.1.2`，且產物檔名繼續保留平台與架構後綴。
- 使用者會使用具 Codex 存取權的 ChatGPT 帳號，並允許瀏覽器完成 Codex CLI 登入。

### Non-goals

- 不上架 Microsoft Store 或 Mac App Store。
- 不購買或設定 Apple Developer ID、notarization、Windows Authenticode 或 Artifact Signing。
- 不指示使用者關閉 Gatekeeper、SmartScreen 或防毒軟體。
- 不建立自有 installer hosting、下載後台、帳號、analytics 或 cookie。
- 不宣稱安裝檔已由 Apple／Microsoft 驗證、已通過惡意軟體掃描或絕對安全。

## 8. Module Documentation Impact

本功能只擴充獨立官網的多頁路由、文案與客戶端 Release 解析，不改變 VocabReader App
的學習機制、資料契約或 Codex App Server runtime。官網的下載、安裝、安全、Release
解析與 GitHub Pages 發布邊界統一記錄於 `documents/modules/product-website.md`；受眾與
產品證據另記錄於 `website/PRODUCT.md`。

## 9. Implementation Record

### 9.1 Delivered

- `website/index.html`
  - Hero 與 Get Started 的免費下載 CTA 已改為站內 `/download/`。
  - 首頁 Early Preview 提示已誠實說明安裝檔目前未簽章，並引導閱讀完整安裝導覽。
  - GitHub repository 保留為次要行動，Releases 保留為可查驗來源而非主要安裝路徑。
- `website/download/index.html`
  - 新增雙語下載、Windows／macOS 安裝、Codex 設定、信任證據與資料界線頁面。
  - Windows 提供 x64 `.exe`；macOS 提供 Apple Silicon 與 Intel `.dmg`。
  - macOS 第 3 步新增實際「隱私權與安全性」截圖與圖說，直接指出 VocabReader 右側的「強制打開」。
  - Hero 改為「下載與安裝 VocabReader」等直接任務文案，不再使用「安心下載、清楚安裝」等宣傳式措辭。
  - Windows 步驟新增兩張並排 SmartScreen 圖解，以紅圈依序標示「其他資訊」與「仍要執行」；手機改為上下排列。
  - Windows／macOS 操作步驟不再要求一般使用者在繼續前自行辨識 GitHub Release 來源；官方來源仍由本頁下載按鈕與信任證據區塊清楚交代。
  - 警告處理限制於單一安裝檔／App，不包含停用 SmartScreen、Gatekeeper 或防毒軟體的指令。
  - Codex 區塊使用官方 standalone installer 指令、`codex login` 與官方文件連結。
- `website/src/download-i18n.js`
  - 新增繁體中文與英文對等完整文案，包含 macOS 截圖替代文字與圖說。
- `website/public/assets/macos-privacy-security-force-open.png`
  - 保存實際 macOS 系統設定畫面；紅框同時標示 VocabReader 訊息與「強制打開」按鈕。
- `website/public/assets/windows-smartscreen-more-info.png`、`website/public/assets/windows-smartscreen-run-anyway.png`
  - 保存兩個連續的 Windows SmartScreen 畫面；網頁以相對定位紅圈標示實際操作目標。
- `website/src/download-helpers.js`、`website/src/download.js`
  - 依瀏覽器平台預選分頁，支援滑鼠與 Left／Right／Home／End 鍵盤操作。
  - 靜態保留 `v0.1.2` 官方 GitHub Release 連結，並從公開 latest-release API 安全更新版本與資產 URL；API 失敗時保留 fallback。
  - 與首頁共用語言偏好 storage key，並同步 metadata、`html[lang]`、aria-label、圖片替代文字與頁面內容。
- `website/vite.config.js`
  - 新增 Vite multi-page input，輸出首頁與 `dist/download/index.html`。
  - 設定 GitHub Pages base `/VocabReader/`，站內導覽使用相對 URL，避免錯誤跳至網域根路徑。
- `website/src/styles.css`
  - 沿用 warm paper、forest ink 與 editorial rules，完成平台分頁、連續安裝步驟、Codex 指令與信任證據的 responsive 版面。
  - macOS 圖解在桌機限制為 820px 並置中；Windows 雙圖在桌機等寬並排、700px 以下改為單欄。

### 9.2 Verification

- Red：新增 TC17–TC24 後，8 個測試依預期因首頁仍直連 Releases、下載頁與相關模組不存在而失敗。
- macOS 圖解 Red：更新 TC20 並新增 TC26 後，測試依預期因尚未提供「強制打開」文案與截圖而失敗。
- Green：`npm test` 通過 25／25 個 contract tests，包含 TC26 的截圖資產、雙語替代文字、操作文案與「不再要求重複查驗下載來源」回歸。
- Windows 雙圖 Red：新增 TC27 後，測試依預期因 Hero 仍使用宣傳式文案且 Windows 圖解尚未存在而失敗。
- Windows 雙圖 Green：`npm test` 通過 26／26 個 contract tests；TC27 覆蓋平實 Hero、兩張資產、雙語圖說、紅圈標記、桌機並排、手機單欄與 macOS 820px 上限。
- Build：`npm run build` 成功產生 `dist/index.html` 與 `dist/download/index.html`。
- Browser acceptance：
  - 1440 × 1000 桌機與 390 × 844 手機皆無水平 overflow。
  - macOS 實際系統設定截圖於桌機完整呈現，手機縮放後仍可辨識紅框位置；圖說在手機改為單欄。
  - Windows 兩張 SmartScreen 圖解在 1440px 桌機等寬並排，「其他資訊」與「仍要執行」紅圈位置正確；390px 手機改為單欄且無 overflow。
  - macOS 圖解桌機實際寬度為 820px，內容 shell 為 1180px，圖片保持置中；手機仍使用可用寬度。
  - 切換至英文後，截圖替代文字與圖說同步更新；繁中與英文皆直接指向 Force Open／「強制打開」。
  - 繁體中文長文、下載按鈕、Windows／macOS 分頁、Codex 指令與信任證據正常呈現。
  - 平台分頁可點擊並以方向鍵切換，focus 狀態清楚。
  - 首頁兩個主要 CTA 皆實際導向 `/download/`。
  - 公開 GitHub API 成功解析 `v0.1.2`，三個下載資產仍指向 `highsunday/VocabReader` 官方 Releases。
  - 瀏覽器 console 無 warning 或 error。
- Production deployment：
  - 已將正式建置發布至現有 `gh-pages` 分支。
  - macOS 圖解與簡明警告文案發布 commit：`27a08b18dce70308b1db9a74d9585ce8581f3a40`。
  - 本次平實 Hero、Windows 雙圖與 macOS 尺寸調整發布 commit：`18bdfa219e7c169793f23e6bf90bfae6157eae14`。
  - `https://highsunday.github.io/VocabReader/` 與 `/VocabReader/download/` 皆回傳 HTTP 200。
  - 正式下載頁成功載入版本偵測、平台分頁、macOS 圖解與兩張 Windows SmartScreen 圖片；所有圖片回傳 HTTP 200，console 無 warning 或 error。

### 9.3 Architectural Observations

- 下載頁保持為獨立官網的輕量多頁延伸，未改動 Electron runtime、Codex App Server client 或學習資料契約。
- Release 檔名後綴是客戶端解析平台資產的最小契約；若未來改名，應同步調整 `resolveReleaseAssets()` 與 TC19。
- `website/.impeccable/design.json` 與目前 `DESIGN.md` 的基準版本不一致；本功能依 `DESIGN.md` 延伸，未在本次範圍內重寫設計設定。
