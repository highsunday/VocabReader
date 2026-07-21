import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSettingsStore } from "./settings-store";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-settings-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LocalSettingsStore", () => {
  it("defaults to source language and persists a selected explanation language", async () => {
    const directory = await temporaryDirectory();
    const store = new LocalSettingsStore(directory);

    await expect(store.load()).resolves.toEqual({ explanationLanguage: "source" });
    await expect(store.save({ explanationLanguage: "ja" })).resolves.toEqual({
      explanationLanguage: "ja"
    });
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "ja"
    });
    await expect(readFile(join(directory, "settings.json"), "utf8"))
      .resolves.toContain('"explanationLanguage": "ja"');
  });

  it("safely falls back to source for corrupt or unknown settings", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "settings.json"), "not-json", "utf8");
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "source"
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ explanationLanguage: "klingon" }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "source"
    });
  });
});
