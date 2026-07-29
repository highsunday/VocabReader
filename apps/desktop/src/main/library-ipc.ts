import type {
  ChapterContent,
  ImportBookResult,
  LibraryBook,
  SaveAnnotationsInput,
  SaveReadingRangeInput,
  SaveReadingStateInput
} from "../shared/library-contracts";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): unknown;
}

interface FileDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface BookLibrary {
  listBooks(): Promise<LibraryBook[]>;
  importFromPath(path: string): Promise<ImportBookResult>;
  deleteBook(bookId: string): Promise<void>;
  getChapterContent(bookId: string, chapterId: string): Promise<ChapterContent>;
  saveReadingState(input: SaveReadingStateInput): Promise<LibraryBook>;
  saveReadingRange(input: SaveReadingRangeInput): Promise<LibraryBook>;
  saveAnnotations(input: SaveAnnotationsInput): Promise<LibraryBook>;
}

export function registerLibraryIpc(
  ipc: IpcRegistrar,
  dialog: FileDialog,
  library: BookLibrary
): void {
  ipc.handle("library:list", () => library.listBooks());
  ipc.handle("library:delete", (_event, bookId) => {
    if (typeof bookId !== "string" || !bookId.trim()) {
      throw new Error("Invalid book deletion request");
    }
    return library.deleteBook(bookId);
  });
  ipc.handle("library:chapter", (_event, bookId, chapterId) => {
    if (typeof bookId !== "string" || typeof chapterId !== "string") {
      throw new Error("Invalid chapter request");
    }
    return library.getChapterContent(bookId, chapterId);
  });
  ipc.handle("library:save-reading-state", (_event, rawInput) => {
    if (!rawInput || typeof rawInput !== "object") {
      throw new Error("Invalid reading state");
    }
    const input = rawInput as Partial<SaveReadingStateInput>;
    if (
      typeof input.bookId !== "string" ||
      (input.view !== "overview" && input.view !== "reader") ||
      (input.chapterId !== null && typeof input.chapterId !== "string") ||
      typeof input.scrollProgress !== "number"
    ) {
      throw new Error("Invalid reading state");
    }
    return library.saveReadingState(input as SaveReadingStateInput);
  });
  ipc.handle("library:save-reading-range", (_event, rawInput) => {
    if (!rawInput || typeof rawInput !== "object") {
      throw new Error("Invalid reading segment");
    }
    const input = rawInput as Partial<SaveReadingRangeInput>;
    const range = input.range;
    if (
      typeof input.bookId !== "string" ||
      typeof input.chapterId !== "string" ||
      !range ||
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start
    ) {
      throw new Error("Invalid reading segment");
    }
    return library.saveReadingRange(input as SaveReadingRangeInput);
  });
  ipc.handle("library:save-annotations", (_event, rawInput) => {
    if (!rawInput || typeof rawInput !== "object") {
      throw new Error("Invalid annotation");
    }
    const input = rawInput as Partial<SaveAnnotationsInput>;
    if (
      typeof input.bookId !== "string" ||
      typeof input.chapterId !== "string" ||
      !Array.isArray(input.annotations) ||
      input.annotations.some((annotation) =>
        !annotation || typeof annotation !== "object" ||
        typeof annotation.id !== "string" || !annotation.id.trim() ||
        !Number.isInteger(annotation.start) ||
        !Number.isInteger(annotation.end) ||
        annotation.start < 0 || annotation.end <= annotation.start ||
        typeof annotation.text !== "string" || !annotation.text
      )
    ) {
      throw new Error("Invalid annotation");
    }
    return library.saveAnnotations(input as SaveAnnotationsInput);
  });
  ipc.handle("library:import", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Import EPUB",
      properties: ["openFile"],
      filters: [{ name: "EPUB Books", extensions: ["epub"] }]
    });
    const selectedPath = selection.filePaths[0];
    if (selection.canceled || !selectedPath) {
      return { status: "cancelled" } satisfies ImportBookResult;
    }
    return library.importFromPath(selectedPath);
  });
}
