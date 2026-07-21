export type ExplanationLanguage = "source" | "zh-TW" | "en" | "ja";

export interface AppSettings {
  explanationLanguage: ExplanationLanguage;
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
