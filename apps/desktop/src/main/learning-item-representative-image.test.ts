// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../shared/learning-contracts";
import {
  downloadRepresentativeImage,
  LearningItemRepresentativeImageService,
  processRepresentativeImage,
  REPRESENTATIVE_IMAGE_SOURCE_LIMIT
} from "./learning-item-representative-image";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function sourceBuffer(
  format: "jpeg" | "png" | "webp",
  width = 420,
  height = 180,
  alpha = 1
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 120, b: 210, alpha }
    }
  });
  return format === "jpeg"
    ? pipeline.jpeg().toBuffer()
    : format === "png"
      ? pipeline.png().toBuffer()
      : pipeline.webp().toBuffer();
}

const item = {
  id: "item-ibex",
  title: "ibex",
  itemType: "word",
  language: "en",
  cefr: "B2",
  sense: "a wild mountain goat",
  markdownContent: "## Meaning\n野生山羊。",
  representativeImageDataUrl: null,
  status: "active",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  trashedAt: null
} satisfies LearningItem;

describe("learning-item representative image", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "converts a %s source to a centered 256px JPEG",
    async (format) => {
      const output = await processRepresentativeImage(await sourceBuffer(format));
      await expect(sharp(output).metadata()).resolves.toMatchObject({
        format: "jpeg",
        width: 256,
        height: 256
      });
    }
  );

  it("centers the crop and flattens transparent pixels onto white", async () => {
    const width = 300;
    const height = 100;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = x < 100 ? 255 : 0;
        pixels[offset + 1] = x >= 100 && x < 200 ? 255 : 0;
        pixels[offset + 2] = x >= 200 ? 255 : 0;
        pixels[offset + 3] = 255;
      }
    }
    const png = await sharp(pixels, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    const output = await processRepresentativeImage(png);
    const raw = await sharp(output).raw().toBuffer();
    const center = (128 * 256 + 128) * 3;
    expect(raw[center + 1]).toBeGreaterThan(220);
    expect(raw[center]).toBeLessThan(40);
    expect(raw[center + 2]).toBeLessThan(40);

    const transparent = await processRepresentativeImage(
      await sourceBuffer("png", 80, 80, 0)
    );
    const transparentRaw = await sharp(transparent).raw().toBuffer();
    const transparentCenter = (128 * 256 + 128) * 3;
    expect(transparentRaw[transparentCenter]).toBeGreaterThan(240);
    expect(transparentRaw[transparentCenter + 1]).toBeGreaterThan(240);
    expect(transparentRaw[transparentCenter + 2]).toBeGreaterThan(240);
  });

  it("rejects oversized, animated-GIF, SVG, and corrupt input", async () => {
    await expect(processRepresentativeImage(
      Buffer.alloc(REPRESENTATIVE_IMAGE_SOURCE_LIMIT + 1)
    )).rejects.toThrow(/10 MiB/);
    await expect(processRepresentativeImage(Buffer.from("GIF89a")))
      .rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(processRepresentativeImage(Buffer.from("<svg></svg>")))
      .rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(processRepresentativeImage(Buffer.from("not an image")))
      .rejects.toThrow(/JPEG, PNG, or WebP/);
  });

  it("downloads HTTP(S) image data with URL and size validation", async () => {
    const source = await sourceBuffer("png");
    const fetcher = vi.fn(async () => new Response(Uint8Array.from(source).buffer, {
      status: 200,
      headers: { "content-type": "image/png" }
    }));
    await expect(downloadRepresentativeImage(
      "https://images.example/ibex.png",
      fetcher
    )).resolves.toEqual(source);
    expect(fetcher).toHaveBeenCalledWith(
      "https://images.example/ibex.png",
      expect.objectContaining({ redirect: "follow" })
    );

    await expect(downloadRepresentativeImage("file:///tmp/ibex.png", fetcher))
      .rejects.toThrow(/http:\/\//);
    await expect(downloadRepresentativeImage("not a url", fetcher))
      .rejects.toThrow(/valid image URL/);
    await expect(downloadRepresentativeImage(
      "https://images.example/large.png",
      async () => new Response("too large", {
        headers: {
          "content-length": String(REPRESENTATIVE_IMAGE_SOURCE_LIMIT + 1)
        }
      })
    )).rejects.toThrow(/10 MiB/);
  });

  it("uses a Main-owned path, preserves data on cancel, and stores only processed JPEG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vocabreader-image-test-"));
    temporaryDirectories.push(directory);
    const imagePath = join(directory, "ibex.webp");
    await writeFile(imagePath, await sourceBuffer("webp"));
    const dialog = {
      showOpenDialog: vi.fn()
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [imagePath] })
    };
    const library = {
      setRepresentativeImage: vi.fn(async (_itemId: string, bytes: Buffer) => ({
        ...item,
        representativeImageDataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`
      })),
      removeRepresentativeImage: vi.fn(async () => item)
    };
    const service = new LearningItemRepresentativeImageService(dialog, library);

    await expect(service.select(item.id)).resolves.toEqual({ status: "cancelled" });
    expect(library.setRepresentativeImage).not.toHaveBeenCalled();
    await expect(service.select(item.id)).resolves.toMatchObject({ status: "updated" });
    const stored = library.setRepresentativeImage.mock.calls[0][1];
    await expect(sharp(stored).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width: 256,
      height: 256
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      properties: ["openFile"]
    }));
  });
});
