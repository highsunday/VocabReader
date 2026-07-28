export type LearningItemType = "word" | "phrase";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LearningItemStatus = "active" | "trashed";
export type LearningItemStudyStatus =
  "new" | "learning" | "due" | "scheduled";
export type LearningItemSort =
  "recent" | "alphabetical" | "study-status" | "next-due";

export interface LearningItem {
  id: string;
  title: string;
  itemType: LearningItemType;
  cefr: CefrLevel;
  sense: string;
  markdownContent: string;
  status: LearningItemStatus;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface LearningLibraryItem extends LearningItem {
  studyStatus: LearningItemStudyStatus;
  nextDueAt: string | null;
}

export interface LearningItemListInput {
  status: LearningItemStatus;
  search?: string;
  itemType?: LearningItemType;
  cefr?: CefrLevel;
  studyStatus?: LearningItemStudyStatus;
  sort: LearningItemSort;
}

export interface CreateLearningItemInput {
  title: string;
  itemType: LearningItemType;
  cefr: CefrLevel;
  sense: string;
  markdownContent: string;
}

export interface UpdateLearningItemInput extends CreateLearningItemInput {
  itemId: string;
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

export interface LearningDesktopApi {
  listItems(input: LearningItemListInput): Promise<LearningLibraryItem[]>;
  getItem(itemId: string): Promise<LearningItem>;
  updateItem(input: UpdateLearningItemInput): Promise<LearningItem>;
  trashItem(itemId: string): Promise<LearningItem>;
  restoreItem(itemId: string): Promise<LearningItem>;
  emptyTrash(): Promise<{ deleted: number }>;
}
