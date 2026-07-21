import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ChatController } from "./chat-controller";
import { registerChatIpc } from "./chat-ipc";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { registerLibraryIpc } from "./library-ipc";
import { LocalBookLibrary } from "./library-service";

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
  const runtimePath = join(app.getPath("userData"), "codex-runtime");
  mkdirSync(runtimePath, { recursive: true });
  chatController = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath
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
