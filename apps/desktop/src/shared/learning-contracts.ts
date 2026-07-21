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
  generateProposals(input: GenerateLearningCardsInput): Promise<LearningProposalResult>;
}

export interface GenerateLearningCardsInput { bookId: string; bookTitle: string; chapterId: string; chapterTitle: string; readingSegment: string; explanationLanguage: "source" | "zh-TW" | "en" | "ja"; sources: Array<{ annotationId: string; annotationText: string; startOffset: number; endOffset: number; sourceSentence: string }>; }
export interface LearningProposalResult { proposals: Array<{ action: "create" | "update" | "unchanged" | "create-distinct-sense"; source: GenerateLearningCardsInput["sources"][number]; candidate: { displayForm: string; canonicalForm: string; itemType: LearningItemType; contextualMeaning: string; conciseExplanation: string }; existingItem: LearningItem | null; fieldDiffs: Array<{ field: string; from: string | null; to: string | null }> }>; }
