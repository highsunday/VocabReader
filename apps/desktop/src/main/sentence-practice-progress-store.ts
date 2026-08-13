import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SENTENCE_PRACTICE_ITEM_COUNT } from "../shared/sentence-practice-contracts";

interface PersistedSentencePracticeProgress {
  version: 1;
  day: string;
  completedItemCount: number;
  completedSessionIds: string[];
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

function emptyProgress(day: string): PersistedSentencePracticeProgress {
  return {
    version: 1,
    day,
    completedItemCount: 0,
    completedSessionIds: []
  };
}

function isPersistedProgress(
  value: unknown
): value is PersistedSentencePracticeProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<PersistedSentencePracticeProgress>;
  return progress.version === 1 && typeof progress.day === "string" &&
    Number.isSafeInteger(progress.completedItemCount) &&
    Number(progress.completedItemCount) >= 0 &&
    Array.isArray(progress.completedSessionIds) &&
    progress.completedSessionIds.every((id) =>
      typeof id === "string" && Boolean(id.trim())
    );
}

export class LocalSentencePracticeProgressStore {
  readonly #progressPath: string;
  readonly #now: () => Date;
  #writeQueue = Promise.resolve();

  constructor(
    private readonly directory: string,
    options: SentencePracticeProgressStoreOptions = {}
  ) {
    this.#progressPath = join(directory, "sentence-practice-progress.json");
    this.#now = options.now ?? (() => new Date());
  }

  async getDailyCompletedItemCount(): Promise<number> {
    const day = localDayKey(this.#now());
    return (await this.#load(day)).completedItemCount;
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
      const day = localDayKey(this.#now());
      const current = await this.#load(day);
      if (!current.completedSessionIds.includes(sessionId)) {
        current.completedSessionIds.push(sessionId);
        current.completedItemCount += itemCount;
        await this.#save(current);
      }
      completedItemCount = current.completedItemCount;
    });
    this.#writeQueue = write.catch(() => undefined);
    await write;
    return completedItemCount;
  }

  async #load(day: string): Promise<PersistedSentencePracticeProgress> {
    await mkdir(this.directory, { recursive: true });
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#progressPath, "utf8"));
      return isPersistedProgress(parsed) && parsed.day === day
        ? parsed
        : emptyProgress(day);
    } catch {
      return emptyProgress(day);
    }
  }

  async #save(progress: PersistedSentencePracticeProgress): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.#progressPath}.next`;
    await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
    await rename(temporary, this.#progressPath);
  }
}
