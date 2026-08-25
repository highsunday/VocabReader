export type LearningItemType = "word" | "phrase";
export type LearningItemLanguage = "en" | "ja" | "zh-TW" | "ko" | "other";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LearningItemStatus = "active" | "trashed";
export type LearningItemStudyStatus =
  "new" | "learning" | "due" | "scheduled";
export type LearningItemProgressStatus =
  "new" | "studying" | "familiar" | "strong";
export type LearningItemSort =
  "recent" | "alphabetical" | "study-status" | "next-due";

export interface LearningItem {
  id: string;
  title: string;
  itemType: LearningItemType;
  language: LearningItemLanguage;
  cefr: CefrLevel;
  sense: string;
  markdownContent: string;
  cautionNote?: string;
  representativeImageDataUrl?: string | null;
  status: LearningItemStatus;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface LearningLibraryItem extends LearningItem {
  studyStatus: LearningItemStudyStatus;
  nextDueAt: string | null;
}

export interface LearningItemSummary {
  id: string;
  title: string;
  itemType: LearningItemType;
  language: LearningItemLanguage;
  cefr: CefrLevel;
  sense: string;
  status: LearningItemStatus;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  studyStatus: LearningItemStudyStatus;
  nextDueAt: string | null;
}

export interface LearningItemListInput {
  status: LearningItemStatus;
  search?: string;
  itemType?: LearningItemType;
  language?: LearningItemLanguage;
  cefr?: CefrLevel;
  studyStatus?: LearningItemStudyStatus;
  progressStatus?: LearningItemProgressStatus;
  sort: LearningItemSort;
  cursor?: string;
}

export interface LearningItemPage {
  items: LearningItemSummary[];
  nextCursor: string | null;
}

export interface LearningItemCounts {
  active: number;
  trashed: number;
  progress: Record<LearningItemProgressStatus, number>;
}

export interface CreateLearningItemInput {
  title: string;
  itemType: LearningItemType;
  language: LearningItemLanguage;
  cefr: CefrLevel;
  sense: string;
  markdownContent: string;
}

export interface UpdateLearningItemInput extends CreateLearningItemInput {
  itemId: string;
  cautionNote: string;
}

export interface LearningItemDraft extends CreateLearningItemInput {
  id: string;
  state: "included" | "excluded";
  requestedTitles?: string[];
}

export interface LearningItemMatch {
  itemId: string;
  title: string;
  sense: string;
  status: "active" | "trashed";
  requestedTitles?: string[];
}

export interface LearningItemDraftBatch {
  id: string;
  status: "pending" | "submitted" | "abandoned";
  drafts: LearningItemDraft[];
  existing: LearningItemMatch[];
  trashed: LearningItemMatch[];
  submittedAt?: number;
  abandonedAt?: number;
  createdItemIds?: string[];
}

export interface UpdateLearningItemDraftInput extends CreateLearningItemInput {
  batchId: string;
  draftId: string;
}

export interface LearningItemEditSnapshot {
  sessionId: string;
  itemId: string;
  phase: "ready" | "responding" | "error";
  draft: {
    markdownContent: string;
    cautionNote: string;
  };
  hasChanges: boolean;
  status: string;
}

export interface LearningItemEditDesktopApi {
  start(itemId: string): Promise<LearningItemEditSnapshot>;
  send(sessionId: string, request: string): Promise<LearningItemEditSnapshot>;
  stop(sessionId: string): Promise<LearningItemEditSnapshot>;
  apply(sessionId: string): Promise<LearningItem>;
  discard(sessionId: string): Promise<void>;
}

export type SelectRepresentativeImageResult =
  | { status: "cancelled" }
  | { status: "updated"; item: LearningItem };

export interface LearningDesktopApi {
  listItems(input: LearningItemListInput): Promise<LearningItemPage>;
  countItems(): Promise<LearningItemCounts>;
  getItem(itemId: string): Promise<LearningItem>;
  updateItem(input: UpdateLearningItemInput): Promise<LearningItem>;
  trashItem(itemId: string): Promise<LearningItem>;
  restoreItem(itemId: string): Promise<LearningItem>;
  emptyTrash(): Promise<{ deleted: number }>;
  selectRepresentativeImage?(
    itemId: string
  ): Promise<SelectRepresentativeImageResult>;
  setRepresentativeImageFromUrl?(
    itemId: string,
    imageUrl: string
  ): Promise<LearningItem>;
  removeRepresentativeImage?(itemId: string): Promise<LearningItem>;
  aiEdit?: LearningItemEditDesktopApi;
}
