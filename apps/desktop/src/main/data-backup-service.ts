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

const backupFormat = "lingoshelf-data-backup";
const backupFormatVersion = 1;
const maximumArchiveBytes = 512 * 1024 * 1024;
const maximumEntryBytes = 256 * 1024 * 1024;
const maximumExtractedBytes = 1024 * 1024 * 1024;
const maximumEntryCount = 1003;

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
  version: typeof backupFormatVersion;
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
  closeLearningDatabase: () => void;
  relaunch: () => void;
  onRestoreStep?: (
    step: "library-replaced" | "learning-library-replaced"
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
      throw new Error("生詞庫資料庫完整性檢查失敗");
    }
    const foreignKeyProblem = database.prepare("PRAGMA foreign_key_check").get();
    if (foreignKeyProblem) {
      throw new Error("生詞庫資料庫關聯完整性檢查失敗");
    }
    const migration = database.prepare(
      "SELECT MAX(version) AS version FROM schema_migrations"
    ).get() as { version: number | null };
    if (
      Number(migration.version ?? 0) >
      MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION
    ) {
      throw new Error("備份使用較新的生詞庫版本");
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
        candidate.epubParseVersion > 2))
  ) {
    throw new Error("書庫索引包含無效書籍狀態");
  }
  const readingState = record(candidate.readingState);
  if (
    !readingState ||
    (readingState.view !== "overview" && readingState.view !== "reader") ||
    (readingState.chapterId !== null &&
      typeof readingState.chapterId !== "string") ||
    !validFiniteNumber(readingState.scrollProgress, 0, 1)
  ) {
    throw new Error("書庫索引包含無效閱讀狀態");
  }
  const chapterIds = new Set<string>();
  for (const rawChapter of candidate.chapters ?? []) {
    const chapter = record(rawChapter);
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
      !Number.isInteger(chapter.depth) ||
      Number(chapter.depth) < 0 ||
      (chapter.fragment !== null && typeof chapter.fragment !== "string")
    ) {
      throw new Error("書庫索引包含無效章節");
    }
    chapterIds.add(chapter.id);
  }
  if (!chapterIds.size) throw new Error("書庫索引包含沒有章節的書籍");
  for (const chapterId of [
    candidate.lastChapterId,
    readingState.chapterId
  ]) {
    if (chapterId !== null && !chapterIds.has(String(chapterId))) {
      throw new Error("書庫索引的閱讀狀態指向未知章節");
    }
  }
  const ranges = candidate.chapterRanges === undefined
    ? {}
    : record(candidate.chapterRanges);
  if (!ranges) throw new Error("書庫索引的閱讀區段格式錯誤");
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
      throw new Error("書庫索引的閱讀區段格式錯誤");
    }
  }
  const annotationsByChapter = candidate.chapterAnnotations === undefined
    ? {}
    : record(candidate.chapterAnnotations);
  if (!annotationsByChapter) throw new Error("書庫索引的標記格式錯誤");
  for (const [chapterId, rawAnnotations] of Object.entries(
    annotationsByChapter
  )) {
    if (!chapterIds.has(chapterId) || !Array.isArray(rawAnnotations)) {
      throw new Error("書庫索引的標記格式錯誤");
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
        throw new Error("書庫索引的標記格式錯誤");
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
      throw new Error("書庫索引包含重疊標記");
    }
  }
}

function parseBookIndex(bytes: Buffer): LibraryBook[] {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("書庫索引格式錯誤");
  }
  if (!Array.isArray(value)) throw new Error("書庫索引格式錯誤");
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
      throw new Error("書庫索引包含無效書籍");
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
    throw new Error("VocabReader 備份格式錯誤");
  }
  const manifest = record(value);
  const counts = record(manifest?.counts);
  if (manifest?.format !== backupFormat) {
    throw new Error("這不是 VocabReader 資料備份");
  }
  if (manifest.version !== backupFormatVersion) {
    throw new Error(
      typeof manifest.version === "number" &&
      manifest.version > backupFormatVersion
        ? "備份格式版本較新，請先更新 VocabReader"
        : "VocabReader 備份格式版本不受支援"
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
    throw new Error("VocabReader 備份 manifest 格式錯誤");
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
      throw new Error("VocabReader 備份 manifest 檔案資訊錯誤");
    }
    return {
      path: file.path,
      bytes: Number(file.bytes),
      sha256: file.sha256
    };
  });
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error("VocabReader 備份 manifest 含重複檔案");
  }
  return {
    format: backupFormat,
    version: backupFormatVersion,
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
    /^library\/books\/[a-f0-9]{64}\/book\.epub$/.test(path)
  );
}

function allowedDirectoryPath(path: string): boolean {
  return (
    path === "library" ||
    path === "library/books" ||
    path === "learning-library" ||
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

  async exportToPath(destinationPath: string): Promise<ExportDataBackupResult> {
    if (this.#busy) throw new Error("另一個資料備份操作正在進行");
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
          throw new Error(`書籍《${book.title ?? book.id}》內容驗證失敗`);
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
    if (this.#busy) throw new Error("另一個資料備份操作正在進行");
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
        throw new Error("備份 ZIP 超過允許大小");
      }
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(archive);
      } catch {
        throw new Error("無法讀取 VocabReader 備份 ZIP");
      }
      const entries = Object.values(zip.files);
      if (entries.length > maximumEntryCount) {
        throw new Error("備份 ZIP 包含過多檔案");
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
          throw new Error("備份 ZIP 包含不安全的檔案路徑");
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
          throw new Error("備份 ZIP 的單一檔案超過允許大小");
        }
      }
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) throw new Error("這不是 VocabReader 資料備份");
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
        throw new Error("備份 ZIP 包含未宣告或不允許的檔案");
      }
      const payloads = new Map<string, Buffer>();
      let extractedBytes = 0;
      for (const declared of manifest.files) {
        const entry = zip.file(declared.path);
        if (!entry) throw new Error(`備份缺少必要檔案：${declared.path}`);
        const bytes = await entry.async("nodebuffer");
        extractedBytes += bytes.byteLength;
        if (
          bytes.byteLength > maximumEntryBytes ||
          extractedBytes > maximumExtractedBytes
        ) {
          throw new Error("備份 ZIP 解壓後超過允許大小");
        }
        if (
          bytes.byteLength !== declared.bytes ||
          sha256(bytes) !== declared.sha256
        ) {
          throw new Error(`備份檔案完整性 checksum 不符：${declared.path}`);
        }
        payloads.set(declared.path, bytes);
      }
      const indexBytes = payloads.get("library/index.json");
      const learningBytes = payloads.get(
        "learning-library/learning-items.sqlite"
      );
      if (!indexBytes || !learningBytes) {
        throw new Error("備份缺少書庫或生詞庫資料");
      }
      const books = parseBookIndex(indexBytes);
      if (books.length !== manifest.counts.books) {
        throw new Error("備份書籍數量與 manifest 不符");
      }
      const bookIds = new Set<string>();
      for (const book of books) {
        if (bookIds.has(book.id)) throw new Error("備份書庫包含重複書籍");
        bookIds.add(book.id);
        const bookPath = `library/books/${book.id}/book.epub`;
        const epub = payloads.get(bookPath);
        if (!epub || sha256(epub) !== book.id) {
          throw new Error(`備份書籍《${book.title}》內容驗證失敗`);
        }
      }
      if (
        [...payloads.keys()].filter((path) =>
          path.startsWith("library/books/")
        ).length !== books.length
      ) {
        throw new Error("備份含有未列入書庫索引的 EPUB");
      }
      for (const [path, bytes] of payloads) {
        const destination = join(preparedDirectory, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
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
        throw new Error("備份生詞庫數量與 manifest 不符");
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
    if (this.#busy) throw new Error("另一個資料備份操作正在進行");
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
    if (this.#busy) throw new Error("另一個資料備份操作正在進行");
    const prepared = this.#preparedRestores.get(token);
    if (!prepared) throw new Error("資料還原預覽已失效，請重新選取備份");
    this.#busy = true;
    const currentLibraryPath = this.options.libraryPath;
    const currentLearningPath = dirname(this.options.learningDatabasePath);
    const preparedLibraryPath = join(prepared.directory, "library");
    const preparedLearningPath = join(prepared.directory, "learning-library");
    const rollbackPath = join(
      dirname(currentLibraryPath),
      `.data-backup-rollback-${randomUUID()}`
    );
    const rollbackLibraryPath = join(rollbackPath, "library");
    const rollbackLearningPath = join(rollbackPath, "learning-library");
    let originalLibraryMoved = false;
    let originalLearningMoved = false;
    let newLibraryInstalled = false;
    let newLearningInstalled = false;
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
      parseBookIndex(readFileSync(join(currentLibraryPath, "index.json")));
      databaseCounts(this.options.learningDatabasePath);
      this.options.relaunch();
      restoreCommitted = true;
    } catch (error) {
      try {
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
