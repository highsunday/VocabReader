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
    await expect(page.getByRole("button", { name: "新對話" })).toBeVisible();
    await expect(page.getByRole("button", { name: "對話紀錄" })).toBeVisible();
    await expect(page.getByRole("button", { name: "設定" })).toBeVisible();
    await expect(page.getByLabel("Codex 狀態")).toBeVisible();

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
            };
            chat: {
              getState: unknown;
              connect: unknown;
              sendMessage: unknown;
              startNewConversation: unknown;
              selectConversation: unknown;
              removeConversation: unknown;
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
        hasChatState: typeof desktop?.chat.getState,
        hasChatConnect: typeof desktop?.chat.connect,
        hasChatSend: typeof desktop?.chat.sendMessage,
        hasChatNew: typeof desktop?.chat.startNewConversation,
        hasChatSelect: typeof desktop?.chat.selectConversation,
        hasChatRemove: typeof desktop?.chat.removeConversation,
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
    expect(security.hasChatState).toBe("function");
    expect(security.hasChatConnect).toBe("function");
    expect(security.hasChatSend).toBe("function");
    expect(security.hasChatNew).toBe("function");
    expect(security.hasChatSelect).toBe("function");
    expect(security.hasChatRemove).toBe("function");
    expect(security.hasChatSubscription).toBe("function");
    expect(security.chatKeys).toEqual([
      "connect",
      "getState",
      "onStateChanged",
      "removeConversation",
      "selectConversation",
      "startNewConversation",
      "sendMessage"
    ].sort());
    expect(security.hasNodeRequire).toBe("undefined");

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
