import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import JSZip from "jszip";
import type {
  DataBackupPreview,
  ExportDataBackupResult
} from "../shared/data-backup-contracts";
import type { LibraryBook } from "../shared/library-contracts";
import {
  MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION
} from "./learning-library-service";
import {
  emptySentencePracticeProgressBytes,
  parseSentencePracticeProgressBytes
} from "./sentence-practice-progress-store";

const backupFormat = "lingoshelf-data-backup";
const backupFormatVersion = 2;
const minimumBackupFormatVersion = 1;
const sentencePracticeActivityPath = "sentence-practice/activity.json";
const maximumArchiveBytes = 512 * 1024 * 1024;
const maximumEntryBytes = 256 * 1024 * 1024;
const maximumExtractedBytes = 1024 * 1024 * 1024;
const maximumEntryCount = 1004;

export function defaultDataBackupFileName(now = new Date()): string {
  const part = (value: number) => String(value).padStart(2, "0");
  return [
    "VocabReader-backup-",
    now.getFullYear(),
    "-",
    part(now.getMonth() + 1),
    "-",
    part(now.getDate()),
    "-",
    part(now.getHours()),
    part(now.getMinutes()),
    part(now.getSeconds()),
    ".zip"
  ].join("");
}

interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

interface DataBackupManifest {
  format: typeof backupFormat;
  version: number;
  createdAt: string;
  appVersion: string;
  counts: {
    books: number;
    activeLearningItems: number;
    trashedLearningItems: number;
  };
  files: ManifestFile[];
}

interface PreparedRestore {
  directory: string;
  preview: DataBackupPreview;
}

export interface DataBackupServiceOptions {
  libraryPath: string;
  learningDatabasePath: string;
  temporaryRoot: string;
  appVersion: string;
  now?: () => Date;
  waitForBookWrites: () => Promise<void>;
  snapshotBookIndex?: () => Promise<LibraryBook[]>;
  snapshotLearningDatabase: (destinationPath: string) => Promise<void>;
  sentencePracticeProgressPath?: string;
  snapshotSentencePracticeProgress?: () => Promise<Uint8Array>;
  closeLearningDatabase: () => void;
  relaunch: () => void;
  onRestoreStep?: (
    step: "library-replaced" | "learning-library-replaced" |
      "sentence-practice-replaced"
  ) => void;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function databaseCounts(databasePath: string): {
  activeLearningItems: number;
  trashedLearningItems: number;
} {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: string;
    };
    if (integrity.integrity_check !== "ok") {
      throw new Error("Learning Library database integrity check failed");
    }
    const foreignKeyProblem = database.prepare("PRAGMA foreign_key_check").get();
    if (foreignKeyProblem) {
      throw new Error("Learning Library database relationship integrity check failed");
    }
    const migration = database.prepare(
      "SELECT MAX(version) AS version FROM schema_migrations"
    ).get() as { version: number | null };
    if (
      Number(migration.version ?? 0) >
      MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION
    ) {
      throw new Error("The backup uses a newer Learning Library version");
    }
    const rows = database.prepare(`
      SELECT status, COUNT(*) AS count
      FROM learning_items
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;
    return {
      activeLearningItems: Number(
        rows.find((row) => row.status === "active")?.count ?? 0
      ),
      trashedLearningItems: Number(
        rows.find((row) => row.status === "trashed")?.count ?? 0
      )
    };
  } finally {
    database.close();
  }
}

function manifestFile(path: string, bytes: Uint8Array): ManifestFile {
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function validFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateBookState(candidate: Partial<LibraryBook>): void {
  if (
    (candidate.coverDataUrl !== null &&
      typeof candidate.coverDataUrl !== "string") ||
    !validFiniteNumber(candidate.progressPercent, 0, 100) ||
    (candidate.lastChapterId !== null &&
      typeof candidate.lastChapterId !== "string") ||
    (candidate.epubParseVersion !== undefined &&
      (!Number.isInteger(candidate.epubParseVersion) ||
        candidate.epubParseVersion < 1 ||
        candidate.epubParseVersion > 3))
  ) {
    throw new Error("The Book Library index contains an invalid book state");
  }
  const readingState = record(candidate.readingState);
  if (
    !readingState ||
    (readingState.view !== "overview" && readingState.view !== "reader") ||
    (readingState.chapterId !== null &&
      typeof readingState.chapterId !== "string") ||
    !validFiniteNumber(readingState.scrollProgress, 0, 1)
  ) {
    throw new Error("The Book Library index contains an invalid reading state");
  }
  const chapterIds = new Set<string>();
  for (const rawChapter of candidate.chapters ?? []) {
    const chapter = record(rawChapter);
    const contentHrefs = chapter?.contentHrefs;
    if (
      !chapter ||
      typeof chapter.id !== "string" ||
      !chapter.id ||
      chapterIds.has(chapter.id) ||
      typeof chapter.title !== "string" ||
      !chapter.title ||
      !Number.isInteger(chapter.order) ||
      Number(chapter.order) < 0 ||
      typeof chapter.href !== "string" ||
      unsafeArchivePath(chapter.href) ||
      (contentHrefs !== undefined &&
        (!Array.isArray(contentHrefs) ||
          !contentHrefs.length ||
          contentHrefs.some((href) =>
            typeof href !== "string" || unsafeArchivePath(href)
          ) ||
          contentHrefs[0] !== chapter.href)) ||
      (candidate.epubParseVersion === 3 && contentHrefs === undefined) ||
      !Number.isInteger(chapter.depth) ||
      Number(chapter.depth) < 0 ||
      (chapter.fragment !== null && typeof chapter.fragment !== "string")
    ) {
      throw new Error("The Book Library index contains an invalid chapter");
    }
    chapterIds.add(chapter.id);
  }
  if (!chapterIds.size) throw new Error("The Book Library index contains a book with no chapters");
  for (const chapterId of [
    candidate.lastChapterId,
    readingState.chapterId
  ]) {
    if (chapterId !== null && !chapterIds.has(String(chapterId))) {
      throw new Error("The Book Library reading state points to an unknown chapter");
    }
  }
  const ranges = candidate.chapterRanges === undefined
    ? {}
    : record(candidate.chapterRanges);
  if (!ranges) throw new Error("The Book Library index contains an invalid reading segment");
  for (const [chapterId, rawRange] of Object.entries(ranges)) {
    const range = record(rawRange);
    if (
      !chapterIds.has(chapterId) ||
      !range ||
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      Number(range.start) < 0 ||
      Number(range.end) < Number(range.start)
    ) {
      throw new Error("The Book Library index contains an invalid reading segment");
    }
  }
  const annotationsByChapter = candidate.chapterAnnotations === undefined
    ? {}
    : record(candidate.chapterAnnotations);
  if (!annotationsByChapter) throw new Error("The Book Library index contains invalid annotations");
  for (const [chapterId, rawAnnotations] of Object.entries(
    annotationsByChapter
  )) {
    if (!chapterIds.has(chapterId) || !Array.isArray(rawAnnotations)) {
      throw new Error("The Book Library index contains invalid annotations");
    }
    const rangesInChapter: Array<{ start: number; end: number }> = [];
    const annotationIds = new Set<string>();
    for (const rawAnnotation of rawAnnotations) {
      const annotation = record(rawAnnotation);
      if (
        !annotation ||
        typeof annotation.id !== "string" ||
        !annotation.id ||
        annotationIds.has(annotation.id) ||
        !Number.isInteger(annotation.start) ||
        !Number.isInteger(annotation.end) ||
        Number(annotation.start) < 0 ||
        Number(annotation.end) <= Number(annotation.start) ||
        typeof annotation.text !== "string" ||
        !annotation.text
      ) {
        throw new Error("The Book Library index contains invalid annotations");
      }
      annotationIds.add(annotation.id);
      rangesInChapter.push({
        start: Number(annotation.start),
        end: Number(annotation.end)
      });
    }
    rangesInChapter.sort((left, right) =>
      left.start - right.start || left.end - right.end
    );
    if (rangesInChapter.some((range, index) =>
      index > 0 && range.start < rangesInChapter[index - 1].end
    )) {
      throw new Error("The Book Library index contains overlapping annotations");
    }
  }
}

function parseBookIndex(bytes: Buffer): LibraryBook[] {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Invalid Book Library index");
  }
  if (!Array.isArray(value)) throw new Error("Invalid Book Library index");
  for (const book of value) {
    const candidate = book as Partial<LibraryBook>;
    if (
      !book ||
      typeof book !== "object" ||
      typeof candidate.id !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.id) ||
      typeof candidate.title !== "string" ||
      !candidate.title.trim() ||
      typeof candidate.author !== "string" ||
      !Array.isArray(candidate.chapters) ||
      !candidate.readingState ||
      typeof candidate.readingState !== "object"
    ) {
      throw new Error("The Book Library index contains an invalid book");
    }
    validateBookState(candidate);
  }
  return value as LibraryBook[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseManifest(bytes: Buffer): DataBackupManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Invalid VocabReader backup");
  }
  const manifest = record(value);
  const counts = record(manifest?.counts);
  if (manifest?.format !== backupFormat) {
    throw new Error("This is not a VocabReader data backup");
  }
  if (!Number.isInteger(manifest.version) ||
    Number(manifest.version) < minimumBackupFormatVersion ||
    Number(manifest.version) > backupFormatVersion) {
    throw new Error(
      typeof manifest.version === "number" &&
      manifest.version > backupFormatVersion
        ? "This backup uses a newer format. Update VocabReader first"
        : "This VocabReader backup format is not supported"
    );
  }
  if (
    typeof manifest.createdAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    typeof manifest.appVersion !== "string" ||
    !manifest.appVersion ||
    !counts ||
    !Number.isInteger(counts.books) ||
    !Number.isInteger(counts.activeLearningItems) ||
    !Number.isInteger(counts.trashedLearningItems) ||
    Number(counts.books) < 0 ||
    Number(counts.activeLearningItems) < 0 ||
    Number(counts.trashedLearningItems) < 0 ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error("Invalid VocabReader backup manifest");
  }
  const files: ManifestFile[] = manifest.files.map((rawFile) => {
    const file = record(rawFile);
    if (
      !file ||
      typeof file.path !== "string" ||
      !Number.isInteger(file.bytes) ||
      Number(file.bytes) < 0 ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("Invalid file information in the VocabReader backup manifest");
    }
    return {
      path: file.path,
      bytes: Number(file.bytes),
      sha256: file.sha256
    };
  });
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error("The VocabReader backup manifest contains duplicate files");
  }
  return {
    format: backupFormat,
    version: Number(manifest.version),
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    counts: {
      books: Number(counts.books),
      activeLearningItems: Number(counts.activeLearningItems),
      trashedLearningItems: Number(counts.trashedLearningItems)
    },
    files
  };
}

function unsafeArchivePath(path: string): boolean {
  return (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[a-z]:/i.test(path) ||
    path.split("/").some((part) => part === "." || part === ".." || !part)
  );
}

function allowedPayloadPath(path: string): boolean {
  return (
    path === "library/index.json" ||
    path === "learning-library/learning-items.sqlite" ||
    path === sentencePracticeActivityPath ||
    /^library\/books\/[a-f0-9]{64}\/book\.epub$/.test(path)
  );
}

function allowedDirectoryPath(path: string): boolean {
  return (
    path === "library" ||
    path === "library/books" ||
    path === "learning-library" ||
    path === "sentence-practice" ||
    /^library\/books\/[a-f0-9]{64}$/.test(path)
  );
}

function moveIfPresent(source: string, destination: string): boolean {
  if (!existsSync(source)) return false;
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
  return true;
}

async function replaceDestinationFile(
  partialPath: string,
  destinationPath: string
): Promise<void> {
  const previousPath = `${destinationPath}.${randomUUID()}.previous`;
  let previousMoved = false;
  try {
    try {
      await rename(destinationPath, previousPath);
      previousMoved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(partialPath, destinationPath);
    if (previousMoved) await rm(previousPath, { force: true });
  } catch (error) {
    if (previousMoved) {
      await rm(destinationPath, { force: true }).catch(() => undefined);
      await rename(previousPath, destinationPath).catch(() => undefined);
    }
    throw error;
  }
}

export class DataBackupService {
  readonly #now: () => Date;
  readonly #preparedRestores = new Map<string, PreparedRestore>();
  #busy = false;

  constructor(private readonly options: DataBackupServiceOptions) {
    this.#now = options.now ?? (() => new Date());
  }

  #sentencePracticeProgressPath(): string {
    return this.options.sentencePracticeProgressPath ?? join(
      dirname(dirname(this.options.learningDatabasePath)),
      "settings",
      "sentence-practice-progress.json"
    );
  }

  async #snapshotSentencePracticeProgress(): Promise<Buffer> {
    let bytes: Buffer;
    if (this.options.snapshotSentencePracticeProgress) {
      bytes = Buffer.from(await this.options.snapshotSentencePracticeProgress());
    } else {
      try {
        bytes = await readFile(this.#sentencePracticeProgressPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        bytes = emptySentencePracticeProgressBytes();
      }
    }
    parseSentencePracticeProgressBytes(bytes);
    return bytes;
  }

  async exportToPath(destinationPath: string): Promise<ExportDataBackupResult> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    this.#busy = true;
    let temporaryDirectory: string | undefined;
    let partialPath: string | undefined;
    try {
      await mkdir(this.options.temporaryRoot, { recursive: true });
      temporaryDirectory = await mkdtemp(
        join(this.options.temporaryRoot, "export-")
      );
      partialPath = join(
        dirname(destinationPath),
        `.${basename(destinationPath)}.${randomUUID()}.partial`
      );
      await this.options.waitForBookWrites();
      const indexPath = join(this.options.libraryPath, "index.json");
      let indexBytes: Buffer;
      if (this.options.snapshotBookIndex) {
        indexBytes = Buffer.from(
          `${JSON.stringify(await this.options.snapshotBookIndex(), null, 2)}\n`,
          "utf8"
        );
      } else {
        try {
          indexBytes = await readFile(indexPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          indexBytes = Buffer.from("[]\n");
        }
      }
      const books = parseBookIndex(indexBytes);
      const learningSnapshotPath = join(
        temporaryDirectory,
        "learning-items.sqlite"
      );
      await this.options.snapshotLearningDatabase(learningSnapshotPath);
      const learningBytes = await readFile(learningSnapshotPath);
      const sentencePracticeBytes =
        await this.#snapshotSentencePracticeProgress();
      const counts = databaseCounts(learningSnapshotPath);
      const payloads: Array<{ path: string; bytes: Buffer }> = [{
        path: "library/index.json",
        bytes: indexBytes
      }];
      for (const book of books) {
        const epubBytes = await readFile(
          join(this.options.libraryPath, "books", book.id, "book.epub")
        );
        if (sha256(epubBytes) !== book.id) {
          throw new Error(`Content validation failed for “${book.title ?? book.id}”`);
        }
        payloads.push({
          path: `library/books/${book.id}/book.epub`,
          bytes: epubBytes
        });
      }
      payloads.push({
        path: "learning-library/learning-items.sqlite",
        bytes: learningBytes
      });
      payloads.push({
        path: sentencePracticeActivityPath,
        bytes: sentencePracticeBytes
      });
      const manifest: DataBackupManifest = {
        format: backupFormat,
        version: backupFormatVersion,
        createdAt: this.#now().toISOString(),
        appVersion: this.options.appVersion,
        counts: {
          books: books.length,
          ...counts
        },
        files: payloads.map((payload) =>
          manifestFile(payload.path, payload.bytes)
        )
      };
      const zip = new JSZip();
      for (const payload of payloads) {
        zip.file(payload.path, payload.bytes, { createFolders: false });
      }
      zip.file(
        "manifest.json",
        `${JSON.stringify(manifest, null, 2)}\n`,
        { createFolders: false }
      );
      const archive = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      await writeFile(partialPath, archive);
      await replaceDestinationFile(partialPath, destinationPath);
      return { status: "exported", fileName: basename(destinationPath) };
    } finally {
      if (partialPath) {
        await rm(partialPath, { force: true }).catch(() => undefined);
      }
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true })
          .catch(() => undefined);
      }
      this.#busy = false;
    }
  }

  async selectBackupFromPath(archivePath: string): Promise<DataBackupPreview> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    this.#busy = true;
    let preparedDirectory: string | undefined;
    try {
      await mkdir(this.options.temporaryRoot, { recursive: true });
      preparedDirectory = await mkdtemp(
        join(this.options.temporaryRoot, "restore-")
      );
      await this.#clearPreparedRestores();
      const archive = await readFile(archivePath);
      if (archive.byteLength > maximumArchiveBytes) {
        throw new Error("The backup ZIP exceeds the allowed size");
      }
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(archive);
      } catch {
        throw new Error("Unable to read the VocabReader backup ZIP");
      }
      const entries = Object.values(zip.files);
      if (entries.length > maximumEntryCount) {
        throw new Error("The backup ZIP contains too many files");
      }
      for (const entry of entries) {
        const safetyPath = entry.dir && entry.name.endsWith("/")
          ? entry.name.slice(0, -1)
          : entry.name;
        const unsafeOriginalName = (
          entry as JSZip.JSZipObject & { unsafeOriginalName?: string }
        ).unsafeOriginalName;
        if (
          unsafeArchivePath(safetyPath) ||
          (entry.dir && !allowedDirectoryPath(safetyPath)) ||
          (unsafeOriginalName !== undefined &&
            unsafeOriginalName !== entry.name) ||
          (typeof entry.unixPermissions === "number" &&
            (entry.unixPermissions & 0o170000) === 0o120000)
        ) {
          throw new Error("The backup ZIP contains an unsafe file path");
        }
        const uncompressedSize = (
          entry as JSZip.JSZipObject & {
            _data?: { uncompressedSize?: number };
          }
        )._data?.uncompressedSize;
        if (
          typeof uncompressedSize === "number" &&
          uncompressedSize > maximumEntryBytes
        ) {
          throw new Error("A file in the backup ZIP exceeds the allowed size");
        }
      }
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) throw new Error("This is not a VocabReader data backup");
      const manifestBytes = await manifestEntry.async("nodebuffer");
      const manifest = parseManifest(manifestBytes);
      const declaredPaths = new Set(manifest.files.map((file) => file.path));
      const archivePaths = new Set(
        entries
          .filter((entry) => !entry.dir)
          .map((entry) => entry.name)
          .filter((path) => path !== "manifest.json")
      );
      if (
        declaredPaths.size !== archivePaths.size ||
        [...declaredPaths].some((path) =>
          !archivePaths.has(path) || !allowedPayloadPath(path)
        )
      ) {
        throw new Error("The backup ZIP contains an undeclared or disallowed file");
      }
      const payloads = new Map<string, Buffer>();
      let extractedBytes = 0;
      for (const declared of manifest.files) {
        const entry = zip.file(declared.path);
        if (!entry) throw new Error(`The backup is missing required file: ${declared.path}`);
        const bytes = await entry.async("nodebuffer");
        extractedBytes += bytes.byteLength;
        if (
          bytes.byteLength > maximumEntryBytes ||
          extractedBytes > maximumExtractedBytes
        ) {
          throw new Error("The extracted backup ZIP exceeds the allowed size");
        }
        if (
          bytes.byteLength !== declared.bytes ||
          sha256(bytes) !== declared.sha256
        ) {
          throw new Error(`Backup file checksum mismatch: ${declared.path}`);
        }
        payloads.set(declared.path, bytes);
      }
      const indexBytes = payloads.get("library/index.json");
      const learningBytes = payloads.get(
        "learning-library/learning-items.sqlite"
      );
      if (!indexBytes || !learningBytes) {
        throw new Error("The backup is missing Book Library or Learning Library data");
      }
      const books = parseBookIndex(indexBytes);
      const sentencePracticeBytes = payloads.get(sentencePracticeActivityPath);
      if (manifest.version === 2 && !sentencePracticeBytes) {
        throw new Error("The backup is missing Sentence Practice activity data");
      }
      if (manifest.version === 1 && sentencePracticeBytes) {
        throw new Error("The legacy backup contains unsupported Sentence Practice data");
      }
      const normalizedSentencePracticeBytes = sentencePracticeBytes ??
        emptySentencePracticeProgressBytes();
      parseSentencePracticeProgressBytes(normalizedSentencePracticeBytes);
      if (books.length !== manifest.counts.books) {
        throw new Error("The backup book count does not match the manifest");
      }
      const bookIds = new Set<string>();
      for (const book of books) {
        if (bookIds.has(book.id)) throw new Error("The backup Book Library contains duplicate books");
        bookIds.add(book.id);
        const bookPath = `library/books/${book.id}/book.epub`;
        const epub = payloads.get(bookPath);
        if (!epub || sha256(epub) !== book.id) {
          throw new Error(`Backup content validation failed for “${book.title}”`);
        }
      }
      if (
        [...payloads.keys()].filter((path) =>
          path.startsWith("library/books/")
        ).length !== books.length
      ) {
        throw new Error("The backup contains an EPUB not listed in the Book Library index");
      }
      for (const [path, bytes] of payloads) {
        const destination = join(preparedDirectory, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }
      if (!sentencePracticeBytes) {
        const destination = join(
          preparedDirectory,
          sentencePracticeActivityPath
        );
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, normalizedSentencePracticeBytes);
      }
      const actualCounts = databaseCounts(join(
        preparedDirectory,
        "learning-library",
        "learning-items.sqlite"
      ));
      if (
        actualCounts.activeLearningItems !==
          manifest.counts.activeLearningItems ||
        actualCounts.trashedLearningItems !==
          manifest.counts.trashedLearningItems
      ) {
        throw new Error("The backup Learning Library count does not match the manifest");
      }
      const token = randomUUID();
      const preview: DataBackupPreview = {
        token,
        createdAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        books: manifest.counts.books,
        activeLearningItems: manifest.counts.activeLearningItems,
        trashedLearningItems: manifest.counts.trashedLearningItems
      };
      this.#preparedRestores.set(token, {
        directory: preparedDirectory,
        preview
      });
      return preview;
    } catch (error) {
      if (preparedDirectory) {
        await rm(preparedDirectory, { recursive: true, force: true })
          .catch(() => undefined);
      }
      throw error;
    } finally {
      this.#busy = false;
    }
  }

  async cancelRestore(token: string): Promise<void> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    this.#busy = true;
    try {
      const prepared = this.#preparedRestores.get(token);
      if (!prepared) return;
      this.#preparedRestores.delete(token);
      await rm(prepared.directory, { recursive: true, force: true });
    } finally {
      this.#busy = false;
    }
  }

  async restoreBackup(token: string): Promise<void> {
    if (this.#busy) throw new Error("Another data-backup operation is in progress");
    const prepared = this.#preparedRestores.get(token);
    if (!prepared) throw new Error("The restore preview expired. Select the backup again");
    this.#busy = true;
    const currentLibraryPath = this.options.libraryPath;
    const currentLearningPath = dirname(this.options.learningDatabasePath);
    const preparedLibraryPath = join(prepared.directory, "library");
    const preparedLearningPath = join(prepared.directory, "learning-library");
    const currentSentencePracticePath = this.#sentencePracticeProgressPath();
    const preparedSentencePracticePath = join(
      prepared.directory,
      sentencePracticeActivityPath
    );
    const rollbackPath = join(
      dirname(currentLibraryPath),
      `.data-backup-rollback-${randomUUID()}`
    );
    const rollbackLibraryPath = join(rollbackPath, "library");
    const rollbackLearningPath = join(rollbackPath, "learning-library");
    const rollbackSentencePracticePath = join(
      rollbackPath,
      "sentence-practice",
      "sentence-practice-progress.json"
    );
    let originalLibraryMoved = false;
    let originalLearningMoved = false;
    let originalSentencePracticeMoved = false;
    let newLibraryInstalled = false;
    let newLearningInstalled = false;
    let newSentencePracticeInstalled = false;
    let restoreCommitted = false;
    try {
      await this.options.waitForBookWrites();
      this.options.closeLearningDatabase();
      mkdirSync(rollbackPath, { recursive: true });
      originalLibraryMoved = moveIfPresent(
        currentLibraryPath,
        rollbackLibraryPath
      );
      mkdirSync(dirname(currentLibraryPath), { recursive: true });
      renameSync(preparedLibraryPath, currentLibraryPath);
      newLibraryInstalled = true;
      this.options.onRestoreStep?.("library-replaced");
      originalLearningMoved = moveIfPresent(
        currentLearningPath,
        rollbackLearningPath
      );
      mkdirSync(dirname(currentLearningPath), { recursive: true });
      renameSync(preparedLearningPath, currentLearningPath);
      newLearningInstalled = true;
      this.options.onRestoreStep?.("learning-library-replaced");
      originalSentencePracticeMoved = moveIfPresent(
        currentSentencePracticePath,
        rollbackSentencePracticePath
      );
      mkdirSync(dirname(currentSentencePracticePath), { recursive: true });
      renameSync(preparedSentencePracticePath, currentSentencePracticePath);
      newSentencePracticeInstalled = true;
      this.options.onRestoreStep?.("sentence-practice-replaced");
      parseBookIndex(readFileSync(join(currentLibraryPath, "index.json")));
      databaseCounts(this.options.learningDatabasePath);
      parseSentencePracticeProgressBytes(
        readFileSync(currentSentencePracticePath)
      );
      this.options.relaunch();
      restoreCommitted = true;
    } catch (error) {
      try {
        if (newSentencePracticeInstalled) {
          rmSync(currentSentencePracticePath, { force: true });
        }
        if (originalSentencePracticeMoved) {
          mkdirSync(dirname(currentSentencePracticePath), { recursive: true });
          renameSync(
            rollbackSentencePracticePath,
            currentSentencePracticePath
          );
        }
        if (newLearningInstalled) {
          rmSync(currentLearningPath, { recursive: true, force: true });
        }
        if (originalLearningMoved) {
          renameSync(rollbackLearningPath, currentLearningPath);
        }
        if (newLibraryInstalled) {
          rmSync(currentLibraryPath, { recursive: true, force: true });
        }
        if (originalLibraryMoved) {
          renameSync(rollbackLibraryPath, currentLibraryPath);
        }
      } finally {
        rmSync(rollbackPath, { recursive: true, force: true });
        this.#preparedRestores.delete(token);
        rmSync(prepared.directory, { recursive: true, force: true });
      }
      throw error;
    } finally {
      if (restoreCommitted) {
        this.#preparedRestores.delete(token);
        try {
          rmSync(rollbackPath, { recursive: true, force: true });
        } catch {
          // The restored data is already committed; stale rollback cleanup is best-effort.
        }
        try {
          rmSync(prepared.directory, { recursive: true, force: true });
        } catch {
          // The App is relaunching; stale staging cleanup is best-effort.
        }
      }
      this.#busy = false;
    }
  }

  async #clearPreparedRestores(): Promise<void> {
    const prepared = [...this.#preparedRestores.values()];
    this.#preparedRestores.clear();
    await Promise.all(prepared.map((entry) =>
      rm(entry.directory, { recursive: true, force: true })
    ));
  }
}
