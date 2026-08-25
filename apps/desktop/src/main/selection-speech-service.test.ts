import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/settings-contracts";
import {
  EncryptedSelectionSpeechApiKeyStore,
  MAX_SELECTION_SPEECH_INPUT_LENGTH,
  PcmSelectionSpeechCache,
  SelectionSpeechService,
  SelectionSpeechServiceError,
  normalizeSelectionSpeechText,
  splitSelectionSpeechText
} from "./selection-speech-service";

const directories: string[] = [];

function defaultSettings(): AppSettings {
  return {
    learningLanguage: "en",
    explanationLanguage: "source",
    explanationLanguages: { en: "source", ja: "source", "zh-TW": "source", ko: "source" },
    aiConversationFontSize: 13,
    ebookContentFontSize: 19,
    readingPaperWidth: 760,
    ebookLineHeight: 1.9,
    dailyNewItemCompletionLimit: 10,
    dailyDueReviewCompletionLimit: 50,
    dailySentencePracticeGoal: 10,
    dailyListenRepeatGoal: 10,
    reviewPaperSize: 10,
    selectionSpeechVoice: "cedar",
    selectionSpeechTone: "learning"
  };
}

function memoryDependencies(overrides?: {
  apiKey?: string;
  fetch?: typeof fetch;
  settings?: AppSettings;
  cache?: PcmSelectionSpeechCache;
}) {
  let key = overrides?.apiKey;
  let settings = overrides?.settings ?? defaultSettings();
  const apiKeyStore = {
    load: vi.fn(async () => key),
    save: vi.fn(async (next: string) => {
      key = next;
    }),
    remove: vi.fn(async () => {
      key = undefined;
    })
  };
  const settingsStore = {
    load: vi.fn(async () => settings),
    save: vi.fn(async (next: AppSettings) => {
      settings = next;
      return next;
    })
  };
  return {
    apiKeyStore,
    settingsStore,
    service: new SelectionSpeechService({
      apiKeyStore,
      settingsStore,
      ...(overrides?.fetch ? { fetch: overrides.fetch } : {}),
      ...(overrides?.cache ? { cache: overrides.cache } : {})
    })
  };
}

async function collectStream(service: SelectionSpeechService, text: string) {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  await new Promise<void>((resolve) => {
    service.start(text, (event) => {
      events.push(event);
      if (event.type === "done" || event.type === "error") resolve();
    });
  });
  return events;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("selection speech text splitting", () => {
  it("keeps all normalized text in ordered chunks within the API limit", () => {
    const text = `${"First sentence. ".repeat(350)}\n\n${"Second sentence? ".repeat(350)}`;
    const chunks = splitSelectionSpeechText(text, 128);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 128)).toBe(true);
    expect(chunks.join("")).toBe(normalizeSelectionSpeechText(text));
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });
});

describe("PcmSelectionSpeechCache", () => {
  it("uses a bounded least-recently-used policy", () => {
    const cache = new PcmSelectionSpeechCache(6);
    cache.set("a", Buffer.from([1, 2, 3]));
    cache.set("b", Buffer.from([4, 5, 6]));
    expect(cache.get("a")).toEqual(Buffer.from([1, 2, 3]));

    cache.set("c", Buffer.from([7, 8, 9]));

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.size).toBe(6);
    cache.set("too-large", Buffer.alloc(7));
    expect(cache.get("too-large")).toBeUndefined();
  });
});

describe("EncryptedSelectionSpeechApiKeyStore", () => {
  it("persists only encrypted bytes and decrypts them through the OS adapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vocabreader-voice-key-"));
    directories.push(directory);
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`).reverse(),
      decryptString: (value: Buffer) =>
        Buffer.from(value).reverse().toString("utf8").replace("encrypted:", "")
    };
    const store = new EncryptedSelectionSpeechApiKeyStore(directory, encryption);

    await store.save("sk-private-value");

    expect(await store.load()).toBe("sk-private-value");
    expect((await readFile(join(directory, "openai-tts-key.bin"))).toString("utf8"))
      .not.toContain("sk-private-value");
  });

  it("refuses plaintext fallback when secure storage is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vocabreader-voice-key-"));
    directories.push(directory);
    const store = new EncryptedSelectionSpeechApiKeyStore(directory, {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => ""
    });

    await expect(store.save("sk-private-value")).rejects.toMatchObject({
      code: "secure-storage"
    });
    await expect(readFile(join(directory, "openai-tts-key.bin")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("SelectionSpeechService", () => {
  it("sends strongly differentiated speech direction for every tone", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(new Uint8Array([82, 73, 70, 70]));
    }) as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-existing", fetch });

    for (const tone of ["learning", "natural", "calm", "expressive"] as const) {
      await service.applySettings({ voice: "cedar", tone });
    }

    expect(requests.map(({ speed }) => speed)).toEqual([0.78, 1, 0.86, 1.12]);
    expect(requests.map(({ instructions }) => instructions)).toEqual([
      expect.stringMatching(/patient English tutor.*crisp consonants.*fully articulated/s),
      expect.stringMatching(/everyday conversation.*connected speech.*short pauses/s),
      expect.stringMatching(/soft.*lower the pitch.*longer pauses/s),
      expect.stringMatching(/lively storytelling.*strong pitch movement.*obvious/s)
    ]);
    expect(new Set(requests.map(({ instructions }) => instructions)).size).toBe(4);
    expect(requests.every(({ input }) =>
      typeof input === "string" && input.includes("?") && input.includes("!")
    )).toBe(true);
  });

  it("previews candidate settings before saving the encrypted key and preferences", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        response_format: "wav"
      });
      expect(body.instructions).toContain("calm");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk-candidate"
      });
      return new Response(new Uint8Array([82, 73, 70, 70]));
    }) as typeof globalThis.fetch;
    const { service, apiKeyStore, settingsStore } = memoryDependencies({ fetch });

    const result = await service.applySettings({
      apiKey: "sk-candidate",
      voice: "marin",
      tone: "calm"
    });

    expect(result.settings).toEqual({ hasApiKey: true, voice: "marin", tone: "calm" });
    expect(result.previewAudio).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(apiKeyStore.save).toHaveBeenCalledWith("sk-candidate");
    expect(settingsStore.save).toHaveBeenCalledWith(expect.objectContaining({
      selectionSpeechVoice: "marin",
      selectionSpeechTone: "calm"
    }));
  });

  it("does not replace applied settings when preview authentication fails", async () => {
    const fetch = (vi.fn(async () =>
      new Response("unauthorized", { status: 401 }))) as unknown as typeof globalThis.fetch;
    const { service, apiKeyStore, settingsStore } = memoryDependencies({
      apiKey: "sk-existing",
      fetch
    });

    await expect(service.applySettings({
      apiKey: "sk-invalid",
      voice: "onyx",
      tone: "expressive"
    })).rejects.toMatchObject({ code: "auth" });
    expect(apiKeyStore.save).not.toHaveBeenCalled();
    expect(settingsStore.save).not.toHaveBeenCalled();
  });

  it("streams PCM, sends only fixed request fields, and reuses cached audio", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-4o-mini-tts",
        voice: "cedar",
        response_format: "pcm"
      });
      expect(Object.keys(body).sort()).toEqual([
        "input", "instructions", "model", "response_format", "speed", "voice"
      ]);
      return new Response(new Uint8Array([0, 0, 1, 0]));
    }) as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-existing", fetch });

    const first = await collectStream(service, "A complete selected sentence.");
    const second = await collectStream(service, "A complete selected sentence.");

    expect(first.map((event) => event.type)).toEqual(["audio", "done"]);
    expect(second.map((event) => event.type)).toEqual(["audio", "done"]);
    expect(fetch).toHaveBeenCalledOnce();

    service.dispose();
    await collectStream(service, "A complete selected sentence.");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("splits over-limit text into complete ordered API inputs", async () => {
    const inputs: string[] = [];
    const fetch = vi.fn(async (_url, init) => {
      inputs.push(JSON.parse(String(init?.body)).input);
      return new Response(new Uint8Array([0, 0]));
    }) as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-existing", fetch });
    const text = "This is a sentence. ".repeat(500);

    const events = await collectStream(service, text);

    expect(events.at(-1)?.type).toBe("done");
    expect(inputs.length).toBeGreaterThan(1);
    expect(MAX_SELECTION_SPEECH_INPUT_LENGTH).toBe(1000);
    expect(inputs.every((input) =>
      input.length <= MAX_SELECTION_SPEECH_INPUT_LENGTH
    )).toBe(true);
    expect(inputs.join("")).toBe(normalizeSelectionSpeechText(text));
  });

  it("emits a safe authentication error without the key or response body", async () => {
    const fetch = (vi.fn(async () =>
      new Response("server echoed sk-secret", { status: 401 }))) as unknown as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-secret", fetch });

    const events = await collectStream(service, "Read this.");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "auth" });
    expect(String(events[0]?.message)).not.toContain("sk-secret");
    expect(String(events[0]?.message)).not.toContain("server echoed");
  });

  it.each([
    { status: 429, code: "quota" },
    { status: 500, code: "service" }
  ] as const)("classifies HTTP $status as $code without exposing the response", async ({
    status,
    code
  }) => {
    const fetch = (vi.fn(async () =>
      new Response("sensitive upstream detail", { status }))) as unknown as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-secret", fetch });

    const events = await collectStream(service, "Read this.");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code });
    expect(String(events[0]?.message)).not.toContain("sensitive upstream detail");
  });

  it("classifies fetch failures as a safe network error", async () => {
    const fetch = (vi.fn(async () => {
      throw new Error("socket included sensitive diagnostics");
    })) as unknown as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-secret", fetch });

    const events = await collectStream(service, "Read this.");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "network" });
    expect(String(events[0]?.message)).not.toContain("sensitive diagnostics");
  });

  it("aborts an active request without emitting a late error", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined;
      requestSignal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as typeof globalThis.fetch;
    const { service } = memoryDependencies({ apiKey: "sk-existing", fetch });
    const events: unknown[] = [];

    const { requestId } = service.start("Read this.", (event) => events.push(event));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    service.cancel(requestId);

    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);
  });
});
