import {
  isExplanationLanguage,
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
      throw new Error("講解語言設定格式錯誤");
    }
    const settings = rawSettings as Partial<AppSettings>;
    if (!isExplanationLanguage(settings.explanationLanguage)) {
      throw new Error("講解語言設定格式錯誤");
    }
    return store.save({ explanationLanguage: settings.explanationLanguage });
  });
}
