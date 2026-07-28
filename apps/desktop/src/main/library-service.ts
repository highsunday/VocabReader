import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import type {
  Annotation,
  BookChapter,
  BookReadingState,
  ChapterContent,
  ImportBookResult,
  LibraryBook,
  ReadingRange,
  SaveAnnotationsInput,
  SaveReadingRangeInput,
  SaveReadingStateInput
} from "../shared/library-contracts";

type XmlValue = string | number | Record<string, unknown> | XmlValue[];
type OrderedXmlNode = Record<string, unknown>;

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

interface ParsedEpub {
  title: string;
  author: string;
  coverDataUrl: string | null;
  chapters: BookChapter[];
}

interface NavigationLink {
  title: string;
  href: string;
  depth: number;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true
});

const chapterXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: false
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join(" ").trim();
  }
  const record = asRecord(value);
  if ("#text" in record) {
    return textValue(record["#text"]);
  }
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, child]) => textValue(child))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function attribute(record: Record<string, unknown>, name: string): string {
  const value = record[`@_${name}`];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function resolveArchivePath(baseDirectory: string, href: string): string {
  const withoutFragment = href.split("#", 1)[0] ?? "";
  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // Keep the literal archive path when percent encoding is malformed.
  }
  const resolved = posix.normalize(posix.join(baseDirectory, decoded));
  if (resolved === ".." || resolved.startsWith("../") || posix.isAbsolute(resolved)) {
    throw new Error("EPUB 包含不安全的檔案路徑");
  }
  return resolved;
}

function chapterId(href: string): string {
  return createHash("sha256").update(href).digest("hex").slice(0, 16);
}

function fragmentFromHref(href: string): string | null {
  const separator = href.indexOf("#");
  if (separator < 0 || separator === href.length - 1) return null;
  const fragment = href.slice(separator + 1);
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function linksFromNavigationList(
  value: unknown,
  depth = 0
): NavigationLink[] {
  const links: NavigationLink[] = [];
  const record = asRecord(value);
  for (const item of asArray(record.li)) {
    const itemRecord = asRecord(item);
    const anchors = asArray(itemRecord.a);
    const anchor = asRecord(anchors[0]);
    const href = attribute(anchor, "href");
    const title = textValue(anchor);
    if (href && title) links.push({ title, href, depth });
    links.push(...linksFromNavigationList(itemRecord.ol, depth + 1));
  }
  return links;
}

function navigationLinks(document: unknown): NavigationLink[] {
  const html = asRecord(asRecord(document).html);
  const body = asRecord(html.body);
  const candidates = asArray(body.nav).map(asRecord);
  const toc =
    candidates.find((nav) => attribute(nav, "type").split(/\s+/).includes("toc")) ??
    candidates[0];
  return toc ? linksFromNavigationList(toc.ol) : [];
}

function ncxLinks(value: unknown, depth = 0): NavigationLink[] {
  const links: NavigationLink[] = [];
  const record = asRecord(value);
  for (const point of asArray(record.navPoint)) {
    const pointRecord = asRecord(point);
    const content = asRecord(pointRecord.content);
    const href = attribute(content, "src");
    const title = textValue(asRecord(pointRecord.navLabel).text);
    if (href && title) links.push({ title, href, depth });
    links.push(...ncxLinks(pointRecord, depth + 1));
  }
  return links;
}

function mediaTypeToDataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

const readableTags = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "em",
  "strong", "b", "i", "u", "s", "blockquote", "pre", "code", "ul",
  "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "hr", "br", "figure", "figcaption", "sup", "sub",
  "section", "article"
]);

const discardedTags = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input",
  "button", "select", "textarea", "meta", "link", "base", "svg", "canvas",
  "audio", "video"
]);

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function imageMediaType(path: string): string | undefined {
  switch (posix.extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    default: return undefined;
  }
}

async function sanitizeChapterHtml(
  zip: JSZip,
  chapterPath: string,
  source: string
): Promise<string> {
  const parsed = chapterXmlParser.parse(source) as OrderedXmlNode[];

  function findBody(nodes: OrderedXmlNode[]): OrderedXmlNode[] | undefined {
    for (const node of nodes) {
      if (Array.isArray(node.body)) return node.body as OrderedXmlNode[];
      for (const [key, value] of Object.entries(node)) {
        if (key !== ":@" && Array.isArray(value)) {
          const body = findBody(value as OrderedXmlNode[]);
          if (body) return body;
        }
      }
    }
    return undefined;
  }

  async function renderNodes(nodes: OrderedXmlNode[]): Promise<string> {
    let output = "";
    for (const node of nodes) {
      if (typeof node["#text"] === "string") {
        output += escapeHtmlText(node["#text"]);
        continue;
      }
      const entry = Object.entries(node).find(
        ([key, value]) => key !== ":@" && Array.isArray(value)
      );
      if (!entry) continue;
      const [rawName, rawChildren] = entry;
      const name = rawName.toLowerCase();
      const children = rawChildren as OrderedXmlNode[];
      if (discardedTags.has(name)) continue;
      const attributes = asRecord(node[":@"]) as Record<string, unknown>;

      if (name === "img") {
        const sourcePath = String(attributes["@_src"] ?? "");
        if (!sourcePath || /^(?:[a-z]+:|\/\/|#)/i.test(sourcePath)) continue;
        try {
          const assetPath = resolveArchivePath(posix.dirname(chapterPath), sourcePath);
          const mediaType = imageMediaType(assetPath);
          const asset = mediaType ? zip.file(assetPath) : null;
          if (!mediaType || !asset) continue;
          const dataUrl = mediaTypeToDataUrl(mediaType, await asset.async("uint8array"));
          const alt = escapeHtmlAttribute(String(attributes["@_alt"] ?? ""));
          output += `<img src="${dataUrl}" alt="${alt}">`;
        } catch {
          // Invalid or missing book-local images are omitted from readable content.
        }
        continue;
      }

      const renderedChildren = await renderNodes(children);
      if (!readableTags.has(name)) {
        output += renderedChildren;
        continue;
      }
      const allowedAttributes: string[] = [];
      const id = String(attributes["@_id"] ?? "");
      if (id && !/[\u0000-\u001f\u007f]/.test(id)) {
        allowedAttributes.push(`id="${escapeHtmlAttribute(id)}"`);
      }
      if (name === "ol" && /^\d+$/.test(String(attributes["@_start"] ?? ""))) {
        allowedAttributes.push(`start="${attributes["@_start"]}"`);
      }
      if (name === "td" || name === "th") {
        for (const attributeName of ["colspan", "rowspan"] as const) {
          const value = String(attributes[`@_${attributeName}`] ?? "");
          if (/^\d+$/.test(value)) {
            allowedAttributes.push(`${attributeName}="${value}"`);
          }
        }
      }
      const opening = `<${name}${allowedAttributes.length ? ` ${allowedAttributes.join(" ")}` : ""}>`;
      output += name === "br" || name === "hr"
        ? opening
        : `${opening}${renderedChildren}</${name}>`;
    }
    return output;
  }

  return (await renderNodes(findBody(parsed) ?? parsed)).trim();
}

function knownChapterId(
  chapters: BookChapter[] | undefined,
  chapterId: string | null | undefined
): string | null {
  return chapterId && chapters?.some((chapter) => chapter.id === chapterId)
    ? chapterId
    : null;
}

function defaultReadingState(book: Partial<LibraryBook>): BookReadingState {
  const saved = book.readingState;
  const savedChapterId = knownChapterId(book.chapters, saved?.chapterId);
  const lastChapterId = knownChapterId(
    book.chapters,
    book.lastChapterId
  );
  const scrollProgress = Number(saved?.scrollProgress);
  return {
    view: saved?.view === "reader" && savedChapterId ? "reader" : "overview",
    chapterId: savedChapterId ?? lastChapterId,
    scrollProgress: Number.isFinite(scrollProgress)
      ? Math.min(1, Math.max(0, scrollProgress))
      : 0
  };
}

function validReadingRange(value: unknown): value is ReadingRange {
  if (!value || typeof value !== "object") return false;
  const range = value as Partial<ReadingRange>;
  return Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    (range.start ?? -1) >= 0 &&
    (range.end ?? -1) >= (range.start ?? 0);
}

function chapterRanges(
  book: Partial<LibraryBook>,
  chapters: BookChapter[]
): Record<string, ReadingRange> {
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  return Object.fromEntries(
    Object.entries(book.chapterRanges ?? {}).filter(
      ([chapterId, range]) => chapterIds.has(chapterId) && validReadingRange(range)
    )
  );
}

function validAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const annotation = value as Partial<Annotation>;
  return typeof annotation.id === "string" && Boolean(annotation.id.trim()) &&
    Number.isInteger(annotation.start) && Number.isInteger(annotation.end) &&
    (annotation.start ?? -1) >= 0 &&
    (annotation.end ?? 0) > (annotation.start ?? -1) &&
    typeof annotation.text === "string" && Boolean(annotation.text);
}

function annotationsOverlap(annotations: readonly Annotation[]) {
  const sorted = [...annotations].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  return sorted.some((annotation, index) =>
    index > 0 && annotation.start < sorted[index - 1].end
  );
}

function chapterAnnotations(
  book: Partial<LibraryBook>,
  chapters: BookChapter[]
): Record<string, Annotation[]> {
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const entries = Object.entries(book.chapterAnnotations ?? {}).flatMap(
    ([chapterId, annotations]) => {
      if (!chapterIds.has(chapterId) || !Array.isArray(annotations)) return [];
      const valid = annotations.filter(validAnnotation).sort(
        (left, right) => left.start - right.start || left.end - right.end
      );
      const independent = valid.reduce<Annotation[]>((accepted, annotation) => {
        const previous = accepted.at(-1);
        if (!previous || annotation.start >= previous.end) accepted.push(annotation);
        return accepted;
      }, []);
      return [[chapterId, independent] as const];
    }
  );
  return Object.fromEntries(entries);
}

function distinctChapters(chapters: BookChapter[]): BookChapter[] {
  const seen = new Set<string>();
  return [...chapters]
    .sort((left, right) => left.order - right.order)
    .filter((chapter) => {
      if (seen.has(chapter.id)) return false;
      seen.add(chapter.id);
      return true;
    })
    .map((chapter, order) => ({
      ...chapter,
      order,
      depth: Number.isInteger(chapter.depth) && chapter.depth >= 0
        ? chapter.depth
        : 0,
      fragment: typeof chapter.fragment === "string" ? chapter.fragment : null
    }));
}

async function requiredTextFile(zip: JSZip, path: string, label: string) {
  const file = zip.file(path);
  if (!file) throw new Error(`缺少 ${label}`);
  return file.async("text");
}

const epubParseVersion = 2;

async function replaceFileWithRetry(source: string, destination: string) {
  const retryableCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !retryableCodes.has(code) || attempt >= 4) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

async function parseEpub(contents: Buffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(contents);
  const mimetype = await requiredTextFile(zip, "mimetype", "mimetype");
  if (mimetype.trim() !== "application/epub+zip") {
    throw new Error("檔案不是標準 EPUB");
  }
  if (zip.file("META-INF/rights.xml") || zip.file("META-INF/encryption.xml")) {
    throw new Error("不支援受 DRM 保護的 EPUB");
  }

  const containerXml = await requiredTextFile(
    zip,
    "META-INF/container.xml",
    "META-INF/container.xml"
  );
  const container = asRecord(xmlParser.parse(containerXml)).container;
  const rootfiles = asRecord(asRecord(container).rootfiles);
  const rootfile = asRecord(asArray(rootfiles.rootfile)[0]);
  const packagePath = attribute(rootfile, "full-path");
  if (!packagePath) throw new Error("container.xml 未指定 package document");

  const packageXml = await requiredTextFile(zip, packagePath, "package document");
  const packageDocument = asRecord(asRecord(xmlParser.parse(packageXml)).package);
  const metadata = asRecord(packageDocument.metadata);
  const title = textValue(asArray(metadata.title)[0]);
  if (!title) throw new Error("EPUB 缺少書名");
  const author = textValue(asArray(metadata.creator)[0]) || "未知作者";
  const packageDirectory = posix.dirname(packagePath);

  const manifestItems = asArray(asRecord(packageDocument.manifest).item)
    .map(asRecord)
    .map<ManifestItem>((item) => ({
      id: attribute(item, "id"),
      href: attribute(item, "href"),
      mediaType: attribute(item, "media-type"),
      properties: attribute(item, "properties")
    }))
    .filter((item) => item.id && item.href);
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));

  const coverMeta = asArray(metadata.meta)
    .map(asRecord)
    .find((meta) => attribute(meta, "name") === "cover");
  const legacyCoverId = coverMeta ? attribute(coverMeta, "content") : "";
  const coverItem =
    manifestItems.find((item) => item.properties.split(/\s+/).includes("cover-image")) ??
    manifestById.get(legacyCoverId);
  let coverDataUrl: string | null = null;
  if (coverItem) {
    const coverPath = resolveArchivePath(packageDirectory, coverItem.href);
    const coverFile = zip.file(coverPath);
    if (coverFile) {
      coverDataUrl = mediaTypeToDataUrl(
        coverItem.mediaType || "application/octet-stream",
        await coverFile.async("uint8array")
      );
    }
  }

  const spine = asRecord(packageDocument.spine);
  const spineItems = asArray(spine.itemref)
    .map(asRecord)
    .map((item) => manifestById.get(attribute(item, "idref")))
    .filter((item): item is ManifestItem => Boolean(item));
  const navigationItem = manifestItems.find((item) =>
    item.properties.split(/\s+/).includes("nav")
  );
  let links: NavigationLink[] = [];
  let linksDirectory = packageDirectory;
  if (navigationItem) {
    const navigationPath = resolveArchivePath(packageDirectory, navigationItem.href);
    linksDirectory = posix.dirname(navigationPath);
    links = navigationLinks(xmlParser.parse(await requiredTextFile(zip, navigationPath, "navigation document")));
  } else {
    const ncxId = attribute(spine, "toc");
    const ncxItem = manifestById.get(ncxId) ??
      manifestItems.find((item) => item.mediaType === "application/x-dtbncx+xml");
    if (ncxItem) {
      const ncxPath = resolveArchivePath(packageDirectory, ncxItem.href);
      linksDirectory = posix.dirname(ncxPath);
      const ncx = asRecord(xmlParser.parse(await requiredTextFile(zip, ncxPath, "NCX"))).ncx;
      links = ncxLinks(asRecord(ncx).navMap);
    }
  }
  if (!links.length) {
    links = spineItems.map((item) => ({
      title: basename(item.href, posix.extname(item.href)).replace(/[-_]+/g, " "),
      href: item.href,
      depth: 0
    }));
  }

  const chapters = distinctChapters(links.map<BookChapter>((link, order) => {
    const href = resolveArchivePath(linksDirectory, link.href);
    const fragment = fragmentFromHref(link.href);
    return {
      id: chapterId(
        link.depth === 0 ? href : `${href}#${fragment ?? `toc-${order}`}`
      ),
      title: link.title,
      order,
      href,
      depth: link.depth,
      fragment
    };
  }));
  if (!chapters.length) throw new Error("EPUB 沒有可閱讀的章節");

  return { title, author, coverDataUrl, chapters };
}

export class LocalBookLibrary {
  readonly #indexPath: string;
  readonly #booksPath: string;
  #stateWriteQueue: Promise<void> = Promise.resolve();

  constructor(private readonly libraryPath: string) {
    this.#indexPath = join(libraryPath, "index.json");
    this.#booksPath = join(libraryPath, "books");
  }

  async waitForIdle(): Promise<void> {
    await this.#stateWriteQueue;
  }

  async #ensureLibrary(): Promise<void> {
    await mkdir(this.#booksPath, { recursive: true });
    try {
      await readFile(this.#indexPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(this.#indexPath, "[]\n", "utf8");
    }
  }

  async listBooks(): Promise<LibraryBook[]> {
    await this.#ensureLibrary();
    const contents = await readFile(this.#indexPath, "utf8");
    const books = JSON.parse(contents) as LibraryBook[];
    let migrated = false;
    const booksWithHierarchy = await Promise.all(books.map(async (book) => {
      const needsMigration = book.epubParseVersion !== epubParseVersion ||
        book.chapters.some((chapter) =>
          !("depth" in chapter) || !("fragment" in chapter)
        );
      if (!needsMigration) return book;
      try {
        const epubPath = join(this.#booksPath, book.id, "book.epub");
        const parsed = await parseEpub(await readFile(epubPath));
        migrated = true;
        return {
          ...book,
          epubParseVersion,
          chapters: parsed.chapters
        };
      } catch {
        return book;
      }
    }));
    if (migrated) await this.#saveBooks(booksWithHierarchy);
    return booksWithHierarchy.map((book) => {
      const chapters = distinctChapters(book.chapters);
      const lastChapterId = knownChapterId(chapters, book.lastChapterId) ??
        knownChapterId(chapters, book.readingState?.chapterId);
      return {
        ...book,
        chapters,
        lastChapterId,
        readingState: defaultReadingState({
          ...book,
          chapters,
          lastChapterId
        }),
        chapterRanges: chapterRanges(book, chapters),
        chapterAnnotations: chapterAnnotations(book, chapters)
      };
    });
  }

  async #saveBooks(books: LibraryBook[]): Promise<void> {
    const temporaryIndex = `${this.#indexPath}.${process.pid}.${randomUUID()}.next`;
    await writeFile(temporaryIndex, `${JSON.stringify(books, null, 2)}\n`, "utf8");
    try {
      await replaceFileWithRetry(temporaryIndex, this.#indexPath);
    } catch (error) {
      await rm(temporaryIndex, { force: true });
      throw error;
    }
  }

  async importFromPath(epubPath: string): Promise<ImportBookResult> {
    await this.#ensureLibrary();
    const contents = await readFile(epubPath);
    const id = createHash("sha256").update(contents).digest("hex");
    const books = await this.listBooks();
    const existing = books.find((book) => book.id === id);
    if (existing) return { status: "existing", book: existing };

    let parsed: ParsedEpub;
    try {
      parsed = await parseEpub(contents);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "格式無法辨識";
      throw new Error(`無法解析這本 EPUB：${detail}`);
    }

    const book: LibraryBook = {
      id,
      epubParseVersion,
      ...parsed,
      progressPercent: 0,
      lastChapterId: null,
      readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
      chapterRanges: {},
      chapterAnnotations: {}
    };
    const bookPath = join(this.#booksPath, id);
    try {
      await mkdir(bookPath, { recursive: false });
      await copyFile(epubPath, join(bookPath, "book.epub"));
      await this.#saveBooks([...books, book]);
    } catch (error) {
      await rm(bookPath, { recursive: true, force: true });
      throw error;
    }
    return { status: "imported", book };
  }

  async deleteBook(bookId: string): Promise<void> {
    const operation = this.#stateWriteQueue.then(async () => {
      const books = await this.listBooks();
      const book = books.find((candidate) => candidate.id === bookId);
      if (!book) throw new Error("找不到書籍");

      await this.#saveBooks(books.filter((candidate) => candidate.id !== bookId));
      try {
        await rm(join(this.#booksPath, book.id), { recursive: true, force: true });
      } catch (error) {
        await this.#saveBooks(books);
        throw error;
      }
    });
    this.#stateWriteQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async getChapterContent(
    bookId: string,
    requestedChapterId: string
  ): Promise<ChapterContent> {
    const books = await this.listBooks();
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) throw new Error("找不到書籍");
    const chapter = book.chapters.find(
      (candidate) => candidate.id === requestedChapterId
    );
    if (!chapter) throw new Error("找不到章節");

    const epub = await readFile(join(this.#booksPath, book.id, "book.epub"));
    const zip = await JSZip.loadAsync(epub);
    const file = zip.file(chapter.href);
    if (!file) throw new Error("章節內容遺失");
    const contentHtml = await sanitizeChapterHtml(
      zip,
      chapter.href,
      await file.async("text")
    );
    return {
      bookId: book.id,
      chapterId: chapter.id,
      title: chapter.title,
      fragment: chapter.fragment,
      contentHtml
    };
  }

  async saveReadingState(input: SaveReadingStateInput): Promise<LibraryBook> {
    const operation = this.#stateWriteQueue.then(async () => {
      const books = await this.listBooks();
      const index = books.findIndex((book) => book.id === input.bookId);
      if (index < 0) throw new Error("找不到書籍");
      const book = books[index];
      const chapter = input.chapterId
        ? book.chapters.find((candidate) => candidate.id === input.chapterId)
        : undefined;
      if (input.chapterId && !chapter) throw new Error("找不到章節");
      const scrollProgress = Number.isFinite(input.scrollProgress)
        ? Math.min(1, Math.max(0, input.scrollProgress))
        : 0;
      const progressPercent = chapter
        ? Math.max(
            book.progressPercent,
            Math.round(((chapter.order + scrollProgress) / book.chapters.length) * 100)
          )
        : book.progressPercent;
      const updated: LibraryBook = {
        ...book,
        progressPercent,
        lastChapterId: chapter?.id ?? book.lastChapterId,
        readingState: {
          view: input.view,
          chapterId: chapter?.id ?? book.readingState.chapterId,
          scrollProgress
        }
      };
      books[index] = updated;
      await this.#saveBooks(books);
      return updated;
    });
    this.#stateWriteQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async saveReadingRange(input: SaveReadingRangeInput): Promise<LibraryBook> {
    const operation = this.#stateWriteQueue.then(async () => {
      const books = await this.listBooks();
      const index = books.findIndex((book) => book.id === input.bookId);
      if (index < 0) throw new Error("找不到書籍");
      const book = books[index];
      if (!book.chapters.some((chapter) => chapter.id === input.chapterId)) {
        throw new Error("找不到章節");
      }
      if (!validReadingRange(input.range)) {
        throw new Error("閱讀區段格式錯誤");
      }
      const updated: LibraryBook = {
        ...book,
        chapterRanges: {
          ...book.chapterRanges,
          [input.chapterId]: input.range
        }
      };
      books[index] = updated;
      await this.#saveBooks(books);
      return updated;
    });
    this.#stateWriteQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async saveAnnotations(input: SaveAnnotationsInput): Promise<LibraryBook> {
    const operation = this.#stateWriteQueue.then(async () => {
      const books = await this.listBooks();
      const index = books.findIndex((book) => book.id === input.bookId);
      if (index < 0) throw new Error("找不到書籍");
      const book = books[index];
      if (!book.chapters.some((chapter) => chapter.id === input.chapterId)) {
        throw new Error("找不到章節");
      }
      if (!Array.isArray(input.annotations) ||
        input.annotations.some((annotation) => !validAnnotation(annotation))) {
        throw new Error("標記格式錯誤");
      }
      if (annotationsOverlap(input.annotations)) return book;
      const annotations = [...input.annotations].sort(
        (left, right) => left.start - right.start || left.end - right.end
      );
      const updated: LibraryBook = {
        ...book,
        chapterAnnotations: {
          ...book.chapterAnnotations,
          [input.chapterId]: annotations
        }
      };
      books[index] = updated;
      await this.#saveBooks(books);
      return updated;
    });
    this.#stateWriteQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
