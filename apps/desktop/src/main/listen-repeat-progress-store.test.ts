// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalListenRepeatProgressStore } from "./listen-repeat-progress-store";

const directories: string[] = [];

async function progressDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-listen-progress-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LocalListenRepeatProgressStore", () => {
  it("records completed long chunks", async () => {
    const directory = await progressDirectory();
    const now = () => new Date(2026, 7, 20, 12, 0, 0);
    const store = new LocalListenRepeatProgressStore(directory, { now });

    await expect(store.recordLongChunkCompletion()).resolves.toBe(1);
    await expect(store.recordLongChunkCompletion()).resolves.toBe(2);

    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedLongChunkCount: 2,
      totalCompletedLongChunkCount: 2,
      completedLongChunkCount30Days: 2
    });
  });

  it("starts a new local day and keeps all-time and zero-filled 30-day activity", async () => {
    const directory = await progressDirectory();
    let current = new Date(2026, 7, 19, 23, 59, 0);
    const store = new LocalListenRepeatProgressStore(directory, {
      now: () => current
    });
    await store.recordLongChunkCompletion();

    current = new Date(2026, 7, 20, 0, 1, 0);
    const before = await store.getStatistics();
    expect(before).toMatchObject({
      todayCompletedLongChunkCount: 0,
      totalCompletedLongChunkCount: 1,
      completedLongChunkCount30Days: 1
    });
    expect(before.dailyActivity).toHaveLength(30);
    expect(before.dailyActivity.at(-2)).toEqual({
      date: "2026-08-19",
      completedLongChunkCount: 1
    });
    expect(before.dailyActivity.at(-1)).toEqual({
      date: "2026-08-20",
      completedLongChunkCount: 0
    });
  });

  it("keeps totals outside the 30-day window and rejects corrupt data", async () => {
    const directory = await progressDirectory();
    const path = join(directory, "listen-repeat-progress.json");
    await writeFile(path, `${JSON.stringify({
      version: 1,
      daily: [
        { date: "2026-06-01", completedLongChunkCount: 7 },
        { date: "2026-08-19", completedLongChunkCount: 3 }
      ]
    })}\n`);
    const store = new LocalListenRepeatProgressStore(directory, {
      now: () => new Date(2026, 7, 20, 12, 0, 0)
    });
    await expect(store.getStatistics()).resolves.toMatchObject({
      todayCompletedLongChunkCount: 0,
      totalCompletedLongChunkCount: 10,
      completedLongChunkCount30Days: 3
    });

    await writeFile(path, JSON.stringify({
      version: 1,
      daily: [{ date: "invalid", completedLongChunkCount: -1 }]
    }));
    await expect(new LocalListenRepeatProgressStore(directory).getStatistics())
      .rejects.toThrow(/listen-and-repeat activity/i);
  });
});
