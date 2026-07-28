import {
  isAiConversationFontSize,
  isEbookContentFontSize,
  isEbookLineHeight,
  isDailyReviewCompletionLimit,
  isExplanationLanguage,
  isReadingPaperWidth,
  isReviewPaperSize,
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
  store: SettingsStore
) {
  ipc.handle("settings:get", () => store.load());
  ipc.handle("settings:save", (_event, rawSettings) => {
    if (!rawSettings || typeof rawSettings !== "object") {
      throw new Error("應用程式設定格式錯誤");
    }
    const settings = rawSettings as Partial<AppSettings>;
    if (
      !isExplanationLanguage(settings.explanationLanguage) ||
      !isAiConversationFontSize(settings.aiConversationFontSize) ||
      !isEbookContentFontSize(settings.ebookContentFontSize) ||
      !isReadingPaperWidth(settings.readingPaperWidth) ||
      !isEbookLineHeight(settings.ebookLineHeight) ||
      !isDailyReviewCompletionLimit(settings.dailyNewItemCompletionLimit) ||
      !isDailyReviewCompletionLimit(settings.dailyDueReviewCompletionLimit) ||
      !isReviewPaperSize(settings.reviewPaperSize)
    ) {
      throw new Error("應用程式設定格式錯誤");
    }
    return store.save({
      explanationLanguage: settings.explanationLanguage,
      aiConversationFontSize: settings.aiConversationFontSize,
      ebookContentFontSize: settings.ebookContentFontSize,
      readingPaperWidth: settings.readingPaperWidth,
      ebookLineHeight: settings.ebookLineHeight,
      dailyNewItemCompletionLimit: settings.dailyNewItemCompletionLimit,
      dailyDueReviewCompletionLimit: settings.dailyDueReviewCompletionLimit,
      reviewPaperSize: settings.reviewPaperSize
    });
  });
}
