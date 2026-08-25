---
author: Codex
date: 2026-08-25
title: 修正 macOS Release 被判定為已損毀
uuid: df53eb62-01e4-44d8-95a5-f190fdb8be85
version: 1.0.0
status: approved
---

# Bug Fix: 修正 macOS Release 被判定為已損毀

## 1. Bug Overview

`v0.1.0` 的 Apple Silicon DMG 可完整下載、通過 `hdiutil verify`，內含執行檔也確實為
`arm64`，但從 Chrome 下載後開啟會顯示「VocabReader.app 已損毀，無法打開」。這不是一般的
未 notarize Gatekeeper 警告。

直接檢查 GitHub Release 內的 App bundle 時，`codesign --verify --deep --strict` 與
`spctl --assess` 都回傳：

```text
code has no resources but signature indicates they must be present
```

目前 workflow 以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 停用憑證探索，但 macOS build config
沒有要求 electron-builder 對完整 App 進行 ad-hoc signing。結果只有 Electron 主執行檔保留
linker-generated ad-hoc signature，App resources、Frameworks 與 Helper Apps 沒有形成有效的
bundle seal。

## 2. Fix Objective

- unsigned Early Preview 在沒有 Apple Developer ID 的情況下，仍由 electron-builder 對完整
  macOS App bundle 執行明確的 ad-hoc signing。
- 產生 DMG 後必須掛載實際 DMG，對其中的 `VocabReader.app` 執行嚴格、遞迴簽章驗證；驗證
  失敗時 CI 不得上傳 installer。
- 發布修正版 `v0.1.1`，保留 Apple Silicon、Intel 與 Windows x64 三平台矩陣。
- 本修正只消除「App 已損毀」封裝缺陷；沒有 Developer ID 與 notarization 時，macOS 仍可
  顯示未知開發者／無法檢查惡意軟體的正常 Early Preview 警告。

## 3. Acceptance Criteria

- **Scenario 1：完整 macOS bundle 使用 ad-hoc signing**
  - **Given** build 環境沒有 Apple Developer ID
  - **When** electron-builder 封裝 macOS App
  - **Then** 明確使用 `identity: "-"` 對 App、Frameworks 與 Helper Apps 簽章
  - **And** ad-hoc signing 不啟用需要正式 Team ID 的 hardened library validation

- **Scenario 2：DMG 內 App 通過簽章驗證**
  - **Given** Apple Silicon 或 Intel DMG 已產生
  - **When** 掛載 DMG 並執行 `codesign --verify --deep --strict`
  - **Then** VocabReader.app 回傳成功，且 sealed resources 存在

- **Scenario 3：CI 阻止損壞 DMG 發布**
  - **Given** macOS matrix job 已完成 Build installer
  - **When** workflow 準備上傳 artifact
  - **Then** 先掛載該 job 的 DMG 並驗證 bundle signature
  - **And** 驗證失敗時 Upload installer 不執行

- **Scenario 4：v0.1.1 三平台重新發布**
  - **Given** 修正已進入 main 且 package version 為 `0.1.1`
  - **When** 建立 `v0.1.1` tag
  - **Then** GitHub Release 同時包含 mac arm64 DMG、mac x64 DMG 與 Windows x64 EXE
  - **And** 公開下載 URL 可在未登入狀態存取

## 4. Test Scenarios

| ID | Scenario | Given | When | Then | Priority |
|---|---|---|---|---|---|
| TC1 | ad-hoc config 契約 | desktop package config | 執行 release config test | mac identity 為 `-` 且 hardened runtime 關閉 | Critical |
| TC2 | workflow 真實 DMG gate | release workflow | 執行 release config test | upload 前存在 hdiutil + strict codesign 驗證 | Critical |
| TC3 | Apple Silicon DMG | macOS arm64 build | 建置、掛載並驗證 | 完整 bundle signature 有效 | Critical |
| TC4 | quarantine 安裝副本 | 已驗證 App | 套用 browser quarantine metadata | 不再因 invalid bundle seal 被判定已損毀 | High |
| TC5 | v0.1.1 Release | tag workflow | 三平台 jobs 完成 | Release assets 齊全且可公開下載 | Critical |

## 5. Implementation Notes

- electron-builder `26.15.3` 明確支援 `mac.identity: "-"` 作為 opt-in ad-hoc signing；沒有設定
  identity 時不會自動 fallback。
- ad-hoc signing 配合預設 hardened runtime 會要求 library-validation entitlement；本版沒有
  Developer Team identity，因此設定 `hardenedRuntime: false`。正式 Developer ID 發布時應重新
  啟用 hardened runtime 並改用正式 entitlements／notarization。
- CI 驗證實際 DMG 內容，而不是只檢查中間 `release/mac*` 目錄，確保交付產物與驗證對象一致。
- 不使用 `xattr` 移除 quarantine 作為正式修復；quarantine workaround 只適用於已下載的舊版。

## 6. Affected Files and Boundaries

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/tests/release-config.test.mjs`
- `.github/workflows/release.yml`
- `docs/release-notes/v0.1.1.md`
- `documents/implements/B31-fix-macos-damaged-release-bundle.md`

不改變 VocabReader 的閱讀、AI 對話、生詞庫、間隔複習或使用者資料 runtime；不需更新
`documents/modules/`。

## 7. Assumptions and Non-goals

- `v0.1.1` 仍為未簽章／未 notarize Early Preview。
- 不在本次購買 Apple Developer Program、建立 signing secrets 或停用 macOS 全域安全設定。
- 不承諾公司 MDM 管理的 Mac 可略過未知開發者政策。
- 不修改 Windows installer 行為，僅重新產生相同版本矩陣中的 Windows x64 asset。

## 8. Implementation Record

### Status

Implementation in progress on 2026-08-25.

## Appendix: TDD Fix Workflow

1. 先以 package config 與 workflow 契約重現缺少完整 bundle signing gate。
2. 加入最小的 electron-builder ad-hoc signing 設定與 DMG verification step。
3. 本機重建 DMG，掛載後執行嚴格簽章驗證並模擬下載 quarantine。
4. 發布 `v0.1.1`，驗證三平台 artifacts 與公開下載，再同步本文件。
