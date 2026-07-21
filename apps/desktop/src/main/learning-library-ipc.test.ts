import { describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../shared/learning-contracts";
import { registerLearningLibraryIpc } from "./learning-library-ipc";

const item: LearningItem = {
  id: "item-1", displayForm: "word", canonicalForm: "word", itemType: "word",
  partOfSpeech: null, contextualMeaning: "", conciseExplanation: "", cefr: null,
  pronunciation: null, collocationNotes: null, status: "pending_ai",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  sources: []
};

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const library = {
    listItems: vi.fn().mockResolvedValue([item]),
    getItem: vi.fn().mockResolvedValue(item),
    createDraft: vi.fn().mockResolvedValue({ item, created: true }),
    updateItem: vi.fn().mockResolvedValue(item),
    archiveItem: vi.fn().mockResolvedValue({ ...item, status: "archived" })
  };
  registerLearningLibraryIpc({ handle(channel, listener) { handlers.set(channel, listener); } }, library);
  return { handlers, library };
}

describe("learning library IPC", () => {
  it("exposes only typed list/get/create/update/archive operations", async () => {
    const { handlers, library } = setup();
    const draft = {
      bookId: "book-1", bookTitle: "Book", chapterId: "chapter-1", chapterTitle: "Chapter",
      annotation: { id: "annotation-1", start: 0, end: 4, text: "word" },
      sourceSentence: "A word."
    };
    const update = {
      itemId: item.id, displayForm: "Word", canonicalForm: "word", itemType: "word",
      partOfSpeech: null, contextualMeaning: "meaning", conciseExplanation: "explanation",
      cefr: null, pronunciation: null, collocationNotes: null
    };

    await expect(handlers.get("learning:list")?.({}, { status: "active" })).resolves.toEqual([item]);
    await expect(handlers.get("learning:get")?.({}, item.id)).resolves.toEqual(item);
    await expect(handlers.get("learning:create-draft")?.({}, draft)).resolves.toEqual({ item, created: true });
    await expect(handlers.get("learning:update")?.({}, update)).resolves.toEqual(item);
    await expect(handlers.get("learning:archive")?.({}, item.id)).resolves.toMatchObject({ status: "archived" });
    expect(library.createDraft).toHaveBeenCalledWith(draft);
  });

  it("rejects malformed cross-process data before it reaches the repository", () => {
    const { handlers, library } = setup();
    expect(() => handlers.get("learning:list")?.({}, { status: "all" })).toThrow(/生詞庫篩選格式錯誤/);
    expect(() => handlers.get("learning:create-draft")?.({}, { bookId: "book" })).toThrow(/生詞庫草稿格式錯誤/);
    expect(() => handlers.get("learning:update")?.({}, { itemId: item.id })).toThrow(/生詞庫更新格式錯誤/);
    expect(() => handlers.get("learning:archive")?.({}, "")).toThrow(/學習項目封存格式錯誤/);
    expect(library.createDraft).not.toHaveBeenCalled();
    expect(library.updateItem).not.toHaveBeenCalled();
    expect(library.archiveItem).not.toHaveBeenCalled();
  });
});
