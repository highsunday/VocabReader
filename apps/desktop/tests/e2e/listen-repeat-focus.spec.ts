import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });

const renderer = fileURLToPath(new URL("../../src/renderer/", import.meta.url));
const longText = "I was once invited to Southern California to mediate between some landowners and migrant farm workers whose conflicts had grown increasingly hostile and difficult to resolve. ".repeat(4);

// Exercise the shipped React view and CSS, holding only external audio preparation.
async function bundleFixture(text: string, progressive: boolean) {
  const result = await build({
    stdin: {
      resolveDir: renderer,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ListenRepeatWorkspace } from "./ListenRepeatWorkspace";
        const text = ${JSON.stringify(text)};
        const progressive = ${progressive};
        const short = { id: "short", kind: "short", text: "I was once invited", parentId: "long", recording: null, aiAudio: null, recordingUnlocked: true };
        const snapshot = {
          hasAiVoice: true,
          progress: { shortCompleted: 0, shortTotal: progressive ? 1 : 0, longCompleted: 0, longTotal: 1, complete: false },
          statistics: { todayCompletedLongChunkCount: 0, totalCompletedLongChunkCount: 0, completedLongChunkCount30Days: 0, dailyActivity: [] },
          practice: { id: "layout", material: text, mode: progressive ? "progressive" : "advanced", shortChunkLength: "short", phase: "ready", error: null,
            longChunks: [{ id: "long", kind: "long", text, parentId: null, recording: null, aiAudio: null, recordingUnlocked: !progressive, shortChunks: progressive ? [short] : [] }] }
        };
        const api = { getSnapshot: async () => snapshot, prepareAiAudio: () => new Promise(() => {}), cancelAiAudio: async () => {} };
        createRoot(document.getElementById("root")).render(<ListenRepeatWorkspace api={api} active onOpenAiVoice={() => {}} />);
      `
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' }
  });
  return result.outputFiles[0].text;
}

for (const scenario of [
  { name: "long sentence on desktop", width: 1512, height: 945, text: longText, progressive: false, scroll: true },
  { name: "long sentence in a short window", width: 1080, height: 600, text: longText, progressive: false, scroll: true },
  { name: "long parent context in a narrow window", width: 800, height: 600, text: longText, progressive: true, scroll: true },
  { name: "ordinary short sentence", width: 1080, height: 600, text: "Every small phrase builds confidence.", progressive: false, scroll: false }
]) {
  test(`continuous practice keeps controls reachable: ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario);
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: readFileSync(`${renderer}/styles.css`, "utf8") });
    await page.addScriptTag({ content: await bundleFixture(scenario.text, scenario.progressive) });
    await page.getByRole("button", { name: /Resume continuous practice/ }).click();
    const dialog = page.getByRole("dialog", { name: "Stay with the rhythm" });
    await expect(dialog).toBeVisible();
    const card = dialog.locator(".listen-repeat-focus-card");
    const bounds = await card.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(scenario.height);
    const stop = dialog.getByRole("button", { name: "Stop continuous practice" });
    await expect(stop).toBeInViewport({ ratio: 1 });
    const content = dialog.getByRole("region", { name: "Practice text" });
    await expect(content).toContainText(scenario.text.trim());
    await page.screenshot({ path: test.info().outputPath("focus-start.png") });
    if (scenario.scroll) {
      expect(await content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await content.focus();
      await page.keyboard.press("PageDown");
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      await content.hover();
      await page.mouse.wheel(0, await content.evaluate(el => el.scrollHeight));
      await expect.poll(() => content.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
      await expect(stop).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: test.info().outputPath("focus.png") });
    await stop.click();
    await expect(dialog).not.toBeAttached();
  });
}
