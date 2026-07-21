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
  chapters: [{ id: "chapter-id", title: "Chapter", order: 0, href: "chapter.xhtml" }]
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
      saveReadingState: vi.fn().mockResolvedValue(book)
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
      saveReadingState: vi.fn()
    };

    registerLibraryIpc(ipc, dialog, library);

    await expect(handlers.get("library:import")?.()).resolves.toEqual({
      status: "cancelled"
    });
    expect(library.importFromPath).not.toHaveBeenCalled();
  });
});
