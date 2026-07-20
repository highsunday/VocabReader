import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type WorkspaceMode = "reader" | "review";

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

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>("reader");
  const [bookName, setBookName] = useState<string>();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);

  const displayBookName = useMemo(
    () => bookName?.replace(/\.epub$/i, "") ?? "尚未導入書籍",
    [bookName]
  );

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setBookName(file.name);
      setMode("reader");
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

        <label className="import-button">
          <input
            aria-label="導入 EPUB"
            accept=".epub,application/epub+zip"
            type="file"
            onChange={handleImport}
          />
          ＋ 導入 EPUB
        </label>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="主要導覽">
          <div className="book-summary">
            <span className="eyebrow">目前書籍</span>
            <strong>{displayBookName}</strong>
            <span>{bookName ? "準備開始閱讀" : "從 EPUB 建立你的閱讀書庫"}</span>
          </div>

          <nav>
            <button
              className={mode === "reader" ? "nav-item active" : "nav-item"}
              onClick={() => setMode("reader")}
            >
              <span>▤</span>
              章節閱讀
            </button>
            <button
              className={mode === "review" ? "nav-item active" : "nav-item"}
              onClick={() => setMode("review")}
            >
              <span>↻</span>
              Anki 複習
              <em>10</em>
            </button>
          </nav>

          <div className="learning-map">
            <span className="eyebrow">章節機制</span>
            <ol>
              <li>閱讀與劃線</li>
              <li>AI 集中解析</li>
              <li>加入生詞庫</li>
              <li>章末選擇題</li>
            </ol>
            <p>Anki 複習是另一套獨立排程。</p>
          </div>
        </aside>

        <main className="content">
          {mode === "reader" ? (
            <section className="reader-panel" aria-labelledby="reader-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Chapter workspace</span>
                  <h1 id="reader-title">
                    {bookName ? displayBookName : "導入 EPUB 開始閱讀"}
                  </h1>
                </div>
                <button className="quiet-button" disabled={!bookName}>
                  完成本章
                </button>
              </div>

              <div className="empty-reader">
                <span className="book-icon">Aa</span>
                <h2>{bookName ? "EPUB 解析器待接入" : "你的閱讀空間已準備好"}</h2>
                <p>
                  原文會顯示在這裡。第一次閱讀先劃線標記，完成後再讓 AI
                  集中解析。
                </p>
                <div className="flow-tags" aria-label="章節學習流程">
                  <span>閱讀標記</span>
                  <span>AI 解析</span>
                  <span>生詞庫</span>
                  <span>章末選擇題</span>
                </div>
              </div>
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
            <span>{mode === "reader" ? "章節上下文" : "複習上下文"}</span>
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
    </div>
  );
}

