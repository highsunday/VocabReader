// @vitest-environment node

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { LocalLearningLibrary } from "./learning-library-service";
import {
  assignUnclassifiedLearningItems,
  migrateLegacyLearningItems
} from "./learning-language-migration";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("migrateLegacyLearningItems", () => {
  it("splits items and their review relations exactly once", async () => {
    const root = await mkdtemp(join(tmpdir(), "vocabreader-language-migration-"));
    temporaryDirectories.push(root);
    const paths = {
      en: join(root, "learning-library", "learning-items.sqlite"),
      ja: join(root, "workspaces", "ja", "learning-items.sqlite"),
      "zh-TW": join(root, "workspaces", "zh-TW", "learning-items.sqlite"),
      other: join(root, "unassigned", "learning-items.sqlite"),
      snapshot: join(root, "migration", "legacy-learning-items.sqlite"),
      marker: join(root, "migration", "F69-complete.json")
    } as const;
    await mkdir(dirname(paths.en), { recursive: true });
    const legacy = new LocalLearningLibrary(paths.en, { seedMockItems: false });
    const items = await Promise.all([
      legacy.createItem(card("hello", "en")),
      legacy.createItem(card("食べる", "ja")),
      legacy.createItem(card("理解", "zh-TW")),
      legacy.createItem(card("bonjour", "other"))
    ]);
    await legacy.confirmReviewSession({
      sessionId: "legacy-review",
      reviewedAt: "2026-08-20T08:00:00.000Z",
      ratings: items.map(({ id }) => ({
        itemId: id,
        aiRating: "good" as const,
        finalRating: "good" as const,
        answer: "remembered"
      }))
    });
    legacy.close();

    expect(migrateLegacyLearningItems(paths)).toEqual({
      migrated: true,
      counts: { en: 1, ja: 1, "zh-TW": 1, other: 1 }
    });
    expect(migrateLegacyLearningItems(paths)).toEqual({
      migrated: false,
      counts: { en: 1, ja: 1, "zh-TW": 1, other: 1 }
    });

    for (const language of ["en", "ja", "zh-TW", "other"] as const) {
      const database = new DatabaseSync(paths[language], { readOnly: true });
      expect(database.prepare(
        "SELECT language FROM learning_items"
      ).all()).toEqual([{ language }]);
      expect(database.prepare(
        "SELECT COUNT(*) AS count FROM learning_review_events"
      ).get()).toEqual({ count: 1 });
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      database.close();
    }

    expect(assignUnclassifiedLearningItems(paths.other, paths.ja, "ja"))
      .toBe(1);
    const japanese = new DatabaseSync(paths.ja, { readOnly: true });
    expect(japanese.prepare(
      "SELECT language, COUNT(*) AS count FROM learning_items GROUP BY language"
    ).all()).toEqual([{ language: "ja", count: 2 }]);
    expect(japanese.prepare(
      "SELECT COUNT(*) AS count FROM learning_review_events"
    ).get()).toEqual({ count: 2 });
    japanese.close();
    expect(assignUnclassifiedLearningItems(paths.other, paths.ja, "ja"))
      .toBe(0);
  });
});

function card(
  title: string,
  language: "en" | "ja" | "zh-TW" | "other"
) {
  return {
    title,
    itemType: "word" as const,
    language,
    cefr: "A1" as const,
    sense: `${title} meaning`,
    markdownContent: `## Meaning\n${title}`
  };
}
