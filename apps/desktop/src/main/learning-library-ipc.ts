import type {
  CefrLevel,
  LearningDesktopApi,
  LearningItemListInput,
  LearningItemSort,
  LearningItemStatus,
  LearningItemStudyStatus,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

type LearningLibrary = Pick<
  LearningDesktopApi,
  "listItems" | "getItem" | "updateItem" | "trashItem" | "restoreItem" | "emptyTrash"
>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validType(value: unknown): value is LearningItemType {
  return value === "word" || value === "phrase";
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
    (input.cefr === undefined || validCefr(input.cefr)) &&
    (input.studyStatus === undefined ||
      validStudyStatus(input.studyStatus));
}

function validUpdate(value: unknown): value is UpdateLearningItemInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<UpdateLearningItemInput>;
  return nonEmptyString(input.itemId) &&
    nonEmptyString(input.title) &&
    validType(input.itemType) &&
    validCefr(input.cefr) &&
    nonEmptyString(input.sense) &&
    nonEmptyString(input.markdownContent);
}

export function registerLearningLibraryIpc(
  ipc: IpcRegistrar,
  library: LearningLibrary
): void {
  ipc.handle("learning:list", (_event, input) => {
    if (!validListInput(input)) throw new Error("生詞庫查詢格式錯誤");
    return library.listItems(input);
  });
  ipc.handle("learning:get", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("學習項目請求格式錯誤");
    return library.getItem(itemId);
  });
  ipc.handle("learning:update", (_event, input) => {
    if (!validUpdate(input)) throw new Error("學習項目更新格式錯誤");
    return library.updateItem(input);
  });
  ipc.handle("learning:trash", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("學習項目刪除格式錯誤");
    return library.trashItem(itemId);
  });
  ipc.handle("learning:restore", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("學習項目還原格式錯誤");
    return library.restoreItem(itemId);
  });
  ipc.handle("learning:empty-trash", () => library.emptyTrash());
}
