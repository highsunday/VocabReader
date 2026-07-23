import { _electron as electron, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    const userDataPath = await electronApp.evaluate(({ app }) =>
      app.getPath("userData")
    );
    const installedSkill = readFileSync(join(
      userDataPath,
      "codex-runtime/.agents/skills/explain-reader-annotations/SKILL.md"
    ), "utf8");
    expect(installedSkill).toContain("name: explain-reader-annotations");
    expect(installedSkill).toContain("Use the requested explanation language");
    const installedReadingSkill = readFileSync(join(
      userDataPath,
      "codex-runtime/.agents/skills/practice-reading-comprehension/SKILL.md"
    ), "utf8");
    expect(installedReadingSkill)
      .toContain("name: practice-reading-comprehension");
    expect(installedReadingSkill).toContain("8–12");
    await expect(page).toHaveTitle("LingoShelf");
    await expect(
      page.getByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeVisible();
    await expect(page.getByLabel("AI 助教")).toBeVisible();
    await expect(page.getByRole("button", { name: "新對話" })).toBeVisible();
    await expect(page.getByRole("button", { name: "對話紀錄" })).toBeVisible();
    await expect(page.getByRole("button", { name: "設定" })).toBeVisible();
    await expect(page.getByLabel("Codex 狀態")).toBeVisible();

    const annotationToolVisual = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".content");
      if (!content) throw new Error("center content is unavailable");
      const dock = document.createElement("div");
      dock.className = "annotation-tool-dock";
      dock.dataset.testid = "annotation-tool-style-probe";
      const button = document.createElement("button");
      button.className = "annotation-tool";
      const label = document.createElement("span");
      label.className = "annotation-tool-label";
      label.textContent = "標記";
      const count = document.createElement("span");
      count.className = "annotation-tool-count";
      count.textContent = "12";
      button.append(label, count);
      dock.append(button);
      content.append(dock);
      const dockStyle = getComputedStyle(dock);
      const buttonStyle = getComputedStyle(button);
      const countStyle = getComputedStyle(count);
      const backgroundImage = buttonStyle.backgroundImage;
      const backgroundColor = buttonStyle.backgroundColor;
      const countBackgroundColor = countStyle.backgroundColor;
      button.style.transition = "none";
      button.classList.add("active");
      const activeButtonStyle = getComputedStyle(button);
      const activeCountStyle = getComputedStyle(count);
      return {
        position: dockStyle.position,
        top: dockStyle.top,
        minWidth: buttonStyle.minWidth,
        height: buttonStyle.height,
        borderRadius: buttonStyle.borderRadius,
        countPosition: countStyle.position,
        countTop: countStyle.top,
        countRight: countStyle.right,
        countText: count.textContent,
        backgroundImage,
        backgroundColor,
        countBackgroundColor,
        activeBackgroundImage: activeButtonStyle.backgroundImage,
        activeBackgroundColor: activeButtonStyle.backgroundColor,
        activeCountBackgroundColor: activeCountStyle.backgroundColor
      };
    });
    expect(annotationToolVisual).toEqual({
      position: "sticky",
      top: "72px",
      minWidth: "84px",
      height: "40px",
      borderRadius: "999px",
      countPosition: "absolute",
      countTop: "-6px",
      countRight: "-6px",
      countText: "12",
      backgroundImage: "none",
      backgroundColor: "rgb(250, 249, 245)",
      countBackgroundColor: "rgb(226, 232, 225)",
      activeBackgroundImage: "none",
      activeBackgroundColor: "rgb(246, 237, 207)",
      activeCountBackgroundColor: "rgb(234, 220, 169)"
    });
    const annotationProbe = page.getByTestId("annotation-tool-style-probe");
    await expect(annotationProbe.locator("[role=tooltip]")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => annotationProbe.locator("button").evaluate(
      (element) => getComputedStyle(element).transitionDuration
    )).toBe("0s");
    await annotationProbe.evaluate((element) => element.remove());

    const assistantPanel = page.getByLabel("AI 助教");
    const resizeHandle = page.getByRole("separator", {
      name: "調整 AI 對話面板寬度"
    });
    await expect(resizeHandle).toBeVisible();
    const initialAssistantBox = await assistantPanel.boundingBox();
    if (!initialAssistantBox) throw new Error("AI panel bounds are unavailable");

    await resizeHandle.press("ArrowLeft");
    await expect.poll(async () => (await assistantPanel.boundingBox())?.width)
      .toBeCloseTo(initialAssistantBox.width + 16, 0);

    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) throw new Error("AI resize handle bounds are unavailable");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 80, handleBox.y + 80);
    await page.mouse.up();
    await expect.poll(async () => (await assistantPanel.boundingBox())?.width)
      .toBeGreaterThan(initialAssistantBox.width + 80);

    const resizedAssistantWidth = await page.locator(".workspace").evaluate(
      (element) => Number.parseFloat(
        getComputedStyle(element).getPropertyValue("--right-sidebar-width")
      )
    );
    await page.getByRole("button", { name: "摺疊右側欄" }).click();
    await expect(resizeHandle).not.toBeAttached();
    await page.getByRole("button", { name: "展開右側欄" }).click();
    await expect(page.getByRole("separator", {
      name: "調整 AI 對話面板寬度"
    })).toBeVisible();
    await expect.poll(async () => page.locator(".workspace").evaluate(
      (element) => Number.parseFloat(
        getComputedStyle(element).getPropertyValue("--right-sidebar-width")
      )
    )).toBeCloseTo(resizedAssistantWidth, 0);

    const security = await page.evaluate(() => {
      const desktop = (
        window as unknown as {
          readerDesktop?: {
            library: {
              listBooks: unknown;
              importBook: unknown;
              deleteBook: unknown;
              getChapterContent: unknown;
              saveReadingState: unknown;
              saveReadingRange: unknown;
              saveAnnotations: unknown;
            };
            learning: {
              listItems: unknown;
              getItem: unknown;
              updateItem: unknown;
              trashItem: unknown;
              restoreItem: unknown;
              emptyTrash: unknown;
            };
            settings: {
              get: unknown;
              save: unknown;
            };
            chat: {
              getState: unknown;
              connect: unknown;
              sendMessage: unknown;
              startNewConversation: unknown;
              selectConversation: unknown;
              removeConversation: unknown;
              selectModel: unknown;
              stopResponse: unknown;
              onStateChanged: unknown;
            };
          };
        }
      ).readerDesktop;
      return {
        hasDesktopBridge: Boolean(desktop),
        hasLibraryList: typeof desktop?.library.listBooks,
        hasLibraryImport: typeof desktop?.library.importBook,
        hasLibraryDelete: typeof desktop?.library.deleteBook,
        hasChapterReader: typeof desktop?.library.getChapterContent,
        hasReadingStateSave: typeof desktop?.library.saveReadingState,
        hasReadingRangeSave: typeof desktop?.library.saveReadingRange,
        hasAnnotationSave: typeof desktop?.library.saveAnnotations,
        learningKeys: Object.keys(desktop?.learning ?? {}).sort(),
        hasLearningList: typeof desktop?.learning.listItems,
        hasLearningGet: typeof desktop?.learning.getItem,
        hasLearningUpdate: typeof desktop?.learning.updateItem,
        hasLearningTrash: typeof desktop?.learning.trashItem,
        hasLearningRestore: typeof desktop?.learning.restoreItem,
        hasLearningEmptyTrash: typeof desktop?.learning.emptyTrash,
        hasSettingsGet: typeof desktop?.settings.get,
        hasSettingsSave: typeof desktop?.settings.save,
        settingsKeys: Object.keys(desktop?.settings ?? {}).sort(),
        hasChatState: typeof desktop?.chat.getState,
        hasChatConnect: typeof desktop?.chat.connect,
        hasChatSend: typeof desktop?.chat.sendMessage,
        hasChatNew: typeof desktop?.chat.startNewConversation,
        hasChatSelect: typeof desktop?.chat.selectConversation,
        hasChatRemove: typeof desktop?.chat.removeConversation,
        hasChatSelectModel: typeof desktop?.chat.selectModel,
        hasChatStop: typeof desktop?.chat.stopResponse,
        hasChatSubscription: typeof desktop?.chat.onStateChanged,
        chatKeys: Object.keys(desktop?.chat ?? {}).sort(),
        hasNodeRequire: typeof (window as Window & { require?: unknown }).require
      };
    });

    expect(security.hasDesktopBridge).toBe(true);
    expect(security.hasLibraryList).toBe("function");
    expect(security.hasLibraryImport).toBe("function");
    expect(security.hasLibraryDelete).toBe("function");
    expect(security.hasChapterReader).toBe("function");
    expect(security.hasReadingStateSave).toBe("function");
    expect(security.hasReadingRangeSave).toBe("function");
    expect(security.hasAnnotationSave).toBe("function");
    expect(security.hasLearningList).toBe("function");
    expect(security.hasLearningGet).toBe("function");
    expect(security.hasLearningUpdate).toBe("function");
    expect(security.hasLearningTrash).toBe("function");
    expect(security.hasLearningRestore).toBe("function");
    expect(security.hasLearningEmptyTrash).toBe("function");
    expect(security.learningKeys).toEqual([
      "emptyTrash",
      "getItem",
      "listItems",
      "restoreItem",
      "trashItem",
      "updateItem"
    ].sort());
    expect(security.hasSettingsGet).toBe("function");
    expect(security.hasSettingsSave).toBe("function");
    expect(security.settingsKeys).toEqual(["get", "save"]);
    expect(security.hasChatState).toBe("function");
    expect(security.hasChatConnect).toBe("function");
    expect(security.hasChatSend).toBe("function");
    expect(security.hasChatNew).toBe("function");
    expect(security.hasChatSelect).toBe("function");
    expect(security.hasChatRemove).toBe("function");
    expect(security.hasChatSelectModel).toBe("function");
    expect(security.hasChatStop).toBe("function");
    expect(security.hasChatSubscription).toBe("function");
    expect(security.chatKeys).toEqual([
      "connect",
      "getState",
      "onStateChanged",
      "removeConversation",
      "selectModel",
      "selectConversation",
      "startNewConversation",
      "stopResponse",
      "sendMessage"
    ].sort());
    expect(security.hasNodeRequire).toBe("undefined");

    await page.getByRole("button", { name: /生詞庫/ }).click();
    await expect(page.getByRole("heading", { name: "生詞庫" })).toBeVisible();
    await expect(page.locator(".learning-item-card")).toHaveCount(10);
    const pinnedLearningToolbar = await page.evaluate(async () => {
      const toolbar = document.querySelector<HTMLElement>(".learning-library-sticky");
      const controls = document.querySelector<HTMLElement>(".learning-library-controls");
      const scrollRegion = document.querySelector<HTMLElement>(
        "[data-testid='learning-library-scroll-region']"
      );
      if (!toolbar || !controls || !scrollRegion) {
        throw new Error("learning library layout is unavailable");
      }
      const before = {
        toolbarTop: toolbar.getBoundingClientRect().top,
        controlsTop: controls.getBoundingClientRect().top
      };
      scrollRegion.scrollTop = scrollRegion.scrollHeight;
      await new Promise<void>((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve())
      ));
      return {
        before,
        after: {
          toolbarTop: toolbar.getBoundingClientRect().top,
          controlsTop: controls.getBoundingClientRect().top
        },
        scrollTop: scrollRegion.scrollTop,
        overflowY: getComputedStyle(scrollRegion).overflowY
      };
    });
    expect(pinnedLearningToolbar.overflowY).toBe("auto");
    expect(pinnedLearningToolbar.scrollTop).toBeGreaterThan(0);
    expect(pinnedLearningToolbar.after.toolbarTop)
      .toBe(pinnedLearningToolbar.before.toolbarTop);
    expect(pinnedLearningToolbar.after.controlsTop)
      .toBe(pinnedLearningToolbar.before.controlsTop);
    await page.getByRole("button", {
      name: /bank，單字，A2，financial institution/
    }).click();
    await expect(page.getByRole("dialog", { name: "bank" })).toBeVisible();
    await expect(page.getByRole("button", { name: "播放 bank 發音" }))
      .toBeVisible();
    await expect(page.getByRole("heading", { name: "Common collocations" }))
      .toBeVisible();
    await page.getByRole("button", { name: "關閉卡片詳情" }).click();
    await page.getByRole("button", {
      name: /take for granted，片語，B2/
    }).click();
    await expect(page.getByRole("button", {
      name: "播放 take for granted 發音"
    })).toBeVisible();
    await page.getByRole("button", { name: "關閉卡片詳情" }).click();

    await page.getByRole("button", { name: "設定" }).click();
    const language = page.getByLabel("講解語言");
    await expect(language.locator("option")).toHaveText([
      "原文語言（預設）",
      "繁體中文",
      "English",
      "日本語"
    ]);
    await language.selectOption("ja");
    await expect(language).toHaveValue("ja");
    await page.getByRole("button", { name: "關閉設定" }).click();

    const dataImageLoads = await page.evaluate(async () => {
      const image = new Image();
      const result = new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
      });
      image.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      return result;
    });

    expect(dataImageLoads).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test("keeps long overview content inside the center scroll area", async () => {
  const electronApp = await electron.launch({
    args: [desktopApp],
    env: {
      ...process.env,
      NODE_ENV: "test"
    }
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(
      page.getByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeVisible();

    const layout = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".content");
      const workspace = document.querySelector<HTMLElement>(".workspace");
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      const assistant = document.querySelector<HTMLElement>(".assistant-panel");
      if (!content || !workspace || !sidebar || !assistant) {
        throw new Error("layout elements are missing");
      }

      const longOverview = document.createElement("div");
      longOverview.style.height = "2400px";
      longOverview.dataset.testid = "long-overview";
      content.append(longOverview);
      content.scrollTop = content.scrollHeight;

      const workspaceRect = workspace.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      const assistantRect = assistant.getBoundingClientRect();

      return {
        documentClientHeight: document.documentElement.clientHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        contentClientHeight: content.clientHeight,
        contentScrollHeight: content.scrollHeight,
        contentScrollTop: content.scrollTop,
        workspaceTop: workspaceRect.top,
        workspaceBottom: workspaceRect.bottom,
        sidebarTop: sidebarRect.top,
        sidebarBottom: sidebarRect.bottom,
        assistantTop: assistantRect.top,
        assistantBottom: assistantRect.bottom
      };
    });

    expect(layout.documentScrollHeight).toBeLessThanOrEqual(
      layout.documentClientHeight + 1
    );
    expect(layout.contentScrollHeight).toBeGreaterThan(layout.contentClientHeight);
    expect(layout.contentScrollTop).toBeGreaterThan(0);
    expect(layout.sidebarTop).toBeCloseTo(layout.workspaceTop, 0);
    expect(layout.sidebarBottom).toBeCloseTo(layout.workspaceBottom, 0);
    expect(layout.assistantTop).toBeCloseTo(layout.workspaceTop, 0);
    expect(layout.assistantBottom).toBeCloseTo(layout.workspaceBottom, 0);
  } finally {
    await electronApp.close();
  }
});
