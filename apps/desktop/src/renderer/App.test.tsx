import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryBook } from "../shared/library-contracts";
import { App } from "./App";

const books: LibraryBook[] = [
  {
    id: "book-one",
    title: "The First Book",
    author: "A. Writer",
    coverDataUrl: null,
    progressPercent: 30,
    lastChapterId: "one-2",
    readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
    chapters: [
      { id: "one-1", title: "Opening", order: 0, href: "one.xhtml" },
      { id: "one-2", title: "A New Road", order: 1, href: "two.xhtml" }
    ]
  },
  {
    id: "book-two",
    title: "The Second Book",
    author: "B. Writer",
    coverDataUrl: null,
    progressPercent: 0,
    lastChapterId: null,
    readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
    chapters: [{ id: "two-1", title: "Beginnings", order: 0, href: "begin.xhtml" }]
  }
];

function installLibraryApi(storedBooks: LibraryBook[] = books) {
  const importBook = vi.fn();
  const deleteBook = vi.fn().mockResolvedValue(undefined);
  const getChapterContent = vi.fn((bookId: string, chapterId: string) =>
    Promise.resolve({
      bookId,
      chapterId,
      title: storedBooks
        .find((book) => book.id === bookId)
        ?.chapters.find((chapter) => chapter.id === chapterId)?.title ?? "Chapter",
      contentHtml: `<p>Content for ${chapterId}</p>`
    })
  );
  const saveReadingState = vi.fn((state) =>
    Promise.resolve({
      ...storedBooks.find((book) => book.id === state.bookId),
      readingState: {
        view: state.view,
        chapterId: state.chapterId,
        scrollProgress: state.scrollProgress
      }
    })
  );
  Object.defineProperty(window, "readerDesktop", {
    configurable: true,
    value: {
      platform: "darwin",
      versions: { chrome: "1", electron: "1", node: "1" },
      library: {
        listBooks: vi.fn().mockResolvedValue(storedBooks),
        importBook,
        deleteBook,
        getChapterContent,
        saveReadingState
      }
    }
  });
  return { importBook, deleteBook, getChapterContent, saveReadingState };
}

afterEach(() => {
  Object.defineProperty(window, "readerDesktop", {
    configurable: true,
    value: undefined
  });
});

describe("App", () => {
  it("keeps chapter practice separate from spaced review", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeInTheDocument();
    expect(screen.getByText("章末選擇題", { selector: ".flow-tags span" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anki 複習/ }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Anki 複習/ }));

    expect(
      screen.getByRole("heading", { name: "Anki 式間隔複習" })
    ).toBeInTheDocument();
    expect(screen.getByText(/跨書籍與章節產生填空、造句/))
      .toBeInTheDocument();
  });

  it("uses book selection as the only overview entry and omits the learning mechanism copy", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: /書籍總覽/ }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anki 複習/ }))
      .toBeInTheDocument();
    expect(screen.queryByText("章節機制")).not.toBeInTheDocument();
    expect(screen.queryByText("閱讀與劃線")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 集中解析")).not.toBeInTheDocument();
    expect(screen.queryByText("加入生詞庫")).not.toBeInTheDocument();
    expect(screen.queryByText("Anki 複習是另一套獨立排程。"))
      .not.toBeInTheDocument();
  });

  it("adds a user message to the assistant panel", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "這句話的文法是什麼？" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.getByText("這句話的文法是什麼？")).toBeInTheDocument();
  });

  it("lists persisted books and switches to the selected book overview", async () => {
    installLibraryApi();
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /The First Book/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The First Book" })
    ).toBeInTheDocument();
    expect(screen.getByText("2 個章節")).toBeInTheDocument();
    expect(screen.getByText("30% 已閱讀")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));

    expect(
      screen.getByRole("heading", { name: "The Second Book" })
    ).toBeInTheDocument();
    expect(screen.getByText("Beginnings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始閱讀" }))
      .toBeInTheDocument();
  });

  it("imports an EPUB through the desktop library and selects it", async () => {
    const { importBook } = installLibraryApi();
    importBook.mockResolvedValue({
      status: "imported",
      book: {
        id: "new-book",
        title: "Newly Imported",
        author: "New Author",
        coverDataUrl: null,
        progressPercent: 0,
        lastChapterId: null,
        readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
        chapters: [{ id: "new-1", title: "First Chapter", order: 0, href: "first.xhtml" }]
      }
    });
    render(<App />);
    await screen.findByRole("button", { name: /The First Book/ });

    fireEvent.click(screen.getByRole("button", { name: "導入 EPUB" }));

    await waitFor(() => expect(importBook).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Newly Imported" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Newly Imported/ }))
      .toBeInTheDocument();
  });

  it("asks for confirmation and cancels without deleting the book", async () => {
    const { deleteBook } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));

    const dialog = screen.getByRole("dialog", { name: "刪除書籍？" });
    expect(dialog).toHaveTextContent("The First Book");
    expect(dialog).toHaveTextContent("無法復原");
    expect(deleteBook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it("deletes the selected book and selects the next book", async () => {
    const { deleteBook } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    await waitFor(() => expect(deleteBook).toHaveBeenCalledWith("book-one"));
    expect(await screen.findByRole("heading", { name: "The Second Book" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /The First Book/ }))
      .not.toBeInTheDocument();
  });

  it("selects the previous book when deleting the last book", async () => {
    installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(await screen.findByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
  });

  it("shows the empty library after deleting its only book", async () => {
    installLibraryApi([books[0]]);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(
      await screen.findByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeInTheDocument();
    expect(screen.getByText("尚未導入書籍")).toBeInTheDocument();
  });

  it("keeps the book visible and reports an error when deletion fails", async () => {
    const { deleteBook } = installLibraryApi();
    deleteBook.mockRejectedValue(new Error("disk busy"));
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "無法刪除這本書籍"
    );
    expect(screen.getByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /The First Book/ }))
      .toBeInTheDocument();
  });

  it("moves between chapters and replaces the completion action with next chapter", async () => {
    const { getChapterContent } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /A New Road/ }));

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenCalledWith("book-one", "one-2");
    expect(screen.queryByRole("button", { name: "完成本章" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一章" })).toBeDisabled();
    const toolbar = screen.getByRole("group", { name: "章節導覽" })
      .closest(".reader-toolbar");
    expect(toolbar?.parentElement).toHaveClass("content", "reader-content");

    fireEvent.click(screen.getByRole("button", { name: "上一章" }));
    expect(await screen.findByText("Content for one-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一章" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));
    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenLastCalledWith("book-one", "one-2");
  });

  it("moves to the next distinct chapter when EPUB navigation entries share an id", async () => {
    const bookWithDuplicateNavigationEntries: LibraryBook = {
      ...books[0],
      lastChapterId: null,
      readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
      chapters: [
        { id: "shared", title: "Introduction", order: 0, href: "intro.xhtml" },
        { id: "shared", title: "Introduction exercise", order: 1, href: "intro.xhtml" },
        { id: "chapter-one", title: "Chapter One", order: 2, href: "one.xhtml" }
      ]
    };
    const { getChapterContent } = installLibraryApi([bookWithDuplicateNavigationEntries]);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /01Introduction/ }));
    expect(await screen.findByText("Content for shared")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一章" }));

    expect(await screen.findByText("Content for chapter-one")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenLastCalledWith("book-one", "chapter-one");
  });

  it("returns to overview and persists that view for the selected book", async () => {
    const { saveReadingState } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");

    fireEvent.click(screen.getByRole("button", { name: "返回總覽" }));

    expect(screen.getByRole("heading", { name: "The First Book" })).toBeInTheDocument();
    expect(saveReadingState).toHaveBeenCalledWith({
      bookId: "book-one",
      view: "overview",
      chapterId: "one-1",
      scrollProgress: 0
    });
  });

  it("restores each book to its own last view, chapter and reading position", async () => {
    const resumableBooks = [
      {
        ...books[0],
        readingState: { view: "reader" as const, chapterId: "one-2", scrollProgress: 0.5 }
      },
      books[1]
    ];
    installLibraryApi(resumableBooks);
    render(<App />);

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    const content = document.querySelector<HTMLElement>(".content");
    if (!content) throw new Error("missing content scroller");
    Object.defineProperties(content, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 }
    });
    content.scrollTop = 400;
    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));
    expect(screen.getByRole("heading", { name: "The Second Book" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /The First Book/ }));

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    await waitFor(() => expect(content.scrollTop).toBe(400));
  });
});
