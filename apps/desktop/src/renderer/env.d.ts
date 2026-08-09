/// <reference types="vite/client" />

import type { ChatDesktopApi } from "../shared/chat-contracts";
import type { DataBackupDesktopApi } from "../shared/data-backup-contracts";
import type { LearningDesktopApi } from "../shared/learning-contracts";
import type { SettingsDesktopApi } from "../shared/settings-contracts";
import type { SentencePracticeDesktopApi } from "../shared/sentence-practice-contracts";

declare global {
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
    saveAnnotations(input: {
      bookId: string;
      chapterId: string;
      annotations: Array<{
        id: string;
        start: number;
        end: number;
        text: string;
      }>;
    }): Promise<DesktopLibraryBook>;
  };
  learning: LearningDesktopApi;
  sentencePractice: SentencePracticeDesktopApi;
  settings: SettingsDesktopApi;
  dataBackup: DataBackupDesktopApi;
  chat: ChatDesktopApi;
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
  chapterAnnotations?: Record<string, Array<{
    id: string;
    start: number;
    end: number;
    text: string;
  }>>;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    href: string;
    contentHrefs?: string[];
    depth: number;
    fragment: string | null;
  }>;
}

interface Window {
  readerDesktop?: ReaderDesktopApi;
}
}

export {};
