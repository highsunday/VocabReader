import { contextBridge, ipcRenderer } from "electron";
import type {
  ImportBookResult,
  LibraryBook
} from "../shared/library-contracts";

const desktopApi = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  }),
  library: Object.freeze({
    listBooks: (): Promise<LibraryBook[]> => ipcRenderer.invoke("library:list"),
    importBook: (): Promise<ImportBookResult> =>
      ipcRenderer.invoke("library:import")
  })
});

contextBridge.exposeInMainWorld("readerDesktop", desktopApi);
