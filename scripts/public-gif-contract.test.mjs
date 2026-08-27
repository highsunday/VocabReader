import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../", import.meta.url);
const gifNames = [
  "ask-ai-context.gif",
  "explain-reader-annotations.gif",
  "add-cards-from-explanation.gif",
  "add-card-with-command.gif",
  "spaced-review-workflow.gif",
  "listen-and-repeat.gif",
  "sentence-practice.gif",
  "japanese-learning-workflow.gif",
  "switch-learning-language.gif",
];
const websiteGifNames = [
  "ask-ai-context.gif",
  "spaced-review-workflow.gif",
  "switch-learning-language.gif",
];
const mp4Names = gifNames.map((name) => name.replace(/\.gif$/, ".mp4"));
const websiteMp4Names = websiteGifNames.map((name) => name.replace(/\.gif$/, ".mp4"));

async function bytes(path) {
  return readFile(new URL(path, repoRoot));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function command(commandName, args) {
  return execFileSync(commandName, args, {
    cwd: new URL(".", repoRoot),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("TC1 public GIF generator preserves the full palette without Bayer or a lossy intermediate", async () => {
  const source = await bytes("scripts/build-public-gifs.sh").then((value) => value.toString("utf8"));
  const gifPipelines = [...source.matchAll(/-filter_complex\s+"([^"]*palettegen[^"]*)"/g)]
    .map((match) => match[1]);

  assert.match(source, /palettegen=[^\n]*max_colors=256/);
  assert.match(source, /paletteuse=[^\n]*dither=sierra2_4a/);
  assert.equal(gifPipelines.length, 2, "expected single-source and concatenated GIF pipelines");
  for (const pipeline of gifPipelines) {
    assert.doesNotMatch(pipeline, /dither=bayer|bayer_scale/);
    assert.doesNotMatch(pipeline, /format=yuv420p/);
  }
});

test("F75 TC2 public media generator builds browser-ready MP4s from source recordings", async () => {
  const source = await bytes("scripts/build-public-gifs.sh").then((value) => value.toString("utf8"));

  assert.match(source, /libx264/);
  assert.match(source, /(?:format=|-pix_fmt\s+)yuv420p/);
  assert.match(source, /movflags\s+\+faststart/);
  assert.match(source, /cwebp\s+-quiet\s+-q\s+82/);
  assert.doesNotMatch(source, /-i\s+[^\n]*\.gif/);
});

test("TC2 every README workflow GIF is animated, legible, and uses a rich first-frame palette", async () => {
  for (const name of gifNames) {
    const path = fileURLToPath(new URL(`docs/readme-assets/${name}`, repoRoot));
    const metadata = command("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,nb_frames",
      "-of", "csv=p=0",
      path,
    ]).split(",").map(Number);
    const [width, height, frameCount] = metadata;
    const colorCount = Number(command("magick", [`${path}[0]`, "-format", "%k", "info:"]));

    assert.ok(width >= 800, `${name} width must remain readable`);
    assert.ok(height >= 500, `${name} height must remain readable`);
    assert.ok(frameCount > 1, `${name} must remain animated`);
    assert.ok(colorCount >= 200, `${name} first frame only uses ${colorCount} colors`);
  }
});

test("TC3 website workflow GIFs are byte-identical copies of the README assets", async () => {
  for (const name of websiteGifNames) {
    const readmeAsset = await bytes(`docs/readme-assets/${name}`);
    const websiteAsset = await bytes(`website/public/assets/${name}`);

    assert.equal(sha256(websiteAsset), sha256(readmeAsset), `${name} drifted between README and website`);
  }
});

test("F75 TC1 every workflow GIF has a smaller, matching browser-ready MP4", async () => {
  for (let index = 0; index < gifNames.length; index += 1) {
    const gifName = gifNames[index];
    const mp4Name = mp4Names[index];
    const gifPath = fileURLToPath(new URL(`docs/readme-assets/${gifName}`, repoRoot));
    const mp4Path = fileURLToPath(new URL(`docs/readme-assets/${mp4Name}`, repoRoot));
    const gifMetadata = JSON.parse(command("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      gifPath,
    ]));
    const mp4Metadata = JSON.parse(command("ffprobe", [
      "-v", "error",
      "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height:format=duration",
      "-of", "json",
      mp4Path,
    ]));
    const gifVideo = gifMetadata.streams[0];
    const mp4Video = mp4Metadata.streams.find((stream) => stream.codec_type === "video");

    assert.equal(mp4Video.codec_name, "h264", `${mp4Name} must use H.264`);
    assert.equal(mp4Video.pix_fmt, "yuv420p", `${mp4Name} must use yuv420p`);
    assert.equal(mp4Video.width, gifVideo.width, `${mp4Name} width drifted from its GIF`);
    assert.equal(mp4Video.height, gifVideo.height, `${mp4Name} height drifted from its GIF`);
    assert.equal(
      mp4Metadata.streams.some((stream) => stream.codec_type === "audio"),
      false,
      `${mp4Name} must not contain audio`,
    );
    assert.ok(
      Math.abs(Number(mp4Metadata.format.duration) - Number(gifMetadata.format.duration)) <= 0.2,
      `${mp4Name} duration drifted from its GIF`,
    );
    assert.ok(
      (await stat(mp4Path)).size < (await stat(gifPath)).size,
      `${mp4Name} must be smaller than its GIF`,
    );
  }
});

test("F75 TC3 website workflow MP4s are byte-identical copies of the README assets", async () => {
  for (const name of websiteMp4Names) {
    const readmeAsset = await bytes(`docs/readme-assets/${name}`);
    const websiteAsset = await bytes(`website/public/assets/${name}`);

    assert.equal(sha256(websiteAsset), sha256(readmeAsset), `${name} drifted between README and website`);
  }
});
