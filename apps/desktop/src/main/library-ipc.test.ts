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
      importFromPath: vi.fn().mockResolvedValue({ status: "imported", book })
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
      importFromPath: vi.fn()
    };

    registerLibraryIpc(ipc, dialog, library);

    await expect(handlers.get("library:import")?.()).resolves.toEqual({
      status: "cancelled"
    });
    expect(library.importFromPath).not.toHaveBeenCalled();
  });
});
