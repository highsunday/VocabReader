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
  it("defaults all preferences and persists selected settings", async () => {
    const directory = await temporaryDirectory();
    const store = new LocalSettingsStore(directory);

    await expect(store.load()).resolves.toEqual({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19
    });
    await expect(store.save({
      explanationLanguage: "ja",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    })).resolves.toEqual({
      explanationLanguage: "ja",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    });
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "ja",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    });
    await expect(readFile(join(directory, "settings.json"), "utf8"))
      .resolves.toContain('"explanationLanguage": "ja"');
  });

  it("safely loads legacy settings and falls back invalid fields independently", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "settings.json"), "not-json", "utf8");
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ explanationLanguage: "ja" }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "ja",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        explanationLanguage: "en",
        aiConversationFontSize: 18.5,
        ebookContentFontSize: 28
      }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      explanationLanguage: "en",
      aiConversationFontSize: 13,
      ebookContentFontSize: 28
    });
  });
});
