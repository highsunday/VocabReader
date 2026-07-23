export type LearningItemType = "word" | "phrase";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LearningItemStatus = "active" | "trashed";
export type LearningItemSort = "recent" | "alphabetical";

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

export interface LearningItemListInput {
  status: LearningItemStatus;
  search?: string;
  itemType?: LearningItemType;
  cefr?: CefrLevel;
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

export interface LearningDesktopApi {
  listItems(input: LearningItemListInput): Promise<LearningItem[]>;
  getItem(itemId: string): Promise<LearningItem>;
  updateItem(input: UpdateLearningItemInput): Promise<LearningItem>;
  trashItem(itemId: string): Promise<LearningItem>;
  restoreItem(itemId: string): Promise<LearningItem>;
  emptyTrash(): Promise<{ deleted: number }>;
}
