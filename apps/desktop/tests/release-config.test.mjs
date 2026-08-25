import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(testDirectory, "..");
const repositoryRoot = resolve(desktopDirectory, "../..");

function readRepositoryFile(path) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test("publishes VocabReader under the 2026 highsunday MIT license", () => {
  const license = readRepositoryFile("LICENSE");

  assert.match(license, /^MIT License$/m);
  assert.match(license, /Copyright \(c\) 2026 highsunday/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("defines native installer scripts and deterministic artifact names", () => {
  const packageJson = JSON.parse(readRepositoryFile("apps/desktop/package.json"));

  assert.equal(packageJson.devDependencies["electron-builder"], "^26.15.3");
  assert.match(packageJson.scripts.postinstall, /electron-builder install-app-deps/);
  assert.match(packageJson.scripts["dist:mac:arm64"], /--mac dmg --arm64 --publish never/);
  assert.match(packageJson.scripts["dist:mac:x64"], /--mac dmg --x64 --publish never/);
  assert.match(packageJson.scripts["dist:win:x64"], /--win nsis --x64 --publish never/);

  assert.equal(packageJson.build.appId, "com.highsunday.vocabreader");
  assert.equal(packageJson.build.productName, "VocabReader");
  assert.equal(
    packageJson.build.mac.icon,
    "assets/icon/vocabreader-language-learning-v6.png"
  );
  assert.equal(
    packageJson.build.win.icon,
    "assets/icon/vocabreader-language-learning-v6.png"
  );
  assert.equal(
    packageJson.build.mac.artifactName,
    "${productName}-${version}-mac-${arch}.${ext}"
  );
  assert.equal(
    packageJson.build.win.artifactName,
    "${productName}-${version}-windows-${arch}-setup.${ext}"
  );
  assert.equal(packageJson.build.publish.provider, "github");
  assert.equal(packageJson.build.publish.owner, "highsunday");
  assert.equal(packageJson.build.publish.repo, "VocabReader");
});

test("builds all installers on native runners before publishing the release", () => {
  const workflow = readRepositoryFile(".github/workflows/release.yml");

  assert.match(workflow, /tags:\s*\n\s*- ["']v\*["']/);
  assert.match(workflow, /runner: macos-15\b/);
  assert.match(workflow, /runner: macos-15-intel\b/);
  assert.match(workflow, /runner: windows-latest\b/);
  assert.match(workflow, /script: dist:mac:arm64\b/);
  assert.match(workflow, /script: dist:mac:x64\b/);
  assert.match(workflow, /script: dist:win:x64\b/);
  assert.match(workflow, /bundle: macos-arm64\b/);
  assert.match(workflow, /bundle: macos-x64\b/);
  assert.match(workflow, /bundle: windows-x64\b/);
  assert.match(workflow, /name: installer-\$\{\{ matrix\.bundle \}\}/);
  assert.doesNotMatch(workflow, /name: installer-\$\{\{ matrix\.script \}\}/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /publish:\s*\n\s*needs: build/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /gh release (?:create|upload)/);
});

test("discloses MIT licensing and unsigned preview installer warnings", () => {
  const readme = readRepositoryFile("README.md");

  assert.match(readme, /license-MIT/);
  assert.match(readme, /尚未簽章/);
  assert.match(readme, /Gatekeeper/);
  assert.match(readme, /SmartScreen/);
  assert.match(readme, /\[MIT License\]\(LICENSE\)/);
});
