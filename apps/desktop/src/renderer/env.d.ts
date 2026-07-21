/// <reference types="vite/client" />

interface ReaderDesktopApi {
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
  library: {
    listBooks(): Promise<DesktopLibraryBook[]>;
    importBook(): Promise<
      | { status: "cancelled" }
      | { status: "imported" | "existing"; book: DesktopLibraryBook }
    >;
    deleteBook(bookId: string): Promise<void>;
    getChapterContent(bookId: string, chapterId: string): Promise<{
      bookId: string;
      chapterId: string;
      title: string;
      fragment: string | null;
      contentHtml: string;
    }>;
    saveReadingState(input: {
      bookId: string;
      view: "overview" | "reader";
      chapterId: string | null;
      scrollProgress: number;
    }): Promise<DesktopLibraryBook>;
    saveReadingRange(input: {
      bookId: string;
      chapterId: string;
      range: { start: number; end: number };
    }): Promise<DesktopLibraryBook>;
  };
}

interface DesktopLibraryBook {
  id: string;
  title: string;
  author: string;
  coverDataUrl: string | null;
  progressPercent: number;
  lastChapterId: string | null;
  readingState: {
    view: "overview" | "reader";
    chapterId: string | null;
    scrollProgress: number;
  };
  chapterRanges?: Record<string, { start: number; end: number }>;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    href: string;
    depth: number;
    fragment: string | null;
  }>;
}

interface Window {
  readerDesktop?: ReaderDesktopApi;
}
