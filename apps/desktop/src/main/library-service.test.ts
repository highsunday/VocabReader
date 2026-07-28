import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryBook } from "../shared/library-contracts";
import { LocalBookLibrary } from "./library-service";

const temporaryDirectories: string[] = [];
type BookChapterWithLegacyFields = Omit<
  LibraryBook["chapters"][number],
  "depth" | "fragment"
> & {
  depth?: number;
  fragment?: string | null;
};

async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-library-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function createEpub3(
  path: string,
  chapterText = "Chapter one",
  includeNestedNavigationEntry = false
) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
      </container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="book-id">urn:test:book</dc:identifier>
          <dc:title>Practical English</dc:title>
          <dc:creator>Jane Author</dc:creator>
        </metadata>
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
          <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
          <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
          <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
      </package>`
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
      <body><nav epub:type="toc"><ol>
        <li><a href="chapter1.xhtml">Getting Started</a>
          ${includeNestedNavigationEntry
            ? '<ol><li><a href="chapter1.xhtml#exercise">Getting Started Exercise</a></li></ol>'
            : ""}
        </li>
        <li><a href="chapter2.xhtml">Useful Patterns</a></li>
      </ol></nav></body></html>`
  );
  zip.file(
    "OEBPS/chapter1.xhtml",
    `<html><body>${chapterText}<section id="exercise">Practice</section></body></html>`
  );
  zip.file("OEBPS/chapter2.xhtml", "<html><body>Chapter two</body></html>");
  zip.file("OEBPS/cover.png", Uint8Array.from([137, 80, 78, 71]));
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function createEpub2(path: string) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>`
  );
  zip.file(
    "OPS/book.opf",
    `<package version="2.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Classic Reader</dc:title><dc:creator>Old Author</dc:creator>
        <meta name="cover" content="cover-image"/>
      </metadata>
      <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
        <item id="intro" href="intro.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine toc="ncx"><itemref idref="intro"/></spine>
    </package>`
  );
  zip.file(
    "OPS/toc.ncx",
    `<ncx><navMap>
      <navPoint id="intro"><navLabel><text>Introduction</text></navLabel><content src="intro.xhtml#intro"/>
        <navPoint id="diagnostic"><navLabel><text>Diagnostic</text></navLabel><content src="intro.xhtml#diagnostic"/></navPoint>
      </navPoint>
    </navMap></ncx>`
  );
  zip.file(
    "OPS/intro.xhtml",
    '<html><body><h1 id="intro">Welcome</h1><section id="diagnostic">Check</section></body></html>'
  );
  zip.file("OPS/images/cover.jpg", Uint8Array.from([255, 216, 255]));
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function createEpubWithNestedNavigationDocument(path: string) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<package version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Nested Navigation</dc:title>
      </metadata>
      <manifest>
        <item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="chapter"/></spine>
    </package>`
  );
  zip.file(
    "OEBPS/text/nav.xhtml",
    `<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
      <nav epub:type="toc"><ol><li><a href="chapter.xhtml">Nested chapter</a></li></ol></nav>
    </body></html>`
  );
  zip.file(
    "OEBPS/text/chapter.xhtml",
    "<html><body><p>Resolved beside the navigation document.</p></body></html>"
  );
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
}

describe("LocalBookLibrary", () => {
  it("imports EPUB 3 metadata, cover and navigation, then reloads it from disk", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "book.epub");
    await createEpub3(epubPath);
    const libraryPath = join(root, "library");

    const result = await new LocalBookLibrary(libraryPath).importFromPath(epubPath);

    expect(result.status).toBe("imported");
    if (result.status === "cancelled") throw new Error("unexpected cancellation");
    expect(result.book).toMatchObject({
      title: "Practical English",
      author: "Jane Author",
      progressPercent: 0,
      lastChapterId: null,
      chapters: [
        { title: "Getting Started", order: 0, depth: 0, fragment: null },
        { title: "Useful Patterns", order: 1, depth: 0, fragment: null }
      ]
    });
    expect(result.book.coverDataUrl).toMatch(/^data:image\/png;base64,/);
    await expect(
      stat(join(libraryPath, "books", result.book.id, "book.epub"))
    ).resolves.toBeDefined();

    const reloaded = await new LocalBookLibrary(libraryPath).listBooks();
    expect(reloaded).toEqual([result.book]);
  });

  it("preserves nested EPUB 3 entries that point to a fragment in the same chapter file", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "duplicate-navigation.epub");
    await createEpub3(epubPath, "Chapter one", true);

    const result = await new LocalBookLibrary(join(root, "library"))
      .importFromPath(epubPath);

    if (result.status === "cancelled") throw new Error("unexpected cancellation");
    expect(result.book.chapters).toEqual([
      expect.objectContaining({
        title: "Getting Started", order: 0, depth: 0, fragment: null
      }),
      expect.objectContaining({
        title: "Getting Started Exercise", order: 1, depth: 1, fragment: "exercise"
      }),
      expect.objectContaining({
        title: "Useful Patterns", order: 2, depth: 0, fragment: null
      })
    ]);
    expect(new Set(result.book.chapters.map((chapter) => chapter.id)).size)
      .toBe(result.book.chapters.length);
  });

  it("resolves EPUB 3 chapter links relative to a nested navigation document", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "nested-navigation.epub");
    await createEpubWithNestedNavigationDocument(epubPath);
    const library = new LocalBookLibrary(join(root, "library"));

    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const [chapter] = imported.book.chapters;

    expect(chapter.href).toBe("OEBPS/text/chapter.xhtml");
    await expect(library.getChapterContent(imported.book.id, chapter.id))
      .resolves.toMatchObject({
        title: "Nested chapter",
        contentHtml: expect.stringContaining(
          "Resolved beside the navigation document."
        )
      });
  });

  it("reparses existing indexes created before nested navigation paths were fixed", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "legacy-nested-navigation.epub");
    const libraryPath = join(root, "library");
    await createEpubWithNestedNavigationDocument(epubPath);
    const imported = await new LocalBookLibrary(libraryPath).importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const indexPath = join(libraryPath, "index.json");
    const persisted = JSON.parse(await readFile(indexPath, "utf8")) as LibraryBook[];
    delete persisted[0].epubParseVersion;
    persisted[0].chapters[0].href = "OEBPS/chapter.xhtml";
    await writeFile(indexPath, `${JSON.stringify(persisted, null, 2)}\n`);

    const library = new LocalBookLibrary(libraryPath);
    const [migrated] = await library.listBooks();

    expect(migrated.epubParseVersion).toBe(2);
    expect(migrated.chapters[0].href).toBe("OEBPS/text/chapter.xhtml");
    await expect(
      library.getChapterContent(migrated.id, migrated.chapters[0].id)
    ).resolves.toMatchObject({
      contentHtml: expect.stringContaining(
        "Resolved beside the navigation document."
      )
    });
  });

  it("imports EPUB 2 metadata, legacy cover and NCX navigation", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "classic.epub");
    await createEpub2(epubPath);

    const result = await new LocalBookLibrary(join(root, "library")).importFromPath(epubPath);

    if (result.status === "cancelled") throw new Error("unexpected cancellation");
    expect(result.book.title).toBe("Classic Reader");
    expect(result.book.author).toBe("Old Author");
    expect(result.book.coverDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.book.chapters).toEqual([
      expect.objectContaining({
        title: "Introduction", order: 0, depth: 0, fragment: "intro"
      }),
      expect.objectContaining({
        title: "Diagnostic", order: 1, depth: 1, fragment: "diagnostic"
      })
    ]);
    expect(result.book.chapters[0].id).not.toBe(result.book.chapters[1].id);
  });

  it("rebuilds missing hierarchy metadata for books imported with an old index", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "legacy-index.epub");
    await createEpub3(epubPath, "Chapter one", true);
    const libraryPath = join(root, "library");
    const imported = await new LocalBookLibrary(libraryPath).importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    const indexPath = join(libraryPath, "index.json");
    const persisted = JSON.parse(await readFile(indexPath, "utf8")) as LibraryBook[];
    persisted[0].readingState = {
      view: "reader",
      chapterId: persisted[0].chapters[0].id,
      scrollProgress: 0.4
    };
    persisted[0].lastChapterId = persisted[0].chapters[0].id;
    const legacyChapters = persisted[0].chapters
      .filter((chapter) => (chapter as BookChapterWithLegacyFields).depth !== 1)
      .map((chapter) => {
        const legacy = { ...chapter } as BookChapterWithLegacyFields;
        delete legacy.depth;
        delete legacy.fragment;
        return legacy;
      });
    (persisted[0] as unknown as { chapters: BookChapterWithLegacyFields[] })
      .chapters = legacyChapters;
    await writeFile(indexPath, `${JSON.stringify(persisted, null, 2)}\n`);

    const [reloaded] = await new LocalBookLibrary(libraryPath).listBooks();

    expect(reloaded.chapters.map((chapter) => chapter.title)).toEqual([
      "Getting Started",
      "Getting Started Exercise",
      "Useful Patterns"
    ]);
    expect(reloaded.readingState).toEqual({
      view: "reader",
      chapterId: imported.book.chapters[0].id,
      scrollProgress: 0.4
    });
    const migrated = JSON.parse(await readFile(indexPath, "utf8")) as LibraryBook[];
    expect(migrated[0].chapters[1]).toMatchObject({ depth: 1, fragment: "exercise" });
  });

  it("returns the existing book for identical content but permits same-title revisions", async () => {
    const root = await createTemporaryDirectory();
    const firstPath = join(root, "first.epub");
    const revisionPath = join(root, "revision.epub");
    await createEpub3(firstPath, "First revision");
    await createEpub3(revisionPath, "Second revision");
    const library = new LocalBookLibrary(join(root, "library"));

    const first = await library.importFromPath(firstPath);
    if (first.status === "cancelled") throw new Error("unexpected cancellation");
    const indexPath = join(root, "library", "index.json");
    const persisted = JSON.parse(await readFile(indexPath, "utf8")) as LibraryBook[];
    persisted[0].progressPercent = 45;
    persisted[0].lastChapterId = persisted[0].chapters[0].id;
    delete (persisted[0] as Partial<LibraryBook>).readingState;
    await writeFile(indexPath, `${JSON.stringify(persisted, null, 2)}\n`);

    const duplicate = await new LocalBookLibrary(join(root, "library")).importFromPath(firstPath);
    const revision = await library.importFromPath(revisionPath);

    expect(first.status).toBe("imported");
    expect(duplicate.status).toBe("existing");
    if (duplicate.status === "cancelled") throw new Error("unexpected cancellation");
    expect(duplicate.book.progressPercent).toBe(45);
    expect(duplicate.book.lastChapterId).toBe(persisted[0].chapters[0].id);
    expect(duplicate.book.readingState).toEqual({
      view: "overview",
      chapterId: persisted[0].chapters[0].id,
      scrollProgress: 0
    });
    expect(revision.status).toBe("imported");
    expect(await library.listBooks()).toHaveLength(2);
    if (revision.status === "cancelled") {
      throw new Error("unexpected cancellation");
    }
    expect(first.book.title).toBe(revision.book.title);
    expect(first.book.id).not.toBe(revision.book.id);
  });

  it("rejects invalid EPUB content without leaving a partial book", async () => {
    const root = await createTemporaryDirectory();
    const invalidPath = join(root, "broken.epub");
    await writeFile(invalidPath, "not an epub");
    const libraryPath = join(root, "library");
    const library = new LocalBookLibrary(libraryPath);

    await expect(library.importFromPath(invalidPath)).rejects.toThrow(
      /無法解析這本 EPUB/
    );
    expect(await library.listBooks()).toEqual([]);
    await expect(readFile(join(libraryPath, "index.json"), "utf8")).resolves.toBe("[]\n");
  });

  it("loads safe chapter content and embeds book-local images", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "readable.epub");
    await createEpub3(
      epubPath,
      `<h1 onclick="alert('no')">A real chapter</h1>
       <p>Keep this paragraph.</p>
       <img src="cover.png" alt="Book art" />
       <img src="https://tracker.example/pixel.png" alt="Tracker" />
       <script>window.evil = true</script><form><input /></form>`
    );
    const library = new LocalBookLibrary(join(root, "library"));
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    const chapter = await library.getChapterContent(
      imported.book.id,
      imported.book.chapters[0].id
    );

    expect(chapter).toMatchObject({
      bookId: imported.book.id,
      chapterId: imported.book.chapters[0].id,
      title: "Getting Started"
    });
    expect(chapter.contentHtml).toContain("A real chapter");
    expect(chapter.contentHtml).toContain("Keep this paragraph.");
    expect(chapter.contentHtml).toMatch(/src="data:image\/png;base64,/);
    expect(chapter.contentHtml).not.toMatch(/script|onclick|form|input|https:\/\//i);
  });

  it("returns a subchapter fragment and preserves its safe target id", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "fragment.epub");
    await createEpub3(epubPath, "Chapter one", true);
    const library = new LocalBookLibrary(join(root, "library"));
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const subchapter = imported.book.chapters.find(
      (chapter) => chapter.title === "Getting Started Exercise"
    );
    expect(subchapter).toBeDefined();

    const content = await library.getChapterContent(
      imported.book.id,
      subchapter!.id
    );

    expect(content).toMatchObject({
      title: "Getting Started Exercise",
      fragment: "exercise"
    });
    expect(content.contentHtml).toContain('id="exercise"');
  });

  it("persists each book reading view, chapter and relative position", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "resume.epub");
    const libraryPath = join(root, "library");
    await createEpub3(epubPath);
    const library = new LocalBookLibrary(libraryPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    const saved = await library.saveReadingState({
      bookId: imported.book.id,
      view: "reader",
      chapterId: imported.book.chapters[1].id,
      scrollProgress: 0.5
    });
    const [reloaded] = await new LocalBookLibrary(libraryPath).listBooks();

    expect(saved.readingState).toEqual({
      view: "reader",
      chapterId: imported.book.chapters[1].id,
      scrollProgress: 0.5
    });
    expect(reloaded.readingState).toEqual(saved.readingState);
    expect(reloaded.lastChapterId).toBe(imported.book.chapters[1].id);
  });

  it("persists one independent reading range for each chapter", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "ranges.epub");
    const libraryPath = join(root, "library");
    await createEpub3(epubPath);
    const library = new LocalBookLibrary(libraryPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const [first, second] = imported.book.chapters;

    await library.saveReadingRange({
      bookId: imported.book.id,
      chapterId: first.id,
      range: { start: 4, end: 80 }
    });
    await library.saveReadingRange({
      bookId: imported.book.id,
      chapterId: second.id,
      range: { start: 12, end: 120 }
    });

    const [reloaded] = await new LocalBookLibrary(libraryPath).listBooks();
    expect(reloaded.chapterRanges).toEqual({
      [first.id]: { start: 4, end: 80 },
      [second.id]: { start: 12, end: 120 }
    });
  });

  it("persists independent annotations for each chapter and supports removal", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "annotations.epub");
    const libraryPath = join(root, "library");
    await createEpub3(epubPath);
    const library = new LocalBookLibrary(libraryPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const [first, second] = imported.book.chapters;
    const firstAnnotation = { id: "a1", start: 0, end: 7, text: "Chapter" };
    const secondAnnotation = { id: "a2", start: 8, end: 11, text: "two" };

    await library.saveAnnotations({
      bookId: imported.book.id,
      chapterId: first.id,
      annotations: [firstAnnotation]
    });
    await library.saveAnnotations({
      bookId: imported.book.id,
      chapterId: second.id,
      annotations: [secondAnnotation]
    });
    const [reloaded] = await new LocalBookLibrary(libraryPath).listBooks();

    expect(reloaded.chapterAnnotations).toEqual({
      [first.id]: [firstAnnotation],
      [second.id]: [secondAnnotation]
    });

    await library.saveAnnotations({
      bookId: imported.book.id,
      chapterId: first.id,
      annotations: []
    });
    expect((await library.listBooks())[0].chapterAnnotations).toEqual({
      [first.id]: [],
      [second.id]: [secondAnnotation]
    });
  });

  it("normalizes missing annotation data and silently ignores overlaps", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "annotation-overlap.epub");
    const libraryPath = join(root, "library");
    await createEpub3(epubPath);
    const library = new LocalBookLibrary(libraryPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const chapterId = imported.book.chapters[0].id;

    expect(imported.book.chapterAnnotations).toEqual({});
    const saved = await library.saveAnnotations({
      bookId: imported.book.id,
      chapterId,
      annotations: [
        { id: "a1", start: 0, end: 7, text: "Chapter" },
        { id: "a2", start: 5, end: 11, text: "er one" }
      ]
    });

    expect(saved.chapterAnnotations).toEqual({});
    expect((await new LocalBookLibrary(libraryPath).listBooks())[0]
      .chapterAnnotations).toEqual({});
  });

  it("rejects invalid or unknown chapter reading ranges without changing the book", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "invalid-range.epub");
    const library = new LocalBookLibrary(join(root, "library"));
    await createEpub3(epubPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    await expect(library.saveReadingRange({
      bookId: imported.book.id,
      chapterId: "missing-chapter",
      range: { start: 0, end: 10 }
    })).rejects.toThrow(/找不到章節/);
    await expect(library.saveReadingRange({
      bookId: imported.book.id,
      chapterId: imported.book.chapters[0].id,
      range: { start: 20, end: 10 }
    })).rejects.toThrow(/閱讀區段格式錯誤/);
    expect((await library.listBooks())[0].chapterRanges).toEqual({});
  });

  it("permanently deletes a book, its EPUB and saved reading state", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "delete-me.epub");
    const libraryPath = join(root, "library");
    await createEpub3(epubPath);
    const library = new LocalBookLibrary(libraryPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    const savingReadingState = library.saveReadingState({
      bookId: imported.book.id,
      view: "reader",
      chapterId: imported.book.chapters[1].id,
      scrollProgress: 0.5
    });
    const deletingBook = library.deleteBook(imported.book.id);

    await Promise.all([savingReadingState, deletingBook]);

    await expect(new LocalBookLibrary(libraryPath).listBooks()).resolves.toEqual([]);
    await expect(
      stat(join(libraryPath, "books", imported.book.id))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects deleting an unknown book without changing the library", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "keep-me.epub");
    const library = new LocalBookLibrary(join(root, "library"));
    await createEpub3(epubPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    await expect(library.deleteBook("missing-book")).rejects.toThrow(/找不到書籍/);
    await expect(library.listBooks()).resolves.toEqual([imported.book]);
  });

  it("rejects unknown chapter requests without changing reading state", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "unknown.epub");
    const library = new LocalBookLibrary(join(root, "library"));
    await createEpub3(epubPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");

    await expect(
      library.getChapterContent(imported.book.id, "missing-chapter")
    ).rejects.toThrow(/找不到章節/);
    expect((await library.listBooks())[0].readingState.view).toBe("overview");
  });

  it("exposes an idle boundary after queued book writes complete", async () => {
    const root = await createTemporaryDirectory();
    const epubPath = join(root, "backup-idle.epub");
    const library = new LocalBookLibrary(join(root, "library"));
    await createEpub3(epubPath);
    const imported = await library.importFromPath(epubPath);
    if (imported.status === "cancelled") throw new Error("unexpected cancellation");
    void library.saveReadingState({
      bookId: imported.book.id,
      view: "reader",
      chapterId: imported.book.chapters[0].id,
      scrollProgress: 0.75
    });

    await (
      library as LocalBookLibrary & { waitForIdle(): Promise<void> }
    ).waitForIdle();

    expect((await library.listBooks())[0].readingState.scrollProgress).toBe(0.75);
  });
});
