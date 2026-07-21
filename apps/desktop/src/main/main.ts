import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import annotationExplanationSkillMarkdown from "../../../../.agents/skills/explain-reader-annotations/SKILL.md";
import { installBundledAnnotationSkill } from "./bundled-skill";
import { ChatController } from "./chat-controller";
import { LocalChatConversationStore } from "./chat-conversation-store";
import { registerChatIpc } from "./chat-ipc";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { registerLibraryIpc } from "./library-ipc";
import { LocalBookLibrary } from "./library-service";
import { registerSettingsIpc } from "./settings-ipc";
import { LocalSettingsStore } from "./settings-store";

let chatController: ChatController | undefined;
let unsubscribeChatState: (() => void) | undefined;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "LingoShelf",
    backgroundColor: "#f5f1e8",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../dist/renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  const libraryPath =
    process.env.NODE_ENV === "test"
      ? join(app.getPath("temp"), `lingoshelf-library-test-${process.pid}`)
      : join(app.getPath("userData"), "library");
  registerLibraryIpc(ipcMain, dialog, new LocalBookLibrary(libraryPath));
  const settingsPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `lingoshelf-settings-test-${process.pid}`)
    : join(app.getPath("userData"), "settings");
  registerSettingsIpc(ipcMain, new LocalSettingsStore(settingsPath));
  const runtimePath = join(app.getPath("userData"), "codex-runtime");
  const conversationPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `lingoshelf-chat-test-${process.pid}`)
    : join(app.getPath("userData"), "chat");
  mkdirSync(runtimePath, { recursive: true });
  const annotationExplanationSkill = installBundledAnnotationSkill(
    runtimePath,
    annotationExplanationSkillMarkdown
  );
  chatController = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    annotationExplanationSkillPath: annotationExplanationSkill.path,
    annotationExplanationSkillInstructions: annotationExplanationSkillMarkdown,
    conversationStore: new LocalChatConversationStore(conversationPath)
  });
  unsubscribeChatState = registerChatIpc(
    ipcMain,
    chatController,
    (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("chat:state-changed", snapshot);
      }
    }
  );
  createMainWindow();
  void chatController.connect();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  unsubscribeChatState?.();
  unsubscribeChatState = undefined;
  chatController?.close();
  chatController = undefined;
});
