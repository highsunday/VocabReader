import { contextBridge, ipcRenderer } from "electron";
import type {
  ChapterContent,
  ImportBookResult,
  LibraryBook,
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
      ipcRenderer.invoke("library:save-reading-state", input)
  })
});

contextBridge.exposeInMainWorld("readerDesktop", desktopApi);
