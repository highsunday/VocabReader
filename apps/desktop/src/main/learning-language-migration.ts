import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LearningLanguage } from "../shared/settings-contracts";

type MigratedLanguage = "en" | "ja" | "zh-TW" | "other";

export interface LearningLanguageMigrationPaths {
  en: string;
  ja: string;
  "zh-TW": string;
  other: string;
  snapshot: string;
  marker: string;
}

export interface LearningLanguageMigrationResult {
  migrated: boolean;
  counts: Record<MigratedLanguage, number>;
}

function itemCount(path: string): number {
  if (!existsSync(path)) return 0;
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return Number((database.prepare(
      "SELECT COUNT(*) AS count FROM learning_items"
    ).get() as { count: number }).count);
  } finally {
    database.close();
  }
}

function currentCounts(
  paths: LearningLanguageMigrationPaths
): Record<MigratedLanguage, number> {
  return {
    en: itemCount(paths.en),
    ja: itemCount(paths.ja),
    "zh-TW": itemCount(paths["zh-TW"]),
    other: itemCount(paths.other)
  };
}

function pruneToLanguage(path: string, language: MigratedLanguage): number {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    database.prepare("DELETE FROM learning_items WHERE language <> ?")
      .run(language);
    const count = Number((database.prepare(
      "SELECT COUNT(*) AS count FROM learning_items"
    ).get() as { count: number }).count);
    const foreignKeyProblems = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyProblems.length) {
      throw new Error("Legacy learning-item relations could not be preserved");
    }
    database.exec("COMMIT;");
    return count;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // The transaction may not have started.
    }
    throw error;
  } finally {
    database.close();
  }
}

/**
 * Splits the one pre-F69 learning database into language-owned databases.
 * The immutable snapshot makes the operation restartable after interruption.
 */
export function migrateLegacyLearningItems(
  paths: LearningLanguageMigrationPaths
): LearningLanguageMigrationResult {
  if (existsSync(paths.marker)) {
    return { migrated: false, counts: currentCounts(paths) };
  }
  if (!existsSync(paths.en) && !existsSync(paths.snapshot)) {
    mkdirSync(dirname(paths.marker), { recursive: true });
    writeFileSync(paths.marker, `${JSON.stringify({
      version: 1,
      completedAt: new Date().toISOString(),
      counts: { en: 0, ja: 0, "zh-TW": 0, other: 0 }
    }, null, 2)}\n`, { flag: "wx" });
    return {
      migrated: false,
      counts: { en: 0, ja: 0, "zh-TW": 0, other: 0 }
    };
  }

  mkdirSync(dirname(paths.snapshot), { recursive: true });
  if (!existsSync(paths.snapshot)) copyFileSync(paths.en, paths.snapshot);

  const languages: MigratedLanguage[] = ["en", "ja", "zh-TW", "other"];
  const stages = Object.fromEntries(languages.map((language) => [
    language,
    `${paths[language]}.F69-stage`
  ])) as Record<MigratedLanguage, string>;
  const counts = { en: 0, ja: 0, "zh-TW": 0, other: 0 };

  try {
    for (const language of languages) {
      const stage = stages[language];
      mkdirSync(dirname(stage), { recursive: true });
      rmSync(stage, { force: true });
      copyFileSync(paths.snapshot, stage);
      counts[language] = pruneToLanguage(stage, language);
    }
    for (const language of languages) {
      mkdirSync(dirname(paths[language]), { recursive: true });
      rmSync(paths[language], { force: true });
      renameSync(stages[language], paths[language]);
    }
    writeFileSync(paths.marker, `${JSON.stringify({
      version: 1,
      completedAt: new Date().toISOString(),
      counts
    }, null, 2)}\n`, { flag: "wx" });
    return { migrated: true, counts };
  } finally {
    for (const stage of Object.values(stages)) rmSync(stage, { force: true });
  }
}

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quotedValue(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableColumns(database: DatabaseSync, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${quotedIdentifier(table)})`).all() as
    Array<{ name: string }>).map(({ name }) => name);
}

export function countUnclassifiedLearningItems(path: string): number {
  return itemCount(path);
}

/** Moves every quarantined legacy item and its review history as one transaction. */
export function assignUnclassifiedLearningItems(
  sourcePath: string,
  destinationPath: string,
  language: LearningLanguage
): number {
  if (!existsSync(sourcePath) || !existsSync(destinationPath)) return 0;
  const database = new DatabaseSync(sourcePath);
  try {
    const count = Number((database.prepare(
      "SELECT COUNT(*) AS count FROM learning_items"
    ).get() as { count: number }).count);
    if (!count) return 0;
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(`ATTACH DATABASE ${quotedValue(destinationPath)} AS destination;`);
    database.exec("BEGIN IMMEDIATE;");
    for (const table of [
      "learning_items",
      "learning_review_schedules",
      "learning_review_events"
    ]) {
      const columns = tableColumns(database, table);
      const names = columns.map(quotedIdentifier).join(", ");
      const values = columns.map((column) =>
        table === "learning_items" && column === "language"
          ? quotedValue(language)
          : quotedIdentifier(column)
      ).join(", ");
      database.exec(
        `INSERT INTO destination.${quotedIdentifier(table)} (${names}) ` +
        `SELECT ${values} FROM main.${quotedIdentifier(table)};`
      );
    }
    database.exec("DELETE FROM learning_items; COMMIT;");
    return count;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // The transaction may not have started.
    }
    throw error;
  } finally {
    database.close();
  }
}
