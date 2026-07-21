import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import type {
  BookChapter,
  ImportBookResult,
  LibraryBook
} from "../shared/library-contracts";

type XmlValue = string | number | Record<string, unknown> | XmlValue[];

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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true
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

function linksFromNavigationList(value: unknown): Array<{ title: string; href: string }> {
  const links: Array<{ title: string; href: string }> = [];
  const record = asRecord(value);
  for (const item of asArray(record.li)) {
    const itemRecord = asRecord(item);
    const anchors = asArray(itemRecord.a);
    const anchor = asRecord(anchors[0]);
    const href = attribute(anchor, "href");
    const title = textValue(anchor);
    if (href && title) links.push({ title, href });
    links.push(...linksFromNavigationList(itemRecord.ol));
  }
  return links;
}

function navigationLinks(document: unknown): Array<{ title: string; href: string }> {
  const html = asRecord(asRecord(document).html);
  const body = asRecord(html.body);
  const candidates = asArray(body.nav).map(asRecord);
  const toc =
    candidates.find((nav) => attribute(nav, "type").split(/\s+/).includes("toc")) ??
    candidates[0];
  return toc ? linksFromNavigationList(toc.ol) : [];
}

function ncxLinks(value: unknown): Array<{ title: string; href: string }> {
  const links: Array<{ title: string; href: string }> = [];
  const record = asRecord(value);
  for (const point of asArray(record.navPoint)) {
    const pointRecord = asRecord(point);
    const content = asRecord(pointRecord.content);
    const href = attribute(content, "src");
    const title = textValue(asRecord(pointRecord.navLabel).text);
    if (href && title) links.push({ title, href });
    links.push(...ncxLinks(pointRecord));
  }
  return links;
}

function mediaTypeToDataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function requiredTextFile(zip: JSZip, path: string, label: string) {
  const file = zip.file(path);
  if (!file) throw new Error(`缺少 ${label}`);
  return file.async("text");
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
  let links: Array<{ title: string; href: string }> = [];
  if (navigationItem) {
    const navigationPath = resolveArchivePath(packageDirectory, navigationItem.href);
    links = navigationLinks(xmlParser.parse(await requiredTextFile(zip, navigationPath, "navigation document")));
  } else {
    const ncxId = attribute(spine, "toc");
    const ncxItem = manifestById.get(ncxId) ??
      manifestItems.find((item) => item.mediaType === "application/x-dtbncx+xml");
    if (ncxItem) {
      const ncxPath = resolveArchivePath(packageDirectory, ncxItem.href);
      const ncx = asRecord(xmlParser.parse(await requiredTextFile(zip, ncxPath, "NCX"))).ncx;
      links = ncxLinks(asRecord(ncx).navMap);
    }
  }
  if (!links.length) {
    links = spineItems.map((item) => ({
      title: basename(item.href, posix.extname(item.href)).replace(/[-_]+/g, " "),
      href: item.href
    }));
  }

  const chapters = links.map<BookChapter>((link, order) => ({
    id: chapterId(resolveArchivePath(packageDirectory, link.href)),
    title: link.title,
    order,
    href: resolveArchivePath(packageDirectory, link.href)
  }));
  if (!chapters.length) throw new Error("EPUB 沒有可閱讀的章節");

  return { title, author, coverDataUrl, chapters };
}

export class LocalBookLibrary {
  readonly #indexPath: string;
  readonly #booksPath: string;

  constructor(private readonly libraryPath: string) {
    this.#indexPath = join(libraryPath, "index.json");
    this.#booksPath = join(libraryPath, "books");
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
    return books.map((book) => ({
      ...book,
      chapters: [...book.chapters].sort((left, right) => left.order - right.order)
    }));
  }

  async #saveBooks(books: LibraryBook[]): Promise<void> {
    const temporaryIndex = `${this.#indexPath}.next`;
    await writeFile(temporaryIndex, `${JSON.stringify(books, null, 2)}\n`, "utf8");
    await rename(temporaryIndex, this.#indexPath);
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
      ...parsed,
      progressPercent: 0,
      lastChapterId: null
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
}
