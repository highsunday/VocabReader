import type {
  ChapterContent,
  ChatSnapshot,
  ImportBookResult,
  LibraryBook,
  SaveReadingRangeInput,
  SendChatMessageInput
} from "../shared/contracts";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown
  ): unknown;
}

export interface EpubFileDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface ReaderLibrary {
  listBooks(): LibraryBook[] | Promise<LibraryBook[]>;
  importFromPath(path: string): Promise<ImportBookResult>;
  getChapterContent(bookId: string, chapterId: string): Promise<ChapterContent>;
  saveReadingRange(input: SaveReadingRangeInput): LibraryBook | Promise<LibraryBook>;
}

interface ReaderChat {
  getSnapshot(): ChatSnapshot;
  connect(): Promise<ChatSnapshot>;
  sendMessage(input: SendChatMessageInput): Promise<ChatSnapshot>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseChatInput(value: unknown): SendChatMessageInput {
  if (!object(value) || typeof value.text !== "string") {
    throw new Error("Invalid chat message.");
  }
  if (value.context === undefined) return { text: value.text };
  if (!object(value.context)) throw new Error("Invalid chat context.");
  const context: NonNullable<SendChatMessageInput["context"]> = {};
  for (const key of ["bookTitle", "chapterTitle", "readingSegment"] as const) {
    const field = value.context[key];
    if (field !== undefined && typeof field !== "string") {
      throw new Error("Invalid chat context.");
    }
    if (typeof field === "string") context[key] = field;
  }
  return { text: value.text, context };
}

export function registerReaderIpc(
  ipc: IpcRegistrar,
  fileDialog: EpubFileDialog,
  library: ReaderLibrary,
  chat: ReaderChat
): void {
  ipc.handle("library:list", () => library.listBooks());
  ipc.handle("library:import", async () => {
    const selection = await fileDialog.showOpenDialog({
      title: "Import EPUB",
      properties: ["openFile"],
      filters: [{ name: "EPUB books", extensions: ["epub"] }]
    });
    const path = selection.filePaths[0];
    return selection.canceled || !path
      ? { status: "cancelled" as const }
      : library.importFromPath(path);
  });
  ipc.handle("library:chapter", (_event, bookId, chapterId) => {
    if (typeof bookId !== "string" || typeof chapterId !== "string") {
      throw new Error("Invalid chapter request.");
    }
    return library.getChapterContent(bookId, chapterId);
  });
  ipc.handle("library:save-range", (_event, value) => {
    if (!object(value) || typeof value.bookId !== "string" ||
      typeof value.chapterId !== "string" || !object(value.range) ||
      !Number.isInteger(value.range.start) || !Number.isInteger(value.range.end)) {
      throw new Error("Invalid reading range.");
    }
    return library.saveReadingRange({
      bookId: value.bookId,
      chapterId: value.chapterId,
      range: { start: Number(value.range.start), end: Number(value.range.end) }
    });
  });
  ipc.handle("chat:get", () => chat.getSnapshot());
  ipc.handle("chat:connect", () => chat.connect());
  ipc.handle("chat:send", (_event, value) => chat.sendMessage(parseChatInput(value)));
}
