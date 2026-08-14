import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, posix } from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import type {
  BookChapter,
  ChapterContent,
  ImportBookResult,
  LibraryBook,
  ReadingRange,
  SaveReadingRangeInput
} from "../shared/contracts";

type XmlRecord = Record<string, unknown>;
type OrderedXmlNode = Record<string, unknown>;

interface ManifestItem {
  id: string;
  href: string;
  properties: string;
}

interface StoredBook {
  book: LibraryBook;
  bytes: Buffer;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true
});

const orderedXml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  preserveOrder: true,
  textNodeName: "#text",
  trimValues: false
});

function record(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as XmlRecord
    : {};
}

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function attribute(value: XmlRecord, name: string): string {
  const candidate = value[`@_${name}`];
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : "";
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  const valueRecord = record(value);
  if ("#text" in valueRecord) return text(valueRecord["#text"]);
  return Object.entries(valueRecord)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, child]) => text(child))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function archivePath(base: string, href: string): string {
  const raw = href.split("#", 1)[0] ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Keep malformed percent encoding literal; normalization still guards traversal.
  }
  const resolved = posix.normalize(posix.join(base, decoded));
  if (!resolved || posix.isAbsolute(resolved) || resolved.startsWith("../")) {
    throw new Error("The EPUB contains an unsafe archive path.");
  }
  return resolved;
}

async function requiredText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`The EPUB is missing ${path}.`);
  return file.async("text");
}

function chapterId(href: string): string {
  return createHash("sha256").update(href).digest("hex").slice(0, 16);
}

function navigationLinks(value: unknown): Array<{ title: string; href: string }> {
  const links: Array<{ title: string; href: string }> = [];
  const visit = (node: unknown) => {
    const nodeRecord = record(node);
    for (const item of array(nodeRecord.li)) {
      const itemRecord = record(item);
      const anchor = record(array(itemRecord.a)[0]);
      const href = attribute(anchor, "href");
      const title = text(anchor);
      if (href && title) links.push({ title, href });
      visit(itemRecord.ol);
    }
    for (const child of array(nodeRecord.ol)) visit(child);
  };
  const html = record(record(value).html);
  const body = record(html.body);
  const navigation = array(body.nav).map(record).find((candidate) =>
    attribute(candidate, "type").split(/\s+/).includes("toc")
  ) ?? record(array(body.nav)[0]);
  visit(navigation.ol);
  return links;
}

const readableTags = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "em",
  "strong", "b", "i", "u", "blockquote", "pre", "code", "ul", "ol",
  "li", "dl", "dt", "dd", "table", "thead", "tbody", "tr", "th", "td",
  "hr", "br", "figure", "figcaption", "sup", "sub", "section", "article"
]);

const discardedTags = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "select", "textarea", "meta", "link", "base", "svg", "canvas", "audio", "video"
]);

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function imageMime(path: string): string | undefined {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  } as Record<string, string>)[posix.extname(path).toLowerCase()];
}

async function sanitizeChapter(
  zip: JSZip,
  chapterPath: string,
  source: string
): Promise<string> {
  const parsed = orderedXml.parse(source) as OrderedXmlNode[];

  const findBody = (nodes: OrderedXmlNode[]): OrderedXmlNode[] | undefined => {
    for (const node of nodes) {
      if (Array.isArray(node.body)) return node.body as OrderedXmlNode[];
      for (const [key, child] of Object.entries(node)) {
        if (key !== ":@" && Array.isArray(child)) {
          const result = findBody(child as OrderedXmlNode[]);
          if (result) return result;
        }
      }
    }
    return undefined;
  };

  const render = async (nodes: OrderedXmlNode[]): Promise<string> => {
    let output = "";
    for (const node of nodes) {
      if (typeof node["#text"] === "string") {
        output += escapeText(node["#text"]);
        continue;
      }
      const entry = Object.entries(node).find(
        ([key, child]) => key !== ":@" && Array.isArray(child)
      );
      if (!entry) continue;
      const [rawName, rawChildren] = entry;
      const name = rawName.toLowerCase();
      if (discardedTags.has(name)) continue;
      const attributes = record(node[":@"]);
      if (name === "img") {
        const sourcePath = String(attributes["@_src"] ?? "");
        if (!sourcePath || /^(?:[a-z]+:|\/\/|#)/i.test(sourcePath)) continue;
        try {
          const assetPath = archivePath(posix.dirname(chapterPath), sourcePath);
          const mime = imageMime(assetPath);
          const asset = mime ? zip.file(assetPath) : null;
          if (!mime || !asset) continue;
          const data = Buffer.from(await asset.async("uint8array")).toString("base64");
          const alt = escapeAttribute(String(attributes["@_alt"] ?? ""));
          output += `<img src="data:${mime};base64,${data}" alt="${alt}">`;
        } catch {
          // Missing or unsafe book-local images are omitted.
        }
        continue;
      }
      const children = await render(rawChildren as OrderedXmlNode[]);
      if (!readableTags.has(name)) {
        output += children;
        continue;
      }
      const id = String(attributes["@_id"] ?? "");
      const idAttribute = id && !/[\u0000-\u001f\u007f]/.test(id)
        ? ` id="${escapeAttribute(id)}"`
        : "";
      output += name === "br" || name === "hr"
        ? `<${name}${idAttribute}>`
        : `<${name}${idAttribute}>${children}</${name}>`;
    }
    return output;
  };

  return (await render(findBody(parsed) ?? parsed)).trim();
}

async function parseBook(bytes: Buffer): Promise<LibraryBook> {
  const zip = await JSZip.loadAsync(bytes);
  if ((await requiredText(zip, "mimetype")).trim() !== "application/epub+zip") {
    throw new Error("The selected file is not a standard EPUB.");
  }
  const container = record(xml.parse(await requiredText(zip, "META-INF/container.xml"))).container;
  const rootfile = record(array(record(record(container).rootfiles).rootfile)[0]);
  const packagePath = attribute(rootfile, "full-path");
  if (!packagePath) throw new Error("The EPUB container has no package document.");

  const packageDocument = record(
    record(xml.parse(await requiredText(zip, packagePath))).package
  );
  const metadata = record(packageDocument.metadata);
  const title = text(array(metadata.title)[0]);
  if (!title) throw new Error("The EPUB has no title.");
  const author = text(array(metadata.creator)[0]) || "Unknown author";
  const packageDirectory = posix.dirname(packagePath);
  const manifest = array(record(packageDocument.manifest).item)
    .map(record)
    .map<ManifestItem>((item) => ({
      id: attribute(item, "id"),
      href: attribute(item, "href"),
      properties: attribute(item, "properties")
    }))
    .filter((item) => item.id && item.href);
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const spineItems = array(record(packageDocument.spine).itemref)
    .map(record)
    .map((item) => manifestById.get(attribute(item, "idref")))
    .filter((item): item is ManifestItem => Boolean(item));

  const navItem = manifest.find((item) =>
    item.properties.split(/\s+/).includes("nav")
  );
  let links: Array<{ title: string; href: string }> = [];
  let linksDirectory = packageDirectory;
  if (navItem) {
    const navPath = archivePath(packageDirectory, navItem.href);
    linksDirectory = posix.dirname(navPath);
    links = navigationLinks(xml.parse(await requiredText(zip, navPath)));
  }
  if (!links.length) {
    links = spineItems.map((item) => ({
      title: basename(item.href, posix.extname(item.href)).replace(/[-_]+/g, " "),
      href: item.href
    }));
  }
  const seen = new Set<string>();
  const chapters = links.flatMap<BookChapter>((link, order) => {
    const href = archivePath(linksDirectory, link.href);
    if (seen.has(href)) return [];
    seen.add(href);
    return [{ id: chapterId(href), title: link.title, href, order }];
  });
  if (!chapters.length) throw new Error("The EPUB has no readable chapters.");
  return {
    id: createHash("sha256").update(bytes).digest("hex"),
    title,
    author,
    chapters,
    chapterRanges: {}
  };
}

export class InMemoryEpubLibrary {
  readonly #books = new Map<string, StoredBook>();

  listBooks(): LibraryBook[] {
    return [...this.#books.values()].map(({ book }) => structuredClone(book));
  }

  async importFromPath(path: string): Promise<ImportBookResult> {
    return this.importFromBuffer(await readFile(path));
  }

  async importFromBuffer(bytes: Buffer): Promise<ImportBookResult> {
    const book = await parseBook(bytes);
    const existing = this.#books.get(book.id);
    if (existing) return { status: "existing", book: structuredClone(existing.book) };
    this.#books.set(book.id, { book, bytes: Buffer.from(bytes) });
    return { status: "imported", book: structuredClone(book) };
  }

  async getChapterContent(bookId: string, chapterIdValue: string): Promise<ChapterContent> {
    const stored = this.#books.get(bookId);
    if (!stored) throw new Error("Book not found.");
    const chapter = stored.book.chapters.find(({ id }) => id === chapterIdValue);
    if (!chapter) throw new Error("Chapter not found.");
    const zip = await JSZip.loadAsync(stored.bytes);
    const file = zip.file(chapter.href);
    if (!file) throw new Error("Chapter content is missing.");
    return {
      bookId,
      chapterId: chapter.id,
      title: chapter.title,
      contentHtml: await sanitizeChapter(zip, chapter.href, await file.async("text"))
    };
  }

  saveReadingRange(input: SaveReadingRangeInput): LibraryBook {
    const stored = this.#books.get(input.bookId);
    if (!stored) throw new Error("Book not found.");
    if (!stored.book.chapters.some(({ id }) => id === input.chapterId)) {
      throw new Error("Chapter not found.");
    }
    const range: ReadingRange = input.range;
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) ||
      range.start < 0 || range.end < range.start) {
      throw new Error("Invalid reading range.");
    }
    stored.book.chapterRanges[input.chapterId] = { ...range };
    return structuredClone(stored.book);
  }
}
