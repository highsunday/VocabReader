import type {
  CefrLevel,
  LearningItemCounts,
  LearningDesktopApi,
  LearningItemListInput,
  LearningItemLanguage,
  LearningItemPage,
  LearningItemSort,
  LearningItemStatus,
  LearningItemStudyStatus,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

interface LearningLibrary extends Pick<
  LearningDesktopApi,
  "getItem" | "updateItem" | "trashItem" | "restoreItem" | "emptyTrash"
> {
  listItemPage(input: LearningItemListInput): Promise<LearningItemPage>;
  countItems(): Promise<LearningItemCounts>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validType(value: unknown): value is LearningItemType {
  return value === "word" || value === "phrase";
}

function validLanguage(value: unknown): value is LearningItemLanguage {
  return value === "en" || value === "ja" || value === "zh-TW" ||
    value === "other";
}

function validCefr(value: unknown): value is CefrLevel {
  return value === "A1" || value === "A2" || value === "B1" ||
    value === "B2" || value === "C1" || value === "C2";
}

function validStatus(value: unknown): value is LearningItemStatus {
  return value === "active" || value === "trashed";
}

function validSort(value: unknown): value is LearningItemSort {
  return value === "recent" || value === "alphabetical" ||
    value === "study-status" || value === "next-due";
}

function validStudyStatus(value: unknown): value is LearningItemStudyStatus {
  return value === "new" || value === "learning" ||
    value === "due" || value === "scheduled";
}

function validListInput(value: unknown): value is LearningItemListInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<LearningItemListInput>;
  return validStatus(input.status) &&
    validSort(input.sort) &&
    (input.search === undefined || typeof input.search === "string") &&
    (input.itemType === undefined || validType(input.itemType)) &&
    (input.language === undefined || validLanguage(input.language)) &&
    (input.cefr === undefined || validCefr(input.cefr)) &&
    (input.studyStatus === undefined ||
      validStudyStatus(input.studyStatus)) &&
    (input.cursor === undefined ||
      (nonEmptyString(input.cursor) && input.cursor.length <= 4096));
}

function validUpdate(value: unknown): value is UpdateLearningItemInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<UpdateLearningItemInput>;
  return nonEmptyString(input.itemId) &&
    nonEmptyString(input.title) &&
    validType(input.itemType) &&
    validLanguage(input.language) &&
    validCefr(input.cefr) &&
    nonEmptyString(input.sense) &&
    nonEmptyString(input.markdownContent) &&
    typeof input.cautionNote === "string";
}

export function registerLearningLibraryIpc(
  ipc: IpcRegistrar,
  library: LearningLibrary
): void {
  ipc.handle("learning:list", (_event, input) => {
    if (!validListInput(input)) throw new Error("Invalid Learning Library query");
    return library.listItemPage(input);
  });
  ipc.handle("learning:counts", () => library.countItems());
  ipc.handle("learning:get", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("Invalid learning-item request");
    return library.getItem(itemId);
  });
  ipc.handle("learning:update", (_event, input) => {
    if (!validUpdate(input)) throw new Error("Invalid learning-item update");
    return library.updateItem(input);
  });
  ipc.handle("learning:trash", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("Invalid learning-item deletion");
    return library.trashItem(itemId);
  });
  ipc.handle("learning:restore", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("Invalid learning-item restore");
    return library.restoreItem(itemId);
  });
  ipc.handle("learning:empty-trash", () => library.emptyTrash());
}
