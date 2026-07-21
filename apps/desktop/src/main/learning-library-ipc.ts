import type {
  ApplyLearningProposalBatchInput,
  CreateLearningDraftInput,
  LearningDesktopApi,
  UpdateLearningItemInput
} from "../shared/learning-contracts";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

type LearningLibrary = Pick<LearningDesktopApi,
  "listItems" | "getItem" | "createDraft" | "updateItem" | "archiveItem" | "applyProposalBatch">;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validDraft(value: unknown): value is CreateLearningDraftInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<CreateLearningDraftInput>;
  const annotation = input.annotation;
  if (!annotation) return false;
  return nonEmptyString(input.bookId) && nonEmptyString(input.bookTitle) &&
    nonEmptyString(input.chapterId) && nonEmptyString(input.chapterTitle) &&
    nonEmptyString(input.sourceSentence) &&
    nonEmptyString(annotation.id) && nonEmptyString(annotation.text) &&
    Number.isInteger(annotation.start) && Number.isInteger(annotation.end) &&
    annotation.start >= 0 && annotation.end > annotation.start;
}

function validUpdate(value: unknown): value is UpdateLearningItemInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<UpdateLearningItemInput>;
  return nonEmptyString(input.itemId) && nonEmptyString(input.displayForm) &&
    nonEmptyString(input.canonicalForm) && (input.itemType === "word" || input.itemType === "phrase") &&
    nullableString(input.partOfSpeech) && nonEmptyString(input.contextualMeaning) &&
    nonEmptyString(input.conciseExplanation) && nullableString(input.cefr) &&
    nullableString(input.pronunciation) && nullableString(input.collocationNotes);
}

function validProposalApply(value: unknown): value is ApplyLearningProposalBatchInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<ApplyLearningProposalBatchInput>;
  if (!nonEmptyString(input.batchId) || !Array.isArray(input.proposals) || !input.proposals.length) {
    return false;
  }
  return input.proposals.every((proposal) => {
    if (!proposal || typeof proposal !== "object") return false;
    const value = proposal as ApplyLearningProposalBatchInput["proposals"][number];
    return nonEmptyString(value.proposalId) && typeof value.selected === "boolean" &&
      ["create", "update", "unchanged", "create-distinct-sense"].includes(value.action) &&
      value.source && nonEmptyString(value.source.bookId) && nonEmptyString(value.source.bookTitle) &&
      nonEmptyString(value.source.chapterId) && nonEmptyString(value.source.chapterTitle) &&
      nonEmptyString(value.source.annotationId) && nonEmptyString(value.source.annotationText) &&
      Number.isInteger(value.source.startOffset) && Number.isInteger(value.source.endOffset) &&
      value.source.endOffset > value.source.startOffset && nonEmptyString(value.source.sourceSentence) &&
      value.candidate && nonEmptyString(value.candidate.displayForm) &&
      nonEmptyString(value.candidate.canonicalForm) &&
      (value.candidate.itemType === "word" || value.candidate.itemType === "phrase") &&
      Array.isArray(value.candidate.aliases) && nullableString(value.candidate.partOfSpeech) &&
      nonEmptyString(value.candidate.contextualMeaning) &&
      nonEmptyString(value.candidate.conciseExplanation) &&
      nullableString(value.candidate.cefr) && nullableString(value.candidate.pronunciation) &&
      nullableString(value.candidate.collocationNotes) &&
      (value.existingItemId === null || nonEmptyString(value.existingItemId)) &&
      (value.expectedVersion === null || Number.isInteger(value.expectedVersion)) &&
      Array.isArray(value.confirmedFields);
  });
}

export function registerLearningLibraryIpc(
  ipc: IpcRegistrar,
  library: LearningLibrary
): void {
  ipc.handle("learning:list", (_event, rawInput) => {
    if (!rawInput || typeof rawInput !== "object" ||
      ((rawInput as { status?: unknown }).status !== "active" &&
      (rawInput as { status?: unknown }).status !== "archived")) {
      throw new Error("生詞庫篩選格式錯誤");
    }
    return library.listItems(rawInput as { status: "active" | "archived" });
  });
  ipc.handle("learning:get", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("學習項目請求格式錯誤");
    return library.getItem(itemId);
  });
  ipc.handle("learning:create-draft", (_event, rawInput) => {
    if (!validDraft(rawInput)) throw new Error("生詞庫草稿格式錯誤");
    return library.createDraft(rawInput);
  });
  ipc.handle("learning:update", (_event, rawInput) => {
    if (!validUpdate(rawInput)) throw new Error("生詞庫更新格式錯誤");
    return library.updateItem(rawInput);
  });
  ipc.handle("learning:archive", (_event, itemId) => {
    if (!nonEmptyString(itemId)) throw new Error("學習項目封存格式錯誤");
    return library.archiveItem(itemId);
  });
  ipc.handle("learning:apply-proposal-batch", (_event, rawInput) => {
    if (!validProposalApply(rawInput)) throw new Error("學習卡套用格式錯誤");
    return library.applyProposalBatch(rawInput);
  });
}
