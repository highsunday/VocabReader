import { contextBridge, ipcRenderer } from "electron";
import type {
  ChatDesktopApi,
  ChatSnapshot,
  SendChatMessageInput
} from "../shared/chat-contracts";
import type {
  ChapterContent,
  ImportBookResult,
  LibraryBook,
  SaveReadingRangeInput,
  SaveReadingStateInput
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
      ipcRenderer.invoke("library:import"),
    deleteBook: (bookId: string): Promise<void> =>
      ipcRenderer.invoke("library:delete", bookId),
    getChapterContent: (
      bookId: string,
      chapterId: string
    ): Promise<ChapterContent> =>
      ipcRenderer.invoke("library:chapter", bookId, chapterId),
    saveReadingState: (input: SaveReadingStateInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-reading-state", input),
    saveReadingRange: (input: SaveReadingRangeInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-reading-range", input)
  }),
  chat: Object.freeze({
    getState: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:get-state"),
    connect: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:connect"),
    sendMessage: (input: SendChatMessageInput): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:send", input),
    startNewConversation: (): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:new"),
    selectConversation: (conversationId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:select", conversationId),
    removeConversation: (conversationId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:remove", conversationId),
    onStateChanged(listener: (snapshot: ChatSnapshot) => void) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        snapshot: ChatSnapshot
      ) => listener(snapshot);
      ipcRenderer.on("chat:state-changed", wrapped);
      return () => ipcRenderer.off("chat:state-changed", wrapped);
    }
  } satisfies ChatDesktopApi)
});

contextBridge.exposeInMainWorld("readerDesktop", desktopApi);
