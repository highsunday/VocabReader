import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SENTENCE_PRACTICE_ITEM_COUNT,
  type SentencePracticeActivityDay,
  type SentencePracticeStatistics
} from "../shared/sentence-practice-contracts";

interface LegacySentencePracticeProgress {
  version: 1;
  day: string;
  completedItemCount: number;
  completedSessionIds: string[];
}

export interface PersistedSentencePracticeProgress {
  version: 2;
  daily: SentencePracticeActivityDay[];
}

interface SentencePracticeProgressStoreOptions {
  now?(): Date;
}

function localDayKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

function emptyProgress(): PersistedSentencePracticeProgress {
  return {
    version: 2,
    daily: []
  };
}

function isLocalDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function isLegacyProgress(
  value: unknown
): value is LegacySentencePracticeProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<LegacySentencePracticeProgress>;
  return progress.version === 1 && typeof progress.day === "string" &&
    isLocalDay(progress.day) &&
    Number.isSafeInteger(progress.completedItemCount) &&
    Number(progress.completedItemCount) >= 0 &&
    Array.isArray(progress.completedSessionIds) &&
    progress.completedSessionIds.every((id) =>
      typeof id === "string" && Boolean(id.trim())
    );
}

export function parseSentencePracticeProgress(
  value: unknown
): PersistedSentencePracticeProgress {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid sentence-practice activity data");
  }
  const progress = value as Partial<PersistedSentencePracticeProgress>;
  if (progress.version !== 2 || !Array.isArray(progress.daily)) {
    throw new Error("Invalid sentence-practice activity data");
  }
  const dates = new Set<string>();
  let total = 0;
  const daily = progress.daily.map((candidate) => {
    if (!candidate || typeof candidate !== "object" ||
      typeof candidate.date !== "string" || !isLocalDay(candidate.date) ||
      !Number.isSafeInteger(candidate.completedItemCount) ||
      candidate.completedItemCount < 0 || dates.has(candidate.date)) {
      throw new Error("Invalid sentence-practice activity data");
    }
    dates.add(candidate.date);
    total += candidate.completedItemCount;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Invalid sentence-practice activity data");
    }
    return {
      date: candidate.date,
      completedItemCount: candidate.completedItemCount
    };
  }).sort((left, right) => left.date.localeCompare(right.date));
  return { version: 2, daily };
}

export function emptySentencePracticeProgressBytes(): Buffer {
  return Buffer.from(`${JSON.stringify(emptyProgress(), null, 2)}\n`, "utf8");
}

export function parseSentencePracticeProgressBytes(
  bytes: Uint8Array
): PersistedSentencePracticeProgress {
  try {
    return parseSentencePracticeProgress(JSON.parse(
      Buffer.from(bytes).toString("utf8")
    ));
  } catch (error) {
    if (error instanceof Error &&
      error.message === "Invalid sentence-practice activity data") {
      throw error;
    }
    throw new Error("Invalid sentence-practice activity data");
  }
}

function statisticsFor(
  progress: PersistedSentencePracticeProgress,
  now: Date
): SentencePracticeStatistics {
  const today = localDayKey(now);
  const counts = new Map(progress.daily.map((entry) => [
    entry.date,
    entry.completedItemCount
  ]));
  const dailyActivity = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (29 - index),
      12,
      0,
      0
    );
    const day = localDayKey(date);
    return {
      date: day,
      completedItemCount: counts.get(day) ?? 0
    };
  });
  return {
    todayCompletedItemCount: counts.get(today) ?? 0,
    totalCompletedItemCount: progress.daily.reduce(
      (total, entry) => total + entry.completedItemCount,
      0
    ),
    completedItemCount30Days: dailyActivity.reduce(
      (total, entry) => total + entry.completedItemCount,
      0
    ),
    dailyActivity
  };
}

export class LocalSentencePracticeProgressStore {
  readonly #progressPath: string;
  readonly #now: () => Date;
  readonly #completedSessionIds = new Set<string>();
  #writeQueue = Promise.resolve();

  constructor(
    private readonly directory: string,
    options: SentencePracticeProgressStoreOptions = {}
  ) {
    this.#progressPath = join(directory, "sentence-practice-progress.json");
    this.#now = options.now ?? (() => new Date());
  }

  async getDailyCompletedItemCount(): Promise<number> {
    return (await this.getStatistics()).todayCompletedItemCount;
  }

  async getStatistics(): Promise<SentencePracticeStatistics> {
    const loaded = await this.#load();
    if (loaded.migrated) await this.#save(loaded.progress);
    return statisticsFor(loaded.progress, this.#now());
  }

  async recordCompletedSession(
    sessionId: string,
    itemCount: number
  ): Promise<number> {
    if (typeof sessionId !== "string" || !sessionId.trim() ||
      !Number.isSafeInteger(itemCount) ||
      itemCount < SENTENCE_PRACTICE_ITEM_COUNT.minimum ||
      itemCount > SENTENCE_PRACTICE_ITEM_COUNT.maximum) {
      throw new Error("Invalid completed sentence-practice session");
    }
    let completedItemCount = 0;
    const write = this.#writeQueue.then(async () => {
      const now = this.#now();
      const day = localDayKey(now);
      const loaded = await this.#load();
      const current = loaded.progress;
      if (!this.#completedSessionIds.has(sessionId)) {
        const existing = current.daily.find((entry) => entry.date === day);
        if (existing) existing.completedItemCount += itemCount;
        else current.daily.push({ date: day, completedItemCount: itemCount });
        current.daily.sort((left, right) => left.date.localeCompare(right.date));
        this.#completedSessionIds.add(sessionId);
        await this.#save(current);
      } else if (loaded.migrated) {
        await this.#save(current);
      }
      completedItemCount = statisticsFor(current, now).todayCompletedItemCount;
    });
    this.#writeQueue = write.catch(() => undefined);
    await write;
    return completedItemCount;
  }

  async snapshotBytes(): Promise<Buffer> {
    await this.#writeQueue;
    const loaded = await this.#load();
    if (loaded.migrated) await this.#save(loaded.progress);
    return Buffer.from(`${JSON.stringify(loaded.progress, null, 2)}\n`, "utf8");
  }

  async #load(): Promise<{
    progress: PersistedSentencePracticeProgress;
    migrated: boolean;
  }> {
    await mkdir(this.directory, { recursive: true });
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#progressPath, "utf8"));
      if (isLegacyProgress(parsed)) {
        return {
          progress: {
            version: 2,
            daily: parsed.completedItemCount > 0
              ? [{
                  date: parsed.day,
                  completedItemCount: parsed.completedItemCount
                }]
              : []
          },
          migrated: true
        };
      }
      return { progress: parseSentencePracticeProgress(parsed), migrated: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { progress: emptyProgress(), migrated: false };
      }
      if (error instanceof Error &&
        error.message === "Invalid sentence-practice activity data") {
        throw error;
      }
      throw new Error("Invalid sentence-practice activity data");
    }
  }

  async #save(progress: PersistedSentencePracticeProgress): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.#progressPath}.next`;
    await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
    await rename(temporary, this.#progressPath);
  }
}
