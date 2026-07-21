import { describe, expect, it, vi } from "vitest";
import type { LibraryBook } from "../shared/library-contracts";
import { registerLibraryIpc } from "./library-ipc";

const book: LibraryBook = {
  id: "book-id",
  title: "Imported Book",
  author: "An Author",
  coverDataUrl: null,
  progressPercent: 0,
  lastChapterId: null,
  readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
  chapters: [{
    id: "chapter-id",
    title: "Chapter",
    order: 0,
    href: "chapter.xhtml",
    depth: 0,
    fragment: null
  }]
};

describe("library IPC", () => {
  it("lists books and imports a selected EPUB through registered handlers", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      })
    };
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["/chosen/book.epub"]
      })
    };
    const library = {
      listBooks: vi.fn().mockResolvedValue([book]),
      importFromPath: vi.fn().mockResolvedValue({ status: "imported", book }),
      getChapterContent: vi.fn().mockResolvedValue({
        bookId: book.id,
        chapterId: "chapter-id",
        title: "Chapter",
        contentHtml: "<p>Readable</p>"
      }),
      saveReadingState: vi.fn().mockResolvedValue(book),
      saveReadingRange: vi.fn().mockResolvedValue(book),
      saveAnnotations: vi.fn().mockResolvedValue(book),
      deleteBook: vi.fn().mockResolvedValue(undefined)
    };

    registerLibraryIpc(ipc, dialog, library);

    await expect(handlers.get("library:list")?.()).resolves.toEqual([book]);
    await expect(handlers.get("library:import")?.()).resolves.toEqual({
      status: "imported",
      book
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ["openFile"] })
    );
    expect(library.importFromPath).toHaveBeenCalledWith("/chosen/book.epub");
    await expect(
      handlers.get("library:chapter")?.({}, book.id, "chapter-id")
    ).resolves.toMatchObject({ contentHtml: "<p>Readable</p>" });
    await expect(
      handlers.get("library:save-reading-state")?.({}, {
        bookId: book.id,
        view: "reader",
        chapterId: "chapter-id",
        scrollProgress: 0.4
      })
    ).resolves.toEqual(book);
    expect(library.getChapterContent).toHaveBeenCalledWith(book.id, "chapter-id");
    expect(library.saveReadingState).toHaveBeenCalledWith({
      bookId: book.id,
      view: "reader",
      chapterId: "chapter-id",
      scrollProgress: 0.4
    });
    await expect(
      handlers.get("library:save-reading-range")?.({}, {
        bookId: book.id,
        chapterId: "chapter-id",
        range: { start: 10, end: 80 }
      })
    ).resolves.toEqual(book);
    expect(library.saveReadingRange).toHaveBeenCalledWith({
      bookId: book.id,
      chapterId: "chapter-id",
      range: { start: 10, end: 80 }
    });
    await expect(
      handlers.get("library:save-annotations")?.({}, {
        bookId: book.id,
        chapterId: "chapter-id",
        annotations: [{ id: "a1", start: 2, end: 8, text: "marked" }]
      })
    ).resolves.toEqual(book);
    expect(library.saveAnnotations).toHaveBeenCalledWith({
      bookId: book.id,
      chapterId: "chapter-id",
      annotations: [{ id: "a1", start: 2, end: 8, text: "marked" }]
    });
    await expect(
      handlers.get("library:delete")?.({}, book.id)
    ).resolves.toBeUndefined();
    expect(library.deleteBook).toHaveBeenCalledWith(book.id);
  });

  it("returns a cancellation without touching the library", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
    };
    const library = {
      listBooks: vi.fn(),
      importFromPath: vi.fn(),
      getChapterContent: vi.fn(),
      saveReadingState: vi.fn(),
      saveReadingRange: vi.fn(),
      saveAnnotations: vi.fn(),
      deleteBook: vi.fn()
    };

    registerLibraryIpc(ipc, dialog, library);

    await expect(handlers.get("library:import")?.()).resolves.toEqual({
      status: "cancelled"
    });
    expect(library.importFromPath).not.toHaveBeenCalled();
  });

  it("rejects an invalid delete request without touching the library", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const library = {
      listBooks: vi.fn(),
      importFromPath: vi.fn(),
      getChapterContent: vi.fn(),
      saveReadingState: vi.fn(),
      saveReadingRange: vi.fn(),
      saveAnnotations: vi.fn(),
      deleteBook: vi.fn()
    };
    const dialog = { showOpenDialog: vi.fn() };
    registerLibraryIpc(ipc, dialog, library);

    expect(() => handlers.get("library:delete")?.({}, "")).toThrow(
      /書籍刪除請求格式錯誤/
    );
    expect(() => handlers.get("library:delete")?.({}, 42)).toThrow(
      /書籍刪除請求格式錯誤/
    );
    expect(library.deleteBook).not.toHaveBeenCalled();
  });

  it("rejects malformed reading ranges before touching the library", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const library = {
      listBooks: vi.fn(),
      importFromPath: vi.fn(),
      getChapterContent: vi.fn(),
      saveReadingState: vi.fn(),
      saveReadingRange: vi.fn(),
      saveAnnotations: vi.fn(),
      deleteBook: vi.fn()
    };
    registerLibraryIpc(ipc, { showOpenDialog: vi.fn() }, library);

    expect(() => handlers.get("library:save-reading-range")?.({}, {
      bookId: book.id,
      chapterId: "chapter-id",
      range: { start: 90, end: 10 }
    })).toThrow(/閱讀區段格式錯誤/);
    expect(library.saveReadingRange).not.toHaveBeenCalled();
  });

  it("rejects malformed annotations before touching the library", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const library = {
      listBooks: vi.fn(),
      importFromPath: vi.fn(),
      getChapterContent: vi.fn(),
      saveReadingState: vi.fn(),
      saveReadingRange: vi.fn(),
      saveAnnotations: vi.fn(),
      deleteBook: vi.fn()
    };
    registerLibraryIpc(ipc, { showOpenDialog: vi.fn() }, library);

    expect(() => handlers.get("library:save-annotations")?.({}, {
      bookId: book.id,
      chapterId: "chapter-id",
      annotations: [{ id: "", start: 8, end: 2, text: "" }]
    })).toThrow(/標記格式錯誤/);
    expect(library.saveAnnotations).not.toHaveBeenCalled();
  });
});
