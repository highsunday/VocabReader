import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { registerReaderIpc } from "./app-ipc";
import { ChatController } from "./chat-controller";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { InMemoryEpubLibrary } from "./epub-library";

let mainWindow: BrowserWindow | null = null;
let chat: ChatController | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#f5f0e7",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(__dirname, "../dist-renderer/index.html"));
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

app.whenReady().then(() => {
  const library = new InMemoryEpubLibrary();
  const codexWorkingDirectory = join(app.getPath("userData"), "codex-reader-context");
  mkdirSync(codexWorkingDirectory, { recursive: true });
  chat = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: codexWorkingDirectory
  });

  registerReaderIpc(
    ipcMain,
    {
      showOpenDialog: (options) => mainWindow
        ? dialog.showOpenDialog(mainWindow, options)
        : dialog.showOpenDialog(options)
    },
    library,
    chat
  );
  chat.onStateChanged((snapshot) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow?.webContents.send("chat:state", snapshot);
    }
  });

  mainWindow = createWindow();
  void chat.connect();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", () => chat?.close());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
