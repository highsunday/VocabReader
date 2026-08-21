import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSettingsStore } from "./settings-store";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-settings-test-"));
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
      learningLanguage: "en",
      explanationLanguage: "source",
      explanationLanguages: {
        en: "source",
        ja: "source",
        "zh-TW": "source"
      },
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      dailyListenRepeatGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning"
    });
    await expect(store.save({
      learningLanguage: "ja",
      explanationLanguage: "ja",
      explanationLanguages: {
        en: "zh-TW",
        ja: "ja",
        "zh-TW": "en"
      },
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 25,
      dailyDueReviewCompletionLimit: 80,
      dailySentencePracticeGoal: 12,
      dailyListenRepeatGoal: 20,
      reviewPaperSize: 6,
      selectionSpeechVoice: "marin",
      selectionSpeechTone: "calm"
    })).resolves.toEqual({
      learningLanguage: "ja",
      explanationLanguage: "ja",
      explanationLanguages: {
        en: "zh-TW",
        ja: "ja",
        "zh-TW": "en"
      },
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 25,
      dailyDueReviewCompletionLimit: 80,
      dailySentencePracticeGoal: 12,
      dailyListenRepeatGoal: 20,
      reviewPaperSize: 6,
      selectionSpeechVoice: "marin",
      selectionSpeechTone: "calm"
    });
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      learningLanguage: "ja",
      explanationLanguage: "ja",
      explanationLanguages: {
        en: "zh-TW",
        ja: "ja",
        "zh-TW": "en"
      },
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 25,
      dailyDueReviewCompletionLimit: 80,
      dailySentencePracticeGoal: 12,
      dailyListenRepeatGoal: 20,
      reviewPaperSize: 6,
      selectionSpeechVoice: "marin",
      selectionSpeechTone: "calm"
    });
    await expect(readFile(join(directory, "settings.json"), "utf8"))
      .resolves.toContain('"explanationLanguage": "ja"');
  });

  it("safely loads legacy settings and falls back invalid fields independently", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "settings.json"), "not-json", "utf8");
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      learningLanguage: "en",
      explanationLanguage: "source",
      explanationLanguages: {
        en: "source", ja: "source", "zh-TW": "source"
      },
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      dailyListenRepeatGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning"
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ explanationLanguage: "ja" }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      learningLanguage: "en",
      explanationLanguage: "ja",
      explanationLanguages: {
        en: "ja", ja: "source", "zh-TW": "source"
      },
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      dailyListenRepeatGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning"
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        explanationLanguage: "en",
        aiConversationFontSize: 18.5,
        ebookContentFontSize: 28,
        readingPaperWidth: 900,
        ebookLineHeight: 2.2,
        selectionSpeechVoice: "coral",
        selectionSpeechTone: "expressive"
      }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      learningLanguage: "en",
      explanationLanguage: "en",
      explanationLanguages: {
        en: "en", ja: "source", "zh-TW": "source"
      },
      aiConversationFontSize: 13,
      ebookContentFontSize: 28,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      dailyListenRepeatGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "coral",
      selectionSpeechTone: "expressive"
    });

    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        explanationLanguage: "zh-TW",
        aiConversationFontSize: 18,
        ebookContentFontSize: 24,
        readingPaperWidth: 901,
        ebookLineHeight: 2.25,
        dailyNewItemCompletionLimit: -1,
        dailyDueReviewCompletionLimit: 1000,
        dailySentencePracticeGoal: 12.5,
        dailyListenRepeatGoal: -1,
        reviewPaperSize: 21,
        selectionSpeechVoice: "unknown",
        selectionSpeechTone: "dramatic"
      }),
      "utf8"
    );
    await expect(new LocalSettingsStore(directory).load()).resolves.toEqual({
      learningLanguage: "en",
      explanationLanguage: "zh-TW",
      explanationLanguages: {
        en: "zh-TW", ja: "source", "zh-TW": "source"
      },
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      dailyListenRepeatGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning"
    });
  });
});
