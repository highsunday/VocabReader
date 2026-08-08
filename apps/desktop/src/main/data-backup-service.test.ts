import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryBook } from "../shared/library-contracts";
import { DataBackupService } from "./data-backup-service";
import { LocalBookLibrary } from "./library-service";
import { LocalLearningLibrary } from "./learning-library-service";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-data-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function createStoredBook(libraryPath: string): Promise<LibraryBook> {
  const archive = new JSZip();
  archive.file("mimetype", "application/epub+zip", { compression: "STORE" });
  archive.file(
    "META-INF/container.xml",
    `<container><rootfiles>
      <rootfile full-path="OEBPS/content.opf"/>
    </rootfiles></container>`
  );
  archive.file(
    "OEBPS/content.opf",
    `<package version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Portable English</dc:title>
        <dc:creator>Test Author</dc:creator>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="chapter"/></spine>
    </package>`
  );
  archive.file(
    "OEBPS/nav.xhtml",
    `<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
      <nav epub:type="toc"><ol>
        <li><a href="chapter.xhtml">Chapter 1</a></li>
      </ol></nav>
    </body></html>`
  );
  archive.file(
    "OEBPS/chapter.xhtml",
    "<html><body><p>Portable chapter content</p></body></html>"
  );
  const epub = await archive.generateAsync({ type: "nodebuffer" });
  const id = createHash("sha256").update(epub).digest("hex");
  const book: LibraryBook = {
    id,
    epubParseVersion: 2,
    title: "Portable English",
    author: "Test Author",
    coverDataUrl: null,
    progressPercent: 42,
    lastChapterId: "chapter-1",
    readingState: {
      view: "reader",
      chapterId: "chapter-1",
      scrollProgress: 0.42
    },
    chapterRanges: {
      "chapter-1": { start: 2, end: 20 }
    },
    chapterAnnotations: {
      "chapter-1": [{
        id: "annotation-1",
        start: 3,
        end: 8,
        text: "table"
      }]
    },
    chapters: [{
      id: "chapter-1",
      title: "Chapter 1",
      order: 0,
      href: "OEBPS/chapter.xhtml",
      depth: 0,
      fragment: null
    }]
  };
  await mkdir(join(libraryPath, "books", id), { recursive: true });
  await writeFile(
    join(libraryPath, "index.json"),
    `${JSON.stringify([book], null, 2)}\n`
  );
  await writeFile(join(libraryPath, "books", id, "book.epub"), epub);
  return book;
}

describe("DataBackupService", () => {
  it("exports one verified ZIP containing complete book and learning data", async () => {
    const root = await temporaryDirectory();
    const libraryPath = join(root, "library");
    const learningDatabasePath = join(root, "learning-library", "learning-items.sqlite");
    const book = await createStoredBook(libraryPath);
    const learningLibrary = new LocalLearningLibrary(learningDatabasePath);
    const activeItems = await learningLibrary.listItems({
      status: "active",
      sort: "recent"
    });
    await learningLibrary.trashItem(activeItems[0].id);
    const destinationPath = join(root, "VocabReader-backup.zip");
    const service = new DataBackupService({
      libraryPath,
      learningDatabasePath,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      now: () => new Date("2026-07-28T03:04:05.000Z"),
      waitForBookWrites: async () => undefined,
      snapshotBookIndex: async () => [book],
      snapshotLearningDatabase: async (path) => {
        await mkdir(join(path, ".."), { recursive: true });
        await copyFile(learningDatabasePath, path);
      },
      closeLearningDatabase: () => undefined,
      relaunch: () => undefined
    });

    const result = await service.exportToPath(destinationPath);

    expect(result).toEqual({
      status: "exported",
      fileName: "VocabReader-backup.zip"
    });
    const zip = await JSZip.loadAsync(await readFile(destinationPath));
    expect(Object.keys(zip.files).sort()).toEqual([
      `library/books/${book.id}/book.epub`,
      "library/index.json",
      "learning-library/learning-items.sqlite",
      "manifest.json"
    ].sort());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("text"));
    expect(manifest).toMatchObject({
      format: "lingoshelf-data-backup",
      version: 1,
      createdAt: "2026-07-28T03:04:05.000Z",
      appVersion: "0.1.0",
      counts: {
        books: 1,
        activeLearningItems: 9,
        trashedLearningItems: 1
      }
    });
    expect(manifest.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "library/index.json",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      expect.objectContaining({
        path: `library/books/${book.id}/book.epub`,
        sha256: book.id
      }),
      expect.objectContaining({
        path: "learning-library/learning-items.sqlite",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    ]));
    expect(Object.keys(zip.files).some((path) =>
      path.startsWith("settings/") ||
      path.startsWith("chat/") ||
      path.startsWith("codex-runtime/")
    )).toBe(false);
  });

  it("exports a normalized snapshot when saved reading chapters no longer exist", async () => {
    const root = await temporaryDirectory();
    const libraryPath = join(root, "library");
    const learningDatabasePath = join(
      root,
      "learning-library",
      "learning-items.sqlite"
    );
    const book = await createStoredBook(libraryPath);
    await writeFile(
      join(libraryPath, "index.json"),
      `${JSON.stringify([{
        ...book,
        lastChapterId: "legacy-chapter",
        readingState: {
          view: "overview",
          chapterId: "legacy-chapter",
          scrollProgress: 0.42
        }
      }], null, 2)}\n`
    );
    const bookLibrary = new LocalBookLibrary(libraryPath);
    const learningLibrary = new LocalLearningLibrary(learningDatabasePath);
    await learningLibrary.listItems({ status: "active", sort: "recent" });
    const destinationPath = join(root, "normalized-reading-state.zip");
    const service = new DataBackupService({
      libraryPath,
      learningDatabasePath,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      waitForBookWrites: () => bookLibrary.waitForIdle(),
      snapshotBookIndex: () => bookLibrary.listBooks(),
      snapshotLearningDatabase: (path) =>
        learningLibrary.backupTo(path),
      closeLearningDatabase: () => learningLibrary.close(),
      relaunch: () => undefined
    });

    await service.exportToPath(destinationPath);

    const zip = await JSZip.loadAsync(await readFile(destinationPath));
    const exportedBooks = JSON.parse(
      await zip.file("library/index.json")!.async("text")
    ) as LibraryBook[];
    expect(exportedBooks[0]).toMatchObject({
      progressPercent: 42,
      lastChapterId: null,
      readingState: {
        view: "overview",
        chapterId: null,
        scrollProgress: 0.42
      }
    });
  });

  it("previews a valid backup without mutation, then replaces both data domains", async () => {
    const root = await temporaryDirectory();
    const sourceLibraryPath = join(root, "source", "library");
    const sourceLearningPath = join(
      root,
      "source",
      "learning-library",
      "learning-items.sqlite"
    );
    const sourceBook = await createStoredBook(sourceLibraryPath);
    const sourceLearning = new LocalLearningLibrary(sourceLearningPath);
    const sourceItems = await sourceLearning.listItems({
      status: "active",
      sort: "recent"
    });
    const multilingualItem = await sourceLearning.updateItem({
      itemId: sourceItems[1].id,
      title: sourceItems[1].title,
      itemType: sourceItems[1].itemType,
      language: "ja",
      cefr: sourceItems[1].cefr,
      sense: sourceItems[1].sense,
      markdownContent: sourceItems[1].markdownContent,
      cautionNote: ""
    });
    await sourceLearning.trashItem(sourceItems[0].id);
    const archivePath = join(root, "portable.zip");
    const sourceService = new DataBackupService({
      libraryPath: sourceLibraryPath,
      learningDatabasePath: sourceLearningPath,
      temporaryRoot: join(root, "source-temporary"),
      appVersion: "0.1.0",
      now: () => new Date("2026-07-28T03:04:05.000Z"),
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: async (path) => {
        await mkdir(join(path, ".."), { recursive: true });
        await copyFile(sourceLearningPath, path);
      },
      closeLearningDatabase: () => undefined,
      relaunch: () => undefined
    });
    await sourceService.exportToPath(archivePath);

    const targetLibraryPath = join(root, "target", "library");
    const targetLearningPath = join(
      root,
      "target",
      "learning-library",
      "learning-items.sqlite"
    );
    await mkdir(targetLibraryPath, { recursive: true });
    await writeFile(join(targetLibraryPath, "index.json"), "[]\n");
    const targetLearning = new LocalLearningLibrary(targetLearningPath);
    await targetLearning.listItems({ status: "active", sort: "recent" });
    await mkdir(join(root, "target", "settings"), { recursive: true });
    await mkdir(join(root, "target", "chat"), { recursive: true });
    await writeFile(join(root, "target", "settings", "settings.json"), "local settings");
    await writeFile(join(root, "target", "chat", "index.json"), "local chat");
    let relaunchCount = 0;
    const targetService = new DataBackupService({
      libraryPath: targetLibraryPath,
      learningDatabasePath: targetLearningPath,
      temporaryRoot: join(root, "target", ".data-backup-staging"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: async (path) => {
        await mkdir(join(path, ".."), { recursive: true });
        await copyFile(targetLearningPath, path);
      },
      closeLearningDatabase: () => (
        targetLearning as unknown as { close(): void }
      ).close(),
      relaunch: () => {
        relaunchCount += 1;
      }
    });

    const preview = await targetService.selectBackupFromPath(archivePath);

    expect(preview).toMatchObject({
      createdAt: "2026-07-28T03:04:05.000Z",
      appVersion: "0.1.0",
      books: 1,
      activeLearningItems: 9,
      trashedLearningItems: 1,
      token: expect.any(String)
    });
    expect(await readFile(join(targetLibraryPath, "index.json"), "utf8"))
      .toBe("[]\n");
    await expect(
      targetLearning.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(10);

    await targetService.restoreBackup(preview.token);

    const restoredBooks = JSON.parse(
      await readFile(join(targetLibraryPath, "index.json"), "utf8")
    ) as LibraryBook[];
    expect(restoredBooks).toHaveLength(1);
    expect(restoredBooks[0]).toMatchObject({
      id: sourceBook.id,
      progressPercent: 42,
      chapterRanges: { "chapter-1": { start: 2, end: 20 } },
      chapterAnnotations: {
        "chapter-1": [expect.objectContaining({ text: "table" })]
      }
    });
    const restoredBookLibrary = new LocalBookLibrary(targetLibraryPath);
    await expect(restoredBookLibrary.listBooks()).resolves.toHaveLength(1);
    await expect(
      restoredBookLibrary.getChapterContent(sourceBook.id, "chapter-1")
    ).resolves.toMatchObject({
      contentHtml: expect.stringContaining("Portable chapter content")
    });
    const restoredLearning = new LocalLearningLibrary(targetLearningPath);
    const restoredActive = await restoredLearning.listItems({
      status: "active",
      sort: "recent"
    });
    expect(restoredActive).toHaveLength(9);
    expect(restoredActive.find(({ id }) => id === multilingualItem.id)?.language)
      .toBe("ja");
    await expect(
      restoredLearning.listItems({ status: "trashed", sort: "recent" })
    ).resolves.toHaveLength(1);
    expect(await readFile(
      join(root, "target", "settings", "settings.json"),
      "utf8"
    )).toBe("local settings");
    expect(await readFile(
      join(root, "target", "chat", "index.json"),
      "utf8"
    )).toBe("local chat");
    expect(relaunchCount).toBe(1);
  });

  it("rejects invalid, tampered, newer and unsafe ZIP files before mutation", async () => {
    const root = await temporaryDirectory();
    const libraryPath = join(root, "library");
    const learningDatabasePath = join(
      root,
      "learning-library",
      "learning-items.sqlite"
    );
    await createStoredBook(libraryPath);
    const originalIndex = await readFile(join(libraryPath, "index.json"), "utf8");
    const learning = new LocalLearningLibrary(learningDatabasePath);
    await learning.listItems({ status: "active", sort: "recent" });
    const service = new DataBackupService({
      libraryPath,
      learningDatabasePath,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: async (path) => {
        await mkdir(join(path, ".."), { recursive: true });
        await copyFile(learningDatabasePath, path);
      },
      closeLearningDatabase: () => undefined,
      relaunch: () => undefined
    });
    const ordinaryPath = join(root, "ordinary.zip");
    const ordinary = new JSZip();
    ordinary.file("notes.txt", "not a backup");
    await writeFile(ordinaryPath, await ordinary.generateAsync({ type: "nodebuffer" }));

    await expect(service.selectBackupFromPath(ordinaryPath))
      .rejects.toThrow(/VocabReader|備份格式/);

    const validPath = join(root, "valid.zip");
    await service.exportToPath(validPath);
    const newer = await JSZip.loadAsync(await readFile(validPath));
    const newerManifest = JSON.parse(
      await newer.file("manifest.json")!.async("text")
    );
    newerManifest.version = 2;
    newer.file("manifest.json", JSON.stringify(newerManifest));
    const newerPath = join(root, "newer.zip");
    await writeFile(newerPath, await newer.generateAsync({ type: "nodebuffer" }));
    await expect(service.selectBackupFromPath(newerPath))
      .rejects.toThrow(/newer format/);

    const tampered = await JSZip.loadAsync(await readFile(validPath));
    tampered.file("library/index.json", "[{\"tampered\":true}]");
    const tamperedPath = join(root, "tampered.zip");
    await writeFile(
      tamperedPath,
      await tampered.generateAsync({ type: "nodebuffer" })
    );
    await expect(service.selectBackupFromPath(tamperedPath))
      .rejects.toThrow(/完整性|checksum/i);

    const unsafe = await JSZip.loadAsync(await readFile(validPath));
    unsafe.file("../outside.txt", "unsafe");
    const unsafePath = join(root, "unsafe.zip");
    await writeFile(
      unsafePath,
      await unsafe.generateAsync({ type: "nodebuffer" })
    );
    await expect(service.selectBackupFromPath(unsafePath))
      .rejects.toThrow(/unsafe file path/);

    const invalidIndex = await JSZip.loadAsync(await readFile(validPath));
    const invalidBooks = JSON.parse(
      await invalidIndex.file("library/index.json")!.async("text")
    ) as LibraryBook[];
    invalidBooks[0].chapterRanges = {
      "chapter-1": { start: -1, end: 20 }
    };
    const invalidIndexBytes = Buffer.from(JSON.stringify(invalidBooks));
    const invalidManifest = JSON.parse(
      await invalidIndex.file("manifest.json")!.async("text")
    );
    const indexFile = invalidManifest.files.find(
      (file: { path: string }) => file.path === "library/index.json"
    );
    indexFile.bytes = invalidIndexBytes.byteLength;
    indexFile.sha256 = createHash("sha256")
      .update(invalidIndexBytes)
      .digest("hex");
    invalidIndex.file("library/index.json", invalidIndexBytes);
    invalidIndex.file("manifest.json", JSON.stringify(invalidManifest));
    const invalidIndexPath = join(root, "invalid-index.zip");
    await writeFile(
      invalidIndexPath,
      await invalidIndex.generateAsync({ type: "nodebuffer" })
    );
    await expect(service.selectBackupFromPath(invalidIndexPath))
      .rejects.toThrow(/Book Library index|reading segment/);

    expect(await readFile(join(libraryPath, "index.json"), "utf8"))
      .toBe(originalIndex);
    await expect(
      learning.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(10);
  });

  it("exports an empty book and learning state as a valid backup", async () => {
    const root = await temporaryDirectory();
    const libraryPath = join(root, "library");
    const learningDatabasePath = join(
      root,
      "learning-library",
      "learning-items.sqlite"
    );
    await mkdir(libraryPath, { recursive: true });
    await writeFile(join(libraryPath, "index.json"), "[]\n");
    const learning = new LocalLearningLibrary(learningDatabasePath);
    const items = await learning.listItems({ status: "active", sort: "recent" });
    for (const item of items) await learning.trashItem(item.id);
    await learning.emptyTrash();
    const archivePath = join(root, "empty.zip");
    const service = new DataBackupService({
      libraryPath,
      learningDatabasePath,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: (path) => learning.backupTo(path),
      closeLearningDatabase: () => learning.close(),
      relaunch: () => undefined
    });

    await service.exportToPath(archivePath);

    const zip = await JSZip.loadAsync(await readFile(archivePath));
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("text"));
    expect(manifest.counts).toEqual({
      books: 0,
      activeLearningItems: 0,
      trashedLearningItems: 0
    });
  });

  it("exports schema version 6 and rejects a newer database", async () => {
    const root = await temporaryDirectory();
    const libraryPath = join(root, "library");
    const learningDatabasePath = join(
      root,
      "learning-library",
      "learning-items.sqlite"
    );
    await mkdir(libraryPath, { recursive: true });
    await writeFile(join(libraryPath, "index.json"), "[]\n");
    const learning = new LocalLearningLibrary(learningDatabasePath);
    await learning.listItems({ status: "active", sort: "recent" });
    learning.close();
    const database = new DatabaseSync(learningDatabasePath);
    database.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (4, CURRENT_TIMESTAMP)
    `).run();
    database.close();
    const archivePath = join(root, "schema-v6.zip");
    const service = new DataBackupService({
      libraryPath,
      learningDatabasePath,
      temporaryRoot: join(root, "temporary"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: (path) => learning.backupTo(path),
      closeLearningDatabase: () => learning.close(),
      relaunch: () => undefined
    });

    await expect(service.exportToPath(archivePath)).resolves.toMatchObject({
      status: "exported"
    });
    await expect(service.selectBackupFromPath(archivePath)).resolves
      .toMatchObject({
        books: 0,
        activeLearningItems: 10,
        trashedLearningItems: 0
      });

    learning.close();
    const newerDatabase = new DatabaseSync(learningDatabasePath);
    newerDatabase.prepare(`
      INSERT INTO schema_migrations (version, applied_at)
      VALUES (7, CURRENT_TIMESTAMP)
    `).run();
    newerDatabase.close();
    await expect(service.exportToPath(join(root, "schema-v7.zip")))
      .rejects.toThrow("The backup uses a newer Learning Library version");
  });

  it("rolls both data domains back when replacement fails", async () => {
    const root = await temporaryDirectory();
    const sourceLibraryPath = join(root, "source", "library");
    const sourceLearningPath = join(
      root,
      "source",
      "learning-library",
      "learning-items.sqlite"
    );
    await createStoredBook(sourceLibraryPath);
    const sourceLearning = new LocalLearningLibrary(sourceLearningPath);
    const sourceItems = await sourceLearning.listItems({
      status: "active",
      sort: "recent"
    });
    await sourceLearning.trashItem(sourceItems[0].id);
    const archivePath = join(root, "source.zip");
    await new DataBackupService({
      libraryPath: sourceLibraryPath,
      learningDatabasePath: sourceLearningPath,
      temporaryRoot: join(root, "source-temporary"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: (path) => sourceLearning.backupTo(path),
      closeLearningDatabase: () => sourceLearning.close(),
      relaunch: () => undefined
    }).exportToPath(archivePath);

    const targetLibraryPath = join(root, "target", "library");
    const targetLearningPath = join(
      root,
      "target",
      "learning-library",
      "learning-items.sqlite"
    );
    await mkdir(targetLibraryPath, { recursive: true });
    await writeFile(join(targetLibraryPath, "index.json"), "[]\n");
    const targetLearning = new LocalLearningLibrary(targetLearningPath);
    await targetLearning.listItems({ status: "active", sort: "recent" });
    let relaunchCount = 0;
    const targetService = new DataBackupService({
      libraryPath: targetLibraryPath,
      learningDatabasePath: targetLearningPath,
      temporaryRoot: join(root, "target", ".data-backup-staging"),
      appVersion: "0.1.0",
      waitForBookWrites: async () => undefined,
      snapshotLearningDatabase: (path) => targetLearning.backupTo(path),
      closeLearningDatabase: () => targetLearning.close(),
      relaunch: () => {
        relaunchCount += 1;
      },
      onRestoreStep: (step) => {
        if (step === "learning-library-replaced") {
          throw new Error("injected replacement failure");
        }
      }
    });
    const preview = await targetService.selectBackupFromPath(archivePath);

    await expect(targetService.restoreBackup(preview.token))
      .rejects.toThrow(/injected replacement failure/);

    expect(await readFile(join(targetLibraryPath, "index.json"), "utf8"))
      .toBe("[]\n");
    const reopenedLearning = new LocalLearningLibrary(targetLearningPath);
    await expect(
      reopenedLearning.listItems({ status: "active", sort: "recent" })
    ).resolves.toHaveLength(10);
    await expect(
      reopenedLearning.listItems({ status: "trashed", sort: "recent" })
    ).resolves.toHaveLength(0);
    expect(relaunchCount).toBe(0);
  });
});
