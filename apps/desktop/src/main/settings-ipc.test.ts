import { describe, expect, it, vi } from "vitest";
import { registerSettingsIpc } from "./settings-ipc";

describe("settings IPC", () => {
  it("loads and saves the restricted explanation language preference", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const store = {
      load: vi.fn().mockResolvedValue({ explanationLanguage: "source" }),
      save: vi.fn().mockResolvedValue({ explanationLanguage: "zh-TW" })
    };

    registerSettingsIpc(ipc, store);

    await expect(handlers.get("settings:get")?.()).resolves.toEqual({
      explanationLanguage: "source"
    });
    await expect(handlers.get("settings:save")?.({}, {
      explanationLanguage: "zh-TW"
    })).resolves.toEqual({ explanationLanguage: "zh-TW" });
    expect(store.save).toHaveBeenCalledWith({ explanationLanguage: "zh-TW" });
  });

  it("rejects unknown explanation languages before touching the store", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const store = { load: vi.fn(), save: vi.fn() };
    registerSettingsIpc(ipc, store);

    expect(() => handlers.get("settings:save")?.({}, {
      explanationLanguage: "klingon"
    })).toThrow(/講解語言設定格式錯誤/);
    expect(store.save).not.toHaveBeenCalled();
  });
});
