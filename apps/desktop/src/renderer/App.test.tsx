import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const books = [
  {
    id: "book-one",
    title: "The First Book",
    author: "A. Writer",
    coverDataUrl: null,
    progressPercent: 30,
    lastChapterId: "one-2",
    chapters: [
      { id: "one-1", title: "Opening", order: 0 },
      { id: "one-2", title: "A New Road", order: 1 }
    ]
  },
  {
    id: "book-two",
    title: "The Second Book",
    author: "B. Writer",
    coverDataUrl: null,
    progressPercent: 0,
    lastChapterId: null,
    chapters: [{ id: "two-1", title: "Beginnings", order: 0 }]
  }
];

function installLibraryApi() {
  const importBook = vi.fn();
  Object.defineProperty(window, "readerDesktop", {
    configurable: true,
    value: {
      platform: "darwin",
      versions: { chrome: "1", electron: "1", node: "1" },
      library: {
        listBooks: vi.fn().mockResolvedValue(books),
        importBook
      }
    }
  });
  return { importBook };
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
        chapters: [{ id: "new-1", title: "First Chapter", order: 0 }]
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
});
