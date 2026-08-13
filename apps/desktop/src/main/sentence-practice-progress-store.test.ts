// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSentencePracticeProgressStore } from "./sentence-practice-progress-store";

const directories: string[] = [];

async function progressDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-sentence-progress-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LocalSentencePracticeProgressStore", () => {
  it.each([
    { itemCount: 5, rounds: 2 },
    { itemCount: 2, rounds: 5 }
  ])("reaches ten items with $rounds rounds of $itemCount", async ({
    itemCount,
    rounds
  }) => {
    const directory = await progressDirectory();
    const store = new LocalSentencePracticeProgressStore(directory, {
      now: () => new Date(2026, 7, 14, 12, 0, 0)
    });

    for (let index = 0; index < rounds; index += 1) {
      await store.recordCompletedSession(`round-${index}`, itemCount);
    }
    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedItemCount: 10,
      totalCompletedItemCount: 10,
      completedItemCount30Days: 10
    });
  });

  it("adds completed item counts, deduplicates sessions, and survives restart", async () => {
    const directory = await progressDirectory();
    const now = () => new Date(2026, 7, 14, 12, 0, 0);
    const store = new LocalSentencePracticeProgressStore(directory, { now });

    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedItemCount: 0,
      totalCompletedItemCount: 0,
      completedItemCount30Days: 0
    });
    await expect(store.recordCompletedSession("round-1", 5)).resolves.toBe(5);
    await expect(store.recordCompletedSession("round-2", 5)).resolves.toBe(10);
    await expect(store.recordCompletedSession("round-1", 5)).resolves.toBe(10);
    await expect(new LocalSentencePracticeProgressStore(directory, { now })
      .getStatistics()).resolves.toMatchObject({
        todayCompletedItemCount: 10,
        totalCompletedItemCount: 10
      });
  });

  it("starts a new local day while retaining cumulative and activity history", async () => {
    const directory = await progressDirectory();
    let current = new Date(2026, 7, 14, 23, 59, 0);
    const store = new LocalSentencePracticeProgressStore(directory, {
      now: () => current
    });
    await store.recordCompletedSession("round-1", 5);

    current = new Date(2026, 7, 15, 0, 1, 0);
    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedItemCount: 0,
      totalCompletedItemCount: 5,
      completedItemCount30Days: 5
    });
    await expect(store.recordCompletedSession("round-2", 2)).resolves.toBe(2);
    const statistics = await store.getStatistics();
    expect(statistics).toMatchObject({
      todayCompletedItemCount: 2,
      totalCompletedItemCount: 7,
      completedItemCount30Days: 7
    });
    expect(statistics.dailyActivity).toHaveLength(30);
    expect(statistics.dailyActivity.at(-2)).toEqual({
      date: "2026-08-14",
      completedItemCount: 5
    });
    expect(statistics.dailyActivity.at(-1)).toEqual({
      date: "2026-08-15",
      completedItemCount: 2
    });
  });

  it("keeps all-time totals outside the zero-filled thirty-day window", async () => {
    const directory = await progressDirectory();
    await writeFile(join(directory, "sentence-practice-progress.json"),
      `${JSON.stringify({
        version: 2,
        daily: [
          { date: "2026-06-01", completedItemCount: 7 },
          { date: "2026-07-16", completedItemCount: 3 },
          { date: "2026-08-13", completedItemCount: 4 }
        ]
      })}\n`);
    const store = new LocalSentencePracticeProgressStore(directory, {
      now: () => new Date(2026, 7, 14, 12, 0, 0)
    });

    const statistics = await store.getStatistics();

    expect(statistics).toMatchObject({
      todayCompletedItemCount: 0,
      totalCompletedItemCount: 14,
      completedItemCount30Days: 7
    });
    expect(statistics.dailyActivity).toHaveLength(30);
    expect(statistics.dailyActivity[0]).toEqual({
      date: "2026-07-16",
      completedItemCount: 3
    });
    expect(statistics.dailyActivity.at(-1)).toEqual({
      date: "2026-08-14",
      completedItemCount: 0
    });
  });

  it("migrates the F63 current-day total without retaining session history", async () => {
    const directory = await progressDirectory();
    const progressPath = join(directory, "sentence-practice-progress.json");
    await writeFile(progressPath, `${JSON.stringify({
      version: 1,
      day: "2026-08-14",
      completedItemCount: 6,
      completedSessionIds: ["legacy-round"]
    })}\n`);
    const store = new LocalSentencePracticeProgressStore(directory, {
      now: () => new Date(2026, 7, 14, 12, 0, 0)
    });

    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedItemCount: 6,
      totalCompletedItemCount: 6,
      completedItemCount30Days: 6
    });
    const migrated = JSON.parse(await readFile(progressPath, "utf8"));
    expect(migrated).toEqual({
      version: 2,
      daily: [{ date: "2026-08-14", completedItemCount: 6 }]
    });
    expect(JSON.stringify(migrated)).not.toContain("legacy-round");
  });

  it("reports corrupt persisted activity instead of silently replacing history", async () => {
    const directory = await progressDirectory();
    await writeFile(
      join(directory, "sentence-practice-progress.json"),
      JSON.stringify({
        version: 2,
        daily: [{ date: "not-a-date", completedItemCount: -1 }]
      })
    );
    const store = new LocalSentencePracticeProgressStore(directory);

    await expect(store.getStatistics()).rejects.toThrow(
      /sentence-practice activity/i
    );
  });

  it("rejects malformed completion records", async () => {
    const directory = await progressDirectory();
    const store = new LocalSentencePracticeProgressStore(directory);

    await expect(store.recordCompletedSession("", 5)).rejects.toThrow(/Invalid/);
    await expect(store.recordCompletedSession("round-1", 1)).rejects.toThrow(/Invalid/);
    await expect(store.recordCompletedSession("round-1", 11)).rejects.toThrow(/Invalid/);
    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedItemCount: 0,
      totalCompletedItemCount: 0
    });
  });
});
