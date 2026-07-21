export interface BookChapter {
  id: string;
  title: string;
  order: number;
  href: string;
}

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  coverDataUrl: string | null;
  progressPercent: number;
  lastChapterId: string | null;
  chapters: BookChapter[];
}

export type ImportBookResult =
  | { status: "cancelled" }
  | { status: "imported" | "existing"; book: LibraryBook };

export interface LibraryDesktopApi {
  listBooks(): Promise<LibraryBook[]>;
  importBook(): Promise<ImportBookResult>;
}
