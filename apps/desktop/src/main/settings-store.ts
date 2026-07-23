import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AI_CONVERSATION_FONT_SIZE,
  EBOOK_CONTENT_FONT_SIZE,
  isAiConversationFontSize,
  isEbookContentFontSize,
  isExplanationLanguage,
  type AppSettings
} from "../shared/settings-contracts";

const defaultSettings = (): AppSettings => ({
  explanationLanguage: "source",
  aiConversationFontSize: AI_CONVERSATION_FONT_SIZE.default,
  ebookContentFontSize: EBOOK_CONTENT_FONT_SIZE.default
});

export class LocalSettingsStore {
  readonly #settingsPath: string;
  #writeQueue = Promise.resolve();

  constructor(private readonly directory: string) {
    this.#settingsPath = join(directory, "settings.json");
  }

  async load(): Promise<AppSettings> {
    await mkdir(this.directory, { recursive: true });
    try {
      const parsed = JSON.parse(
        await readFile(this.#settingsPath, "utf8")
      ) as Record<string, unknown> | null;
      const defaults = defaultSettings();
      return {
        explanationLanguage: isExplanationLanguage(parsed?.explanationLanguage)
          ? parsed.explanationLanguage
          : defaults.explanationLanguage,
        aiConversationFontSize: isAiConversationFontSize(
          parsed?.aiConversationFontSize
        )
          ? parsed.aiConversationFontSize
          : defaults.aiConversationFontSize,
        ebookContentFontSize: isEbookContentFontSize(parsed?.ebookContentFontSize)
          ? parsed.ebookContentFontSize
          : defaults.ebookContentFontSize
      };
    } catch {
      return defaultSettings();
    }
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const write = this.#writeQueue.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const temporary = `${this.#settingsPath}.next`;
      await writeFile(
        temporary,
        `${JSON.stringify(settings, null, 2)}\n`,
        "utf8"
      );
      await rename(temporary, this.#settingsPath);
    });
    this.#writeQueue = write.catch(() => undefined);
    await write;
    return settings;
  }
}
