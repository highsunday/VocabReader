export interface BookChapter {
  id: string;
  title: string;
  order: number;
  href: string;
}

export type BookView = "overview" | "reader";

export interface BookReadingState {
  view: BookView;
  chapterId: string | null;
  scrollProgress: number;
}

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  coverDataUrl: string | null;
  progressPercent: number;
  lastChapterId: string | null;
  readingState: BookReadingState;
  chapters: BookChapter[];
}

export interface ChapterContent {
  bookId: string;
  chapterId: string;
  title: string;
  contentHtml: string;
}

export interface SaveReadingStateInput extends BookReadingState {
  bookId: string;
}

export type ImportBookResult =
  | { status: "cancelled" }
  | { status: "imported" | "existing"; book: LibraryBook };

export interface LibraryDesktopApi {
  listBooks(): Promise<LibraryBook[]>;
  importBook(): Promise<ImportBookResult>;
  deleteBook(bookId: string): Promise<void>;
  getChapterContent(bookId: string, chapterId: string): Promise<ChapterContent>;
  saveReadingState(input: SaveReadingStateInput): Promise<LibraryBook>;
}
