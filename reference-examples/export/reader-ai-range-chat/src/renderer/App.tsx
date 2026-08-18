import {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ChapterContent,
  ChatSnapshot,
  LibraryBook,
  ReadingRange
} from "../shared/contracts";
import {
  advanceReadingRange,
  extractReadingSegment,
  initialReadingRange,
  markerTopForTextOffset,
  textOffsetAtPoint
} from "./reading-range";

export interface ReadingLayout {
  fontSize: number;
  lineHeight: number;
  paperWidth: number;
}

const defaultReadingLayout: ReadingLayout = {
  fontSize: 19,
  lineHeight: 1.9,
  paperWidth: 760
};

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function loadReadingLayout(): ReadingLayout {
  if (typeof window === "undefined") return defaultReadingLayout;
  try {
    const saved = JSON.parse(window.localStorage.getItem("reader-example-layout") ?? "null") as Partial<ReadingLayout> | null;
    return {
      fontSize: bounded(saved?.fontSize, 15, 28, defaultReadingLayout.fontSize),
      lineHeight: bounded(saved?.lineHeight, 1.5, 2.5, defaultReadingLayout.lineHeight),
      paperWidth: bounded(saved?.paperWidth, 560, 920, defaultReadingLayout.paperWidth)
    };
  } catch {
    return defaultReadingLayout;
  }
}

const emptyChat: ChatSnapshot = {
  connection: "disconnected",
  connectionDetail: "Codex is not connected.",
  account: null,
  allowance: {
    phase: "unavailable",
    fiveHour: null,
    weekly: null,
    detail: "AI usage allowance is not available yet."
  },
  threadId: null,
  activeTurnId: null,
  messages: []
};

function connectionLabel(connection: ChatSnapshot["connection"]): string {
  if (connection === "ready") return "Connected";
  if (connection === "auth-required") return "Sign in";
  if (connection === "connecting") return "Connecting";
  if (connection === "error") return "Error";
  return "Offline";
}

function resetLabel(resetsAt: number): string {
  return new Date(resetsAt * 1_000).toLocaleString();
}

export function CodexAccountStatus({ snapshot }: { snapshot: ChatSnapshot }) {
  return (
    <section
      className={`codex-account-card ${snapshot.connection}`}
      aria-label="Codex status"
      title={snapshot.connectionDetail}
    >
      <div className="codex-account-heading">
        <div className="codex-account-brand">
          <span className={`codex-status-dot ${snapshot.connection}`} aria-hidden="true" />
          <strong className="codex-account-name">Codex</strong>
        </div>
        <span className="codex-connection-label">
          {connectionLabel(snapshot.connection)}
        </span>
      </div>
      <div className="allowance-summary">
        {([
          ["5 hours", snapshot.allowance.fiveHour],
          ["Weekly", snapshot.allowance.weekly]
        ] as const).map(([label, allowance]) => {
          const unavailable = snapshot.allowance.phase === "loading" ? "Loading…" : "Unavailable";
          const detail = allowance
            ? `${label}: ${allowance.remainingPercent}% remaining, resets ${resetLabel(allowance.resetsAt)}`
            : `${label}: ${unavailable}`;
          return (
            <div className="allowance-summary-row" key={label} title={detail} aria-label={detail}>
              <span>{label}</span>
              <strong className={`allowance-value ${allowance ? "available" : snapshot.allowance.phase}`}>
                {allowance ? `${allowance.remainingPercent}%` : unavailable}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BookShelf({
  books,
  selectedBookId,
  onSelect
}: {
  books: LibraryBook[];
  selectedBookId?: string;
  onSelect(book: LibraryBook): void;
}) {
  return (
    <section className="book-library" aria-label="Book library">
      <header className="book-library-heading">
        <span>My library</span>
        <strong>{books.length} {books.length === 1 ? "book" : "books"}</strong>
      </header>
      <div className="book-library-panel">
        {books.length ? (
          <nav className="book-list" aria-label="Imported books">
            {books.map((book) => (
              <button
                className={`book-item${book.id === selectedBookId ? " active" : ""}`}
                type="button"
                key={book.id}
                aria-pressed={book.id === selectedBookId}
                onClick={() => onSelect(book)}
              >
                <span className="book-item-cover" aria-hidden="true">
                  {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : "Aa"}
                </span>
                <span className="book-item-copy">
                  <strong title={book.title}>{book.title}</strong>
                  <small title={book.author}>{book.author}</small>
                  <span>{book.chapters.length} chapters</span>
                </span>
              </button>
            ))}
          </nav>
        ) : (
          <p className="empty-library">Import an EPUB to begin. Books stay in memory for this example session.</p>
        )}
      </div>
    </section>
  );
}

export function BookOverview({
  book,
  onContinue,
  onOpenChapter
}: {
  book: LibraryBook;
  onContinue(): void;
  onOpenChapter(chapterId: string): void;
}) {
  const markedChapterCount = Object.keys(book.chapterRanges).length;
  return (
    <section className="book-overview" aria-labelledby="book-overview-title">
      <div className="overview-hero">
        <div className="overview-cover">
          {book.coverDataUrl
            ? <img src={book.coverDataUrl} alt={`${book.title} cover`} />
            : <span>Aa</span>}
        </div>
        <div className="overview-details">
          <span className="eyebrow">Book overview</span>
          <h1 id="book-overview-title">{book.title}</h1>
          <p className="book-author">{book.author}</p>
          <div className="book-facts">
            <span>{book.chapters.length} chapters</span>
            <span>{markedChapterCount} AI {markedChapterCount === 1 ? "range" : "ranges"} saved</span>
          </div>
          <button className="primary-action" type="button" onClick={onContinue}>
            {markedChapterCount ? "Continue reading" : "Start reading"}
          </button>
        </div>
      </div>
      <div className="overview-chapters">
        <div>
          <span className="eyebrow">Contents</span>
          <h2>Chapters</h2>
        </div>
        <ol>
          {book.chapters.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpenChapter(item.id)}>
                <span>{String(item.order + 1).padStart(2, "0")}</span>
                <strong>{item.title}</strong>
                <em>Start reading →</em>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ReaderToolbar({
  chapterTitle,
  layout,
  layoutOpen,
  hasPreviousChapter,
  hasNextChapter,
  onBack,
  onToggleLayout,
  onCloseLayout,
  onChangeLayout,
  onResetLayout,
  onPreviousChapter,
  onNextChapter
}: {
  chapterTitle: string;
  layout: ReadingLayout;
  layoutOpen: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onBack(): void;
  onToggleLayout(): void;
  onCloseLayout(): void;
  onChangeLayout(next: ReadingLayout): void;
  onResetLayout(): void;
  onPreviousChapter(): void;
  onNextChapter(): void;
}) {
  return (
    <header className="reader-toolbar reading-toolbar">
      <div className="reader-toolbar-inner">
        <button className="reader-back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to overview
        </button>
        <div className="reader-toolbar-context">
          <span>Reading</span>
          <strong title={chapterTitle}>{chapterTitle}</strong>
        </div>
        <div className="reader-toolbar-actions">
          <div className="reading-layout-anchor">
            <button
              className="reading-layout-button"
              type="button"
              aria-label="Reading layout"
              aria-controls="reading-layout-panel"
              aria-expanded={layoutOpen}
              onClick={onToggleLayout}
            >
              Aa
            </button>
            {layoutOpen ? (
              <section
                id="reading-layout-panel"
                className="reading-layout-panel"
                role="dialog"
                aria-label="Reading layout"
              >
                <div className="reading-layout-heading">
                  <div>
                    <span>Reading layout</span>
                    <strong>Text settings</strong>
                  </div>
                  <button type="button" aria-label="Close reading layout" onClick={onCloseLayout}>×</button>
                </div>
                <label className="reading-layout-control">
                  <span><b>Text size</b><output>{layout.fontSize}px</output></span>
                  <input
                    type="range"
                    min="15"
                    max="28"
                    step="1"
                    value={layout.fontSize}
                    onChange={(event) => onChangeLayout({
                      ...layout,
                      fontSize: Number(event.target.value)
                    })}
                  />
                </label>
                <label className="reading-layout-control">
                  <span><b>Line spacing</b><output>{layout.lineHeight.toFixed(1)}×</output></span>
                  <input
                    type="range"
                    min="1.5"
                    max="2.5"
                    step="0.1"
                    value={layout.lineHeight}
                    onChange={(event) => onChangeLayout({
                      ...layout,
                      lineHeight: Number(event.target.value)
                    })}
                  />
                </label>
                <label className="reading-layout-control">
                  <span><b>Page width</b><output>{layout.paperWidth}px</output></span>
                  <input
                    type="range"
                    min="560"
                    max="920"
                    step="20"
                    value={layout.paperWidth}
                    onChange={(event) => onChangeLayout({
                      ...layout,
                      paperWidth: Number(event.target.value)
                    })}
                  />
                </label>
                <button className="reading-layout-reset" type="button" onClick={onResetLayout}>
                  Restore defaults
                </button>
              </section>
            ) : null}
          </div>
          <div className="chapter-navigation" role="group" aria-label="Chapter navigation">
            <button type="button" onClick={onPreviousChapter} disabled={!hasPreviousChapter}>
              <span aria-hidden="true">‹</span> Previous chapter
            </button>
            <button type="button" onClick={onNextChapter} disabled={!hasNextChapter}>
              Next chapter <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function AccountSettings({
  snapshot,
  onReconnect,
  onClose
}: {
  snapshot: ChatSnapshot;
  onReconnect(): void;
  onClose(): void;
}) {
  const connected = snapshot.connection === "ready";
  return (
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header>
        <div>
          <span>Settings</span>
          <h2 id="settings-title">Account</h2>
        </div>
        <button type="button" aria-label="Close settings" onClick={onClose}>×</button>
      </header>
      <div className="account-card">
        <div className="account-avatar" aria-hidden="true">
          {snapshot.account?.email?.slice(0, 1).toUpperCase() ?? "C"}
        </div>
        <div className="account-identity">
          <span className={`account-state ${snapshot.connection}`}>
            {connected ? "Connected" : snapshot.connection.replace("-", " ")}
          </span>
          <strong>{snapshot.account?.email ?? "No Codex account connected"}</strong>
          <small>{snapshot.account?.type ?? snapshot.connectionDetail}</small>
        </div>
      </div>
      <p className="account-detail">{snapshot.connectionDetail}</p>
      <button
        className="reconnect-button"
        type="button"
        onClick={onReconnect}
        disabled={snapshot.connection === "connecting"}
      >
        {snapshot.connection === "connecting" ? "Connecting…" : "Reconnect Codex"}
      </button>
    </section>
  );
}

export function App() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [activeChapterId, setActiveChapterId] = useState<string>();
  const [view, setView] = useState<"overview" | "reader">("overview");
  const [chapter, setChapter] = useState<ChapterContent>();
  const [range, setRange] = useState<ReadingRange>();
  const [markerTops, setMarkerTops] = useState({ start: 0, end: 0 });
  const [chat, setChat] = useState(emptyChat);
  const [draft, setDraft] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [chatError, setChatError] = useState("");
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readingLayoutOpen, setReadingLayoutOpen] = useState(false);
  const [readingLayout, setReadingLayout] = useState<ReadingLayout>(loadReadingLayout);
  const [annotationCount, setAnnotationCount] = useState(0);
  const articleRef = useRef<HTMLElement>(null);
  const rangeRef = useRef<ReadingRange | undefined>(undefined);

  const selectedBook = useMemo(
    () => books.find(({ id }) => id === selectedBookId),
    [books, selectedBookId]
  );
  const activeChapter = selectedBook?.chapters.find(({ id }) => id === activeChapterId);
  const activeChapterIndex = selectedBook?.chapters.findIndex(({ id }) => id === activeChapterId) ?? -1;
  const previousChapter = activeChapterIndex > 0
    ? selectedBook?.chapters[activeChapterIndex - 1]
    : undefined;
  const nextChapter = activeChapterIndex >= 0
    ? selectedBook?.chapters[activeChapterIndex + 1]
    : undefined;

  useEffect(() => {
    void window.readerExample.library.listBooks().then(setBooks).catch((reason) =>
      setLibraryError(reason instanceof Error ? reason.message : "Unable to load the library.")
    );
    const unsubscribe = window.readerExample.chat.onStateChanged(setChat);
    void window.readerExample.chat.getState().then(setChat);
    void window.readerExample.chat.connect().then(setChat);
    return unsubscribe;
  }, []);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  useEffect(() => {
    window.localStorage.setItem("reader-example-layout", JSON.stringify(readingLayout));
  }, [readingLayout]);

  useEffect(() => {
    setAnnotationCount(0);
    setReadingLayoutOpen(false);
  }, [activeChapterId]);

  useEffect(() => {
    if (view !== "reader" || !selectedBookId || !activeChapterId) {
      setChapter(undefined);
      setRange(undefined);
      return;
    }
    let cancelled = false;
    setChapter(undefined);
    setRange(undefined);
    void window.readerExample.library
      .getChapterContent(selectedBookId, activeChapterId)
      .then((content) => {
        if (!cancelled) setChapter(content);
      })
      .catch((reason) => setLibraryError(
        reason instanceof Error ? reason.message : "Unable to load this chapter."
      ));
    return () => {
      cancelled = true;
    };
  }, [view, selectedBookId, activeChapterId]);

  useEffect(() => {
    const article = articleRef.current;
    if (!chapter || !article || !selectedBook) return;
    const text = article.textContent ?? "";
    const saved = selectedBook.chapterRanges[chapter.chapterId];
    setRange(saved && saved.end <= text.length ? saved : initialReadingRange(text));
  }, [chapter, selectedBook]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !range) return;
    const update = () => setMarkerTops({
      start: markerTopForTextOffset(article, range.start),
      end: markerTopForTextOffset(article, range.end, "after")
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(article);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [chapter, range]);

  async function importBook() {
    setImporting(true);
    setLibraryError("");
    try {
      const result = await window.readerExample.library.importBook();
      if (result.status === "cancelled") return;
      setBooks((current) => [
        ...current.filter(({ id }) => id !== result.book.id),
        result.book
      ]);
      setSelectedBookId(result.book.id);
      setActiveChapterId(undefined);
      setView("overview");
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : "Unable to import this EPUB.");
    } finally {
      setImporting(false);
    }
  }

  function selectBook(book: LibraryBook) {
    setSelectedBookId(book.id);
    setActiveChapterId(undefined);
    setView("overview");
  }

  function openChapter(chapterId: string) {
    setActiveChapterId(chapterId);
    setView("reader");
  }

  function continueReading() {
    if (!selectedBook) return;
    const chapterId = activeChapter && activeChapter.id === activeChapterId
      ? activeChapter.id
      : selectedBook.chapters[0]?.id;
    if (chapterId) openChapter(chapterId);
  }

  function returnToOverview() {
    setView("overview");
    setReadingLayoutOpen(false);
    setChapter(undefined);
    setRange(undefined);
  }

  function persistReadingRange(next: ReadingRange) {
    if (!selectedBook || !chapter) return;
    rangeRef.current = next;
    setRange(next);
    void window.readerExample.library.saveReadingRange({
      bookId: selectedBook.id,
      chapterId: chapter.chapterId,
      range: next
    }).then((saved) => setBooks((current) => current.map((book) =>
      book.id === saved.id ? saved : book
    ))).catch((reason) => setLibraryError(
      reason instanceof Error ? reason.message : "Unable to save the range."
    ));
  }

  function scrollToRangeMarker(marker: "start" | "end") {
    document.querySelector<HTMLElement>(`[data-range-boundary="${marker}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function advanceToNextSegment() {
    const text = articleRef.current?.textContent ?? "";
    const current = rangeRef.current;
    if (!current || current.end >= text.length) return;
    persistReadingRange(advanceReadingRange(text, current));
    window.requestAnimationFrame(() => scrollToRangeMarker("start"));
  }

  function annotateSelection() {
    const article = articleRef.current;
    const selection = window.getSelection();
    if (!article || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const selected = selection.getRangeAt(0);
    const common = selected.commonAncestorContainer;
    if (common !== article && !article.contains(common)) return;
    const mark = document.createElement("mark");
    mark.className = "reader-annotation";
    try {
      selected.surroundContents(mark);
    } catch {
      const contents = selected.extractContents();
      mark.append(contents);
      selected.insertNode(mark);
    }
    selection.removeAllRanges();
    setAnnotationCount((count) => count + 1);
  }

  function updateRange(marker: "start" | "end", offset: number) {
    const current = rangeRef.current;
    if (!current) return;
    const next = marker === "start"
      ? { start: Math.min(offset, current.end), end: current.end }
      : { start: current.start, end: Math.max(offset, current.start) };
    rangeRef.current = next;
    setRange(next);
  }

  function startDragging(
    marker: "start" | "end",
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    const article = articleRef.current;
    if (!article || !chapter || !selectedBook) return;
    const move = (pointer: PointerEvent) => {
      const rectangle = article.getBoundingClientRect();
      const offset = textOffsetAtPoint(article, rectangle.left + 28, pointer.clientY);
      if (offset !== null) updateRange(marker, offset);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      const finalRange = rangeRef.current;
      if (!finalRange) return;
      persistReadingRange(finalRange);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || chat.activeTurnId) return;
    const articleText = articleRef.current?.textContent ?? "";
    const readingSegment = range ? extractReadingSegment(articleText, range) : "";
    setDraft("");
    setChatError("");
    try {
      setChat(await window.readerExample.chat.sendMessage({
        text: question,
        context: {
          ...(selectedBook?.title ? { bookTitle: selectedBook.title } : {}),
          ...(view === "reader" && activeChapter?.title
            ? { chapterTitle: activeChapter.title }
            : {}),
          ...(readingSegment ? { readingSegment } : {})
        }
      }));
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : "Unable to send the question.");
    }
  }

  async function reconnectCodex() {
    setChatError("");
    try {
      setChat(await window.readerExample.chat.connect());
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : "Unable to connect to Codex.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="library-panel">
        <header className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>Deep Reader</strong>
            <span>minimum example</span>
          </div>
        </header>
        <button className="import-button" type="button" onClick={importBook} disabled={importing}>
          {importing ? "Importing…" : "+ Import EPUB"}
        </button>
        {libraryError ? <p className="library-error" role="alert">{libraryError}</p> : null}
        <BookShelf books={books} selectedBookId={selectedBookId} onSelect={selectBook} />
        <div className="library-footer">
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <span aria-hidden="true">⚙</span> Settings
          </button>
          <CodexAccountStatus snapshot={chat} />
        </div>
      </aside>

      <section className="reader-panel">
        {view === "reader" ? (
          <ReaderToolbar
            chapterTitle={activeChapter?.title ?? "Loading chapter…"}
            layout={readingLayout}
            layoutOpen={readingLayoutOpen}
            hasPreviousChapter={Boolean(previousChapter)}
            hasNextChapter={Boolean(nextChapter)}
            onBack={returnToOverview}
            onToggleLayout={() => setReadingLayoutOpen((open) => !open)}
            onCloseLayout={() => setReadingLayoutOpen(false)}
            onChangeLayout={setReadingLayout}
            onResetLayout={() => setReadingLayout(defaultReadingLayout)}
            onPreviousChapter={() => previousChapter && openChapter(previousChapter.id)}
            onNextChapter={() => nextChapter && openChapter(nextChapter.id)}
          />
        ) : (
          <header className="reader-toolbar overview-toolbar">
            <div className="reader-toolbar-copy">
              <div>
              <span>{selectedBook?.title ?? "Your reading space"}</span>
                <strong>{selectedBook ? "Book overview" : "Import a book to start reading"}</strong>
              </div>
            </div>
          </header>
        )}
        <div className="reader-scroll">
          {view === "reader" && chapter ? (
            <div
              className="reading-range-shell"
              style={{
                "--reading-paper-width": `${readingLayout.paperWidth}px`,
                "--reader-font-size": `${readingLayout.fontSize}px`,
                "--reader-line-height": readingLayout.lineHeight
              } as CSSProperties}
            >
              <div className="reader-segment-toolbar">
                <div className="reading-range-actions-group">
                  <div className="range-jump-controls" role="group" aria-label="Reading segment quick navigation">
                    <button type="button" onClick={() => scrollToRangeMarker("start")}>
                      <span aria-hidden="true">↑</span> Start
                    </button>
                    <button className="end" type="button" onClick={() => scrollToRangeMarker("end")}>
                      <span aria-hidden="true">↓</span> End
                    </button>
                  </div>
                  <button
                    className="range-advance-action"
                    type="button"
                    onClick={advanceToNextSegment}
                    disabled={!range || range.end >= (articleRef.current?.textContent?.length ?? 0)}
                  >
                    Next segment <span aria-hidden="true">→</span>
                  </button>
                </div>
                <button
                  className="annotation-tool"
                  type="button"
                  onClick={annotateSelection}
                  title="Select text in the chapter, then click Annotate"
                >
                  <span aria-hidden="true">✎</span> Annotate
                  {annotationCount ? <em>{annotationCount}</em> : null}
                </button>
              </div>
              {range ? (
                <div className="range-layer" aria-label="AI-readable START and END range">
                  <div
                    className="range-boundary start"
                    data-range-boundary="start"
                    style={{ top: markerTops.start }}
                  >
                    <button type="button" aria-label="Drag START" onPointerDown={(event) => startDragging("start", event)} />
                    <span><b>START</b></span>
                  </div>
                  <div
                    className="range-boundary end"
                    data-range-boundary="end"
                    style={{ top: markerTops.end }}
                  >
                    <button type="button" aria-label="Drag END" onPointerDown={(event) => startDragging("end", event)} />
                    <span><b>END</b></span>
                  </div>
                </div>
              ) : null}
              <article
                ref={articleRef}
                className="chapter-content"
                dangerouslySetInnerHTML={{ __html: chapter.contentHtml }}
              />
            </div>
          ) : view === "reader" ? (
            <div className="reader-empty compact">
              <span>···</span>
              <h1>Loading chapter</h1>
            </div>
          ) : selectedBook ? (
            <BookOverview
              book={selectedBook}
              onContinue={continueReading}
              onOpenChapter={openChapter}
            />
          ) : (
            <div className="reader-empty">
              <span>↗</span>
              <h1>Read for understanding</h1>
              <p>Import an EPUB, drag START and END around the passage you want Codex to read, then ask about its ideas.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="chat-panel">
        <header className="chat-header">
          <div><span className={`status ${chat.connection}`} /><strong>Codex</strong></div>
          <small>{chat.connectionDetail}</small>
        </header>
        <div className="range-notice">
          <span>AI context</span>
          <strong>{range ? "START → END only" : "No book passage"}</strong>
          <small>Each question includes only the current marked segment.</small>
        </div>
        <div className="messages" aria-live="polite">
          {chat.messages.length ? chat.messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <span>{message.role === "user" ? "You" : "Codex"}</span>
              <p>{message.text || "…"}</p>
            </article>
          )) : (
            <div className="chat-empty">
              <span>✦</span>
              <strong>Ask to understand</strong>
              <p>Try “What is the author’s central claim?” or “Explain the reasoning in this passage.”</p>
            </div>
          )}
          {chat.activeTurnId ? <div className="responding">Codex is responding…</div> : null}
        </div>
        <form className="chat-form" onSubmit={sendMessage}>
          <textarea
            aria-label="Ask about the current reading range"
            rows={4}
            value={draft}
            placeholder="Ask about the marked passage…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={chat.connection !== "ready" || Boolean(chat.activeTurnId)}
          />
          <button
            type="submit"
            disabled={!draft.trim() || chat.connection !== "ready" || Boolean(chat.activeTurnId)}
          >
            Ask Codex <span>↑</span>
          </button>
        </form>
        {chatError ? <p className="error" role="alert">{chatError}</p> : null}
      </aside>
      {settingsOpen ? (
        <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <AccountSettings
              snapshot={chat}
              onReconnect={() => void reconnectCodex()}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
