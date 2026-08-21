// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, LearningLanguage } from "../shared/settings-contracts";
import { LearningLanguageDataBackupService } from "./learning-language-data-backup-service";
import { LocalLearningLibrary } from "./learning-library-service";

const directories: string[] = [];
const settings: AppSettings = {
  learningLanguage: "ja",
  explanationLanguage: "zh-TW",
  explanationLanguages: { en: "en", ja: "zh-TW", "zh-TW": "source" },
  aiConversationFontSize: 13,
  ebookContentFontSize: 19,
  readingPaperWidth: 760,
  ebookLineHeight: 1.9,
  dailyNewItemCompletionLimit: 10,
  dailyDueReviewCompletionLimit: 50,
  dailySentencePracticeGoal: 10,
  dailyListenRepeatGoal: 10,
  reviewPaperSize: 10,
  selectionSpeechVoice: "cedar",
  selectionSpeechTone: "learning"
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LearningLanguageDataBackupService", () => {
  it("exports, previews, and restores all workspaces with settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "vocabreader-workspace-backup-"));
    directories.push(root);
    const restored: LearningLanguage[] = [];
    const counts = {
      en: { books: 1, activeLearningItems: 2, trashedLearningItems: 3 },
      ja: { books: 4, activeLearningItems: 5, trashedLearningItems: 6 },
      "zh-TW": { books: 7, activeLearningItems: 8, trashedLearningItems: 9 }
    };
    const workspaces = Object.fromEntries(
      (["en", "ja", "zh-TW"] as const).map((language) => [language, {
        exportToPath: async (path: string) => {
          await writeFile(path, `${language}-backup`);
          return { status: "exported" as const, fileName: `${language}.zip` };
        },
        selectBackupFromPath: async () => ({
          token: `${language}-token-1234`,
          createdAt: "2026-08-21T08:00:00.000Z",
          appVersion: "0.1.0",
          ...counts[language]
        }),
        cancelRestore: vi.fn(),
        restoreBackup: async () => { restored.push(language); }
      }])
    ) as unknown as ConstructorParameters<
      typeof LearningLanguageDataBackupService
    >[0]["workspaces"];
    const saveSettings = vi.fn().mockResolvedValue(settings);
    const relaunch = vi.fn();
    const service = new LearningLanguageDataBackupService({
      workspaces,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      now: () => new Date("2026-08-21T08:00:00.000Z"),
      loadSettings: async () => settings,
      saveSettings,
      relaunch
    });
    const archivePath = join(root, "all.zip");

    await expect(service.exportToPath(archivePath)).resolves.toEqual({
      status: "exported",
      fileName: "all.zip"
    });
    const zip = await JSZip.loadAsync(await readFile(archivePath));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      "manifest.json",
      "settings.json",
      "workspaces/en.zip",
      "workspaces/ja.zip",
      "workspaces/zh-TW.zip"
    ]));
    const preview = await service.selectBackupFromPath(archivePath);
    expect(preview).toMatchObject({
      books: 12,
      activeLearningItems: 15,
      trashedLearningItems: 18,
      workspaceCounts: counts
    });

    await service.restoreBackup(preview.token);
    expect(restored).toEqual(["en", "ja", "zh-TW"]);
    expect(saveSettings).toHaveBeenCalledWith(settings);
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("converts a validated legacy backup into language workspaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "vocabreader-legacy-backup-"));
    directories.push(root);
    const databasePath = join(root, "legacy.sqlite");
    const library = new LocalLearningLibrary(databasePath, {
      seedMockItems: false
    });
    for (const [title, language] of [
      ["hello", "en"],
      ["食べる", "ja"],
      ["理解", "zh-TW"],
      ["bonjour", "other"]
    ] as const) {
      await library.createItem({
        title,
        itemType: "word",
        language,
        cefr: "A1",
        sense: title,
        markdownContent: `## Meaning\n${title}`
      });
    }
    library.close();
    const legacy = new JSZip();
    legacy.file("manifest.json", JSON.stringify({
      format: "lingoshelf-data-backup",
      version: 3,
      createdAt: "2026-08-20T08:00:00.000Z",
      appVersion: "0.1.0"
    }));
    legacy.file("library/index.json", "[]\n");
    legacy.file(
      "learning-library/learning-items.sqlite",
      await readFile(databasePath)
    );
    legacy.file("sentence-practice/activity.json", JSON.stringify({
      version: 2,
      daily: []
    }));
    legacy.file("listen-and-repeat/activity.json", JSON.stringify({
      version: 1,
      daily: []
    }));
    const archivePath = join(root, "legacy.zip");
    await writeFile(archivePath, await legacy.generateAsync({ type: "nodebuffer" }));
    let sequence = 0;
    const workspaces = Object.fromEntries(
      (["en", "ja", "zh-TW"] as const).map((language) => [language, {
        exportToPath: vi.fn(),
        selectBackupFromPath: async (path: string) => {
          if (path === archivePath) {
            return {
              token: "legacy-validation-token",
              createdAt: "2026-08-20T08:00:00.000Z",
              appVersion: "0.1.0",
              books: 0,
              activeLearningItems: 4,
              trashedLearningItems: 0
            };
          }
          const inner = await JSZip.loadAsync(await readFile(path));
          const bytes = await inner.file(
            "learning-library/learning-items.sqlite"
          )!.async("nodebuffer");
          const inspectedPath = join(root, `inspected-${sequence++}.sqlite`);
          await writeFile(inspectedPath, bytes);
          const database = new DatabaseSync(inspectedPath, { readOnly: true });
          const rows = database.prepare(
            "SELECT language FROM learning_items"
          ).all() as Array<{ language: string }>;
          database.close();
          expect(rows.every((row) => row.language === language)).toBe(true);
          return {
            token: `${language}-converted-token`,
            createdAt: "2026-08-20T08:00:00.000Z",
            appVersion: "0.1.0",
            books: 0,
            activeLearningItems: rows.length,
            trashedLearningItems: 0
          };
        },
        cancelRestore: vi.fn(),
        restoreBackup: vi.fn()
      }])
    ) as unknown as ConstructorParameters<
      typeof LearningLanguageDataBackupService
    >[0]["workspaces"];
    const service = new LearningLanguageDataBackupService({
      workspaces,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      loadSettings: async () => settings,
      saveSettings: async (value) => value,
      relaunch: vi.fn()
    });

    await expect(service.selectBackupFromPath(archivePath)).resolves.toMatchObject({
      activeLearningItems: 3,
      trashedLearningItems: 0,
      unclassifiedLearningItems: 1,
      workspaceCounts: {
        en: { activeLearningItems: 1 },
        ja: { activeLearningItems: 1 },
        "zh-TW": { activeLearningItems: 1 }
      }
    });
  });
});
