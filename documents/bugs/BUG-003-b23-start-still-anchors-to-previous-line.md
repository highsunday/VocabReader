---
bug-id: BUG-003
title: B23 修正後 START 仍顯示在上一行
status: resolved
severity: medium
created: 2026-08-14
updated: 2026-08-14
related-bxx: B23
---

## 狀態快照（接手者先讀這一段）

- **現在相信的根因方向：** 已確認並修復：自動推進曾把上一句句尾標點留成新區段第一個 glyph。
- **已排除（別再找）：** 單靠 START glyph rectangle 無法修正錯誤的資料 offset；本次錯誤指紋不需歸因於 EPUB DOM、Range 多矩形或字型載入時序。
- **下一步要做什麼：** 請使用者在原本會復發的 EPUB 執行一次「完成這段，前往下一段」做最終畫面驗收；若 start 已指向下一段文字但線仍在上一行，再重開其餘呈現層假說。
- **進度：** EXP-001 完全修復；相關 108 / 108、Desktop 541 / 541、Server 3 / 3、typecheck 與 build 全數通過。

## Bug 描述

B23 已把 START 的像素測量由 collapsed caret 改為新區段第一個 glyph，但使用者在
2026-08-14 回報相同畫面症狀再次出現：按下「完成這段，前往下一段」後，START 仍顯示在
上一個視覺行。預期 START 應對齊下一段第一個尚未閱讀的文字所在行。

**錯誤指紋（用來辨識復發）：**

```text
完成這段並自動推進後，readingRange.start 指向上一段最後一個單字後的句尾標點，
使 START glyph 與分隔線仍位於上一個視覺行。
```

## 重現步驟

```text
環境：VocabReader Desktop renderer；含一般英文句尾標點的章節。
1. 目前閱讀區段的 END 位於該段最後一個英文單字之後、緊鄰句尾標點之前。
2. 執行「完成這段，前往下一段」。
3. 檢查新的 readingRange.start 與 START 分隔線。
4. 預期 start 對齊下一段第一個未讀文字；實際 start 指向上一句句尾標點。
```

出現頻率：對符合上述邊界的輸入穩定重現；真實 EPUB 中的整體出現頻率待驗收確認。

## 完成條件 (Done)

| 指標 | 基準值（現在） | 目標值（修好後） | 目前最佳 |
|------|-------------|---------------|---------|
| 含句尾標點的自動推進回歸測試 | 0 / 1（start 13，預期 15） | 1 / 1 通過 | 1 / 1 |
| reading-range 單元測試 | 15 / 16 | 全數通過 | 17 / 17 |
| reading-range + App 相關測試 | 待量測 | 全數通過 | 108 / 108 |
| Desktop 完整測試 | 待量測 | 全數通過 | 541 / 541；Server 3 / 3 |
| 使用者真實 EPUB 驗收 | START 仍可能在上一行 | START 對齊下一段首行 | 待驗收 |

## 已確認事實（建立後視為真，不再重測）

| 事實 | 如何被確認 | 日期 |
|------|----------|------|
| B23 已把 START 改為以 offset 處非空 glyph Range 定位 | commit `0e58c52` 與 B23 實作紀錄 | 2026-08-14 |
| 修正前 `endAfterWords()` 回傳最後一個匹配單字的末端，不包含其後標點 | 紅燈前閱讀 `reading-range.ts` | 2026-08-14 |
| 修正前 `firstReadableOffset()` 只略過 Unicode 空白，句點會被視為新 START | 紅燈前閱讀 `reading-range.ts` | 2026-08-14 |
| offset 13 是上一句句點、預期 offset 15 是下一句 `Four` | EXP-001 失敗斷言 | 2026-08-14 |
| 修正後下一段保留開引號，END 保留句點與閉引號 | EXP-001 單元測試 | 2026-08-14 |

## 調查範圍

### 已排除 — 確認非原因

| 範圍 / 元件 | 排除依據 | 日期 |
|------------|---------|------|
| `markerTopForTextOffset()` 作為本次唯一根因 | 紅燈在不呼叫 DOM Range 的純 `advanceReadingRange()` 單元測試即可重現同一 offset 指紋 | 2026-08-14 |

### 可疑點

| 優先 | 範圍 / 元件 | 懷疑理由 | 狀態 |
|------|------------|---------|------|
| 🔴 | `advanceReadingRange()` 的標點邊界 | 現行 end/start 組合可讓句尾標點成為下一段首字元 | 已確認並修復 |
| 🟡 | EPUB 相鄰 text node／不可見文字 | 純 text offset 可能與第一個可見 glyph 不一致 | 本指紋不需調查 |
| 🟡 | Range 多矩形合併 | `getBoundingClientRect()` 可能不代表第一個 client rect | 本指紋不需調查 |
| 🟢 | 字型載入／ResizeObserver 時序 | 字型換行後可能未觸發預期的 marker 重測 | 本指紋不需調查 |

### 未調查

- [ ] 若使用者驗收仍失敗，再擷取真實 EPUB 交界 DOM 與保存的 start 字元。
- [ ] 僅在 start 字元已正確時，再調查 Electron Range client rect 與 webfont 重排。

## 當前假說

已證實的假說：B23 修正了 offset 到像素的呈現，但沒有修正自動推進產生的 offset。
當舊 END 恰好停在最後一個單字末端時，下一個非空白字元常是同一行的句尾標點；因此
`markerTopForTextOffset()` 即使完全正確，也會把 START 放在該標點所在的上一行。

## 實驗紀錄

> AI 自主執行，最新的在最上面。

### EXP-001 — 2026-08-14

- **假說：** 自動推進把句尾標點誤留給下一段，是 B23 視覺症狀回歸的資料層原因。
- **預計修改範圍：** 先只新增 `apps/desktop/src/renderer/reading-range.test.ts` 的標點重現測試；確認紅燈後才修改 `reading-range.ts`。
- **測試方式：** 執行 reading-range 單元測試，斷言新 START 不得指向已完成句子的句尾標點，且下一段仍維持約略相同字數。
- **修改內容：** 已在 `reading-range.test.ts` 新增含連續英文句子與句尾標點的自動推進測試；斷言新 START 位於下一句 `Four`，且新區段完整保留自身句點。`reading-range.ts` 接著把下一段起點移到下一個詞或其前方同段開頭符號，並讓新 END 吸收緊鄰最後單字的句尾標點。另補開引號歸屬測試，並把 App 明確推進測試改為真實句尾標點邊界、斷言保存的 START 跳過上一句句點。
- **指標變化：** 新測試穩定紅燈後轉綠；reading-range 15 / 16 → 17 / 17（含開引號案例），`next.start` 由句點 offset 13 改為 `Four` offset 15；reading-range + App 108 / 108 通過。
- **結果：** ✅ 完全修復；相關 108 / 108、Desktop 541 / 541、Server 3 / 3、typecheck、production build 與 `git diff --check` 全數通過。
- **觀察 / 新線索：** 錯誤值直接指向上一句句點，確認資料層 offset 足以完整解釋 B23 的畫面指紋；最小邊界修正讓單元與 App 保存 feedback loop 轉綠，不需要擴大呈現層改動。

## 解決方案

- **根因：** `endAfterWords()` 把 END 停在單字末端，而 `firstReadableOffset()` 只跳過空白；兩者組合讓上一句句點成為新 START。
- **修復方式：** 新 START 尋找下一個 Unicode 字母／數字並保留空白後的開頭標點；新 END 吸收緊鄰最後單字的句尾標點與閉引號。
- **最終 commit 序列：** `0e58c52`（原始 glyph 修正）＋本次 B23 regression correction scoped commit。
- **回歸測試：** `reading-range.test.ts` 新增句尾標點與開引號案例；`App.test.tsx` 的明確推進案例加入句點邊界並斷言實際保存 START。
