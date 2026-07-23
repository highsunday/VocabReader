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
  SaveAnnotationsInput,
  SaveReadingRangeInput,
  SaveReadingStateInput
} from "../shared/library-contracts";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemListInput,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  AppSettings,
  SettingsDesktopApi
} from "../shared/settings-contracts";

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
      ipcRenderer.invoke("library:save-reading-range", input),
    saveAnnotations: (input: SaveAnnotationsInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-annotations", input)
  }),
  learning: Object.freeze({
    listItems: (input: LearningItemListInput): Promise<LearningItem[]> =>
      ipcRenderer.invoke("learning:list", input),
    getItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:get", itemId),
    updateItem: (input: UpdateLearningItemInput): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:update", input),
    trashItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:trash", itemId),
    restoreItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:restore", itemId),
    emptyTrash: (): Promise<{ deleted: number }> =>
      ipcRenderer.invoke("learning:empty-trash")
  } satisfies LearningDesktopApi),
  settings: Object.freeze({
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    save: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:save", settings)
  } satisfies SettingsDesktopApi),
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
    selectModel: (modelId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:select-model", modelId),
    stopResponse: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:stop"),
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
