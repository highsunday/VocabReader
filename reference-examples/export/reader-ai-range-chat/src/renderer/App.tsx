import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChapterContent,
  ChatSnapshot,
  LibraryBook,
  ReadingRange
} from "../shared/contracts";
import {
  extractReadingSegment,
  initialReadingRange,
  markerTopForTextOffset,
  textOffsetAtPoint
} from "./reading-range";

const emptyChat: ChatSnapshot = {
  connection: "disconnected",
  connectionDetail: "Codex is not connected.",
  account: null,
  threadId: null,
  activeTurnId: null,
  messages: []
};

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
  const [chapter, setChapter] = useState<ChapterContent>();
  const [range, setRange] = useState<ReadingRange>();
  const [markerTops, setMarkerTops] = useState({ start: 0, end: 0 });
  const [chat, setChat] = useState(emptyChat);
  const [draft, setDraft] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [chatError, setChatError] = useState("");
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const rangeRef = useRef<ReadingRange | undefined>(undefined);

  const selectedBook = useMemo(
    () => books.find(({ id }) => id === selectedBookId),
    [books, selectedBookId]
  );
  const activeChapter = selectedBook?.chapters.find(({ id }) => id === activeChapterId);

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
    if (!selectedBookId || !activeChapterId) {
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
  }, [selectedBookId, activeChapterId]);

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
      setActiveChapterId(result.book.chapters[0]?.id);
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : "Unable to import this EPUB.");
    } finally {
      setImporting(false);
    }
  }

  function selectBook(book: LibraryBook) {
    setSelectedBookId(book.id);
    setActiveChapterId(book.chapters[0]?.id);
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
      void window.readerExample.library.saveReadingRange({
        bookId: selectedBook.id,
        chapterId: chapter.chapterId,
        range: finalRange
      }).then((saved) => setBooks((current) => current.map((book) =>
        book.id === saved.id ? saved : book
      ))).catch((reason) => setLibraryError(
        reason instanceof Error ? reason.message : "Unable to save the range."
      ));
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
          ...(activeChapter?.title ? { chapterTitle: activeChapter.title } : {}),
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

  const selectedLength = range ? Math.max(0, range.end - range.start) : 0;

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
        <nav aria-label="Book library">
          {books.length ? books.map((book) => (
            <button
              className={`book-button${book.id === selectedBookId ? " active" : ""}`}
              type="button"
              key={book.id}
              onClick={() => selectBook(book)}
            >
              <span className="book-spine" aria-hidden="true" />
              <span><strong>{book.title}</strong><small>{book.author}</small></span>
            </button>
          )) : (
            <p className="empty-library">Import an EPUB to begin. Books stay in memory for this example session.</p>
          )}
        </nav>
        {selectedBook ? (
          <div className="chapter-list">
            <span>Contents</span>
            {selectedBook.chapters.map((item) => (
              <button
                className={item.id === activeChapterId ? "active" : ""}
                type="button"
                key={item.id}
                onClick={() => setActiveChapterId(item.id)}
              >
                <em>{String(item.order + 1).padStart(2, "0")}</em>{item.title}
              </button>
            ))}
          </div>
        ) : null}
        <div className="library-footer">
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </div>
      </aside>

      <section className="reader-panel">
        <header className="reader-toolbar">
          <div>
            <span>{selectedBook?.title ?? "Your reading space"}</span>
            <strong>{activeChapter?.title ?? "Import a book to start reading"}</strong>
          </div>
          {range ? <output>{selectedLength.toLocaleString()} characters in AI range</output> : null}
        </header>
        <div className="reader-scroll">
          {chapter ? (
            <div className="reading-range-shell">
              {range ? (
                <div className="range-layer" aria-label="AI-readable START and END range">
                  <div className="range-boundary start" style={{ top: markerTops.start }}>
                    <button type="button" aria-label="Drag START" onPointerDown={(event) => startDragging("start", event)} />
                    <span><b>START</b></span>
                  </div>
                  <div className="range-boundary end" style={{ top: markerTops.end }}>
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
