import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { registerReaderIpc } from "../src/main/app-ipc";
import type { ChatSnapshot, LibraryBook } from "../src/shared/contracts";

const book: LibraryBook = {
  id: "book-1",
  title: "The Example Book",
  author: "Example Author",
  chapters: [{ id: "chapter-1", title: "Chapter One", href: "chapter.xhtml", order: 0 }],
  chapterRanges: {}
};

const chatSnapshot: ChatSnapshot = {
  connection: "ready",
  connectionDetail: "Connected",
  account: { type: "chatgpt", email: "reader@example.com" },
  threadId: null,
  activeTurnId: null,
  messages: []
};

test("the import IPC opens an EPUB-only picker and imports the selected path", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const dialog = {
    showOpenDialog: vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["/books/example.epub"]
    })
  };
  const library = {
    listBooks: vi.fn().mockReturnValue([]),
    importFromPath: vi.fn().mockResolvedValue({ status: "imported", book }),
    getChapterContent: vi.fn(),
    saveReadingRange: vi.fn()
  };
  registerReaderIpc(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog,
    library,
    {
      getSnapshot: () => chatSnapshot,
      connect: vi.fn().mockResolvedValue(chatSnapshot),
      sendMessage: vi.fn().mockResolvedValue(chatSnapshot)
    }
  );

  const result = await handlers.get("library:import")?.(undefined);
  assert.deepEqual(result, { status: "imported", book });
  assert.equal(library.importFromPath.mock.calls[0]?.[0], "/books/example.epub");
  assert.deepEqual(dialog.showOpenDialog.mock.calls[0]?.[0], {
    title: "Import EPUB",
    properties: ["openFile"],
    filters: [{ name: "EPUB books", extensions: ["epub"] }]
  });
});

test("cancelling the native EPUB picker is a safe no-op", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const library = {
    listBooks: vi.fn().mockReturnValue([]),
    importFromPath: vi.fn(),
    getChapterContent: vi.fn(),
    saveReadingRange: vi.fn()
  };
  registerReaderIpc(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
    library,
    {
      getSnapshot: () => chatSnapshot,
      connect: vi.fn().mockResolvedValue(chatSnapshot),
      sendMessage: vi.fn().mockResolvedValue(chatSnapshot)
    }
  );

  assert.deepEqual(
    await handlers.get("library:import")?.(undefined),
    { status: "cancelled" }
  );
  assert.equal(library.importFromPath.mock.calls.length, 0);
});
