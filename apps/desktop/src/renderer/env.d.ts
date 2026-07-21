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
  };
}

interface DesktopLibraryBook {
  id: string;
  title: string;
  author: string;
  coverDataUrl: string | null;
  progressPercent: number;
  lastChapterId: string | null;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    href: string;
  }>;
}

interface Window {
  readerDesktop?: ReaderDesktopApi;
}
