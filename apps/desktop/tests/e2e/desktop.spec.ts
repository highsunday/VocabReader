import { _electron as electron, expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const desktopApp = fileURLToPath(new URL("../..", import.meta.url));

test("launches the secure Electron reading shell", async () => {
  const electronApp = await electron.launch({
    args: [desktopApp],
    env: {
      ...process.env,
      NODE_ENV: "test"
    }
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("LingoShelf");
    await expect(
      page.getByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeVisible();
    await expect(page.getByLabel("AI 助教")).toBeVisible();

    const security = await page.evaluate(() => ({
      hasDesktopBridge: Boolean(window.readerDesktop),
      hasNodeRequire: typeof (window as Window & { require?: unknown }).require
    }));

    expect(security.hasDesktopBridge).toBe(true);
    expect(security.hasNodeRequire).toBe("undefined");
  } finally {
    await electronApp.close();
  }
});
