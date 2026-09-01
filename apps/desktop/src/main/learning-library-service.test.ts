// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalLearningLibrary,
  MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION,
  sentencePracticeMeaning
} from "./learning-library-service";

const temporaryDirectories: string[] = [];

async function databasePath() {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-learning-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "learning.sqlite");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EBUSY") throw error;
      })
  ));
});

describe("LocalLearningLibrary", () => {
  it("persists a memory tip and migrates legacy items to an empty tip", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path, { seedMockItems: false });
    const created = await library.createItem({
      title: "reluctant",
      itemType: "word",
      language: "en",
      cefr: "B2",
      sense: "unwilling or hesitant",
      memoryTip: "想像門已打開，但你的腳還黏在地上，不情願踏出去。",
      markdownContent: "## Meaning\n不情願。"
    });

    expect(created.memoryTip).toBe(
      "想像門已打開，但你的腳還黏在地上，不情願踏出去。"
    );
    expect(MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION).toBe(8);

    library.close();
    const database = new DatabaseSync(path);
    const row = database.prepare(
      "SELECT memory_tip FROM learning_items WHERE id = ?"
    ).get(created.id) as { memory_tip: string };
    const migration = database.prepare(
      "SELECT MAX(version) AS version FROM schema_migrations"
    ).get() as { version: number };
    database.close();

    expect(row.memory_tip).toBe(created.memoryTip);
    expect(migration.version).toBe(8);

    const reopened = new LocalLearningLibrary(path, { seedMockItems: false });
    const page = await reopened.listItemPage({ status: "active", sort: "recent" });
    expect(page.items.find(({ id }) => id === created.id))
      .not.toHaveProperty("memoryTip");
    const review = await reopened.getReviewSummary("2026-09-01T08:00:00.000Z");
    expect(review.selectedItems.find(({ id }) => id === created.id))
      .not.toHaveProperty("memoryTip");
    reopened.close();
  });

  it("persists one representative image without adding it to list summaries", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 20,
        dailyDueReviewCompletionLimit: 20,
        reviewPaperSize: 20
      })
    });
    const created = await library.createItem({
      title: "ibex",
      itemType: "word",
      language: "en",
      cefr: "B2",
      sense: "a wild mountain goat",
      markdownContent: "## Meaning\n一種野生山羊。"
    });
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02]);
    const imageLibrary = library as unknown as {
      setRepresentativeImage(itemId: string, jpegBytes: Buffer): Promise<{
        representativeImageDataUrl: string | null;
      }>;
      removeRepresentativeImage(itemId: string): Promise<{
        representativeImageDataUrl: string | null;
      }>;
    };

    const withImage = await imageLibrary.setRepresentativeImage(created.id, imageBytes);
    expect(withImage.representativeImageDataUrl).toBe(
      `data:image/jpeg;base64,${imageBytes.toString("base64")}`
    );
    const page = await library.listItemPage({ status: "active", sort: "recent" });
    expect(page.items.find(({ id }) => id === created.id))
      .not.toHaveProperty("representativeImageDataUrl");
    const review = await library.getReviewSummary("2026-08-10T08:00:00.000Z");
    expect(review.selectedItems.find(({ id }) => id === created.id))
      .not.toHaveProperty("representativeImageDataUrl");

    await library.updateItem({
      itemId: created.id,
      title: created.title,
      itemType: created.itemType,
      language: created.language,
      cefr: created.cefr,
      sense: "a sure-footed wild mountain goat",
      markdownContent: created.markdownContent,
      memoryTip: created.memoryTip ?? "",
      cautionNote: ""
    });
    expect((await library.getItem(created.id)).representativeImageDataUrl)
      .toBe(withImage.representativeImageDataUrl);
    const beforeAiEdit = await library.getItem(created.id);
    await library.applyAiEdit({
      itemId: created.id,
      baseUpdatedAt: beforeAiEdit.updatedAt,
      markdownContent: `${beforeAiEdit.markdownContent}\n\n## Habitat\nRocky mountains.`,
      memoryTip: beforeAiEdit.memoryTip ?? "",
      cautionNote: ""
    });
    expect((await library.getItem(created.id)).representativeImageDataUrl)
      .toBe(withImage.representativeImageDataUrl);

    await library.trashItem(created.id);
    expect((await library.getItem(created.id)).representativeImageDataUrl)
      .toBe(withImage.representativeImageDataUrl);
    await library.restoreItem(created.id);
    expect((await library.getItem(created.id)).representativeImageDataUrl)
      .toBe(withImage.representativeImageDataUrl);

    const withoutImage = await imageLibrary.removeRepresentativeImage(created.id);
    expect(withoutImage.representativeImageDataUrl).toBeNull();
    expect(MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION).toBe(8);

    await imageLibrary.setRepresentativeImage(created.id, imageBytes);
    await library.trashItem(created.id);
    await expect(imageLibrary.setRepresentativeImage(created.id, imageBytes))
      .rejects.toThrow(/editable learning item/);
    await library.emptyTrash();
    await expect(library.getItem(created.id)).rejects.toThrow(/not found/);
  });

  it("uses the first Meaning paragraph and falls back to the target sense", () => {
    expect(sentencePracticeMeaning(
      "# Card\n\n## Meaning\n第一行\n第二行\n\n## Examples\n1. Example.",
      "fallback sense"
    )).toBe("第一行 第二行");
    expect(sentencePracticeMeaning(
      "## Examples\n1. Example.",
      "fallback sense"
    )).toBe("fallback sense");
    expect(sentencePracticeMeaning(
      "## Meaning\n\n## Examples\n1. Example.",
      "fallback sense"
    )).toBe("fallback sense");
  });

  it("selects only active reviewed English items for integrated sentence practice", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const reviewedEnglish = await Promise.all([
      library.createItem({
        title: "create",
        itemType: "word",
        language: "en",
        cefr: "A2",
        sense: "make something",
        markdownContent: "## Meaning\n創造；製作。\n\n## Examples\n1. We created a plan."
      }),
      library.createItem({
        title: "on the verge of",
        itemType: "phrase",
        language: "en",
        cefr: "C1",
        sense: "very close to happening",
        markdownContent: "## Meaning\n瀕臨；即將發生。\n\n## Examples\n1. She was on the verge of tears."
      }),
      library.createItem({
        title: "reflect",
        itemType: "word",
        language: "en",
        cefr: "B2",
        sense: "think carefully",
        markdownContent: "## Meaning\n仔細思考。\n\n## Examples\n1. He reflected on the choice."
      })
    ]);
    const reviewedJapanese = await library.createItem({
      title: "食べる",
      itemType: "word",
      language: "ja",
      cefr: "A1",
      sense: "to eat",
      markdownContent: "## Meaning\n食べ物を口にする。"
    });
    const reviewedTrash = await library.createItem({
      title: "discarded",
      itemType: "word",
      language: "en",
      cefr: "B1",
      sense: "thrown away",
      markdownContent: "## Meaning\n丟棄的。"
    });
    await library.createItem({
      title: "brand-new",
      itemType: "word",
      language: "en",
      cefr: "A1",
      sense: "completely new",
      markdownContent: "## Meaning\n全新的。"
    });
    await library.confirmReviewSession({
      sessionId: "sentence-practice-eligibility",
      reviewedAt: "2026-08-01T08:00:00.000Z",
      ratings: [
        ...reviewedEnglish.map((item) => ({
          itemId: item.id,
          aiRating: "good" as const,
          finalRating: "good" as const,
          answer: "reviewed"
        })),
        {
          itemId: reviewedJapanese.id,
          aiRating: "good",
          finalRating: "good",
          answer: "reviewed"
        },
        {
          itemId: reviewedTrash.id,
          aiRating: "good",
          finalRating: "good",
          answer: "reviewed"
        }
      ]
    });
    await library.trashItem(reviewedTrash.id);

    const sentencePracticeLibrary = library as unknown as {
      getSentencePracticeEligibleCount(): Promise<number>;
      selectSentencePracticeItems(count: number): Promise<Array<{
        id: string;
        title: string;
        meaning: string;
      }>>;
    };

    const reviewBeforeSelection = await library.getItemReviewDetail(
      reviewedEnglish[0].id,
      "2026-08-01T08:01:00.000Z"
    );
    await expect(sentencePracticeLibrary.getSentencePracticeEligibleCount())
      .resolves.toBe(3);
    const selected = await sentencePracticeLibrary.selectSentencePracticeItems(2);
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map(({ id }) => id))).toHaveLength(2);
    expect(selected.every((item) =>
      reviewedEnglish.some(({ id }) => id === item.id)
    )).toBe(true);
    expect(selected.every(({ meaning }) => meaning.length > 0)).toBe(true);
    await expect(library.getItemReviewDetail(
      reviewedEnglish[0].id,
      "2026-08-01T08:01:00.000Z"
    )).resolves.toEqual(reviewBeforeSelection);
  });

  it("migrates and seeds ten stable examples exactly once", async () => {
    const path = await databasePath();
    const first = new LocalLearningLibrary(path);
    const seeded = await first.listItems({ status: "active", sort: "recent" });
    const restarted = new LocalLearningLibrary(path);

    expect(seeded).toHaveLength(10);
    expect(new Set(seeded.map((item) => item.itemType))).toEqual(
      new Set(["word", "phrase"])
    );
    expect(new Set(seeded.map((item) => item.cefr))).toEqual(
      new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
    );
    expect(seeded.filter((item) => item.title === "bank")).toHaveLength(2);
    expect(seeded.every((item) =>
      item.markdownContent.includes("## Examples") &&
      (item.markdownContent.match(/^\d+\./gm)?.length ?? 0) >= 3
    )).toBe(true);
    await expect(
      restarted.listItems({ status: "active", sort: "recent" })
    ).resolves.toEqual(seeded);
  });

  it("migrates legacy review answers and backfills learning-item language and caution", async () => {
    const path = await databasePath();
    const legacy = new LocalLearningLibrary(path);
    await legacy.listItems({ status: "active", sort: "recent" });
    legacy.close();

    const legacyDatabase = new DatabaseSync(path);
    const legacyColumns = legacyDatabase.prepare(
      "PRAGMA table_info(learning_review_events)"
    ).all() as unknown as Array<{ name: string }>;
    if (legacyColumns.some(({ name }) => name === "answer")) {
      legacyDatabase.exec("ALTER TABLE learning_review_events DROP COLUMN answer");
    }
    const legacyItemColumns = legacyDatabase.prepare(
      "PRAGMA table_info(learning_items)"
    ).all() as unknown as Array<{ name: string }>;
    if (legacyItemColumns.some(({ name }) => name === "language")) {
      legacyDatabase.exec(
        "DROP INDEX IF EXISTS learning_items_status_language_created_idx"
      );
      legacyDatabase.exec("ALTER TABLE learning_items DROP COLUMN language");
    }
    if (legacyItemColumns.some(({ name }) => name === "caution_note")) {
      legacyDatabase.exec("ALTER TABLE learning_items DROP COLUMN caution_note");
    }
    if (legacyItemColumns.some(({ name }) => name === "representative_image")) {
      legacyDatabase.exec("ALTER TABLE learning_items DROP COLUMN representative_image");
    }
    legacyDatabase.prepare(
      "DELETE FROM schema_migrations WHERE version >= 4"
    ).run();
    legacyDatabase.close();

    const migrated = new LocalLearningLibrary(path);
    await migrated.listItems({ status: "active", sort: "recent" });
    migrated.close();

    const migratedDatabase = new DatabaseSync(path);
    const columns = migratedDatabase.prepare(
      "PRAGMA table_info(learning_review_events)"
    ).all() as unknown as Array<{ name: string; notnull: number }>;
    const itemColumns = migratedDatabase.prepare(
      "PRAGMA table_info(learning_items)"
    ).all() as unknown as Array<{ name: string; notnull: number }>;
    const languages = migratedDatabase.prepare(
      "SELECT DISTINCT language FROM learning_items"
    ).all() as unknown as Array<{ language: string }>;
    const cautions = migratedDatabase.prepare(
      "SELECT DISTINCT caution_note FROM learning_items"
    ).all() as unknown as Array<{ caution_note: string }>;
    const migration = migratedDatabase.prepare(
      "SELECT MAX(version) AS version FROM schema_migrations"
    ).get() as { version: number };
    migratedDatabase.close();

    expect(columns.find(({ name }) => name === "answer")).toMatchObject({
      name: "answer",
      notnull: 0
    });
    expect(itemColumns.find(({ name }) => name === "language")).toMatchObject({
      name: "language",
      notnull: 1
    });
    expect(itemColumns.find(({ name }) => name === "caution_note")).toMatchObject({
      name: "caution_note",
      notnull: 1
    });
    expect(itemColumns.find(({ name }) => name === "representative_image"))
      .toMatchObject({ name: "representative_image", notnull: 0 });
    expect(languages).toEqual([{ language: "en" }]);
    expect(cautions).toEqual([{ caution_note: "" }]);
    expect(migration.version).toBe(8);
  });

  it("never reseeds after every example is permanently removed", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    const items = await library.listItems({ status: "active", sort: "recent" });
    for (const item of items) await library.trashItem(item.id);
    await library.emptyTrash();

    const restarted = new LocalLearningLibrary(path);
    await expect(
      restarted.listItems({ status: "active", sort: "recent" })
    ).resolves.toEqual([]);
  });

  it("searches only titles and combines type, CEFR, and sort filters", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    await library.createItem({
      title: "ordinary",
      itemType: "word",
      language: "en" as const,
      cefr: "B2",
      sense: "search boundary",
      markdownContent: "## Meaning\nThis content mentions fastidious."
    });

    const titleMatches = await library.listItems({
      status: "active",
      search: "FAST",
      sort: "alphabetical"
    });
    const filtered = await library.listItems({
      status: "active",
      itemType: "phrase",
      language: "en" as const,
      cefr: "B2",
      sort: "alphabetical"
    });

    expect(titleMatches.map((item) => item.title)).toEqual(["fastidious"]);
    expect(filtered.map((item) => item.title)).toEqual(["take for granted"]);
  });

  it("persists learning-item language and filters pages before limiting results", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const japanese = await library.createItem({
      title: "食べる",
      itemType: "word",
      language: "ja",
      cefr: "A1",
      sense: "to eat",
      markdownContent: "## Meaning\n食べ物を口にする。"
    } as Parameters<typeof library.createItem>[0]);
    await library.createItem({
      title: "bonjour",
      itemType: "word",
      language: "other",
      cefr: "A1",
      sense: "hello",
      markdownContent: "## Meaning\nHello."
    } as Parameters<typeof library.createItem>[0]);

    expect(japanese.language).toBe("ja");
    await expect(library.listItemPage({
      status: "active",
      language: "ja",
      sort: "recent"
    } as Parameters<typeof library.listItemPage>[0])).resolves.toMatchObject({
      items: [expect.objectContaining({ title: "食べる", language: "ja" })]
    });
    await expect(library.listItemPage({
      status: "active",
      language: "fr",
      sort: "recent"
    } as unknown as Parameters<typeof library.listItemPage>[0])).rejects.toThrow(
      "Invalid learning-item language filter"
    );
  });

  it("returns fixed-size summary pages and counts without full learning-item content", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    for (let index = 0; index < 45; index += 1) {
      await library.createItem({
        title: `paged item ${String(index).padStart(2, "0")}`,
        itemType: "word",
      language: "en" as const,
        cefr: "A1",
        sense: `page fixture ${index}`,
        markdownContent: `## Meaning\nprivate content ${index}`
      });
    }

    const first = await library.listItemPage({
      status: "active",
      sort: "alphabetical"
    }, new Date("2026-07-31T00:00:00.000Z"));
    const second = await library.listItemPage({
      status: "active",
      sort: "alphabetical",
      cursor: first.nextCursor ?? undefined
    }, new Date("2026-07-31T00:00:00.000Z"));

    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items]).toHaveLength(55);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)))
      .toHaveLength(55);
    expect(first.items[0]).not.toHaveProperty("markdownContent");
    await expect(library.countItems()).resolves.toEqual({
      active: 55,
      trashed: 0,
      progress: { new: 55, studying: 0, familiar: 0, strong: 0 }
    });
  });

  it("rejects cursors reused with a different Learning Library query", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    for (let index = 0; index < 45; index += 1) {
      await library.createItem({
        title: `cursor item ${index}`,
        itemType: "word",
      language: "en" as const,
        cefr: "A1",
        sense: `cursor fixture ${index}`,
        markdownContent: "## Meaning\ncursor fixture"
      });
    }
    const first = await library.listItemPage({
      status: "active",
      sort: "recent"
    });

    await expect(library.listItemPage({
      status: "active",
      search: "cursor",
      sort: "recent",
      cursor: first.nextCursor ?? undefined
    })).rejects.toThrow(/cursor/);
    await expect(library.listItemPage({
      status: "active",
      sort: "recent",
      cursor: "not-a-valid-cursor"
    })).rejects.toThrow(/cursor/);
  });

  it("keeps list pages bounded with ten thousand learning items", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    await library.listItemPage({ status: "active", sort: "recent" });
    library.close();

    const database = new DatabaseSync(path);
    const insert = database.prepare(`
      INSERT INTO learning_items (
        id, title, item_type, cefr, sense, markdown_content, status,
        created_at, updated_at, trashed_at
      ) VALUES (?, ?, 'word', 'A1', ?, ?, 'active', ?, ?, NULL)
    `);
    database.exec("BEGIN");
    for (let index = 10; index < 10_000; index += 1) {
      const id = `scale-${String(index).padStart(5, "0")}`;
      const timestamp = new Date(1_700_000_000_000 + index).toISOString();
      insert.run(
        id,
        `scale item ${index}`,
        `scale sense ${index}`,
        `## Meaning\nscale private content ${index}`,
        timestamp,
        timestamp
      );
    }
    database.exec("COMMIT");
    database.close();

    const reopened = new LocalLearningLibrary(path);
    const first = await reopened.listItemPage({
      status: "active",
      sort: "recent"
    });
    const second = await reopened.listItemPage({
      status: "active",
      sort: "recent",
      cursor: first.nextCursor ?? undefined
    });

    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    expect(first.items).not.toEqual(second.items);
    expect(first.items.every((item) => !("markdownContent" in item))).toBe(true);
    await expect(reopened.countItems()).resolves.toEqual({
      active: 10_000,
      trashed: 0,
      progress: { new: 10_000, studying: 0, familiar: 0, strong: 0 }
    });
  });

  it("annotates, filters, and sorts cards by their current study status", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const items = await library.listItems(
      { status: "active", sort: "recent" },
      new Date("2026-01-01T08:00:00.000Z")
    );

    async function completeNewItem(
      itemId: string,
      reviewedAt: Date,
      sessionPrefix: string
    ) {
      const first = await library.confirmReviewSession({
        sessionId: `${sessionPrefix}-first`,
        reviewedAt: reviewedAt.toISOString(),
        ratings: [{
          itemId,
          aiRating: "good",
          finalRating: "good"
        }]
      });
      return library.confirmReviewSession({
        sessionId: `${sessionPrefix}-second`,
        reviewedAt: first.entries[0].nextDueAt,
        ratings: [{
          itemId,
          aiRating: "good",
          finalRating: "good"
        }]
      });
    }

    await completeNewItem(
      items[0].id,
      new Date("2026-01-01T08:00:00.000Z"),
      "due-card"
    );
    const scheduled = await completeNewItem(
      items[1].id,
      new Date("2026-07-20T08:00:00.000Z"),
      "scheduled-card"
    );
    const now = new Date(
      new Date(scheduled.entries[0].reviewedAt).getTime() + 60_000
    );
    await library.confirmReviewSession({
      sessionId: "learning-card",
      reviewedAt: new Date(now.getTime() - 30_000).toISOString(),
      ratings: [{
        itemId: items[2].id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });

    await expect(library.countItems(now)).resolves.toEqual({
      active: 10,
      trashed: 0,
      progress: {
        new: 7,
        studying: 1,
        familiar: 2,
        strong: 0
      }
    });

    const prioritized = await library.listItems({
      status: "active",
      sort: "study-status"
    }, now);
    expect(prioritized.slice(0, 3).map(({ studyStatus }) => studyStatus))
      .toEqual(["learning", "due", "new"]);

    const due = await library.listItems({
      status: "active",
      studyStatus: "due",
      sort: "next-due"
    }, now);
    expect(due.length).toBeGreaterThan(0);
    expect(due.every(({ studyStatus }) => studyStatus === "due")).toBe(true);
    expect(due.every(({ nextDueAt }) => Boolean(nextDueAt))).toBe(true);

    const scheduledOnly = await library.listItems({
      status: "active",
      studyStatus: "scheduled",
      sort: "next-due"
    }, now);
    expect(scheduledOnly).toEqual([
      expect.objectContaining({
        id: items[1].id,
        studyStatus: "scheduled"
      })
    ]);

    const pagedPriority = await library.listItemPage({
      status: "active",
      sort: "study-status"
    }, now);
    const pagedDue = await library.listItemPage({
      status: "active",
      studyStatus: "due",
      sort: "next-due"
    }, now);
    const pagedScheduled = await library.listItemPage({
      status: "active",
      studyStatus: "scheduled",
      sort: "next-due"
    }, now);

    expect(pagedPriority.items.slice(0, 3).map(({ studyStatus }) => studyStatus))
      .toEqual(["learning", "due", "new"]);
    expect(pagedDue.items.length).toBeGreaterThan(0);
    expect(pagedDue.items.every(({ studyStatus }) => studyStatus === "due"))
      .toBe(true);
    expect(pagedScheduled.items).toEqual([
      expect.objectContaining({
        id: items[1].id,
        studyStatus: "scheduled"
      })
    ]);

    const studyingProgress = await library.listItemPage({
      status: "active",
      progressStatus: "studying",
      sort: "recent"
    }, now);
    const familiarProgress = await library.listItemPage({
      status: "active",
      progressStatus: "familiar",
      sort: "recent"
    }, now);
    const newProgress = await library.listItemPage({
      status: "active",
      progressStatus: "new",
      sort: "recent"
    }, now);
    expect(studyingProgress.items.map(({ id }) => id)).toEqual([items[2].id]);
    expect(new Set(familiarProgress.items.map(({ id }) => id))).toEqual(
      new Set([items[0].id, items[1].id])
    );
    expect(newProgress.items).toHaveLength(7);
  });

  it("persists valid edits and rejects invalid structured values", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    const item = (await library.listItems({
      status: "active",
      search: "reluctant",
      sort: "recent"
    }))[0];

    const updated = await library.updateItem({
      itemId: item.id,
      title: "reluctant",
      itemType: "word",
      language: "en" as const,
      cefr: "C1",
      sense: "unwilling to act",
      markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant to leave.",
      memoryTip: "想像門已打開，但你仍緊抓門框不想離開。",
      cautionNote: "注意不要與 relevant 混淆。"
    });

    expect(updated.cefr).toBe("C1");
    expect(updated.cautionNote).toBe("注意不要與 relevant 混淆。");
    await expect(new LocalLearningLibrary(path).getItem(item.id))
      .resolves.toEqual(updated);
    await expect(library.updateItem({
      itemId: item.id,
      title: "",
      itemType: "word",
      language: "en" as const,
      cefr: "C1",
      sense: "unwilling",
      markdownContent: "content",
      memoryTip: "",
      cautionNote: ""
    })).rejects.toThrow(/title/);
  });

  it("applies only a current active AI draft and rejects stale or trashed cards", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const original = await library.createItem({
      title: "impair",
      itemType: "word",
      language: "en",
      cefr: "B2",
      sense: "weaken or damage",
      markdownContent: "## Meaning\n損害或削弱。",
      memoryTip: "把 impair 想成一對東西受損。"
    });

    const applied = await library.applyAiEdit({
      itemId: original.id,
      baseUpdatedAt: original.updatedAt,
      markdownContent: [
        original.markdownContent,
        "",
        "## impair vs. repair",
        "impair 是削弱；repair 是修復。"
      ].join("\n"),
      memoryTip: "把 **IM-** 接到 **PAIR** 前：這一對被損害了。",
      cautionNote: "不要把 impair（削弱）誤解成 repair（修復）。"
    });

    expect(applied).toMatchObject({
      id: original.id,
      title: original.title,
      itemType: original.itemType,
      language: original.language,
      cefr: original.cefr,
      sense: original.sense,
      status: "active",
      memoryTip: "把 **IM-** 接到 **PAIR** 前：這一對被損害了。",
      cautionNote: "不要把 impair（削弱）誤解成 repair（修復）。"
    });
    expect(applied.updatedAt).not.toBe(original.updatedAt);
    const cleared = await library.applyAiEdit({
      itemId: original.id,
      baseUpdatedAt: applied.updatedAt,
      markdownContent: applied.markdownContent,
      memoryTip: "",
      cautionNote: applied.cautionNote ?? ""
    });
    expect(cleared.memoryTip).toBe("");
    await expect(library.applyAiEdit({
      itemId: original.id,
      baseUpdatedAt: original.updatedAt,
      markdownContent: "stale overwrite",
      memoryTip: "stale",
      cautionNote: "stale"
    })).rejects.toThrow(/changed/);

    const trashed = await library.trashItem(original.id);
    await expect(library.applyAiEdit({
      itemId: original.id,
      baseUpdatedAt: trashed.updatedAt,
      markdownContent: "trashed overwrite",
      memoryTip: "trashed",
      cautionNote: "trashed"
    })).rejects.toThrow(/changed/);
  });

  it("moves an item to trash, restores it, and permanently empties trash", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const item = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];

    const trashed = await library.trashItem(item.id);
    expect(trashed.status).toBe("trashed");
    await expect(library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    })).resolves.toEqual([]);
    await expect(library.listItems({
      status: "trashed",
      sort: "recent"
    })).resolves.toEqual([
      expect.objectContaining(trashed)
    ]);

    const restored = await library.restoreItem(item.id);
    expect(restored).toMatchObject({ id: item.id, status: "active" });

    await library.trashItem(item.id);
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 1 });
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 0 });
    await expect(library.getItem(item.id)).rejects.toThrow(/Learning item not found/);
  });

  it("finds only exact normalized title candidates across active and trash", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const happy = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];
    await library.trashItem(happy.id);

    const candidates = await library.findDuplicateCandidates([
      " BANK ",
      "Happy",
      "banking"
    ]);

    expect(candidates.map((item) => ({
      title: item.title,
      sense: item.sense,
      status: item.status
    }))).toEqual([
      {
        title: "bank",
        sense: "financial institution",
        status: "active"
      },
      {
        title: "bank",
        sense: "side of a river",
        status: "active"
      },
      {
        title: "happy",
        sense: "feeling pleasure",
        status: "trashed"
      }
    ]);
  });

  it("creates a consistent SQLite backup and reopens after being closed", async () => {
    const sourcePath = await databasePath();
    const snapshotPath = `${sourcePath}.snapshot`;
    const library = new LocalLearningLibrary(sourcePath);
    const active = await library.listItems({ status: "active", sort: "recent" });
    await library.trashItem(active[0].id);

    await (
      library as LocalLearningLibrary & {
        backupTo(path: string): Promise<void>;
      }
    ).backupTo(snapshotPath);
    library.close();

    const snapshot = new LocalLearningLibrary(snapshotPath);
    await expect(
      snapshot.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(9);
    await expect(
      snapshot.listItems({ status: "trashed", sort: "recent" })
    ).resolves.toHaveLength(1);
    await expect(
      library.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(9);
  });

  it("creates a validated batch atomically", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const before = await library.listItems({ status: "active", sort: "recent" });
    const valid = {
      title: "meticulous",
      itemType: "word" as const,
      language: "en" as const,
      cefr: "C1" as const,
      sense: "very careful and precise",
      markdownContent: "## Meaning\n一絲不苟。\n\n## Examples\n1. She is meticulous."
    };

    await expect(library.createItemsAtomically([
      valid,
      { ...valid, title: "" }
    ])).rejects.toThrow(/title/);
    await expect(
      library.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(before.length);

    const created = await library.createItemsAtomically([
      valid,
      {
        ...valid,
        title: "look into",
        itemType: "phrase",
      language: "en" as const,
        cefr: "B1",
        sense: "investigate"
      }
    ]);
    expect(created.map((item) => item.title))
      .toEqual(["meticulous", "look into"]);
    await expect(
      library.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(before.length + 2);
  });

  it("selects reviewed due items before new items ordered by CEFR", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const reviewLibrary = library as LocalLearningLibrary & {
      getReviewSummary(now: Date): Promise<{
        dueReviewedCount: number;
        newCount: number;
        selectedItems: Array<{ title: string; cefr: string }>;
      }>;
    };

    const summary = await reviewLibrary.getReviewSummary(
      new Date("2026-07-24T08:00:00.000Z")
    );

    expect({
      ...summary,
      selectedItems: summary.selectedItems.slice(0, 4)
    }).toMatchObject({
      dueReviewedCount: 0,
      newCount: 10,
      selectedItems: [
        { title: "happy", cefr: "A1" },
        { title: "wake up", cefr: "A1" },
        { title: "bank", cefr: "A2" },
        { title: "bank", cefr: "A2" }
      ]
    });
  });

  it("persists compact FSRS history and uses the final user rating", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    const happy = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];
    const bank = (await library.listItems({
      status: "active",
      search: "bank",
      sort: "recent"
    }))[0];
    const reviewedAt = "2026-07-24T08:00:00.000Z";

    const result = await library.confirmReviewSession({
      sessionId: "review-session-1",
      reviewedAt,
      ratings: [{
        itemId: happy.id,
        aiRating: "easy",
        finalRating: "forgotten",
        answer: "  金融機構\n提供存款服務  "
      }, {
        itemId: bank.id,
        aiRating: "forgotten",
        finalRating: "forgotten",
        answer: ""
      }]
    });
    const detail = await library.getItemReviewDetail(
      happy.id,
      new Date(reviewedAt)
    );
    const blankDetail = await library.getItemReviewDetail(
      bank.id,
      new Date(reviewedAt)
    );

    expect(result.entries[0]).toMatchObject({
      itemId: happy.id,
      aiRating: "easy",
      finalRating: "forgotten",
      reviewedAt,
      answer: "  金融機構\n提供存款服務  "
    });
    expect(result.entries[0].intervalSeconds).toBeGreaterThan(0);
    expect(detail).toMatchObject({
      reviewCount: 1,
      lastFinalRating: "forgotten",
      nextDueAt: result.entries[0].nextDueAt,
      history: [{
        aiRating: "easy",
        finalRating: "forgotten",
        answer: "  金融機構\n提供存款服務  "
      }]
    });
    expect(blankDetail.history[0].answer).toBe("");

    library.close();
    const database = new DatabaseSync(path);
    database.prepare(`
      UPDATE learning_review_events
      SET answer = NULL
      WHERE learning_item_id = ?
    `).run(happy.id);
    database.close();

    const reopened = new LocalLearningLibrary(path);
    const legacyDetail = await reopened.getItemReviewDetail(
      happy.id,
      new Date(reviewedAt)
    );
    expect(legacyDetail.history[0].answer).toBeNull();
  });

  it("confirms active review items after another paper item is trashed", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [trashedItem, activeItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);
    const reviewedAt = "2026-07-24T08:00:00.000Z";

    await library.trashItem(trashedItem.id);
    const result = await library.confirmReviewSession({
      sessionId: "review-session-with-trashed-item",
      reviewedAt,
      ratings: [{
        itemId: trashedItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten",
        answer: "removed answer"
      }, {
        itemId: activeItem.id,
        aiRating: "good",
        finalRating: "good",
        answer: "active answer"
      }]
    });

    expect(result.entries).toEqual([
      expect.objectContaining({
        itemId: activeItem.id,
        answer: "active answer"
      })
    ]);
    expect(await library.getItemReviewDetail(trashedItem.id)).toMatchObject({
      reviewCount: 0,
      history: []
    });
    expect(await library.getItemReviewDetail(activeItem.id)).toMatchObject({
      reviewCount: 1,
      history: [expect.objectContaining({ answer: "active answer" })]
    });
  });

  it("confirms active review items after another paper item is permanently deleted", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [deletedItem, activeItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);

    await library.trashItem(deletedItem.id);
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 1 });
    const result = await library.confirmReviewSession({
      sessionId: "review-session-with-deleted-item",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: [{
        itemId: deletedItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten",
        answer: "deleted answer"
      }, {
        itemId: activeItem.id,
        aiRating: "easy",
        finalRating: "easy",
        answer: "active answer"
      }]
    });

    expect(result.entries).toEqual([
      expect.objectContaining({
        itemId: activeItem.id,
        answer: "active answer"
      })
    ]);
    expect(await library.getItemReviewDetail(activeItem.id)).toMatchObject({
      reviewCount: 1,
      history: [expect.objectContaining({ answer: "active answer" })]
    });
  });

  it("confirms with no history when every paper item is trashed", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const items = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);

    for (const item of items) await library.trashItem(item.id);
    const result = await library.confirmReviewSession({
      sessionId: "review-session-with-no-active-items",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: items.map(({ id }) => ({
        itemId: id,
        aiRating: "forgotten" as const,
        finalRating: "forgotten" as const,
        answer: "removed answer"
      }))
    });

    expect(result.entries).toEqual([]);
    for (const item of items) {
      expect(await library.getItemReviewDetail(item.id)).toMatchObject({
        reviewCount: 0,
        history: []
      });
    }
  });

  it("limits new introductions independently and uses the configured paper size", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 2,
        dailyDueReviewCompletionLimit: 50,
        reviewPaperSize: 6
      })
    });

    const summary = await library.getReviewSummary(
      new Date("2026-07-24T08:00:00.000Z")
    );

    expect(summary).toMatchObject({
      newCount: 10,
      dueReviewedCount: 0,
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      newLearningCount: 0,
      dueLearningCount: 0,
      newRemainingCapacity: 2,
      dueRemainingCapacity: 50,
      totalAvailable: 2
    });
    expect(summary.selectedItems).toHaveLength(2);
    expect(summary.selectedItems.every(({ reviewKind }) =>
      reviewKind === "new"
    )).toBe(true);
  });

  it("does not reserve new-item completion capacity for same-day learning items", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 20,
        dailyDueReviewCompletionLimit: 50,
        reviewPaperSize: 10
      })
    });
    for (let index = 0; index < 16; index += 1) {
      await library.createItem({
        title: `capacity item ${index + 1}`,
        itemType: "word",
      language: "en" as const,
        cefr: "A1",
        sense: `capacity test item ${index + 1}`,
        markdownContent: `## Meaning\nCapacity test item ${index + 1}.`
      });
    }
    const items = await library.listItems({
      status: "active",
      sort: "recent"
    });
    const reviewedAt = new Date(2026, 6, 29, 9, 0);

    await library.confirmReviewSession({
      sessionId: "fourteen-new-items-completed",
      reviewedAt: reviewedAt.toISOString(),
      ratings: items.slice(0, 14).map(({ id }) => ({
        itemId: id,
        aiRating: "easy" as const,
        finalRating: "easy" as const
      }))
    });
    await library.confirmReviewSession({
      sessionId: "six-new-items-learning",
      reviewedAt: reviewedAt.toISOString(),
      ratings: items.slice(14, 20).map(({ id }) => ({
        itemId: id,
        aiRating: "forgotten" as const,
        finalRating: "forgotten" as const
      }))
    });

    const summary = await library.getReviewSummary(
      new Date(reviewedAt.getTime() + 1_000)
    );

    expect(summary).toMatchObject({
      reviewedNewTodayCount: 14,
      newLearningCount: 6,
      newCompletionLimit: 20,
      newRemainingCapacity: 6,
      availableNewCount: 6,
      totalAvailable: 6
    });
    expect(summary.selectedItems).toHaveLength(6);
    expect(summary.selectedItems.every(({ reviewKind }) =>
      reviewKind === "new"
    )).toBe(true);
  });

  it("does not reserve due-review completion capacity for same-day relearning items", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 0,
        dailyDueReviewCompletionLimit: 2,
        reviewPaperSize: 10
      })
    });
    const [relearningItem, otherDueItem, completedDueItem] =
      (await library.listItems({
        status: "active",
        sort: "recent"
      })).slice(0, 3);
    const introduced = await library.confirmReviewSession({
      sessionId: "introduce-three-due-items",
      reviewedAt: new Date(2026, 6, 1, 9, 0).toISOString(),
      ratings: [relearningItem, otherDueItem, completedDueItem].map(({ id }) => ({
        itemId: id,
        aiRating: "easy" as const,
        finalRating: "easy" as const
      }))
    });
    const dueAt = introduced.entries[0].nextDueAt;

    await library.confirmReviewSession({
      sessionId: "one-completed-and-one-relearning-due-item",
      reviewedAt: dueAt,
      ratings: [{
        itemId: relearningItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }, {
        itemId: completedDueItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });

    const summary = await library.getReviewSummary(
      new Date(new Date(dueAt).getTime() + 1_000)
    );

    expect(summary).toMatchObject({
      reviewedDueTodayCount: 1,
      dueLearningCount: 1,
      dueReviewCompletionLimit: 2,
      dueRemainingCapacity: 1,
      availableDueCount: 1,
      totalAvailable: 1
    });
    expect(summary.selectedItems).toEqual([
      expect.objectContaining({
        id: otherDueItem.id,
        reviewKind: "due"
      })
    ]);
  });

  it("keeps an already-started learning path available after the completion limit is reached", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 1,
        dailyDueReviewCompletionLimit: 50,
        reviewPaperSize: 10
      })
    });
    const [completedItem, learningItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);
    const reviewedAt = new Date(2026, 6, 29, 9, 0);
    const result = await library.confirmReviewSession({
      sessionId: "completion-limit-with-learning-path",
      reviewedAt: reviewedAt.toISOString(),
      ratings: [{
        itemId: completedItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }, {
        itemId: learningItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });
    const learningDueAt = result.entries.find(({ itemId }) =>
      itemId === learningItem.id
    )!.nextDueAt;

    const summary = await library.getReviewSummary(learningDueAt);

    expect(summary).toMatchObject({
      reviewedNewTodayCount: 1,
      newLearningCount: 1,
      newRemainingCapacity: 0,
      availableLearningCount: 1
    });
    expect(summary.selectedItems[0]).toMatchObject({
      id: learningItem.id,
      reviewKind: "new"
    });
  });

  it("keeps a same-day retry in its new learning path until it reaches a later date", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 1,
        dailyDueReviewCompletionLimit: 50,
        reviewPaperSize: 10
      })
    });
    const item = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];
    const firstReviewedAt = new Date(2026, 6, 24, 9, 0);
    const first = await library.confirmReviewSession({
      sessionId: "new-learning-first",
      reviewedAt: firstReviewedAt.toISOString(),
      ratings: [{
        itemId: item.id,
        aiRating: "good",
        finalRating: "good"
      }]
    });
    const firstDue = new Date(first.entries[0].nextDueAt);

    const learning = await library.getReviewSummary(firstDue);
    expect(learning).toMatchObject({
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      newLearningCount: 1,
      dueLearningCount: 0,
      newRemainingCapacity: 1
    });
    expect(learning.selectedItems[0]).toMatchObject({
      id: item.id,
      reviewKind: "new"
    });

    const nextDay = new Date(firstDue);
    nextDay.setDate(nextDay.getDate() + 1);
    const crossDay = await library.getReviewSummary(nextDay);
    expect(crossDay).toMatchObject({
      reviewedNewTodayCount: 0,
      newLearningCount: 1
    });
    expect(crossDay.selectedItems[0]).toMatchObject({
      id: item.id,
      reviewKind: "new"
    });

    const second = await library.confirmReviewSession({
      sessionId: "new-learning-second",
      reviewedAt: firstDue.toISOString(),
      ratings: [{
        itemId: item.id,
        aiRating: "good",
        finalRating: "good"
      }]
    });
    expect(new Date(second.entries[0].nextDueAt).getDate())
      .not.toBe(firstDue.getDate());

    const completed = await library.getReviewSummary(
      new Date(firstDue.getTime() + 1)
    );
    expect(completed).toMatchObject({
      reviewedNewTodayCount: 1,
      reviewedDueTodayCount: 0,
      newLearningCount: 0,
      newRemainingCapacity: 0
    });
    expect(completed.selectedItems).toEqual([]);
  });

  it("prioritizes learning paths, then mature due items, then untouched new items", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 2,
        dailyDueReviewCompletionLimit: 1,
        reviewPaperSize: 3
      })
    });
    const [learningItem, matureItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);
    const today = new Date(2026, 6, 24, 9, 0);
    const matureStart = new Date(2026, 6, 16, 8, 0);
    await library.confirmReviewSession({
      sessionId: "mature-setup",
      reviewedAt: matureStart.toISOString(),
      ratings: [{
        itemId: matureItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    const learningResult = await library.confirmReviewSession({
      sessionId: "new-learning-setup",
      reviewedAt: today.toISOString(),
      ratings: [{
        itemId: learningItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });
    const now = new Date(Math.max(
      new Date(learningResult.entries[0].nextDueAt).getTime(),
      new Date(2026, 6, 24, 9, 1).getTime()
    ));

    const summary = await library.getReviewSummary(now);

    expect(summary.selectedItems).toHaveLength(3);
    expect(summary.selectedItems[0]).toMatchObject({
      id: learningItem.id,
      reviewKind: "new"
    });
    expect(summary.selectedItems[1]).toMatchObject({
      id: matureItem.id,
      reviewKind: "due"
    });
    expect(summary.selectedItems[2].reviewKind).toBe("new");
  });

  it("treats zero as a pause for each independent review category", async () => {
    const library = new LocalLearningLibrary(await databasePath(), {
      getReviewPreferences: async () => ({
        dailyNewItemCompletionLimit: 0,
        dailyDueReviewCompletionLimit: 0,
        reviewPaperSize: 20
      })
    });

    const summary = await library.getReviewSummary(
      new Date("2026-07-24T08:00:00.000Z")
    );

    expect(summary).toMatchObject({
      newCount: 10,
      newRemainingCapacity: 0,
      dueRemainingCapacity: 0,
      totalAvailable: 0,
      selectedItems: []
    });
  });

  it("counts today's new and due review events using local calendar boundaries", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [dueItem, newItem, previousDayItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 3);
    const todayStart = new Date(2026, 6, 24, 0, 0, 0, 0);
    const tomorrowStart = new Date(2026, 6, 25, 0, 0, 0, 0);

    await library.confirmReviewSession({
      sessionId: "review-session-due-setup",
      reviewedAt: new Date(2026, 6, 16, 9, 0).toISOString(),
      ratings: [{
        itemId: dueItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.confirmReviewSession({
      sessionId: "review-session-previous-day",
      reviewedAt: new Date(todayStart.getTime() - 1).toISOString(),
      ratings: [{
        itemId: previousDayItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.confirmReviewSession({
      sessionId: "review-session-due-today",
      reviewedAt: new Date(2026, 6, 24, 10, 0).toISOString(),
      ratings: [{
        itemId: dueItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.confirmReviewSession({
      sessionId: "review-session-new-today",
      reviewedAt: new Date(2026, 6, 24, 11, 0).toISOString(),
      ratings: [{
        itemId: newItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });

    const summary = await library.getReviewSummary(
      new Date(tomorrowStart.getTime() - 1)
    );

    expect(summary).toMatchObject({
      reviewedNewTodayCount: 1,
      reviewedDueTodayCount: 1
    });
  });

  it("builds a 90-day solid-recall trend instead of treating first completion as mastery", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [solidItem, buildingItem, trashedItem] =
      (await library.listItems({
        status: "active",
        sort: "recent"
      })).slice(0, 3);

    const firstSolidReview = await library.confirmReviewSession({
      sessionId: "solid-first",
      reviewedAt: "2026-01-01T09:00:00.000Z",
      ratings: [{
        itemId: solidItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    const secondSolidReview = await library.confirmReviewSession({
      sessionId: "solid-second",
      reviewedAt: firstSolidReview.entries[0].nextDueAt,
      ratings: [{
        itemId: solidItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.confirmReviewSession({
      sessionId: "building-first",
      reviewedAt: secondSolidReview.reviewedAt,
      ratings: [{
        itemId: buildingItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.confirmReviewSession({
      sessionId: "trashed-first",
      reviewedAt: secondSolidReview.reviewedAt,
      ratings: [{
        itemId: trashedItem.id,
        aiRating: "easy",
        finalRating: "easy"
      }]
    });
    await library.trashItem(trashedItem.id);

    const now = new Date(
      new Date(secondSolidReview.reviewedAt).getTime() + 60_000
    );
    const summary = await library.getReviewSummary(now);
    const progress = summary.learningProgress!;

    expect(progress.daily).toHaveLength(90);
    expect(progress).toMatchObject({
      periodDays: 90,
      solidItemCount: 1,
      solidItemCountDelta30Days: 1,
      buildingItemCount: 1,
      recallRate30Days: 100,
      recallReviewCount30Days: 1
    });
    const libraryCounts = await library.countItems(now);
    expect(libraryCounts.progress).toEqual({
      new: 7,
      studying: 0,
      familiar: 1,
      strong: progress.solidItemCount
    });
    expect(libraryCounts.progress.strong).toBe(progress.solidItemCount);
    expect(Object.values(libraryCounts.progress).reduce(
      (total, count) => total + count,
      0
    )).toBe(libraryCounts.active);
    const strongItems = await library.listItemPage({
      status: "active",
      progressStatus: "strong",
      sort: "recent"
    }, now);
    const familiarItems = await library.listItemPage({
      status: "active",
      progressStatus: "familiar",
      sort: "recent"
    }, now);
    expect(strongItems.items.map(({ id }) => id)).toEqual([solidItem.id]);
    expect(familiarItems.items.map(({ id }) => id)).toEqual([buildingItem.id]);
    expect(progress.daily.at(-1)).toMatchObject({
      date: now.toLocaleDateString("en-CA"),
      solidItemCount: 1
    });
    expect(summary.reviewActivity).toMatchObject({
      periodDays: 30,
      completedReviewCount: 3
    });
    expect(summary.reviewActivity?.daily).toHaveLength(30);
  });

  it("moves forgotten and decayed items out of solid recall", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [forgottenItem, decayedItem] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);

    async function makeSolid(itemId: string, prefix: string) {
      const first = await library.confirmReviewSession({
        sessionId: `${prefix}-first`,
        reviewedAt: "2026-01-01T09:00:00.000Z",
        ratings: [{
          itemId,
          aiRating: "easy",
          finalRating: "easy"
        }]
      });
      return library.confirmReviewSession({
        sessionId: `${prefix}-second`,
        reviewedAt: first.entries[0].nextDueAt,
        ratings: [{
          itemId,
          aiRating: "easy",
          finalRating: "easy"
        }]
      });
    }

    const forgottenSolid = await makeSolid(forgottenItem.id, "forgotten");
    const decayedSolid = await makeSolid(decayedItem.id, "decayed");
    const forgottenAt = forgottenSolid.entries[0].nextDueAt;
    await library.confirmReviewSession({
      sessionId: "forgotten-third",
      reviewedAt: forgottenAt,
      ratings: [{
        itemId: forgottenItem.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });

    const justForgotten = (await library.getReviewSummary(
      new Date(new Date(forgottenAt).getTime() + 60_000)
    )).learningProgress!;
    expect(justForgotten).toMatchObject({
      solidItemCount: 1,
      buildingItemCount: 1,
      solidItemCountDelta30Days: -1,
      recallRate30Days: 0,
      recallReviewCount30Days: 1
    });

    const longAfterBothDue = new Date(
      new Date(decayedSolid.reviewedAt).getTime() + 180 * 86_400_000
    );
    expect((await library.getReviewSummary(
      longAfterBothDue
    )).learningProgress).toMatchObject({
      solidItemCount: 0,
      buildingItemCount: 2
    });
  });

  it("maps all four final ratings to distinct FSRS intervals", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const items = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 4);
    const ratings = ["forgotten", "hard", "good", "easy"] as const;

    const result = await library.confirmReviewSession({
      sessionId: "review-session-four-ratings",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: items.map((item, index) => ({
        itemId: item.id,
        aiRating: ratings[index],
        finalRating: ratings[index]
      }))
    });

    expect(result.entries.map(({ intervalSeconds }) => intervalSeconds))
      .toEqual([60, 360, 600, 691200]);
  });

  it("rolls back every item when a review session conflicts mid-transaction", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const [first, second] = (await library.listItems({
      status: "active",
      sort: "recent"
    })).slice(0, 2);
    await library.confirmReviewSession({
      sessionId: "review-session-collision",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: [{
        itemId: second.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });

    await expect(library.confirmReviewSession({
      sessionId: "review-session-collision",
      reviewedAt: "2030-07-24T08:00:00.000Z",
      ratings: [{
        itemId: first.id,
        aiRating: "good",
        finalRating: "good"
      }, {
        itemId: second.id,
        aiRating: "good",
        finalRating: "good"
      }]
    })).rejects.toThrow();

    expect((await library.getItemReviewDetail(first.id)).reviewCount).toBe(0);
    expect((await library.getItemReviewDetail(second.id)).reviewCount).toBe(1);
  });

  it("prioritizes a same-day new learning item once its exact due time arrives", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const fastidious = (await library.listItems({
      status: "active",
      search: "fastidious",
      sort: "recent"
    }))[0];
    const first = await library.confirmReviewSession({
      sessionId: "review-session-due",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: [{
        itemId: fastidious.id,
        aiRating: "forgotten",
        finalRating: "forgotten"
      }]
    });

    const beforeDue = await library.getReviewSummary(
      new Date(new Date(first.entries[0].nextDueAt).getTime() - 1)
    );
    const atDue = await library.getReviewSummary(first.entries[0].nextDueAt);

    expect(beforeDue.selectedItems.some(({ id }) => id === fastidious.id))
      .toBe(false);
    expect(atDue.selectedItems[0]).toMatchObject({
      id: fastidious.id,
      reviewKind: "new",
      dueAt: first.entries[0].nextDueAt
    });
  });

  it("does not duplicate a confirmed session and keeps trash out of review", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const happy = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];
    const input = {
      sessionId: "review-session-once",
      reviewedAt: "2026-07-24T08:00:00.000Z",
      ratings: [{
        itemId: happy.id,
        aiRating: "good" as const,
        finalRating: "good" as const
      }]
    };
    await library.confirmReviewSession(input);
    await expect(library.confirmReviewSession(input)).rejects.toThrow();
    expect((await library.getItemReviewDetail(happy.id)).reviewCount).toBe(1);

    await library.trashItem(happy.id);
    expect((await library.getReviewSummary("2030-01-01T00:00:00.000Z"))
      .selectedItems.some(({ id }) => id === happy.id)).toBe(false);
    await library.restoreItem(happy.id);
    expect((await library.getReviewSummary("2030-01-01T00:00:00.000Z"))
      .selectedItems[0].id).toBe(happy.id);
  });
});
