// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalLearningLibrary } from "./learning-library-service";

const temporaryDirectories: string[] = [];

async function databasePath() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-learning-test-"));
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
      cefr: "B2",
      sort: "alphabetical"
    });

    expect(titleMatches.map((item) => item.title)).toEqual(["fastidious"]);
    expect(filtered.map((item) => item.title)).toEqual(["take for granted"]);
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
      cefr: "C1",
      sense: "unwilling to act",
      markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant to leave."
    });

    expect(updated.cefr).toBe("C1");
    await expect(new LocalLearningLibrary(path).getItem(item.id))
      .resolves.toEqual(updated);
    await expect(library.updateItem({
      itemId: item.id,
      title: "",
      itemType: "word",
      cefr: "C1",
      sense: "unwilling",
      markdownContent: "content"
    })).rejects.toThrow(/標題/);
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
    })).resolves.toContainEqual(trashed);

    const restored = await library.restoreItem(item.id);
    expect(restored).toMatchObject({ id: item.id, status: "active" });

    await library.trashItem(item.id);
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 1 });
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 0 });
    await expect(library.getItem(item.id)).rejects.toThrow(/找不到/);
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

  it("creates a validated batch atomically", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const before = await library.listItems({ status: "active", sort: "recent" });
    const valid = {
      title: "meticulous",
      itemType: "word" as const,
      cefr: "C1" as const,
      sense: "very careful and precise",
      markdownContent: "## Meaning\n一絲不苟。\n\n## Examples\n1. She is meticulous."
    };

    await expect(library.createItemsAtomically([
      valid,
      { ...valid, title: "" }
    ])).rejects.toThrow(/標題/);
    await expect(
      library.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(before.length);

    const created = await library.createItemsAtomically([
      valid,
      {
        ...valid,
        title: "look into",
        itemType: "phrase",
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
    const library = new LocalLearningLibrary(await databasePath());
    const happy = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];
    const reviewedAt = "2026-07-24T08:00:00.000Z";

    const result = await library.confirmReviewSession({
      sessionId: "review-session-1",
      reviewedAt,
      ratings: [{
        itemId: happy.id,
        aiRating: "easy",
        finalRating: "forgotten"
      }]
    });
    const detail = await library.getItemReviewDetail(
      happy.id,
      new Date(reviewedAt)
    );

    expect(result.entries[0]).toMatchObject({
      itemId: happy.id,
      aiRating: "easy",
      finalRating: "forgotten",
      reviewedAt
    });
    expect(result.entries[0].intervalSeconds).toBeGreaterThan(0);
    expect(detail).toMatchObject({
      reviewCount: 1,
      lastFinalRating: "forgotten",
      nextDueAt: result.entries[0].nextDueAt,
      history: [{
        aiRating: "easy",
        finalRating: "forgotten"
      }]
    });
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
      newRemainingCapacity: 0
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
