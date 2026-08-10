import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import type {
  LearningItem,
  SelectRepresentativeImageResult
} from "../shared/learning-contracts";

export const REPRESENTATIVE_IMAGE_SOURCE_LIMIT = 10 * 1024 * 1024;
export const REPRESENTATIVE_IMAGE_SIZE = 256;
export const REPRESENTATIVE_IMAGE_JPEG_QUALITY = 85;

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedFormats = new Set(["jpeg", "png", "webp"]);
const DOWNLOAD_TIMEOUT_MS = 15_000;

type RepresentativeImageFetcher = (
  input: string,
  init: { signal: AbortSignal; redirect: "follow" }
) => Promise<Response>;

export async function processRepresentativeImage(source: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(source) || source.byteLength === 0) {
    throw new Error("The selected image is empty");
  }
  if (source.byteLength > REPRESENTATIVE_IMAGE_SOURCE_LIMIT) {
    throw new Error("The selected image exceeds the 10 MiB limit");
  }
  try {
    const metadata = await sharp(source, { animated: false }).metadata();
    if (!metadata.format || !allowedFormats.has(metadata.format)) {
      throw new Error("unsupported-format");
    }
    const { data, info } = await sharp(source, { animated: false })
      .autoOrient()
      .resize(REPRESENTATIVE_IMAGE_SIZE, REPRESENTATIVE_IMAGE_SIZE, {
        fit: "cover",
        position: "centre"
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: REPRESENTATIVE_IMAGE_JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    if (
      info.format !== "jpeg" ||
      info.width !== REPRESENTATIVE_IMAGE_SIZE ||
      info.height !== REPRESENTATIVE_IMAGE_SIZE
    ) {
      throw new Error("invalid-output");
    }
    return data;
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("10 MiB")) throw cause;
    throw new Error("The selected file is not a supported JPEG, PNG, or WebP image");
  }
}

export async function downloadRepresentativeImage(
  sourceUrl: string,
  fetcher: RepresentativeImageFetcher = fetch
): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    throw new Error("Enter a valid image URL");
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error("The image URL must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("Image URLs containing sign-in details are not supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetcher(url.toString(), {
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Unable to download the image (HTTP ${response.status})`);
    }
    const finalUrl = new URL(response.url || url.toString());
    if (!(["http:", "https:"] as string[]).includes(finalUrl.protocol)) {
      throw new Error("The image redirected to an unsupported URL");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) &&
      contentLength > REPRESENTATIVE_IMAGE_SOURCE_LIMIT) {
      throw new Error("The image exceeds the 10 MiB limit");
    }
    if (!response.body) throw new Error("The image response was empty");

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > REPRESENTATIVE_IMAGE_SOURCE_LIMIT) {
        await reader.cancel();
        throw new Error("The image exceeds the 10 MiB limit");
      }
      chunks.push(Buffer.from(value));
    }
    if (total === 0) throw new Error("The image response was empty");
    return Buffer.concat(chunks, total);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error("The image download timed out");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

interface RepresentativeImageDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface RepresentativeImageLibrary {
  setRepresentativeImage(itemId: string, jpegBytes: Buffer): Promise<LearningItem>;
  removeRepresentativeImage(itemId: string): Promise<LearningItem>;
}

export class LearningItemRepresentativeImageService {
  readonly #dialog: RepresentativeImageDialog;
  readonly #library: RepresentativeImageLibrary;

  constructor(
    dialog: RepresentativeImageDialog,
    library: RepresentativeImageLibrary
  ) {
    this.#dialog = dialog;
    this.#library = library;
  }

  async select(itemId: string): Promise<SelectRepresentativeImageResult> {
    const selection = await this.#dialog.showOpenDialog({
      title: "Choose a Representative Image",
      properties: ["openFile"],
      filters: [{
        name: "JPEG, PNG, or WebP Image",
        extensions: ["jpg", "jpeg", "png", "webp"]
      }]
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return { status: "cancelled" };
    if (!allowedExtensions.has(extname(sourcePath).toLowerCase())) {
      throw new Error("Choose a JPEG, PNG, or WebP image");
    }
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error("The selected image is not a file");
    if (sourceStat.size > REPRESENTATIVE_IMAGE_SOURCE_LIMIT) {
      throw new Error("The selected image exceeds the 10 MiB limit");
    }
    const source = await readFile(sourcePath);
    const processed = await processRepresentativeImage(source);
    const item = await this.#library.setRepresentativeImage(itemId, processed);
    return { status: "updated", item };
  }

  async setFromUrl(itemId: string, imageUrl: string): Promise<LearningItem> {
    const source = await downloadRepresentativeImage(imageUrl);
    const processed = await processRepresentativeImage(source);
    return this.#library.setRepresentativeImage(itemId, processed);
  }

  remove(itemId: string): Promise<LearningItem> {
    return this.#library.removeRepresentativeImage(itemId);
  }
}
