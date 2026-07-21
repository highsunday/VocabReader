import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  BookView,
  ChapterContent,
  LibraryBook,
  LibraryDesktopApi
} from "../shared/library-contracts";

type WorkspaceMode = "overview" | "reader" | "review";

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  content: string;
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    content: "完成一章的標記後，我會集中解析單字、片語、句型與文法。"
  }
];

function desktopLibrary(): LibraryDesktopApi | undefined {
  return (
    window as unknown as {
      readerDesktop?: { library: LibraryDesktopApi };
    }
  ).readerDesktop?.library;
}

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>("overview");
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [activeChapterId, setActiveChapterId] = useState<string>();
  const [libraryError, setLibraryError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [bookPendingDeletion, setBookPendingDeletion] = useState<LibraryBook>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [chapterContent, setChapterContent] = useState<ChapterContent>();
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const contentRef = useRef<HTMLElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0],
    [books, selectedBookId]
  );
  const activeChapter = selectedBook?.chapters.find(
    (chapter) => chapter.id === activeChapterId
  );
  const activeChapterIndex = selectedBook?.chapters.findIndex(
    (chapter) => chapter.id === activeChapterId
  ) ?? -1;
  const previousChapter = adjacentChapter(-1);
  const nextChapter = adjacentChapter(1);

  function adjacentChapter(direction: -1 | 1) {
    if (!selectedBook || !activeChapterId || activeChapterIndex < 0) {
      return undefined;
    }
    for (
      let index = activeChapterIndex + direction;
      index >= 0 && index < selectedBook.chapters.length;
      index += direction
    ) {
      const chapter = selectedBook.chapters[index];
      if (chapter.id !== activeChapterId) return chapter;
    }
    return undefined;
  }

  function restoreBook(book: LibraryBook) {
    const state = book.readingState;
    const canResumeReader =
      state?.view === "reader" &&
      Boolean(state.chapterId) &&
      book.chapters.some((chapter) => chapter.id === state.chapterId);
    setSelectedBookId(book.id);
    setActiveChapterId(canResumeReader ? state.chapterId ?? undefined : undefined);
    setMode(canResumeReader ? "reader" : "overview");
  }

  useEffect(() => {
    const library = desktopLibrary();
    if (!library) {
      return;
    }

    void library
      .listBooks()
      .then((storedBooks) => {
        setBooks(storedBooks);
        if (storedBooks[0]) restoreBook(storedBooks[0]);
      })
      .catch(() => setLibraryError("無法讀取本機書庫，請重新開啟應用程式。"));
  }, []);

  useEffect(() => {
    const library = desktopLibrary();
    if (mode !== "reader" || !selectedBookId || !activeChapterId || !library) {
      setChapterContent(undefined);
      setChapterError("");
      return;
    }

    let cancelled = false;
    setChapterContent(undefined);
    setChapterError("");
    setIsLoadingChapter(true);
    void library
      .getChapterContent(selectedBookId, activeChapterId)
      .then((content) => {
        if (!cancelled) setChapterContent(content);
      })
      .catch(() => {
        if (!cancelled) {
          setChapterError("無法載入這個章節，請返回總覽後再試一次。");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChapter(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedBookId, activeChapterId]);

  useEffect(() => {
    if (!chapterContent || !selectedBook || !contentRef.current) return;
    const maximum = Math.max(
      0,
      contentRef.current.scrollHeight - contentRef.current.clientHeight
    );
    const progress = selectedBook.readingState.chapterId === chapterContent.chapterId
      ? selectedBook.readingState.scrollProgress
      : 0;
    contentRef.current.scrollTop = maximum * progress;
  }, [chapterContent, selectedBookId]);

  useEffect(() => {
    if (mode !== "reader" && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [mode, selectedBookId]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  function currentScrollProgress(): number {
    const scroller = contentRef.current;
    if (!scroller) return 0;
    const maximum = scroller.scrollHeight - scroller.clientHeight;
    return maximum > 0
      ? Math.min(1, Math.max(0, scroller.scrollTop / maximum))
      : 0;
  }

  function persistReadingState(
    book: LibraryBook,
    view: BookView,
    chapterId: string | null,
    scrollProgress: number
  ) {
    const state = { bookId: book.id, view, chapterId, scrollProgress };
    setBooks((current) => current.map((candidate) =>
      candidate.id === book.id
        ? {
            ...candidate,
            lastChapterId: chapterId ?? candidate.lastChapterId,
            readingState: { view, chapterId, scrollProgress }
          }
        : candidate
    ));
    void desktopLibrary()?.saveReadingState(state).then((savedBook) => {
      setBooks((current) => current.map((candidate) =>
        candidate.id === savedBook.id ? savedBook : candidate
      ));
    }).catch(() => {
      setLibraryError("無法保存閱讀位置；本次切換仍可繼續使用。");
    });
  }

  function saveCurrentReaderPosition() {
    if (mode === "reader" && selectedBook && activeChapterId) {
      persistReadingState(
        selectedBook,
        "reader",
        activeChapterId,
        currentScrollProgress()
      );
    }
  }

  function handleContentScroll() {
    if (mode !== "reader" || !selectedBook || !activeChapterId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistReadingState(
        selectedBook,
        "reader",
        activeChapterId,
        currentScrollProgress()
      );
    }, 300);
  }

  async function handleImport() {
    const library = desktopLibrary();
    if (!library || isImporting) {
      return;
    }

    setIsImporting(true);
    setLibraryError("");
    try {
      const result = await library.importBook();
      if (result.status === "cancelled") {
        return;
      }

      setBooks((current) => {
        const index = current.findIndex((book) => book.id === result.book.id);
        if (index < 0) {
          return [...current, result.book];
        }
        return current.map((book) =>
          book.id === result.book.id ? result.book : book
        );
      });
      restoreBook(result.book);
    } catch (error) {
      setLibraryError(
        error instanceof Error && error.message
          ? error.message
          : "無法導入這本 EPUB，請確認檔案未損壞且不含 DRM。"
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDelete() {
    const library = desktopLibrary();
    const target = bookPendingDeletion;
    if (!library || !target || isDeleting) return;

    setIsDeleting(true);
    setLibraryError("");
    try {
      await library.deleteBook(target.id);
      const deletedIndex = books.findIndex((book) => book.id === target.id);
      const remainingBooks = books.filter((book) => book.id !== target.id);
      const replacement =
        remainingBooks[deletedIndex] ?? remainingBooks[deletedIndex - 1];
      setBooks(remainingBooks);
      setChapterContent(undefined);
      setBookPendingDeletion(undefined);
      if (replacement) {
        restoreBook(replacement);
      } else {
        setSelectedBookId(undefined);
        setActiveChapterId(undefined);
        setMode("overview");
      }
    } catch {
      setLibraryError("無法刪除這本書籍，請稍後再試一次。");
      setBookPendingDeletion(undefined);
    } finally {
      setIsDeleting(false);
    }
  }

  function selectBook(bookId: string) {
    saveCurrentReaderPosition();
    const book = books.find((candidate) => candidate.id === bookId);
    if (book) restoreBook(book);
  }

  function openChapter(chapterId: string) {
    if (!selectedBook) return;
    persistReadingState(selectedBook, "reader", chapterId, 0);
    setActiveChapterId(chapterId);
    setMode("reader");
  }

  function returnToOverview() {
    if (selectedBook) {
      persistReadingState(
        selectedBook,
        "overview",
        activeChapterId ?? selectedBook.readingState.chapterId,
        currentScrollProgress()
      );
    }
    setMode("overview");
  }

  function openPreviousChapter() {
    if (previousChapter) openChapter(previousChapter.id);
  }

  function openNextChapter() {
    if (nextChapter) openChapter(nextChapter.id);
  }

  function startOrContinueReading() {
    if (!selectedBook) {
      return;
    }
    const chapterId =
      selectedBook.lastChapterId ?? selectedBook.chapters[0]?.id;
    if (chapterId) {
      openChapter(chapterId);
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content }
    ]);
    setDraft("");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            <strong>LingoShelf</strong>
            <span>Read first. Learn deeply.</span>
          </div>
        </div>

        <button
          aria-label="導入 EPUB"
          className="import-button"
          type="button"
          onClick={() => void handleImport()}
          disabled={isImporting || isDeleting || !desktopLibrary()}
        >
          {isImporting ? "導入中…" : "＋ 導入 EPUB"}
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="主要導覽">
          <div className="book-summary">
            <span className="eyebrow">我的書庫</span>
            <strong>{books.length ? `${books.length} 本書籍` : "尚未導入書籍"}</strong>
            <span>{books.length ? "選擇書籍即可查看總覽" : "從 EPUB 建立你的閱讀書庫"}</span>
          </div>

          <div className="book-list" aria-label="已導入書籍">
            {books.map((book) => (
              <button
                className={book.id === selectedBook?.id ? "book-item active" : "book-item"}
                key={book.id}
                type="button"
                onClick={() => selectBook(book.id)}
              >
                <span className="book-item-cover" aria-hidden="true">
                  {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : "Aa"}
                </span>
                <span>
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                </span>
              </button>
            ))}
          </div>

          <nav>
            <button
              className={mode === "review" ? "nav-item active" : "nav-item"}
              onClick={() => {
                saveCurrentReaderPosition();
                setMode("review");
              }}
            >
              <span>↻</span>
              Anki 複習
              <em>10</em>
            </button>
          </nav>
        </aside>

        <main
          className={mode === "reader" ? "content reader-content" : "content"}
          ref={contentRef}
          onScroll={handleContentScroll}
        >
          {mode === "reader" ? (
            <div className="reader-toolbar">
              <div className="reader-toolbar-inner">
                <button
                  className="reader-back-button"
                  type="button"
                  aria-label="返回總覽"
                  onClick={returnToOverview}
                >
                  <span aria-hidden="true">←</span>
                  返回總覽
                </button>

                <div className="reader-toolbar-context" aria-hidden="true">
                  <span>閱讀中</span>
                  <strong>{activeChapter?.title ?? selectedBook?.title}</strong>
                </div>

                <div className="chapter-navigation" role="group" aria-label="章節導覽">
                  <button
                    type="button"
                    onClick={openPreviousChapter}
                    disabled={!previousChapter}
                  >
                    <span aria-hidden="true">‹</span>
                    上一章
                  </button>
                  <button
                    type="button"
                    onClick={openNextChapter}
                    disabled={!nextChapter}
                  >
                    下一章
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {libraryError ? <div className="library-error" role="alert">{libraryError}</div> : null}

          {mode === "overview" ? (
            selectedBook ? (
              <section className="book-overview" aria-labelledby="book-overview-title">
                <div className="overview-hero">
                  <div className="overview-cover">
                    {selectedBook.coverDataUrl ? (
                      <img src={selectedBook.coverDataUrl} alt={`${selectedBook.title} 封面`} />
                    ) : (
                      <span>Aa</span>
                    )}
                  </div>
                  <div className="overview-details">
                    <span className="eyebrow">Book overview</span>
                    <h1 id="book-overview-title">{selectedBook.title}</h1>
                    <p className="book-author">{selectedBook.author}</p>
                    <div className="book-facts">
                      <span>{selectedBook.chapters.length} 個章節</span>
                      <span>{selectedBook.progressPercent}% 已閱讀</span>
                    </div>
                    <div className="progress-track" aria-label={`閱讀進度 ${selectedBook.progressPercent}%`}>
                      <span style={{ width: `${selectedBook.progressPercent}%` }} />
                    </div>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={startOrContinueReading}
                      disabled={!selectedBook.chapters.length}
                    >
                      {selectedBook.progressPercent > 0 ? "繼續閱讀" : "開始閱讀"}
                    </button>
                    <button
                      className="delete-book-button"
                      type="button"
                      onClick={() => setBookPendingDeletion(selectedBook)}
                      disabled={isImporting || isDeleting}
                    >
                      刪除書籍
                    </button>
                  </div>
                </div>

                <div className="chapter-list">
                  <div>
                    <span className="eyebrow">Contents</span>
                    <h2>章節</h2>
                  </div>
                  <ol>
                    {selectedBook.chapters.map((chapter) => (
                      <li key={`${chapter.id}-${chapter.order}`}>
                        <button type="button" onClick={() => openChapter(chapter.id)}>
                          <span>{String(chapter.order + 1).padStart(2, "0")}</span>
                          <strong>{chapter.title}</strong>
                          <em>開始閱讀 →</em>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            ) : (
              <section className="reader-panel" aria-labelledby="reader-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Book library</span>
                    <h1 id="reader-title">導入 EPUB 開始閱讀</h1>
                  </div>
                </div>
                <div className="empty-reader">
                  <span className="book-icon">Aa</span>
                  <h2>你的閱讀空間已準備好</h2>
                  <p>導入第一本 EPUB，書籍會保存在本機書庫並顯示於左側。</p>
                  <div className="flow-tags" aria-label="章節學習流程">
                    <span>閱讀標記</span>
                    <span>AI 解析</span>
                    <span>生詞庫</span>
                    <span>章末選擇題</span>
                  </div>
                </div>
              </section>
            )
          ) : mode === "reader" ? (
            <section className="reader-panel" aria-labelledby="reader-title">
              <div className="section-heading reader-heading">
                <div>
                  <span className="eyebrow">Chapter workspace</span>
                  <h1 id="reader-title">
                    {activeChapter?.title ?? selectedBook?.title ?? "導入 EPUB 開始閱讀"}
                  </h1>
                </div>
              </div>

              {isLoadingChapter ? (
                <div className="chapter-status" role="status">章節載入中…</div>
              ) : chapterError ? (
                <div className="chapter-status error" role="alert">
                  <p>{chapterError}</p>
                  <button type="button" onClick={returnToOverview}>返回總覽</button>
                </div>
              ) : chapterContent ? (
                <article
                  className="chapter-content"
                  aria-label={`${chapterContent.title} 章節內容`}
                  dangerouslySetInnerHTML={{ __html: chapterContent.contentHtml }}
                />
              ) : null}
            </section>
          ) : (
            <section className="review-panel" aria-labelledby="review-title">
              <span className="eyebrow">Spaced repetition</span>
              <h1 id="review-title">Anki 式間隔複習</h1>
              <p>
                這裡只處理生詞庫中的到期項目，跨書籍與章節產生填空、造句等題目。
              </p>
              <div className="review-card">
                <strong>今日待複習</strong>
                <b>10</b>
                <span>完成回答後才會更新各項目的複習間隔。</span>
              </div>
            </section>
          )}
        </main>

        <aside className="assistant-panel" aria-label="AI 助教">
          <div className="assistant-heading">
            <div>
              <span className="status-dot" />
              <strong>AI 助教</strong>
            </div>
            <span>{mode === "review" ? "複習上下文" : "書籍上下文"}</span>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <div className={"message " + message.role} key={message.id}>
                <span>{message.role === "assistant" ? "AI" : "你"}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={sendMessage}>
            <label htmlFor="chat-input">詢問目前內容</label>
            <textarea
              id="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：這句為什麼使用過去完成式？"
              rows={3}
            />
            <div>
              <small>AI gateway 尚未連線</small>
              <button type="submit">送出</button>
            </div>
          </form>
        </aside>
      </div>

      {bookPendingDeletion ? (
        <div className="dialog-backdrop">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <span className="delete-dialog-icon" aria-hidden="true">!</span>
            <h2 id="delete-dialog-title">刪除書籍？</h2>
            <p>
              將永久刪除《{bookPendingDeletion.title}》、本機 EPUB 與閱讀進度。
              此操作無法復原。
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                onClick={() => setBookPendingDeletion(undefined)}
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                className="danger-action"
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? "刪除中…" : "永久刪除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
