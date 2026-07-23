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
        ebookContentFontSize: 19
      }),
      save: vi.fn().mockResolvedValue({
        explanationLanguage: "zh-TW",
        aiConversationFontSize: 18,
        ebookContentFontSize: 24
      })
    };

    registerSettingsIpc(ipc, store);

    await expect(handlers.get("settings:get")?.()).resolves.toEqual({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19
    });
    await expect(handlers.get("settings:save")?.({}, {
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    })).resolves.toEqual({
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    });
    expect(store.save).toHaveBeenCalledWith({
      explanationLanguage: "zh-TW",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    });
  });

  it.each([
    {
      explanationLanguage: "klingon",
      aiConversationFontSize: 18,
      ebookContentFontSize: 24
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 11,
      ebookContentFontSize: 24
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 25,
      ebookContentFontSize: 24
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 15
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 33
    },
    {
      explanationLanguage: "en",
      aiConversationFontSize: 18,
      ebookContentFontSize: 32.5
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

    expect(() => handlers.get("settings:save")?.({}, settings))
      .toThrow(/應用程式設定格式錯誤/);
    expect(store.save).not.toHaveBeenCalled();
  });
});
