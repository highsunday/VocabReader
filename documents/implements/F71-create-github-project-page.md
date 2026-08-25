---
author: Codex
date: 2026-08-25
title: 建立吸引使用者下載 VocabReader 的 GitHub 專案首頁
uuid: 89ac9707-bc2d-4551-a033-1f7b82b33790
version: 1.0.0
status: approved
---

# Feature Specification - GitHub 專案首頁

## 1. Feature Overview

目前根目錄 `README.md` 只描述早期 Electron／Node.js 骨架、開發指令與兩項舊版學習
機制，未能呈現 VocabReader 已完成的閱讀、AI 解析、學習項目、間隔複習、復述、跟讀與
整合造句體驗，也缺少足以讓初次訪客快速理解產品的真實介面畫面。

本功能把 GitHub 預設顯示的 README 改造成產品首頁：先說明 VocabReader 解決的學習
問題與完整學習循環，搭配真實 App 截圖展示核心工作區，再提供誠實、可執行的取得方式、
環境需求、隱私邊界與參與入口。首頁不得把尚未存在的安裝包、Release、授權條款或雲端
同步描述成已提供功能。

## 2. Requirements (User Story)

- **As a** 第一次造訪 VocabReader GitHub repository 的語言學習者
- **I want** 在一頁內看懂產品價值、實際介面與取得方式
- **So that** 我可以判斷是否適合自己的學習流程，並立即從原始碼試用或追蹤未來 Release

## 3. Acceptance Criteria

- **Scenario 1：首頁先呈現產品價值**
  - **Given** 訪客開啟 repository 首頁
  - **When** GitHub 顯示根目錄 README
  - **Then** 首屏包含品牌主視覺、短價值主張、產品狀態及清楚的取得入口

- **Scenario 2：真實畫面展示核心體驗**
  - **Given** 訪客繼續瀏覽產品介紹
  - **When** 進入畫面展示區
  - **Then** 可看到閱讀與 AI、生詞庫、間隔複習、逐句跟讀及整合造句的真實 App 截圖
  - **And** 圖片使用 repository 內的穩定相對路徑，不依賴簡報原始檔或外部圖床

- **Scenario 3：功能說明符合目前產品**
  - **Given** `CONTEXT.md`、模組文件與目前實作
  - **When** 訪客閱讀功能與學習循環說明
  - **Then** 使用正式領域詞彙並清楚區分閱讀理解、Anki 式間隔複習與主動輸出

- **Scenario 4：取得方式可執行且不誤導**
  - **Given** repository 目前沒有 tag、Release 或 installer pipeline
  - **When** 訪客查看取得方式
  - **Then** README 明確標示 Early Preview、安裝版尚在準備
  - **And** 提供可複製執行的 clone、install、dev 與 build 指令

- **Scenario 5：AI 與本機資料邊界清楚**
  - **Given** 核心 AI 使用 Codex 登入狀態，而 AI 語音需另外使用 OpenAI API key
  - **When** 訪客閱讀環境需求與資料說明
  - **Then** README 不把兩者混為同一憑證或宣稱所有處理完全離線

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 首屏內容 | 更新後的 `README.md` | 檢查開頭 | 有主視覺、價值主張、狀態與 CTA | Critical |
| TC2 | 截圖資產 | README 內所有相對圖片連結 | 解析並檢查檔案 | 每個檔案存在、可讀且尺寸適合 GitHub 顯示 | Critical |
| TC3 | 功能準確性 | `CONTEXT.md` 與相關模組文件 | 比對 README 敘述 | 核心機制與用詞一致 | Critical |
| TC4 | 開發啟動 | 全新 clone 與 Node.js／npm | 執行 README 指令 | 依現有 root scripts 安裝、啟動與建置 | High |
| TC5 | 發布狀態 | 無 tags、Releases、LICENSE | 檢查下載與授權文字 | 不宣稱已有 installer 或既定授權 | Critical |
| TC6 | Markdown 品質 | 所有新增文件 | 執行 diff 與連結檢查 | 無 trailing whitespace 或遺失的本機檔案 | High |

## 5. Implementation Notes

- 更新根目錄 `README.md`，讓它同時服務產品訪客與想從原始碼試用的開發者。
- 從既有產品介紹簡報內嵌的真實 App 截圖建立 `docs/images/` GitHub 專用資產；不修改
  使用者原有簡報及匯出資料夾。
- 使用相對圖片路徑，確保 fork、clone 與 GitHub renderer 都能顯示。
- Releases 入口可先保持穩定 URL，但必須明確標示安裝版仍在準備；第一個 Release 建立後
  不需再次修改連結。
- 開源授權涉及維護者決策，本功能不自動新增 LICENSE。

## 6. Assumptions and Non-goals

### Assumptions

- 主要讀者為使用繁體中文、正在閱讀外語 EPUB 的學習者；介面截圖本身保留英文 UI。
- Repository 未來會公開，並以 GitHub Releases 提供正式安裝包。

### Non-goals

- 不建立 Electron installer、簽章、公證或自動發布 workflow。
- 不建立 GitHub Pages 網站；本功能只改善 repository 預設首頁。
- 不代替維護者決定 MIT、Apache-2.0、GPL 或其他授權。
- 不修改產品 UI 或建立與實際功能不符的合成介面。

## 7. Module Documentation Impact

不需新增或更新產品模組文件。本功能只改變 repository 的對外產品說明與圖片資產，沒有
修改 App 行為、資料契約或架構邊界。

## 8. Implementation Record

### Status

Implemented on 2026-08-25.

### Implementation Summary

- 把只有開發骨架資訊的根目錄 README 改寫成繁體中文產品首頁，首屏包含品牌主視覺、
  一句價值主張、Early Preview 狀態與 Releases／原始碼試用／Issues 三個入口。
- 以「閱讀 → 理解 → 收進生詞庫 → 間隔複習 → 復述、跟讀與造句」說明完整學習循環，
  並使用 `CONTEXT.md` 的閱讀區段、學習項目與學習語言工作區等正式詞彙。
- 從使用者既有產品簡報擷取真實 App 畫面，建立六張不依賴外部圖床的 GitHub 圖片資產；
  原始簡報及匯出資料夾未被修改。
- 加入可執行的 clone、install、dev、typecheck、test、e2e 與 build 指令，並明確說明
  目前尚無 installer、核心 Codex 登入與選用 AI 語音 API key 的差異。
- 補上本機資料、AI 有限上下文、語音傳送與手動備份／完整還原邊界，以及技術組成與
  contribution CTA。

### Changed Files

- `README.md`
- `docs/images/vocabreader-hero.png`
- `docs/images/reading-with-ai.png`
- `docs/images/learning-library.png`
- `docs/images/spaced-review.png`
- `docs/images/listen-and-repeat.png`
- `docs/images/sentence-practice.png`
- `documents/implements/F71-create-github-project-page.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 首頁先呈現產品價值 | Pass | Hero、tagline、狀態、三個 CTA 均位於 README 首屏 |
| 真實畫面展示核心體驗 | Pass | 六張 repository-local PNG，涵蓋五個核心工作區與主視覺 |
| 功能說明符合目前產品 | Pass | 已對照 `CONTEXT.md`、七份相關模組文件與目前 package scripts |
| 取得方式可執行且不誤導 | Pass | 原始碼指令對應 root scripts；明示尚無 installer／tag／Release |
| AI 與本機資料邊界清楚 | Pass | README 獨立說明 Codex 登入、語音 API key、本機資料與有限 AI scope |

### Verification

- Node 靜態檢查解析 README 的六個本機圖片引用，確認六個檔案全部存在。
- `file docs/images/*.png` 確認 hero 為 1600×900，其餘五張畫面為 1440×920 PNG。
- `git diff --check` 通過。

### Known Publication Follow-ups

- Repository 必須改成 public，外部訪客才能看到首頁。
- 建立第一個 GitHub Release 與可下載 installer，讓首頁的 Releases CTA 產生實際轉換。
- 維護者需選定並加入 LICENSE；在此之前 README 不宣稱特定開源授權。
