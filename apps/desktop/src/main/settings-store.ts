import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isExplanationLanguage,
  type AppSettings
} from "../shared/settings-contracts";

const defaultSettings = (): AppSettings => ({ explanationLanguage: "source" });

export class LocalSettingsStore {
  readonly #settingsPath: string;

  constructor(private readonly directory: string) {
    this.#settingsPath = join(directory, "settings.json");
  }

  async load(): Promise<AppSettings> {
    await mkdir(this.directory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.#settingsPath, "utf8")) as {
        explanationLanguage?: unknown;
      };
      return isExplanationLanguage(parsed.explanationLanguage)
        ? { explanationLanguage: parsed.explanationLanguage }
        : defaultSettings();
    } catch {
      return defaultSettings();
    }
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.#settingsPath}.next`;
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporary, this.#settingsPath);
    return settings;
  }
}
