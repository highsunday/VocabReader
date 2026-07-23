export type ExplanationLanguage = "source" | "zh-TW" | "en" | "ja";

export const AI_CONVERSATION_FONT_SIZE = {
  min: 12,
  max: 24,
  default: 13
} as const;

export const EBOOK_CONTENT_FONT_SIZE = {
  min: 16,
  max: 32,
  default: 19
} as const;

export interface AppSettings {
  explanationLanguage: ExplanationLanguage;
  aiConversationFontSize: number;
  ebookContentFontSize: number;
}

export interface SettingsDesktopApi {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<AppSettings>;
}

export const explanationLanguages: readonly ExplanationLanguage[] = [
  "source",
  "zh-TW",
  "en",
  "ja"
];

export function isExplanationLanguage(
  value: unknown
): value is ExplanationLanguage {
  return explanationLanguages.includes(value as ExplanationLanguage);
}

function isIntegerInRange(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

export function isAiConversationFontSize(value: unknown): value is number {
  return isIntegerInRange(
    value,
    AI_CONVERSATION_FONT_SIZE.min,
    AI_CONVERSATION_FONT_SIZE.max
  );
}

export function isEbookContentFontSize(value: unknown): value is number {
  return isIntegerInRange(
    value,
    EBOOK_CONTENT_FONT_SIZE.min,
    EBOOK_CONTENT_FONT_SIZE.max
  );
}
