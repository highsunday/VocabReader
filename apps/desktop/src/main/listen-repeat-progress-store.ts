import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ListenRepeatActivityDay,
  ListenRepeatStatistics
} from "../shared/listen-repeat-contracts";

export interface PersistedListenRepeatProgress {
  version: 1;
  daily: ListenRepeatActivityDay[];
}

interface Options {
  now?(): Date;
}

function localDayKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

function isLocalDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day;
}

export function parseListenRepeatProgress(
  value: unknown
): PersistedListenRepeatProgress {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid listen-and-repeat activity data");
  }
  const progress = value as Partial<PersistedListenRepeatProgress>;
  if (progress.version !== 1 || !Array.isArray(progress.daily)) {
    throw new Error("Invalid listen-and-repeat activity data");
  }
  const dates = new Set<string>();
  let total = 0;
  const daily = progress.daily.map((candidate) => {
    if (!candidate || typeof candidate !== "object" ||
      typeof candidate.date !== "string" || !isLocalDay(candidate.date) ||
      !Number.isSafeInteger(candidate.completedLongChunkCount) ||
      candidate.completedLongChunkCount < 0 || dates.has(candidate.date)) {
      throw new Error("Invalid listen-and-repeat activity data");
    }
    dates.add(candidate.date);
    total += candidate.completedLongChunkCount;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Invalid listen-and-repeat activity data");
    }
    return {
      date: candidate.date,
      completedLongChunkCount: candidate.completedLongChunkCount
    };
  }).sort((left, right) => left.date.localeCompare(right.date));
  return { version: 1, daily };
}

export function emptyListenRepeatProgressBytes(): Buffer {
  return Buffer.from(`${JSON.stringify({ version: 1, daily: [] }, null, 2)}\n`);
}

export function parseListenRepeatProgressBytes(
  bytes: Uint8Array
): PersistedListenRepeatProgress {
  try {
    return parseListenRepeatProgress(JSON.parse(Buffer.from(bytes).toString("utf8")));
  } catch (error) {
    if (error instanceof Error &&
      error.message === "Invalid listen-and-repeat activity data") throw error;
    throw new Error("Invalid listen-and-repeat activity data");
  }
}

function statisticsFor(
  progress: PersistedListenRepeatProgress,
  now: Date
): ListenRepeatStatistics {
  const today = localDayKey(now);
  const counts = new Map(progress.daily.map((entry) => [
    entry.date,
    entry.completedLongChunkCount
  ]));
  const dailyActivity = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (29 - index),
      12
    );
    const day = localDayKey(date);
    return {
      date: day,
      completedLongChunkCount: counts.get(day) ?? 0
    };
  });
  return {
    todayCompletedLongChunkCount: counts.get(today) ?? 0,
    totalCompletedLongChunkCount: progress.daily.reduce(
      (sum, entry) => sum + entry.completedLongChunkCount,
      0
    ),
    completedLongChunkCount30Days: dailyActivity.reduce(
      (sum, entry) => sum + entry.completedLongChunkCount,
      0
    ),
    dailyActivity
  };
}

export class LocalListenRepeatProgressStore {
  readonly #path: string;
  readonly #now: () => Date;
  #writeQueue = Promise.resolve();

  constructor(private readonly directory: string, options: Options = {}) {
    this.#path = join(directory, "listen-repeat-progress.json");
    this.#now = options.now ?? (() => new Date());
  }

  async getStatistics(): Promise<ListenRepeatStatistics> {
    return statisticsFor(await this.#load(), this.#now());
  }

  async recordLongChunkCompletion(): Promise<number> {
    let today = 0;
    const write = this.#writeQueue.then(async () => {
      const now = this.#now();
      const day = localDayKey(now);
      const progress = await this.#load();
      const existing = progress.daily.find((entry) => entry.date === day);
      if (existing) existing.completedLongChunkCount += 1;
      else progress.daily.push({ date: day, completedLongChunkCount: 1 });
      progress.daily.sort((left, right) => left.date.localeCompare(right.date));
      await this.#save(progress);
      today = statisticsFor(progress, now).todayCompletedLongChunkCount;
    });
    this.#writeQueue = write.catch(() => undefined);
    await write;
    return today;
  }

  async snapshotBytes(): Promise<Buffer> {
    await this.#writeQueue;
    return Buffer.from(`${JSON.stringify(await this.#load(), null, 2)}\n`);
  }

  async #load(): Promise<PersistedListenRepeatProgress> {
    await mkdir(this.directory, { recursive: true });
    try {
      return parseListenRepeatProgress(JSON.parse(await readFile(this.#path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, daily: [] };
      }
      if (error instanceof Error &&
        error.message === "Invalid listen-and-repeat activity data") throw error;
      throw new Error("Invalid listen-and-repeat activity data");
    }
  }

  async #save(progress: PersistedListenRepeatProgress): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.#path}.next`;
    await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
    await rename(temporary, this.#path);
  }
}
