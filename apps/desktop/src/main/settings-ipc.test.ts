import { describe, expect, it, vi } from "vitest";
import { registerSettingsIpc } from "./settings-ipc";

describe("settings IPC", () => {
  it("loads and saves the restricted application preferences", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const store = {
      load: vi.fn().mockResolvedValue({
        explanationLanguage: "source",
        aiConversationFontSize: 13,
        ebookContentFontSize: 19,
        readingPaperWidth: 760,
        ebookLineHeight: 1.9,
        dailyNewItemCompletionLimit: 10,
        dailyDueReviewCompletionLimit: 50,
        dailySentencePracticeGoal: 10,
        reviewPaperSize: 10,
        selectionSpeechVoice: "cedar",
        selectionSpeechTone: "learning"
      }),
      save: vi.fn().mockResolvedValue({
        explanationLanguage: "zh-TW",
        aiConversationFontSize: 18,
        ebookContentFontSize: 24,
        readingPaperWidth: 900,
        ebookLineHeight: 2.2,
        dailyNewItemCompletionLimit: 0,
        dailyDueReviewCompletionLimit: 999,
        dailySentencePracticeGoal: 999,
        reviewPaperSize: 20,
        selectionSpeechVoice: "onyx",
        selectionSpeechTone: "natural"
      })
    };

    registerSettingsIpc(ipc, store);

    await expect(handlers.get("settings:get")?.()).resolves.toEqual({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning"
    });
    await expect(handlers.get("settings:save")?.({}, {
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 0,
      dailyDueReviewCompletionLimit: 999,
      dailySentencePracticeGoal: 999,
      reviewPaperSize: 20,
      selectionSpeechVoice: "onyx",
      selectionSpeechTone: "natural"
    })).resolves.toEqual({
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 0,
      dailyDueReviewCompletionLimit: 999,
      dailySentencePracticeGoal: 999,
      reviewPaperSize: 20,
      selectionSpeechVoice: "onyx",
      selectionSpeechTone: "natural"
    });
    expect(store.save).toHaveBeenCalledWith({
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 0,
      dailyDueReviewCompletionLimit: 999,
      dailySentencePracticeGoal: 999,
      reviewPaperSize: 20,
      selectionSpeechVoice: "onyx",
      selectionSpeechTone: "natural"
    });
  });

  it.each([
    {
      explanationLanguage: "klingon",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 11,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 25,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 15,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 33,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 32.5,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 550,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 901,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 980,
      ebookLineHeight: 2.2
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 1.3
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.5
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.25
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      selectionSpeechVoice: "unknown"
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      selectionSpeechTone: "dramatic"
    }
  ])("rejects invalid settings before touching the store", (settings) => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const store = { load: vi.fn(), save: vi.fn() };
    registerSettingsIpc(ipc, store);

    expect(() => handlers.get("settings:save")?.({}, {
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning",
      ...settings
    }))
      .toThrow(/Invalid application settings/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it.each([
    ["dailyNewItemCompletionLimit", -1],
    ["dailyNewItemCompletionLimit", 1000],
    ["dailyNewItemCompletionLimit", 1.5],
    ["dailyDueReviewCompletionLimit", -1],
    ["dailyDueReviewCompletionLimit", 1000],
    ["dailySentencePracticeGoal", -1],
    ["dailySentencePracticeGoal", 1000],
    ["dailySentencePracticeGoal", 1.5],
    ["reviewPaperSize", 0],
    ["reviewPaperSize", 21],
    ["reviewPaperSize", 2.5]
  ])("rejects invalid %s values", (field, value) => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const store = { load: vi.fn(), save: vi.fn() };
    registerSettingsIpc(ipc, store);

    expect(() => handlers.get("settings:save")?.({}, {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      dailySentencePracticeGoal: 10,
      reviewPaperSize: 10,
      selectionSpeechVoice: "cedar",
      selectionSpeechTone: "learning",
      [field]: value
    })).toThrow(/Invalid application settings/);
    expect(store.save).not.toHaveBeenCalled();
  });
});
