---
author: Codex
date: 2026-08-27
title: 為公開操作 GIF 補上 MP4 版本
uuid: e5e76a44-40c8-49e9-baf0-c4fe1dd7c89d
version: 1.0.1
status: approved
---

# Feature Specification - 為公開操作 GIF 補上 MP4 版本

## 1. Feature Overview

VocabReader 的 README 與產品官網以 9 個真實操作 GIF 展示學習流程；GIF 相容性高，但同等
畫質下檔案較大。這項功能讓每個公開操作 GIF 都有同名 MP4 版本，並讓產品官網的 3 個動畫
優先載入 MP4、保留 GIF 作為 poster 與不支援影片時的 fallback。

MP4 必須從既有原始錄影套用與 GIF 相同的加速、串接、縮放與長寬比規則產生，不從 GIF
反向轉碼。如此可避免調色盤量化造成的品質損失，並維持兩種格式相同的內容與播放節奏。

## 2. Requirements (User Story)

- **As a** 瀏覽 VocabReader 公開產品介紹的使用者
- **I want** 操作動畫有瀏覽器友善且較省流量的 MP4 版本
- **So that** 我能在保留 GIF 相容性的前提下，更快載入真實產品流程

## 3. Requirements

### 3.1 公開媒體產生

- `docs/readme-assets/` 的 9 個操作 GIF 都必須有同名 `.mp4` sibling。
- MP4 使用 H.264、`yuv420p`、無音訊、fast-start，尺寸與播放內容對應同名 GIF。
- 既有 `scripts/build-public-gifs.sh` 一次重建 GIF 與 MP4，並從原始 MP4 錄影產生兩者。
- 每個 MP4 必須是可播放影片、duration 與同名 GIF 的差異不超過一個合理影格誤差，且檔案
  小於同名 GIF。

### 3.2 產品官網整合

- 官網使用的 `ask-ai-context`、`spaced-review-workflow` 與 `switch-learning-language` 同步複製
  GIF 與 MP4，README 與官網的同名 MP4 必須位元級一致。
- 首頁 3 個動態證據使用 `<video>` 優先載入 MP4，維持自動播放、靜音、循環與 inline 播放。
- 每個官網 MP4 使用輕量靜態 WebP poster，避免瀏覽器為 poster 另外下載完整 GIF；同名 GIF
  在 `<video>` 內保留為不支援 video 時的 `<img>` fallback。既有雙語可存取名稱、固定
  width/height 與 fallback lazy-loading 行為不能退化。
- `prefers-reduced-motion: reduce` 時，動態證據不得自動播放，應停留在 poster 畫面。

## 4. Acceptance Criteria

- **Scenario 1：所有 GIF 都有品質合格的 MP4 sibling**
  - **Given** repository 內 9 個公開操作 GIF
  - **When** 執行公開媒體產生器與媒體契約測試
  - **Then** 每個同名 MP4 都是 H.264、`yuv420p`、無音訊、尺寸與節奏相符且小於 GIF

- **Scenario 2：官網取得同步 MP4**
  - **Given** 官網使用 3 個操作動畫
  - **When** 公開媒體產生器完成同步
  - **Then** 官網與 README 的 3 個同名 MP4 位元級一致

- **Scenario 3：官網漸進增強且尊重 reduced motion**
  - **Given** 訪客載入產品官網
  - **When** 瀏覽器支援 H.264 MP4
  - **Then** 動態證據以 muted、loop、playsinline 的 video 播放，WebP 作為 poster，GIF 保留為 fallback
  - **And** 使用者偏好 reduced motion 時不自動播放影片

## 5. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | 9 個 MP4 媒體契約 | 公開 GIF 與原始錄影 | 執行 `npm run test:media` | 同名 MP4 的 codec、pixel format、音訊、尺寸、duration 與檔案大小皆合格 | Critical |
| TC2 | 產生器輸出契約 | `scripts/build-public-gifs.sh` | 檢查並執行腳本 | 從原始錄影產生 H.264/yuv420p/fast-start MP4，不從 GIF 轉碼 | Critical |
| TC3 | 官網媒體同步 | README 與 website 各 3 個 MP4 | 執行 `npm run test:media` | 對應檔案 SHA-256 完全一致 | Critical |
| TC4 | 官網 video 漸進增強 | `website/index.html` 與 CSS/JS | 執行 website contract tests | 3 個 video 具 MP4 source、WebP poster、GIF fallback、固定尺寸、可存取名稱與 reduced-motion 停播 | Critical |

## 6. Implementation Notes

- 保留既有腳本名稱，避免破壞目前 `npm run test:media` 與文件引用；腳本職責擴充為公開動畫
  的 GIF/MP4 雙格式產生器。
- MP4 以 FFmpeg `libx264` 編碼，使用 `-movflags +faststart` 讓瀏覽器可以邊下載邊播放。
- 官網用小型 JavaScript 媒體查詢處理 reduced motion：偏好開啟時 pause 並移除 autoplay，
  偏好關閉時恢復 autoplay/play；`play()` 被瀏覽器拒絕時安靜保留 poster。

## 7. Assumptions and Non-goals

### Assumptions

- 「加上 MP4 版本」涵蓋目前所有 9 個公開操作 GIF，而不是只處理官網已使用的 3 個。
- GIF 仍需保留，因 README 顯示與舊環境相容性仍依賴它。

### Non-goals

- 不移除或重新設計任何現有 GIF、截圖、文案與產品官網版面。
- 不新增 WebM、AV1、串流服務、CDN、service worker 或影音控制列。
- 不改變 Electron App、server、學習資料或 AI 功能。

## 8. Module Documentation Impact

更新 `documents/modules/product-website.md` 的首頁媒體、關鍵檔案與測試說明；不新增新的
domain module。

## 9. Implementation Record

### Status

Implemented and verified on 2026-08-27.

### Implementation Summary

- `scripts/build-public-gifs.sh` now produces a same-named H.264 MP4 beside each of the 9 public
  workflow GIFs, using the same source recordings, timing scale, concatenation, dimensions, and
  aspect-ratio rules as the GIF path.
- Every MP4 uses `yuv420p`, has no audio, places metadata at the front with `+faststart`, matches the
  corresponding GIF duration within 0.2 seconds, and is 72.8%–85.5% smaller.
- The 3 homepage workflows synchronize byte-identical MP4s to `website/public/assets/`. Their first
  frames are encoded as 20–48 KB WebP posters through FFmpeg PNG output and `cwebp`.
- Homepage workflow evidence now uses accessible `<video>` markup with MP4 source, static WebP
  poster, and nested GIF fallback. Existing bilingual accessible names, 800×500 intrinsic size,
  visual framing, autoplay, mute, loop, and inline playback are retained.
- `website/src/main.js` pauses videos and returns them to the first frame when reduced motion is
  preferred, restoring autoplay if that preference is later disabled.

### Test Coverage

- F75 TC1–TC3: `scripts/public-gif-contract.test.mjs` validates generator configuration, all 9 MP4
  codecs, pixel formats, audio absence, dimensions, durations, file sizes, and website byte identity.
- F75 TC4: `website/tests/contracts.test.mjs` validates all 3 video elements, MP4 sources, WebP
  posters, GIF fallbacks, intrinsic dimensions, accessible names, and reduced-motion handling.
- Existing GIF palette and website contracts remain green.

### Changed Files

#### Production code and media

- `scripts/build-public-gifs.sh`
- `docs/readme-assets/{ask-ai-context,explain-reader-annotations,add-cards-from-explanation,add-card-with-command,spaced-review-workflow,listen-and-repeat,sentence-practice,japanese-learning-workflow,switch-learning-language}.mp4`
- `website/index.html`
- `website/src/main.js`
- `website/src/styles.css`
- `website/public/assets/{ask-ai-context,spaced-review-workflow,switch-learning-language}.mp4`
- `website/public/assets/{ask-ai-context,spaced-review-workflow,switch-learning-language}-poster.webp`

#### Test code

- `scripts/public-gif-contract.test.mjs`
- `website/tests/contracts.test.mjs`

#### Documentation

- `documents/implements/F75-add-mp4-workflow-media.md`
- `documents/modules/product-website.md`
- `website/PRODUCT.md`
- `website/DESIGN.md`
- `website/.impeccable/asset-inventory.md`

### Acceptance Criteria Verification

| Acceptance criterion | Status | Basis |
|---|---|---|
| 9 個 GIF 都有合格 MP4 sibling | Pass | F75 TC1、FFprobe checks |
| 官網取得 3 個 byte-identical MP4 | Pass | F75 TC3 SHA-256 checks |
| 官網漸進增強並尊重 reduced motion | Pass | F75 TC4、desktop/mobile browser acceptance |

### Test Scenario Verification

| Test scenario ID | Status | Automated test basis |
|---|---|---|
| TC1 | Pass | `F75 TC1 every workflow GIF has a smaller, matching browser-ready MP4` |
| TC2 | Pass | `F75 TC2 public media generator builds browser-ready MP4s from source recordings` |
| TC3 | Pass | `F75 TC3 website workflow MP4s are byte-identical copies of the README assets` |
| TC4 | Pass | `F75 TC4 progressively enhances workflow GIFs with accessible MP4 video` |

### Commands Executed

```bash
bash scripts/build-public-gifs.sh
npm run test:media
npm test
npm run build
```

### Hypotheses and Decisions

- The initial static-poster implementation attempted FFmpeg's `libwebp` encoder, but this machine's
  FFmpeg build only provides a WebP decoder. A deterministic probe confirmed that the installed
  `cwebp` accepts FFmpeg's PNG image pipe, so the generator now declares `cwebp` as a dependency and
  uses one consistent encoding path.
- A full GIF is not used as the `<video>` poster because browsers may download it in addition to the
  MP4, offsetting the bandwidth improvement. The lightweight WebP poster preserves the initial and
  reduced-motion states; GIF remains only as compatibility fallback.
- Browser acceptance at 1440×1000 and 390×844 confirmed MP4 playback, 0 horizontal overflow,
  preserved 800:500 layout ratio, and no console warnings or errors.

### Deferred Items

- The ignored `website/` artifact was updated and built locally but not published to `gh-pages`;
  deployment was not requested.
- WebM, AV1, CDN delivery, automated publishing, and removal of GIF fallbacks remain non-goals.

### Architectural Observations

- No new runtime coupling or unclear responsibility boundary was introduced. The existing risk that
  `website/` is ignored on `main` and published manually remains documented in the product-website
  module; this task does not broaden it.
