import {
  isAiConversationFontSize,
  isEbookContentFontSize,
  isEbookLineHeight,
  isDailyReviewCompletionLimit,
  isExplanationLanguage,
  isExplanationLanguages,
  isLearningLanguage,
  isReadingPaperWidth,
  isReviewPaperSize,
  isSelectionSpeechTone,
  isSelectionSpeechVoice,
  type AppSettings
} from "../shared/settings-contracts";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): unknown;
}

interface SettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<AppSettings>;
}

export function registerSettingsIpc(
  ipc: IpcRegistrar,
  store: SettingsStore,
  onLearningLanguageChange?: (
    language: AppSettings["learningLanguage"]
  ) => void | Promise<void>,
  unclassified?: {
    count(): number | Promise<number>;
    assign(language: AppSettings["learningLanguage"]): number | Promise<number>;
  }
) {
  ipc.handle("settings:get", () => store.load());
  ipc.handle("settings:unclassified-count", () => unclassified?.count() ?? 0);
  ipc.handle("settings:assign-unclassified", (_event, language) => {
    if (!isLearningLanguage(language)) {
      throw new Error("Invalid learning language");
    }
    return unclassified?.assign(language) ?? 0;
  });
  ipc.handle("settings:save", (_event, rawSettings) => {
    if (!rawSettings || typeof rawSettings !== "object") {
      throw new Error("Invalid application settings");
    }
    const settings = rawSettings as Partial<AppSettings>;
    if (
      !isExplanationLanguage(settings.explanationLanguage) ||
      !isLearningLanguage(settings.learningLanguage) ||
      !isExplanationLanguages(settings.explanationLanguages) ||
      !isAiConversationFontSize(settings.aiConversationFontSize) ||
      !isEbookContentFontSize(settings.ebookContentFontSize) ||
      !isReadingPaperWidth(settings.readingPaperWidth) ||
      !isEbookLineHeight(settings.ebookLineHeight) ||
      !isDailyReviewCompletionLimit(settings.dailyNewItemCompletionLimit) ||
      !isDailyReviewCompletionLimit(settings.dailyDueReviewCompletionLimit) ||
      !isDailyReviewCompletionLimit(settings.dailySentencePracticeGoal) ||
      !isDailyReviewCompletionLimit(settings.dailyListenRepeatGoal) ||
      !isReviewPaperSize(settings.reviewPaperSize) ||
      !isSelectionSpeechVoice(settings.selectionSpeechVoice) ||
      !isSelectionSpeechTone(settings.selectionSpeechTone)
    ) {
      throw new Error("Invalid application settings");
    }
    return store.save({
      learningLanguage: settings.learningLanguage,
      explanationLanguage: settings.explanationLanguage,
      explanationLanguages: settings.explanationLanguages,
      aiConversationFontSize: settings.aiConversationFontSize,
      ebookContentFontSize: settings.ebookContentFontSize,
      readingPaperWidth: settings.readingPaperWidth,
      ebookLineHeight: settings.ebookLineHeight,
      dailyNewItemCompletionLimit: settings.dailyNewItemCompletionLimit,
      dailyDueReviewCompletionLimit: settings.dailyDueReviewCompletionLimit,
      dailySentencePracticeGoal: settings.dailySentencePracticeGoal,
      dailyListenRepeatGoal: settings.dailyListenRepeatGoal,
      reviewPaperSize: settings.reviewPaperSize,
      selectionSpeechVoice: settings.selectionSpeechVoice,
      selectionSpeechTone: settings.selectionSpeechTone
    }).then(async (saved) => {
      await onLearningLanguageChange?.(saved.learningLanguage);
      return saved;
    });
  });
}
