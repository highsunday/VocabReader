import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/settings-contracts";
import { LocalListenRepeatStore } from "./listen-repeat-store";
import { ListenRepeatVoiceService } from "./listen-repeat-voice-service";

function settings(tone: AppSettings["selectionSpeechTone"] = "learning"):
AppSettings {
  return {
    explanationLanguage: "source",
    aiConversationFontSize: 13,
    ebookContentFontSize: 19,
    readingPaperWidth: 760,
    ebookLineHeight: 1.9,
    dailyNewItemCompletionLimit: 10,
    dailyDueReviewCompletionLimit: 50,
    reviewPaperSize: 10,
    selectionSpeechVoice: "cedar",
    selectionSpeechTone: tone
  };
}

describe("ListenRepeatVoiceService", () => {
  it("uses language-neutral directions and reuses persistent audio after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-voice-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-voice",
      material: "こんにちは。",
      mode: "advanced",
      longChunks: [{ text: "こんにちは。", shortChunks: [] }]
    });
    const chunkId = installed.practice!.longChunks[0].id;
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-4o-mini-tts",
        voice: "cedar",
        input: "こんにちは。",
        response_format: "wav"
      });
      expect(body.instructions).toMatch(/same language.*exact text/i);
      expect(body.instructions).not.toMatch(/English tutor/i);
      return new Response(new Uint8Array([82, 73, 70, 70, 1]));
    }) as typeof globalThis.fetch;
    const dependencies = {
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    };

    const first = await new ListenRepeatVoiceService(dependencies)
      .prepare("practice-voice", chunkId);
    const second = await new ListenRepeatVoiceService({
      ...dependencies,
      store: new LocalListenRepeatStore(root)
    }).prepare("practice-voice", chunkId);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.audio).toEqual(first.audio);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("generates a new fingerprint after tone changes without deleting learner audio", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-fingerprint-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-tone",
      material: "Speak.",
      mode: "advanced",
      longChunks: [{ text: "Speak.", shortChunks: [] }]
    });
    const chunkId = installed.practice!.longChunks[0].id;
    await store.saveRecording({
      practiceId: "practice-tone",
      chunkId,
      mimeType: "audio/webm",
      audio: new Uint8Array([9])
    });
    let tone: AppSettings["selectionSpeechTone"] = "learning";
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))) as
      typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings(tone) },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    const first = await service.prepare("practice-tone", chunkId);
    tone = "natural";
    const second = await service.prepare("practice-tone", chunkId);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await store.getSnapshot(true)).practice!.longChunks[0].recording)
      .not.toBeNull();
  });

  it("aborts a pending chunk request without persisting late audio", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-cancel-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-cancel",
      material: "Wait.",
      mode: "advanced",
      longChunks: [{ text: "Wait.", shortChunks: [] }]
    });
    const chunkId = installed.practice!.longChunks[0].id;
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException(
        "Aborted",
        "AbortError"
      )));
    })) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    const pending = service.prepare("practice-cancel", chunkId);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    service.cancel("practice-cancel", chunkId);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(signal?.aborted).toBe(true);
    expect((await store.getSnapshot(true)).practice!.longChunks[0].aiAudio)
      .toBeNull();
  });
});
