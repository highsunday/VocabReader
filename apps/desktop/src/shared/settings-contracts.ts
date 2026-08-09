export type ExplanationLanguage = "source" | "zh-TW" | "en" | "ja";
export type SelectionSpeechVoice = "cedar" | "marin" | "coral" | "onyx";
export type SelectionSpeechTone = "learning" | "natural" | "calm" | "expressive";

export const selectionSpeechVoices: readonly SelectionSpeechVoice[] = [
  "cedar",
  "marin",
  "coral",
  "onyx"
];

export const selectionSpeechTones: readonly SelectionSpeechTone[] = [
  "learning",
  "natural",
  "calm",
  "expressive"
];

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

export const READING_PAPER_WIDTH = {
  min: 560,
  max: 960,
  step: 20,
  default: 760
} as const;

export const EBOOK_LINE_HEIGHT = {
  min: 1.4,
  max: 2.4,
  step: 0.1,
  default: 1.9
} as const;

export const DAILY_REVIEW_COMPLETION_LIMIT = {
  min: 0,
  max: 999
} as const;

export const DAILY_NEW_ITEM_COMPLETION_LIMIT = {
  ...DAILY_REVIEW_COMPLETION_LIMIT,
  default: 10
} as const;

export const DAILY_DUE_REVIEW_COMPLETION_LIMIT = {
  ...DAILY_REVIEW_COMPLETION_LIMIT,
  default: 50
} as const;

export const REVIEW_PAPER_SIZE = {
  min: 1,
  max: 20,
  default: 10
} as const;

export interface AppSettings {
  explanationLanguage: ExplanationLanguage;
  aiConversationFontSize: number;
  ebookContentFontSize: number;
  readingPaperWidth: number;
  ebookLineHeight: number;
  dailyNewItemCompletionLimit: number;
  dailyDueReviewCompletionLimit: number;
  reviewPaperSize: number;
  selectionSpeechVoice: SelectionSpeechVoice;
  selectionSpeechTone: SelectionSpeechTone;
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

export function isSelectionSpeechVoice(
  value: unknown
): value is SelectionSpeechVoice {
  return selectionSpeechVoices.includes(value as SelectionSpeechVoice);
}

export function isSelectionSpeechTone(
  value: unknown
): value is SelectionSpeechTone {
  return selectionSpeechTones.includes(value as SelectionSpeechTone);
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

export function isReadingPaperWidth(value: unknown): value is number {
  return (
    isIntegerInRange(
      value,
      READING_PAPER_WIDTH.min,
      READING_PAPER_WIDTH.max
    ) &&
    (Number(value) - READING_PAPER_WIDTH.min) % READING_PAPER_WIDTH.step === 0
  );
}

export function isEbookLineHeight(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const scaledValue = value * 10;
  return (
    Number.isInteger(scaledValue) &&
    scaledValue >= EBOOK_LINE_HEIGHT.min * 10 &&
    scaledValue <= EBOOK_LINE_HEIGHT.max * 10
  );
}

export function isDailyReviewCompletionLimit(
  value: unknown
): value is number {
  return isIntegerInRange(
    value,
    DAILY_REVIEW_COMPLETION_LIMIT.min,
    DAILY_REVIEW_COMPLETION_LIMIT.max
  );
}

export function isReviewPaperSize(value: unknown): value is number {
  return isIntegerInRange(
    value,
    REVIEW_PAPER_SIZE.min,
    REVIEW_PAPER_SIZE.max
  );
}
