import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import JSZip from "jszip";
import type {
  DataBackupPreview,
  ExportDataBackupResult
} from "../shared/data-backup-contracts";
import type {
  AppSettings,
  LearningLanguage
} from "../shared/settings-contracts";
import {
  isAiConversationFontSize,
  isDailyReviewCompletionLimit,
  isEbookContentFontSize,
  isEbookLineHeight,
  isExplanationLanguage,
  isExplanationLanguages,
  isLearningLanguage,
  isReadingPaperWidth,
  isReviewPaperSize,
  isSelectionSpeechTone,
  isSelectionSpeechVoice
} from "../shared/settings-contracts";
import { emptySentencePracticeProgressBytes } from "./sentence-practice-progress-store";
import { emptyListenRepeatProgressBytes } from "./listen-repeat-progress-store";

interface WorkspaceBackupOperations {
  exportToPath(path: string): Promise<ExportDataBackupResult>;
  selectBackupFromPath(path: string): Promise<DataBackupPreview>;
  cancelRestore(token: string): Promise<void>;
  restoreBackup(token: string): Promise<void>;
}

interface PreparedWorkspaceRestore {
  directory: string;
  settings: AppSettings;
  previews: Record<LearningLanguage, DataBackupPreview>;
  unclassifiedBytes?: Buffer;
  unclassifiedLearningItems: number;
}

export interface LearningLanguageDataBackupServiceOptions {
  workspaces: Record<LearningLanguage, WorkspaceBackupOperations>;
  temporaryRoot: string;
  appVersion: string;
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  relaunch(): void;
  snapshotUnclassified?(): Promise<Uint8Array | undefined>;
  inspectUnclassified?(bytes: Uint8Array): Promise<number>;
  restoreUnclassified?(bytes: Uint8Array | undefined): Promise<void>;
  now?: () => Date;
}

const languages: LearningLanguage[] = ["en", "ja", "zh-TW", "ko"];
const versionOneLanguages: LearningLanguage[] = ["en", "ja", "zh-TW"];
const format = "vocabreader-learning-language-backup";
const legacyFormat = "lingoshelf-data-backup";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function filterLearningDatabase(path: string, language: LearningLanguage | "other") {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    database.prepare("DELETE FROM learning_items WHERE language <> ?").run(language);
    const rows = database.prepare(`
      SELECT status, COUNT(*) AS count FROM learning_items GROUP BY status
    `).all() as Array<{ status: string; count: number }>;
    database.exec("COMMIT;");
    return {
      activeLearningItems: Number(
        rows.find(({ status }) => status === "active")?.count ?? 0
      ),
      trashedLearningItems: Number(
        rows.find(({ status }) => status === "trashed")?.count ?? 0
      )
    };
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

function normalizeSettings(value: unknown): AppSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const settings = value as Partial<AppSettings>;
  const storedExplanationLanguages = settings.explanationLanguages as unknown;
  const legacyExplanationLanguages = storedExplanationLanguages &&
    typeof storedExplanationLanguages === "object"
    ? storedExplanationLanguages as Record<string, unknown>
    : undefined;
  const normalizedExplanationLanguages = isExplanationLanguages(
    storedExplanationLanguages
  ) ? storedExplanationLanguages : legacyExplanationLanguages &&
    versionOneLanguages.every((language) =>
      isExplanationLanguage(legacyExplanationLanguages[language])
    ) ? {
        en: legacyExplanationLanguages.en as AppSettings["explanationLanguage"],
        ja: legacyExplanationLanguages.ja as AppSettings["explanationLanguage"],
        "zh-TW": legacyExplanationLanguages["zh-TW"] as AppSettings["explanationLanguage"],
        ko: "source" as const
      } : undefined;
  if (!normalizedExplanationLanguages ||
    !isLearningLanguage(settings.learningLanguage) ||
    !isExplanationLanguage(settings.explanationLanguage) ||
    !isAiConversationFontSize(settings.aiConversationFontSize) ||
    !isEbookContentFontSize(settings.ebookContentFontSize) ||
    !isReadingPaperWidth(settings.readingPaperWidth) ||
    !isEbookLineHeight(settings.ebookLineHeight) ||
    !isDailyReviewCompletionLimit(settings.dailyNewItemCompletionLimit) ||
    !isDailyReviewCompletionLimit(settings.dailyDueReviewCompletionLimit) ||
    !isDailyReviewCompletionLimit(settings.dailySentencePracticeGoal) ||
    !isDailyReviewCompletionLimit(settings.dailyListenRepeatGoal) ||
    !isReviewPaperSize(settings.reviewPaperSize) ||
    !isSelectionSpeechVoice(settings.selectionSpeechVoice) ||
    !isSelectionSpeechTone(settings.selectionSpeechTone)) return undefined;
  return {
    learningLanguage: settings.learningLanguage,
    explanationLanguage: settings.explanationLanguage,
    explanationLanguages: normalizedExplanationLanguages,
    aiConversationFontSize: settings.aiConversationFontSize,
    ebookContentFontSize: settings.ebookContentFontSize,
    readingPaperWidth: settings.readingPaperWidth,
    ebookLineHeight: settings.ebookLineHeight,
    dailyNewItemCompletionLimit: settings.dailyNewItemCompletionLimit,
    dailyDueReviewCompletionLimit: settings.dailyDueReviewCompletionLimit,
    dailySentencePracticeGoal: settings.dailySentencePracticeGoal,
    dailyListenRepeatGoal: settings.dailyListenRepeatGoal,
    reviewPaperSize: settings.reviewPaperSize,
    selectionSpeechVoice: settings.selectionSpeechVoice,
    selectionSpeechTone: settings.selectionSpeechTone
  };
}

export class LearningLanguageDataBackupService {
  readonly #prepared = new Map<string, PreparedWorkspaceRestore>();
  readonly #now: () => Date;
  #busy = false;

  constructor(private readonly options: LearningLanguageDataBackupServiceOptions) {
    this.#now = options.now ?? (() => new Date());
  }

  async exportToPath(path: string): Promise<ExportDataBackupResult> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    this.#busy = true;
    let directory: string | undefined;
    try {
      await mkdir(this.options.temporaryRoot, { recursive: true });
      directory = await mkdtemp(join(this.options.temporaryRoot, "all-export-"));
      const zip = new JSZip();
      for (const language of languages) {
        const workspacePath = join(directory, `${language}.zip`);
        await this.options.workspaces[language].exportToPath(workspacePath);
        zip.file(`workspaces/${language}.zip`, await readFile(workspacePath));
      }
      zip.file("settings.json", `${JSON.stringify(
        await this.options.loadSettings(),
        null,
        2
      )}\n`);
      const unclassifiedBytes = await this.options.snapshotUnclassified?.();
      if (unclassifiedBytes) {
        zip.file("unclassified/learning-items.sqlite", unclassifiedBytes);
      }
      zip.file("manifest.json", `${JSON.stringify({
        format,
        version: 2,
        createdAt: this.#now().toISOString(),
        appVersion: this.options.appVersion,
        workspaces: languages
      }, null, 2)}\n`);
      await writeFile(path, await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      }));
      return { status: "exported", fileName: basename(path) };
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      this.#busy = false;
    }
  }

  async selectBackupFromPath(path: string): Promise<DataBackupPreview> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    this.#busy = true;
    let directory: string | undefined;
    const selected: Array<[LearningLanguage, string]> = [];
    try {
      await mkdir(this.options.temporaryRoot, { recursive: true });
      directory = await mkdtemp(join(this.options.temporaryRoot, "all-restore-"));
      const zip = await JSZip.loadAsync(await readFile(path));
      const manifestEntry = zip.file("manifest.json");
      const settingsEntry = zip.file("settings.json");
      if (!manifestEntry) {
        throw new Error("This is not a learning-language workspace backup");
      }
      const rawManifest = JSON.parse(await manifestEntry.async("text")) as {
        format?: string;
        version?: number;
        createdAt?: string;
        appVersion?: string;
        workspaces?: unknown;
      };
      if (rawManifest.format === legacyFormat) {
        const preview = await this.#selectLegacyBackup(
          path,
          directory,
          zip,
          rawManifest
        );
        directory = undefined;
        return preview;
      }
      if (!settingsEntry) {
        throw new Error("This is not a learning-language workspace backup");
      }
      const allowedEntries = new Set([
        "manifest.json",
        "settings.json",
        ...languages.map((language) => `workspaces/${language}.zip`),
        "unclassified/learning-items.sqlite"
      ]);
      if (Object.values(zip.files).some((entry) =>
        !entry.dir && !allowedEntries.has(entry.name)
      )) {
        throw new Error("The workspace backup contains an undeclared file");
      }
      const manifest = rawManifest;
      const manifestWorkspaces = manifest.workspaces;
      const backupLanguages = manifest.version === 1
        ? versionOneLanguages
        : manifest.version === 2 ? languages : undefined;
      if (manifest.format !== format || !backupLanguages ||
        !Array.isArray(manifestWorkspaces) ||
        manifestWorkspaces.length !== backupLanguages.length ||
        backupLanguages.some((language) => !manifestWorkspaces.includes(language)) ||
        typeof manifest.createdAt !== "string" ||
        !Number.isFinite(Date.parse(manifest.createdAt)) ||
        typeof manifest.appVersion !== "string") {
        throw new Error("Invalid learning-language workspace backup manifest");
      }
      const settings = normalizeSettings(JSON.parse(await settingsEntry.async("text")));
      if (!settings) {
        throw new Error("The workspace backup contains invalid settings");
      }
      const unclassifiedEntry = zip.file("unclassified/learning-items.sqlite");
      const unclassifiedBytes = unclassifiedEntry
        ? await unclassifiedEntry.async("nodebuffer")
        : undefined;
      const unclassifiedLearningItems = unclassifiedBytes &&
        this.options.inspectUnclassified
        ? await this.options.inspectUnclassified(unclassifiedBytes)
        : 0;
      const previews = {} as Record<LearningLanguage, DataBackupPreview>;
      for (const language of languages) {
        const entry = zip.file(`workspaces/${language}.zip`);
        const workspacePath = join(directory, `${language}.zip`);
        if (entry) {
          await writeFile(workspacePath, await entry.async("nodebuffer"));
        } else if (manifest.version === 1 && language === "ko") {
          const preserved = await this.options.workspaces.ko
            .exportToPath(workspacePath);
          if (preserved.status !== "exported") {
            throw new Error("Unable to preserve the current Korean workspace");
          }
        } else {
          throw new Error(`The backup is missing the ${language} workspace`);
        }
        previews[language] = await this.options.workspaces[language]
          .selectBackupFromPath(workspacePath);
        selected.push([language, previews[language].token]);
      }
      const token = randomUUID();
      const workspaceCounts = Object.fromEntries(languages.map((language) => [
        language,
        {
          books: previews[language].books,
          activeLearningItems: previews[language].activeLearningItems,
          trashedLearningItems: previews[language].trashedLearningItems
        }
      ])) as DataBackupPreview["workspaceCounts"];
      const preview: DataBackupPreview = {
        token,
        createdAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        books: languages.reduce((sum, language) => sum + previews[language].books, 0),
        activeLearningItems: languages.reduce(
          (sum, language) => sum + previews[language].activeLearningItems,
          0
        ),
        trashedLearningItems: languages.reduce(
          (sum, language) => sum + previews[language].trashedLearningItems,
          0
        ),
        workspaceCounts,
        unclassifiedLearningItems
      };
      this.#prepared.set(token, {
        directory,
        settings,
        previews,
        unclassifiedBytes,
        unclassifiedLearningItems
      });
      return preview;
    } catch (error) {
      await Promise.all(selected.map(([language, token]) =>
        this.options.workspaces[language].cancelRestore(token)
      ));
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    } finally {
      this.#busy = false;
    }
  }

  async cancelRestore(token: string): Promise<void> {
    const prepared = this.#prepared.get(token);
    if (!prepared) return;
    this.#prepared.delete(token);
    await Promise.all(languages.map((language) =>
      this.options.workspaces[language].cancelRestore(
        prepared.previews[language].token
      )
    ));
    await rm(prepared.directory, { recursive: true, force: true });
  }

  async restoreBackup(token: string): Promise<void> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    const prepared = this.#prepared.get(token);
    if (!prepared) throw new Error("The restore preview expired. Select the backup again");
    this.#busy = true;
    try {
      for (const language of languages) {
        await this.options.workspaces[language].restoreBackup(
          prepared.previews[language].token
        );
      }
      await this.options.restoreUnclassified?.(prepared.unclassifiedBytes);
      await this.options.saveSettings(prepared.settings);
      this.#prepared.delete(token);
      await rm(prepared.directory, { recursive: true, force: true });
      this.options.relaunch();
    } finally {
      this.#busy = false;
    }
  }

  async #selectLegacyBackup(
    archivePath: string,
    directory: string,
    legacyZip: JSZip,
    manifest: {
      createdAt?: string;
      appVersion?: string;
    }
  ): Promise<DataBackupPreview> {
    const validation = await this.options.workspaces.en
      .selectBackupFromPath(archivePath);
    await this.options.workspaces.en.cancelRestore(validation.token);
    if (typeof manifest.createdAt !== "string" ||
      typeof manifest.appVersion !== "string") {
      throw new Error("Invalid legacy backup manifest");
    }
    const learningEntry = legacyZip.file(
      "learning-library/learning-items.sqlite"
    );
    const indexEntry = legacyZip.file("library/index.json");
    if (!learningEntry || !indexEntry) {
      throw new Error("The legacy backup is missing required data");
    }
    const learningBytes = await learningEntry.async("nodebuffer");
    const legacyIndexBytes = await indexEntry.async("nodebuffer");
    const legacyBooks = JSON.parse(legacyIndexBytes.toString("utf8")) as unknown[];
    const sentenceBytes = legacyZip.file("sentence-practice/activity.json")
      ? await legacyZip.file("sentence-practice/activity.json")!.async("nodebuffer")
      : emptySentencePracticeProgressBytes();
    const listenBytes = legacyZip.file("listen-and-repeat/activity.json")
      ? await legacyZip.file("listen-and-repeat/activity.json")!.async("nodebuffer")
      : emptyListenRepeatProgressBytes();
    const previews = {} as Record<LearningLanguage, DataBackupPreview>;
    const selected: Array<[LearningLanguage, string]> = [];
    try {
      for (const language of languages) {
        const databasePath = join(directory, `${language}.sqlite`);
        await writeFile(databasePath, learningBytes);
        const counts = filterLearningDatabase(databasePath, language);
        const databaseBytes = await readFile(databasePath);
        const indexBytes = language === "en"
          ? legacyIndexBytes
          : Buffer.from("[]\n");
        const payloads: Array<{ path: string; bytes: Buffer }> = [{
          path: "library/index.json",
          bytes: indexBytes
        }, {
          path: "learning-library/learning-items.sqlite",
          bytes: databaseBytes
        }, {
          path: "sentence-practice/activity.json",
          bytes: language === "en"
            ? Buffer.from(sentenceBytes)
            : emptySentencePracticeProgressBytes()
        }, {
          path: "listen-and-repeat/activity.json",
          bytes: language === "en"
            ? Buffer.from(listenBytes)
            : emptyListenRepeatProgressBytes()
        }];
        if (language === "en") {
          for (const [entryPath, entry] of Object.entries(legacyZip.files)) {
            if (!entry.dir && entryPath.startsWith("library/books/")) {
              payloads.push({ path: entryPath, bytes: await entry.async("nodebuffer") });
            }
          }
        }
        const inner = new JSZip();
        for (const payload of payloads) inner.file(payload.path, payload.bytes);
        inner.file("manifest.json", `${JSON.stringify({
          format: legacyFormat,
          version: 3,
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
          counts: {
            books: language === "en" ? legacyBooks.length : 0,
            ...counts
          },
          files: payloads.map(({ path, bytes }) => ({
            path,
            bytes: bytes.byteLength,
            sha256: digest(bytes)
          }))
        }, null, 2)}\n`);
        const workspacePath = join(directory, `${language}.zip`);
        await writeFile(workspacePath, await inner.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE"
        }));
        previews[language] = await this.options.workspaces[language]
          .selectBackupFromPath(workspacePath);
        selected.push([language, previews[language].token]);
      }
      const otherPath = join(directory, "other.sqlite");
      await writeFile(otherPath, learningBytes);
      const otherCounts = filterLearningDatabase(otherPath, "other");
      const unclassifiedBytes = await readFile(otherPath);
      const unclassifiedLearningItems =
        otherCounts.activeLearningItems + otherCounts.trashedLearningItems;
      const token = randomUUID();
      const workspaceCounts = Object.fromEntries(languages.map((language) => [
        language,
        {
          books: previews[language].books,
          activeLearningItems: previews[language].activeLearningItems,
          trashedLearningItems: previews[language].trashedLearningItems
        }
      ])) as NonNullable<DataBackupPreview["workspaceCounts"]>;
      const preview: DataBackupPreview = {
        token,
        createdAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        books: legacyBooks.length,
        activeLearningItems: languages.reduce(
          (sum, language) => sum + previews[language].activeLearningItems,
          0
        ),
        trashedLearningItems: languages.reduce(
          (sum, language) => sum + previews[language].trashedLearningItems,
          0
        ),
        workspaceCounts,
        unclassifiedLearningItems
      };
      this.#prepared.set(token, {
        directory,
        settings: await this.options.loadSettings(),
        previews,
        unclassifiedBytes,
        unclassifiedLearningItems
      });
      return preview;
    } catch (error) {
      await Promise.all(selected.map(([language, token]) =>
        this.options.workspaces[language].cancelRestore(token)
      ));
      throw error;
    }
  }
}
