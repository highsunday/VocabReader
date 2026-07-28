export interface BookChapter {
  id: string;
  title: string;
  order: number;
  href: string;
  depth: number;
  fragment: string | null;
}

export type BookView = "overview" | "reader";

export interface BookReadingState {
  view: BookView;
  chapterId: string | null;
  scrollProgress: number;
}

export interface ReadingRange {
  start: number;
  end: number;
}

export interface Annotation {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface LibraryBook {
  id: string;
  epubParseVersion?: number;
  title: string;
  author: string;
  coverDataUrl: string | null;
  progressPercent: number;
  lastChapterId: string | null;
  readingState: BookReadingState;
  chapterRanges?: Record<string, ReadingRange>;
  chapterAnnotations?: Record<string, Annotation[]>;
  chapters: BookChapter[];
}

export interface ChapterContent {
  bookId: string;
  chapterId: string;
  title: string;
  fragment: string | null;
  contentHtml: string;
}

export interface SaveReadingStateInput extends BookReadingState {
  bookId: string;
}

export interface SaveReadingRangeInput {
  bookId: string;
  chapterId: string;
  range: ReadingRange;
}

export interface SaveAnnotationsInput {
  bookId: string;
  chapterId: string;
  annotations: Annotation[];
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
  saveReadingRange(input: SaveReadingRangeInput): Promise<LibraryBook>;
  saveAnnotations(input: SaveAnnotationsInput): Promise<LibraryBook>;
}
