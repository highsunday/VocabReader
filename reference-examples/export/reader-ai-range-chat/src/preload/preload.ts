import { contextBridge, ipcRenderer } from "electron";
import type {
  ChapterContent,
  ChatSnapshot,
  ImportBookResult,
  LibraryBook,
  ReaderDesktopApi,
  SaveReadingRangeInput,
  SendChatMessageInput
} from "../shared/contracts";

const api: ReaderDesktopApi = Object.freeze({
  library: Object.freeze({
    listBooks: (): Promise<LibraryBook[]> => ipcRenderer.invoke("library:list"),
    importBook: (): Promise<ImportBookResult> => ipcRenderer.invoke("library:import"),
    getChapterContent: (bookId: string, chapterId: string): Promise<ChapterContent> =>
      ipcRenderer.invoke("library:chapter", bookId, chapterId),
    saveReadingRange: (input: SaveReadingRangeInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-range", input)
  }),
  chat: Object.freeze({
    getState: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:get"),
    connect: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:connect"),
    sendMessage: (input: SendChatMessageInput): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:send", input),
    onStateChanged(listener: (snapshot: ChatSnapshot) => void) {
      const wrapped = (_event: Electron.IpcRendererEvent, snapshot: ChatSnapshot) =>
        listener(snapshot);
      ipcRenderer.on("chat:state", wrapped);
      return () => ipcRenderer.off("chat:state", wrapped);
    }
  })
});

contextBridge.exposeInMainWorld("readerExample", api);
