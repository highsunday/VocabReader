// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
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
    const store = new LocalSentencePracticeProgressStore(directory);

    for (let index = 0; index < rounds; index += 1) {
      await store.recordCompletedSession(`round-${index}`, itemCount);
    }
    await expect(store.getDailyCompletedItemCount()).resolves.toBe(10);
  });

  it("adds completed item counts, deduplicates sessions, and survives restart", async () => {
    const directory = await progressDirectory();
    const now = () => new Date(2026, 7, 14, 12, 0, 0);
    const store = new LocalSentencePracticeProgressStore(directory, { now });

    await expect(store.getDailyCompletedItemCount()).resolves.toBe(0);
    await expect(store.recordCompletedSession("round-1", 5)).resolves.toBe(5);
    await expect(store.recordCompletedSession("round-2", 5)).resolves.toBe(10);
    await expect(store.recordCompletedSession("round-1", 5)).resolves.toBe(10);
    await expect(new LocalSentencePracticeProgressStore(directory, { now })
      .getDailyCompletedItemCount()).resolves.toBe(10);
  });

  it("resets on the next local calendar day", async () => {
    const directory = await progressDirectory();
    let current = new Date(2026, 7, 14, 23, 59, 0);
    const store = new LocalSentencePracticeProgressStore(directory, {
      now: () => current
    });
    await store.recordCompletedSession("round-1", 5);

    current = new Date(2026, 7, 15, 0, 1, 0);
    await expect(store.getDailyCompletedItemCount()).resolves.toBe(0);
    await expect(store.recordCompletedSession("round-2", 2)).resolves.toBe(2);
  });

  it("rejects malformed completion records", async () => {
    const directory = await progressDirectory();
    const store = new LocalSentencePracticeProgressStore(directory);

    await expect(store.recordCompletedSession("", 5)).rejects.toThrow(/Invalid/);
    await expect(store.recordCompletedSession("round-1", 1)).rejects.toThrow(/Invalid/);
    await expect(store.recordCompletedSession("round-1", 11)).rejects.toThrow(/Invalid/);
    await expect(store.getDailyCompletedItemCount()).resolves.toBe(0);
  });
});
