import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

  assert.match(source, /palettegen=[^\n]*max_colors=256/);
  assert.match(source, /paletteuse=[^\n]*dither=sierra2_4a/);
  assert.doesNotMatch(source, /dither=bayer|bayer_scale/);
  assert.doesNotMatch(source, /(?:format=|-pix_fmt\s+)yuv420p/);
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
