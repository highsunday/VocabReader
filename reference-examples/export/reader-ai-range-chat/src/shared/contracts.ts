export interface ReadingRange {
  start: number;
  end: number;
}

export interface BookChapter {
  id: string;
  title: string;
  href: string;
  order: number;
}

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  chapters: BookChapter[];
  chapterRanges: Record<string, ReadingRange>;
}

export interface ChapterContent {
  bookId: string;
  chapterId: string;
  title: string;
  contentHtml: string;
}

export type ImportBookResult =
  | { status: "cancelled" }
  | { status: "imported" | "existing"; book: LibraryBook };

export interface SaveReadingRangeInput {
  bookId: string;
  chapterId: string;
  range: ReadingRange;
}

export type ConnectionPhase =
  | "disconnected"
  | "connecting"
  | "ready"
  | "auth-required"
  | "error";

export interface ChatMessage {
  id: string;
  turnId: string | null;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "completed" | "failed";
}

export interface ChatContext {
  bookTitle?: string;
  chapterTitle?: string;
  readingSegment?: string;
}

export interface SendChatMessageInput {
  text: string;
  context?: ChatContext;
}

export interface CodexAccount {
  type: string;
  email?: string;
}

export interface ChatSnapshot {
  connection: ConnectionPhase;
  connectionDetail: string;
  account: CodexAccount | null;
  threadId: string | null;
  activeTurnId: string | null;
  messages: ChatMessage[];
}

export interface ReaderDesktopApi {
  library: {
    listBooks(): Promise<LibraryBook[]>;
    importBook(): Promise<ImportBookResult>;
    getChapterContent(bookId: string, chapterId: string): Promise<ChapterContent>;
    saveReadingRange(input: SaveReadingRangeInput): Promise<LibraryBook>;
  };
  chat: {
    getState(): Promise<ChatSnapshot>;
    connect(): Promise<ChatSnapshot>;
    sendMessage(input: SendChatMessageInput): Promise<ChatSnapshot>;
    onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
  };
}
