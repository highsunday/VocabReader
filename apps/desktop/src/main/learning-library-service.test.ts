import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalLearningLibrary } from "./learning-library-service";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-learning-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

const source = {
  bookId: "book-1",
  bookTitle: "The First Book",
  chapterId: "chapter-1",
  chapterTitle: "Opening",
  annotation: { id: "annotation-1", start: 8, end: 13, text: "word" },
  sourceSentence: "A source word is captured."
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LocalLearningLibrary", () => {
  it("migrates a fresh SQLite database and returns a true empty active list", async () => {
    const library = new LocalLearningLibrary(join(await temporaryDirectory(), "learning.sqlite"));

    await expect(library.listItems({ status: "active" })).resolves.toEqual([]);
  });

  it("creates one pending-AI item per annotation source and survives a repository restart", async () => {
    const databasePath = join(await temporaryDirectory(), "learning.sqlite");
    const firstLibrary = new LocalLearningLibrary(databasePath);

    const created = await firstLibrary.createDraft(source);
    const repeated = await firstLibrary.createDraft(source);
    const restartedLibrary = new LocalLearningLibrary(databasePath);
    const items = await restartedLibrary.listItems({ status: "active" });

    expect(created.created).toBe(true);
    expect(repeated).toEqual({ item: created.item, created: false });
    expect(items).toEqual([created.item]);
    expect(created.item).toMatchObject({
      status: "pending_ai",
      displayForm: "word",
      canonicalForm: "word",
      itemType: "word",
      sources: [expect.objectContaining({
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        annotationText: "word",
        sourceSentence: "A source word is captured.",
        bookAvailable: true
      })]
    });
  });

  it("persists allowed edits and archive state without hard deletion", async () => {
    const library = new LocalLearningLibrary(join(await temporaryDirectory(), "learning.sqlite"));
    const { item } = await library.createDraft(source);

    const updated = await library.updateItem({
      itemId: item.id,
      displayForm: "Word",
      canonicalForm: "word",
      itemType: "word",
      partOfSpeech: "noun",
      contextualMeaning: "在本文中指一個詞",
      conciseExplanation: "待日後 AI 整理",
      cefr: "A2",
      pronunciation: "/wɜːd/",
      collocationNotes: "learn a word"
    });
    await library.archiveItem(item.id);

    await expect(library.listItems({ status: "active" })).resolves.toEqual([]);
    await expect(library.listItems({ status: "archived" })).resolves.toEqual([
      expect.objectContaining({
        status: "archived",
        displayForm: updated.displayForm,
        partOfSpeech: "noun",
        collocationNotes: "learn a word"
      })
    ]);
  });

  it("retains a source snapshot but marks it unavailable when its book disappears", async () => {
    let available = true;
    const library = new LocalLearningLibrary(
      join(await temporaryDirectory(), "learning.sqlite"),
      { isBookAvailable: async () => available }
    );
    const { item } = await library.createDraft(source);
    available = false;

    await expect(library.getItem(item.id)).resolves.toEqual(expect.objectContaining({
      sources: [expect.objectContaining({
        bookTitle: "The First Book",
        sourceSentence: "A source word is captured.",
        bookAvailable: false
      })]
    }));
  });
});
