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
  version: number;
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
  applyProposalBatch(input: ApplyLearningProposalBatchInput): Promise<ApplyLearningProposalBatchResult>;
}

export interface GenerateLearningCardsInput { bookId: string; bookTitle: string; chapterId: string; chapterTitle: string; readingSegment: string; explanationLanguage: "source" | "zh-TW" | "en" | "ja"; sources: Array<{ annotationId: string; annotationText: string; startOffset: number; endOffset: number; sourceSentence: string }>; }
export type LearningProposalAction = "create" | "update" | "unchanged" | "create-distinct-sense";
export type LearningProposalField = "displayForm" | "canonicalForm" | "itemType" | "partOfSpeech" | "contextualMeaning" | "conciseExplanation" | "cefr" | "pronunciation" | "collocationNotes";
export interface LearningProposalCandidate {
  displayForm: string; canonicalForm: string; itemType: LearningItemType; aliases: string[];
  partOfSpeech: string | null; contextualMeaning: string; conciseExplanation: string;
  cefr: string | null; pronunciation: string | null; collocationNotes: string | null;
}
export type LearningProposalSource = GenerateLearningCardsInput["sources"][number] & {
  bookId: string; bookTitle: string; chapterId: string; chapterTitle: string;
};
export interface LearningProposalResult { proposals: Array<{ action: LearningProposalAction; source: GenerateLearningCardsInput["sources"][number]; candidate: LearningProposalCandidate; existingItem: LearningItem | null; fieldDiffs: Array<{ field: LearningProposalField; from: string | null; to: string | null }> }>; }
export interface ApplyLearningProposalBatchInput {
  batchId: string;
  proposals: Array<{
    proposalId: string; selected: boolean; action: LearningProposalAction;
    source: LearningProposalSource; candidate: LearningProposalCandidate;
    existingItemId: string | null; expectedVersion: number | null;
    confirmedFields: LearningProposalField[];
  }>;
}
export interface ApplyLearningProposalBatchResult {
  batchId: string; created: number; updated: number; unchanged: number; cancelled: number;
  sourceAppended: number;
  results: Array<{ proposalId: string; action: LearningProposalAction; itemId: string | null; sourceAppended: boolean; contentUpdated: boolean; outcome: "created" | "updated" | "unchanged" | "cancelled" }>;
}
