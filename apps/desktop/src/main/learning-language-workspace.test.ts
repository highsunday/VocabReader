import { describe, expect, it, vi } from "vitest";
import {
  LearningLanguageWorkspaceRegistry,
  createActiveWorkspaceProxy
} from "./learning-language-workspace";

describe("LearningLanguageWorkspaceRegistry", () => {
  it("routes every operation to the active learning-language workspace", () => {
    const resources = {
      en: { read: vi.fn(() => "English") },
      ja: { read: vi.fn(() => "日本語") },
      "zh-TW": { read: vi.fn(() => "繁體中文") }
    };
    const registry = new LearningLanguageWorkspaceRegistry("en", resources);
    const active = createActiveWorkspaceProxy(registry);

    expect(active.read()).toBe("English");
    registry.switchTo("ja");
    expect(active.read()).toBe("日本語");
    registry.switchTo("zh-TW");
    expect(active.read()).toBe("繁體中文");
    expect(resources.en.read).toHaveBeenCalledTimes(1);
    expect(resources.ja.read).toHaveBeenCalledTimes(1);
    expect(resources["zh-TW"].read).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported languages and reports all workspace resources", () => {
    const registry = new LearningLanguageWorkspaceRegistry("en", {
      en: { id: "en" },
      ja: { id: "ja" },
      "zh-TW": { id: "zh-TW" }
    });

    expect(() => registry.switchTo("other" as never)).toThrow(
      "Unsupported learning language"
    );
    expect(registry.all().map(([language]) => language)).toEqual([
      "en",
      "ja",
      "zh-TW"
    ]);
  });
});
