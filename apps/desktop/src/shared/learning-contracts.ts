import type { Annotation } from "./library-contracts";

export type LearningItemType = "word" | "phrase";
export type LearningItemStatus = "pending_ai" | "archived";
export type LearningListStatus = "active" | "archived";

export interface LearningItemSource {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  annotationId: string;
  annotationText: string;
  startOffset: number;
  endOffset: number;
  sourceSentence: string;
  bookAvailable: boolean;
  createdAt: string;
}

export interface LearningItem {
  id: string;
  displayForm: string;
  canonicalForm: string;
  itemType: LearningItemType;
  partOfSpeech: string | null;
  contextualMeaning: string;
  conciseExplanation: string;
  cefr: string | null;
  pronunciation: string | null;
  collocationNotes: string | null;
  status: LearningItemStatus;
  createdAt: string;
  updatedAt: string;
  sources: LearningItemSource[];
}

export interface CreateLearningDraftInput {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  annotation: Annotation;
  sourceSentence: string;
}

export interface UpdateLearningItemInput {
  itemId: string;
  displayForm: string;
  canonicalForm: string;
  itemType: LearningItemType;
  partOfSpeech: string | null;
  contextualMeaning: string;
  conciseExplanation: string;
  cefr: string | null;
  pronunciation: string | null;
  collocationNotes: string | null;
}

export interface LearningDesktopApi {
  listItems(input: { status: LearningListStatus }): Promise<LearningItem[]>;
  getItem(itemId: string): Promise<LearningItem>;
  createDraft(input: CreateLearningDraftInput): Promise<{
    item: LearningItem;
    created: boolean;
  }>;
  updateItem(input: UpdateLearningItemInput): Promise<LearningItem>;
  archiveItem(itemId: string): Promise<LearningItem>;
}
