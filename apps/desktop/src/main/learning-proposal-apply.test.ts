import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalLearningLibrary } from "./learning-library-service";

const directories: string[] = [];

async function libraryForTest() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-proposal-apply-"));
  directories.push(directory);
  return new LocalLearningLibrary(join(directory, "learning.sqlite"));
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function source(annotationId: string, text: string) {
  return {
    bookId: "book-1", bookTitle: "Book", chapterId: "chapter-1", chapterTitle: "Opening",
    annotationId, annotationText: text, startOffset: 1, endOffset: text.length + 1,
    sourceSentence: `A ${text} source sentence.`
  };
}

function candidate(displayForm: string, contextualMeaning = `${displayForm} meaning`) {
  return {
    displayForm, canonicalForm: displayForm.toLowerCase(), itemType: "word" as const, aliases: [],
    partOfSpeech: "noun", contextualMeaning, conciseExplanation: `${contextualMeaning} explanation`,
    cefr: "B1", pronunciation: null, collocationNotes: "manual notes"
  };
}

async function createExisting(library: LocalLearningLibrary, term: string) {
  const initial = source(`${term}-original`, term);
  const { item } = await library.createDraft({
    bookId: initial.bookId, bookTitle: initial.bookTitle, chapterId: initial.chapterId,
    chapterTitle: initial.chapterTitle,
    annotation: { id: initial.annotationId, text: initial.annotationText, start: initial.startOffset, end: initial.endOffset },
    sourceSentence: initial.sourceSentence
  });
  return library.updateItem({
    itemId: item.id, ...candidate(term, `manual ${term}`),
    conciseExplanation: `manual ${term} explanation`, collocationNotes: "keep this manual note"
  });
}

function apply(library: LocalLearningLibrary, input: unknown) {
  return (library as unknown as { applyProposalBatch(value: unknown): Promise<unknown> })
    .applyProposalBatch(input);
}

describe("LocalLearningLibrary proposal apply", () => {
  it("applies a mixed selected batch, protects unconfirmed fields and appends sources", async () => {
    const library = await libraryForTest();
    const existing = await createExisting(library, "reluctant");
    const result = await apply(library, {
      batchId: "mixed-batch",
      proposals: [
        {
          proposalId: "update", selected: true, action: "update", source: source("reluctant-new", "reluctant"),
          candidate: { ...candidate("reluctant", "unwilling"), conciseExplanation: "new concise explanation", collocationNotes: "replace me" },
          existingItemId: existing.id, expectedVersion: existing.version, confirmedFields: ["conciseExplanation"]
        },
        {
          proposalId: "create", selected: true, action: "create", source: source("new-word", "novel"),
          candidate: candidate("novel"), existingItemId: null, expectedVersion: null, confirmedFields: []
        },
        {
          proposalId: "cancelled", selected: false, action: "unchanged", source: source("cancelled", "reluctant"),
          candidate: candidate("reluctant"), existingItemId: existing.id, expectedVersion: existing.version, confirmedFields: []
        }
      ]
    });

    expect(result).toMatchObject({ created: 1, updated: 1, unchanged: 0, cancelled: 1 });
    const updated = await library.getItem(existing.id);
    expect(updated).toMatchObject({
      conciseExplanation: "new concise explanation",
      contextualMeaning: "manual reluctant",
      collocationNotes: "keep this manual note",
      sources: expect.arrayContaining([
        expect.objectContaining({ annotationId: "reluctant-original" }),
        expect.objectContaining({ annotationId: "reluctant-new" })
      ])
    });
    expect(await library.listItems({ status: "active" })).toHaveLength(2);
  });

  it("counts an update with no effective field change as unchanged while appending its source stably", async () => {
    const library = await libraryForTest();
    const existing = await createExisting(library, "steady");
    const before = await library.getItem(existing.id);

    const result = await apply(library, {
      batchId: "no-op-update",
      proposals: [{
        proposalId: "same-content", selected: true, action: "update",
        source: source("steady-new", "steady"),
        candidate: {
          ...candidate("steady", "manual steady"),
          conciseExplanation: "manual steady explanation",
          collocationNotes: "keep this manual note"
        },
        existingItemId: existing.id, expectedVersion: existing.version,
        confirmedFields: ["conciseExplanation"]
      }]
    });
    const after = await library.getItem(existing.id);

    expect(result).toMatchObject({
      created: 0, updated: 0, unchanged: 1, cancelled: 0, sourceAppended: 1,
      results: [expect.objectContaining({
        proposalId: "same-content", outcome: "unchanged", contentUpdated: false,
        sourceAppended: true
      })]
    });
    expect(after).toMatchObject({
      id: before.id,
      version: before.version,
      updatedAt: before.updatedAt,
      contextualMeaning: before.contextualMeaning,
      conciseExplanation: before.conciseExplanation
    });
    expect(after.sources).toHaveLength(2);
    expect(after.sources.map((entry) => entry.annotationId)).toEqual(expect.arrayContaining([
      "steady-original", "steady-new"
    ]));
  });

  it("creates a distinct sense and leaves unchanged content/version/timestamp stable across an idempotent replay and restart", async () => {
    const library = await libraryForTest();
    const existing = await createExisting(library, "bank");
    const before = await library.getItem(existing.id);
    const request = {
      batchId: "distinct-and-unchanged",
      proposals: [
        {
          proposalId: "distinct", selected: true, action: "create-distinct-sense",
          source: source("bank-financial", "bank"),
          candidate: candidate("bank", "financial institution"), existingItemId: null,
          expectedVersion: null, confirmedFields: []
        },
        {
          proposalId: "unchanged", selected: true, action: "unchanged",
          source: source("bank-river", "bank"), candidate: candidate("bank", "river edge"),
          existingItemId: existing.id, expectedVersion: existing.version, confirmedFields: []
        }
      ]
    };

    const first = await apply(library, request);
    const after = await library.getItem(existing.id);
    const replay = await apply(library, request);
    const restarted = new LocalLearningLibrary((library as unknown as { databasePath: string }).databasePath);

    expect(first).toMatchObject({ created: 1, updated: 0, unchanged: 1, cancelled: 0 });
    expect(replay).toEqual(first);
    expect(after).toMatchObject({
      id: before.id, version: before.version, updatedAt: before.updatedAt,
      contextualMeaning: before.contextualMeaning,
      sources: expect.arrayContaining([expect.objectContaining({ annotationId: "bank-river" })])
    });
    expect(await restarted.listItems({ status: "active" })).toHaveLength(2);
  });

  it("rejects a stale target and rolls back every proposal in the batch", async () => {
    const library = await libraryForTest();
    const existing = await createExisting(library, "stale");
    const staleRequest = {
      batchId: "stale-batch",
      proposals: [
        {
          proposalId: "update", selected: true, action: "update", source: source("stale-new", "stale"),
          candidate: candidate("stale", "AI replacement"), existingItemId: existing.id,
          expectedVersion: existing.version, confirmedFields: ["contextualMeaning"]
        },
        {
          proposalId: "create", selected: true, action: "create", source: source("would-create", "blocked"),
          candidate: candidate("blocked"), existingItemId: null, expectedVersion: null, confirmedFields: []
        }
      ]
    };
    await library.updateItem({
      itemId: existing.id, ...candidate("stale", "new manual value"),
      conciseExplanation: "new manual explanation", collocationNotes: "manual"
    });

    await expect(apply(library, staleRequest)).rejects.toThrow(/版本|重新/);
    expect(await library.listItems({ status: "active" })).toHaveLength(1);
    await expect(library.getItem(existing.id)).resolves.toMatchObject({
      contextualMeaning: "new manual value",
      sources: [expect.objectContaining({ annotationId: "stale-original" })]
    });
  });

  it("rejects invalid batch data and rolls back an earlier selected create", async () => {
    const library = await libraryForTest();
    await expect(apply(library, {
      batchId: "invalid-batch",
      proposals: [
        {
          proposalId: "create", selected: true, action: "create", source: source("valid-first", "first"),
          candidate: candidate("first"), existingItemId: null, expectedVersion: null, confirmedFields: []
        },
        {
          proposalId: "invalid", selected: true, action: "create", source: source("invalid", "second"),
          candidate: candidate("second"), existingItemId: null, expectedVersion: null, confirmedFields: ["status"]
        }
      ]
    })).rejects.toThrow(/欄位|格式|確認/);
    await expect(library.listItems({ status: "active" })).resolves.toEqual([]);
  });
});
