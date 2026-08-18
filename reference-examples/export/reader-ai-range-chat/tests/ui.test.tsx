import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import {
  AccountSettings,
  App,
  BookOverview,
  BookShelf,
  CodexAccountStatus,
  ReaderToolbar
} from "../src/renderer/App";
import type { LibraryBook } from "../src/shared/contracts";

const connectedSnapshot = {
  connection: "ready" as const,
  connectionDetail: "Connected as reader@example.com",
  account: { type: "chatgpt", email: "reader@example.com" },
  allowance: {
    phase: "available" as const,
    fiveHour: { remainingPercent: 75, resetsAt: 1_800_000_000 },
    weekly: { remainingPercent: 62, resetsAt: 1_800_500_000 },
    detail: "Shared account allowance loaded."
  },
  threadId: null,
  activeTurnId: null,
  messages: []
};

const book: LibraryBook = {
  id: "book-1",
  title: "Thinking in Systems",
  author: "Donella Meadows",
  coverDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  chapters: [
    { id: "chapter-1", title: "The Basics", href: "basics.xhtml", order: 0 },
    { id: "chapter-2", title: "Feedback Loops", href: "feedback.xhtml", order: 1 }
  ],
  chapterRanges: {}
};

test("the reader shell has no language-learning navigation", () => {
  const markup = renderToStaticMarkup(<App />);
  assert.match(markup, /Import EPUB/);
  assert.match(markup, /Settings/);
  assert.doesNotMatch(
    markup,
    /Review|Sentence Practice|Listen &amp; Repeat|Learning Library/
  );
});

test("Settings contains only the connected Codex Account", () => {
  const markup = renderToStaticMarkup(
    <AccountSettings
      snapshot={connectedSnapshot}
      onReconnect={() => undefined}
      onClose={() => undefined}
    />
  );
  assert.match(markup, /Account/);
  assert.match(markup, /reader@example\.com/);
  assert.match(markup, /Reconnect Codex/);
  assert.doesNotMatch(markup, /General|Voice|Review|Sentence Practice/);
});

test("the original Codex connection and allowance card stays in the sidebar", () => {
  const markup = renderToStaticMarkup(
    <CodexAccountStatus snapshot={connectedSnapshot} />
  );
  assert.match(markup, /Codex/);
  assert.match(markup, /Connected/);
  assert.match(markup, /5 hours/);
  assert.match(markup, /75%/);
  assert.match(markup, /Weekly/);
  assert.match(markup, /62%/);
});

test("the sidebar shelf shows scrollable books but not chapter navigation", () => {
  const markup = renderToStaticMarkup(
    <BookShelf books={[book]} selectedBookId={book.id} onSelect={() => undefined} />
  );
  assert.match(markup, /My library/);
  assert.match(markup, /Thinking in Systems/);
  assert.match(markup, /Donella Meadows/);
  assert.match(markup, /book-list/);
  assert.doesNotMatch(markup, /The Basics|Feedback Loops|Start reading/);
});

test("a selected book has an overview page containing its chapters", () => {
  const markup = renderToStaticMarkup(
    <BookOverview
      book={book}
      onContinue={() => undefined}
      onOpenChapter={() => undefined}
    />
  );
  assert.match(markup, /Book overview/);
  assert.match(markup, /Thinking in Systems/);
  assert.match(markup, /Start reading/);
  assert.match(markup, /Contents/);
  assert.match(markup, /The Basics/);
  assert.match(markup, /Feedback Loops/);
});

test("the reading toolbar exposes chapter navigation and text settings", () => {
  const markup = renderToStaticMarkup(
    <ReaderToolbar
      chapterTitle="Feedback Loops"
      layout={{ fontSize: 19, lineHeight: 1.9, paperWidth: 760 }}
      layoutOpen
      hasPreviousChapter
      hasNextChapter={false}
      onBack={() => undefined}
      onToggleLayout={() => undefined}
      onCloseLayout={() => undefined}
      onChangeLayout={() => undefined}
      onResetLayout={() => undefined}
      onPreviousChapter={() => undefined}
      onNextChapter={() => undefined}
    />
  );
  assert.match(markup, /Back to overview/);
  assert.match(markup, /Feedback Loops/);
  assert.match(markup, /Previous chapter/);
  assert.match(markup, /Next chapter/);
  assert.match(markup, /Text settings/);
  assert.match(markup, /Text size/);
  assert.match(markup, /Line spacing/);
  assert.match(markup, /Page width/);
  assert.match(markup, /Restore defaults/);
  assert.match(markup, /disabled=""/);
});
