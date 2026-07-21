import {
  FormEvent,
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatDesktopApi,
  ChatSnapshot,
  ConnectionPhase,
  SendChatMessageInput
} from "../shared/chat-contracts";
import type {
  BookView,
  ChapterContent,
  LibraryBook,
  LibraryDesktopApi,
  ReadingRange
} from "../shared/library-contracts";
import {
  advanceReadingRange,
  extractReadingSegment,
  initialReadingRange,
  markerTopForTextOffset,
  textOffsetAtPoint
} from "./reading-range";

type WorkspaceMode = "overview" | "reader" | "review";

const initialChatSnapshot: ChatSnapshot = {
  connection: "disconnected",
  connectionDetail: "尚未連線 Codex。",
  account: null,
  allowance: {
    phase: "unavailable",
    fiveHour: null,
    weekly: null,
    detail: "尚未取得 AI 使用額度。"
  },
  messages: [],
  threadId: null,
  activeTurnId: null
};

function desktopBridge(): {
  library?: LibraryDesktopApi;
  chat?: ChatDesktopApi;
} | undefined {
  return (
    window as unknown as {
      readerDesktop?: {
        library?: LibraryDesktopApi;
        chat?: ChatDesktopApi;
      };
    }
  ).readerDesktop;
}

function desktopLibrary(): LibraryDesktopApi | undefined {
  return desktopBridge()?.library;
}

function desktopChat(): ChatDesktopApi | undefined {
  return desktopBridge()?.chat;
}

function connectionLabel(phase: ConnectionPhase) {
  return {
    disconnected: "尚未連線",
    connecting: "連線中…",
    ready: "已連線",
    "auth-required": "需要登入",
    error: "連線失敗"
  }[phase];
}

function resetLabel(timestamp: number | undefined) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date((timestamp ?? 0) * 1000).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ChatMessageContent({ text }: { text: string }) {
  return (
    <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="markdown-table-scroll">
              <table {...props} />
            </div>
          )
        }}
      >
        {text || "…"}
      </ReactMarkdown>
    </div>
  );
}

const ChapterArticle = memo(forwardRef<HTMLElement, {
  content: ChapterContent;
}>(function ChapterArticle({ content }, ref) {
  return (
    <article
      ref={ref}
      className="chapter-content"
      aria-label={`${content.title} 章節內容`}
      dangerouslySetInnerHTML={{ __html: content.contentHtml }}
    />
  );
}));

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>("overview");
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
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
  const [readingRange, setReadingRange] = useState<ReadingRange>();
  const [rangeMenu, setRangeMenu] = useState<{
    x: number;
    y: number;
    offset: number;
  }>();
  const [markerTops, setMarkerTops] = useState({ start: 0, end: 0 });
  const [draft, setDraft] = useState("");
  const [chatSnapshot, setChatSnapshot] = useState(initialChatSnapshot);
  const [chatError, setChatError] = useState("");
  const contentRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const initializedRangeRef = useRef<string | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chapterStartRef = useRef<{
    bookId: string;
    chapterId: string;
    useFragment: boolean;
  } | undefined>(undefined);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0],
    [books, selectedBookId]
  );
  const rangeBoundariesOverlap = readingRange
    ? Math.abs(markerTops.start - markerTops.end) < 28
    : false;
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
    if (canResumeReader && state.chapterId) {
      chapterStartRef.current = {
        bookId: book.id,
        chapterId: state.chapterId,
        useFragment: true
      };
    }
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
    const chat = desktopChat();
    if (!chat) return;
    let active = true;
    const update = (snapshot: ChatSnapshot) => {
      if (active) setChatSnapshot(snapshot);
    };
    const unsubscribe = chat.onStateChanged(update);
    void chat.getState()
      .then(update)
      .then(() => chat.connect())
      .then(update)
      .catch((error: unknown) => {
        if (!active) return;
        setChatError(
          error instanceof Error ? error.message : "無法連線 Codex。"
        );
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
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
    setReadingRange(undefined);
    setRangeMenu(undefined);
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
    const article = articleRef.current;
    if (!chapterContent || !selectedBook || !article) return;
    const key = `${chapterContent.bookId}:${chapterContent.chapterId}`;
    if (initializedRangeRef.current === key && readingRange) return;
    initializedRangeRef.current = key;
    const text = article.textContent ?? "";
    const saved = selectedBook.chapterRanges?.[chapterContent.chapterId];
    const range = saved && saved.start <= saved.end && saved.end <= text.length
      ? saved
      : initialReadingRange(text);
    setReadingRange(range);
    if (!saved) persistReadingRange(range);
  }, [chapterContent, selectedBook]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !readingRange) return;
    const updateMarkerTops = () => setMarkerTops({
      start: markerTopForTextOffset(article, readingRange.start),
      end: markerTopForTextOffset(article, readingRange.end, "after")
    });
    updateMarkerTops();
    window.addEventListener("resize", updateMarkerTops);
    return () => window.removeEventListener("resize", updateMarkerTops);
  }, [chapterContent, readingRange]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !chapterContent) return;
    const handleContextMenu = (event: MouseEvent) => {
      const offset = textOffsetAtPoint(
        article,
        event.clientX,
        event.clientY,
        event.target
      );
      if (offset === null) return;
      event.preventDefault();
      setRangeMenu({ x: event.clientX, y: event.clientY, offset });
    };
    article.addEventListener("contextmenu", handleContextMenu);
    return () => article.removeEventListener("contextmenu", handleContextMenu);
  }, [chapterContent]);

  useEffect(() => {
    if (!rangeMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rangeMenuRef.current?.contains(event.target as Node)) return;
      setRangeMenu(undefined);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [rangeMenu]);

  useEffect(() => {
    if (!chapterContent || !selectedBook || !contentRef.current) return;
    const maximum = Math.max(
      0,
      contentRef.current.scrollHeight - contentRef.current.clientHeight
    );
    const progress = selectedBook.readingState.chapterId === chapterContent.chapterId
      ? selectedBook.readingState.scrollProgress
      : 0;
    const startPreference = chapterStartRef.current;
    const useFragment =
      !startPreference ||
      startPreference.bookId !== chapterContent.bookId ||
      startPreference.chapterId !== chapterContent.chapterId ||
      startPreference.useFragment;
    if (progress === 0 && useFragment && chapterContent.fragment) {
      const target = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>("[id]")
      ).find((element) => element.id === chapterContent.fragment);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
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
        candidate.id === savedBook.id
          ? {
              ...savedBook,
              chapterRanges: savedBook.chapterRanges ?? candidate.chapterRanges
            }
          : candidate
      ));
    }).catch(() => {
      setLibraryError("無法保存閱讀位置；本次切換仍可繼續使用。");
    });
  }

  function persistReadingRange(range: ReadingRange) {
    const book = selectedBook;
    const chapterId = chapterContent?.chapterId ?? activeChapterId;
    if (!book || !chapterId) return;
    setReadingRange(range);
    setBooks((current) => current.map((candidate) =>
      candidate.id === book.id
        ? {
            ...candidate,
            chapterRanges: {
              ...candidate.chapterRanges,
              [chapterId]: range
            }
          }
        : candidate
    ));
    void desktopLibrary()?.saveReadingRange({
      bookId: book.id,
      chapterId,
      range
    }).then((savedBook) => {
      setBooks((current) => current.map((candidate) =>
        candidate.id === savedBook.id
          ? {
              ...candidate,
              chapterRanges: savedBook.chapterRanges ?? candidate.chapterRanges
            }
          : candidate
      ));
    }).catch(() => {
      setLibraryError("無法保存閱讀區段；本次調整仍可暫時使用。");
    });
  }

  function rangeWithOffset(
    marker: "start" | "end",
    offset: number,
    sourceRange = readingRange
  ): ReadingRange | undefined {
    if (!sourceRange) return undefined;
    const textLength = articleRef.current?.textContent?.length ?? 0;
    const bounded = Math.min(textLength, Math.max(0, Math.trunc(offset)));
    if (marker === "start") {
      return bounded > sourceRange.end
        ? { start: bounded, end: bounded }
        : { ...sourceRange, start: bounded };
    }
    return bounded < sourceRange.start
      ? { start: bounded, end: bounded }
      : { ...sourceRange, end: bounded };
  }

  function moveRangeMarker(marker: "start" | "end", offset: number) {
    const next = rangeWithOffset(marker, offset);
    if (next) persistReadingRange(next);
    setRangeMenu(undefined);
  }

  function startDraggingRangeMarker(
    marker: "start" | "end",
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    if (!readingRange) return;
    event.preventDefault();
    const initialRange = readingRange;
    let lastValidRange = initialRange;
    let hasMoved = false;

    const updateFromPoint = (event: PointerEvent) => {
      const article = articleRef.current;
      if (!article) return;
      const offset = textOffsetAtPoint(article, event.clientX, event.clientY);
      if (offset === null) return;
      const next = rangeWithOffset(marker, offset, initialRange);
      if (!next) return;
      lastValidRange = next;
      hasMoved = next.start !== initialRange.start || next.end !== initialRange.end;
      setReadingRange(next);
    };
    const stopListening = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    const handlePointerMove = (event: PointerEvent) => {
      updateFromPoint(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      stopListening();
      updateFromPoint(event);
      if (hasMoved) persistReadingRange(lastValidRange);
      setRangeMenu(undefined);
    };
    const handlePointerCancel = () => {
      stopListening();
      setReadingRange(initialRange);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function advanceToNextReadingRange() {
    const article = articleRef.current;
    if (!article || !readingRange) return;
    const text = article.textContent ?? "";
    if (readingRange.end >= text.length) return;
    persistReadingRange(advanceReadingRange(text, readingRange));
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

  function openChapter(chapterId: string, useFragment = true) {
    if (!selectedBook) return;
    chapterStartRef.current = {
      bookId: selectedBook.id,
      chapterId,
      useFragment
    };
    if (!useFragment && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
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
    if (previousChapter) openChapter(previousChapter.id, false);
  }

  function openNextChapter() {
    if (nextChapter) openChapter(nextChapter.id, false);
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    const chat = desktopChat();
    if (!text || !chat || chatSnapshot.connection !== "ready" ||
      chatSnapshot.activeTurnId) return;

    const segment = mode === "reader" && readingRange && articleRef.current
      ? extractReadingSegment(articleRef.current.textContent ?? "", readingRange)
      : "";
    const context = {
      ...(selectedBook?.title ? { bookTitle: selectedBook.title } : {}),
      ...(mode === "reader" && activeChapter?.title
        ? { chapterTitle: activeChapter.title }
        : {}),
      ...(segment ? { readingSegment: segment } : {})
    };
    const input: SendChatMessageInput = {
      text,
      ...(Object.keys(context).length ? { context } : {})
    };
    setDraft("");
    setChatError("");
    try {
      setChatSnapshot(await chat.sendMessage(input));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "無法送出訊息。");
    }
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

      <div
        className={[
          "workspace",
          isLeftSidebarCollapsed ? "left-collapsed" : "",
          isRightSidebarCollapsed ? "right-collapsed" : ""
        ].filter(Boolean).join(" ")}
      >
        <aside
          className={isLeftSidebarCollapsed ? "sidebar collapsed" : "sidebar"}
          aria-label="主要導覽"
        >
          <div className="sidebar-heading">
            {!isLeftSidebarCollapsed ? (
              <div className="book-summary">
                <span className="eyebrow">我的書庫</span>
                <strong>{books.length ? `${books.length} 本書籍` : "尚未導入書籍"}</strong>
              </div>
            ) : null}
            <button
              className="panel-toggle left-toggle"
              type="button"
              aria-label={isLeftSidebarCollapsed ? "展開左側欄" : "摺疊左側欄"}
              aria-controls="left-sidebar-content"
              aria-expanded={!isLeftSidebarCollapsed}
              onClick={() => setIsLeftSidebarCollapsed((collapsed) => !collapsed)}
            >
              <svg aria-hidden="true" viewBox="0 0 18 18">
                <rect x="1.75" y="2.25" width="14.5" height="13.5" rx="3" />
                <path d="M6 2.75v12.5" />
              </svg>
            </button>
          </div>

          {!isLeftSidebarCollapsed ? (
            <div className="sidebar-content" id="left-sidebar-content">
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

              <div className="sidebar-footer">
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

                <button className="settings-button" type="button">
                  <span aria-hidden="true">⚙</span>
                  設定
                </button>

                <section
                  className={`codex-account-card ${chatSnapshot.connection}`}
                  aria-label="Codex 狀態"
                  title={chatSnapshot.connectionDetail}
                >
                  <div className="codex-account-heading">
                    <div className="codex-account-brand">
                      <span
                        className={`codex-status-dot ${chatSnapshot.connection}`}
                        aria-hidden="true"
                      />
                      <strong className="codex-account-name">Codex</strong>
                    </div>
                    <span className="codex-connection-label">
                      {connectionLabel(chatSnapshot.connection)}
                    </span>
                  </div>
                  <p
                    className="codex-account-identity"
                    title={chatSnapshot.account
                      ? [chatSnapshot.account.email, chatSnapshot.account.type]
                          .filter(Boolean)
                          .join(" · ")
                      : chatSnapshot.connectionDetail}
                    aria-label={chatSnapshot.account
                      ? [chatSnapshot.account.email, chatSnapshot.account.type]
                          .filter(Boolean)
                          .join(" · ")
                      : chatSnapshot.connectionDetail}
                  >
                    {chatSnapshot.account ? (
                      <span className="codex-account-email">
                        {chatSnapshot.account.email ?? "本機帳戶"}
                      </span>
                    ) : (
                      <span className="codex-account-email">
                        {chatSnapshot.connectionDetail}
                      </span>
                    )}
                  </p>
                  <div className="allowance-summary">
                    {([
                      ["5 小時", chatSnapshot.allowance.fiveHour],
                      ["一週", chatSnapshot.allowance.weekly]
                    ] as const).map(([label, allowance]) => (
                      <div
                        className="allowance-summary-row"
                        key={label}
                        title={allowance
                          ? `${label}：剩餘 ${allowance.remainingPercent}%，${resetLabel(allowance.resetsAt)} 重置`
                          : `${label}：${chatSnapshot.allowance.phase === "loading" ? "取得中" : "無法取得"}`}
                        aria-label={allowance
                          ? `${label}：剩餘 ${allowance.remainingPercent}%，${resetLabel(allowance.resetsAt)} 重置`
                          : `${label}：${chatSnapshot.allowance.phase === "loading" ? "取得中" : "無法取得"}`}
                      >
                        <span>{label}</span>
                        <strong className={`allowance-value ${allowance ? "available" : chatSnapshot.allowance.phase}`}>
                          {allowance
                            ? `${allowance.remainingPercent}%`
                            : chatSnapshot.allowance.phase === "loading"
                              ? "取得中…"
                              : "無法取得"}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
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
                    {selectedBook.chapters.map((chapter) => {
                      const depth = Math.max(0, chapter.depth ?? 0);
                      return (
                      <li
                        className={depth > 0 ? "subchapter" : undefined}
                        data-depth={depth}
                        key={`${chapter.id}-${chapter.order}`}
                        style={{ "--chapter-depth": Math.min(depth, 4) } as CSSProperties}
                      >
                        <button type="button" onClick={() => openChapter(chapter.id)}>
                          <span>
                            {depth > 0
                              ? "↳ 子章節"
                              : String(chapter.order + 1).padStart(2, "0")}
                          </span>
                          <strong>{chapter.title}</strong>
                          <em>{depth > 0 ? "閱讀此節 →" : "開始閱讀 →"}</em>
                        </button>
                      </li>
                      );
                    })}
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
            <section className="reader-panel" aria-label="章節閱讀">
              {isLoadingChapter ? (
                <div className="chapter-status" role="status">章節載入中…</div>
              ) : chapterError ? (
                <div className="chapter-status error" role="alert">
                  <p>{chapterError}</p>
                  <button type="button" onClick={returnToOverview}>返回總覽</button>
                </div>
              ) : chapterContent ? (
                <div className="reading-range-workspace">
                  <div className="reading-range-shell">
                    {readingRange ? (
                      <div className="reading-range-markers" aria-label="AI 可讀範圍">
                        <div
                          className={`reading-range-boundary start${rangeBoundariesOverlap ? " is-overlapping" : ""}`}
                          data-range-boundary="start"
                          data-text-offset={readingRange.start}
                          style={{ top: markerTops.start }}
                        >
                          <button
                            aria-label="閱讀區段起點"
                            className="reading-range-marker start"
                            data-text-offset={readingRange.start}
                            onPointerDown={(event) => startDraggingRangeMarker("start", event)}
                            type="button"
                          >
                            <span aria-hidden="true" />
                          </button>
                          <span className="reading-range-divider start" aria-hidden="true">
                            <span className="reading-range-divider-label">START</span>
                          </span>
                        </div>
                        <div
                          className={`reading-range-boundary end${rangeBoundariesOverlap ? " is-overlapping" : ""}`}
                          data-range-boundary="end"
                          data-text-offset={readingRange.end}
                          style={{ top: markerTops.end }}
                        >
                          <button
                            aria-label="閱讀區段終點"
                            className="reading-range-marker end"
                            data-text-offset={readingRange.end}
                            onPointerDown={(event) => startDraggingRangeMarker("end", event)}
                            type="button"
                          >
                            <span aria-hidden="true" />
                          </button>
                          <span className="reading-range-divider end" aria-hidden="true">
                            <span className="reading-range-divider-label">END</span>
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <ChapterArticle ref={articleRef} content={chapterContent} />
                  </div>
                  <div className="reading-range-actions">
                    <span>AI 只會讀取兩個書籤之間的內容</span>
                    <button
                      type="button"
                      onClick={advanceToNextReadingRange}
                      disabled={!readingRange || readingRange.end >= (articleRef.current?.textContent?.length ?? 0)}
                    >
                      完成這段，前往下一段
                    </button>
                  </div>
                  {rangeMenu ? (
                    <div
                      ref={rangeMenuRef}
                      className="reading-range-menu"
                      role="menu"
                      style={{ left: rangeMenu.x, top: rangeMenu.y }}
                    >
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => moveRangeMarker("start", rangeMenu.offset)}
                      >
                        將起點移到這裡
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => moveRangeMarker("end", rangeMenu.offset)}
                      >
                        將終點移到這裡
                      </button>
                    </div>
                  ) : null}
                </div>
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

        <aside
          className={isRightSidebarCollapsed ? "assistant-panel collapsed" : "assistant-panel"}
          aria-label="AI 助教"
        >
          <div className="assistant-heading">
            {!isRightSidebarCollapsed ? (
              <>
                <div>
                  <span className={`status-dot ${chatSnapshot.connection}`} />
                  <strong>AI 助教</strong>
                </div>
                <span>
                  {mode === "reader" && readingRange &&
                    extractReadingSegment(
                      articleRef.current?.textContent ?? "",
                      readingRange
                    )
                    ? "閱讀區段上下文"
                    : "一般對話"}
                </span>
              </>
            ) : null}
            <button
              className="panel-toggle right-toggle"
              type="button"
              aria-label={isRightSidebarCollapsed ? "展開右側欄" : "摺疊右側欄"}
              aria-controls="right-sidebar-content"
              aria-expanded={!isRightSidebarCollapsed}
              onClick={() => setIsRightSidebarCollapsed((collapsed) => !collapsed)}
            >
              <svg aria-hidden="true" viewBox="0 0 18 18">
                <rect x="1.75" y="2.25" width="14.5" height="13.5" rx="3" />
                <path d="M12 2.75v12.5" />
              </svg>
            </button>
          </div>

          {!isRightSidebarCollapsed ? (
            <div className="assistant-content" id="right-sidebar-content">
              <div className="messages" aria-live="polite">
                {chatSnapshot.messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <strong>從目前閱讀內容開始提問</strong>
                    <p>Codex 只會收到你明確選取的閱讀區段。</p>
                  </div>
                ) : null}
                {chatSnapshot.messages.map((message) => (
                  <article
                    aria-label={message.role === "assistant" ? "AI 回覆" : "使用者訊息"}
                    className={"message " + message.role}
                    key={message.id}
                  >
                    <ChatMessageContent text={message.text} />
                  </article>
                ))}
              </div>

              <form className="chat-form" onSubmit={sendMessage}>
                <label htmlFor="chat-input">詢問目前內容</label>
                <textarea
                  id="chat-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="例如：這句為什麼使用過去完成式？"
                  rows={3}
                  disabled={chatSnapshot.connection !== "ready" ||
                    Boolean(chatSnapshot.activeTurnId)}
                />
                <div>
                  <small>
                    {chatError || (chatSnapshot.activeTurnId
                      ? "Codex 正在回覆…"
                      : chatSnapshot.connectionDetail)}
                  </small>
                  <button
                    type="submit"
                    disabled={chatSnapshot.connection !== "ready" ||
                      Boolean(chatSnapshot.activeTurnId) || !draft.trim()}
                  >
                    送出
                  </button>
                </div>
              </form>
            </div>
          ) : null}
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
