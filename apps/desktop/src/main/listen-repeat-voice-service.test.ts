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
    learningLanguage: "en",
    explanationLanguage: "source",
    explanationLanguages: { en: "source", ja: "source", "zh-TW": "source" },
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
    selectionSpeechTone: tone
  };
}

function pcmWav(
  durationSeconds = 1,
  sampleRate = 24_000,
  streamingLength = false
): Uint8Array {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => {
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0))
    );
  };
  ascii(0, "RIFF");
  view.setUint32(4, streamingLength ? 0xffff_ffff : 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, streamingLength ? 0xffff_ffff : dataBytes, true);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * 2, index % 32 < 16 ? 2_000 : -2_000, true);
  }
  return new Uint8Array(buffer);
}

function pcmWavResponse(streamingLength = false) {
  return new Response(pcmWav(1, 24_000, streamingLength).buffer as ArrayBuffer);
}

describe("ListenRepeatVoiceService", () => {
  it("creates one parent take and derives every Progressive child from it", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-parent-take-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-parent-take",
      material: "If you want, continue.",
      mode: "progressive",
      longChunks: [{
        text: "If you want, continue.",
        shortChunks: [{ text: "If you want, " }, { text: "continue." }]
      }]
    });
    const parent = installed.practice!.longChunks[0];
    const requests: string[] = [];
    const fetch = vi.fn(async (url, init) => {
      requests.push(String(url));
      if (String(url).endsWith("/audio/speech")) {
        const body = JSON.parse(String(init?.body));
        expect(body.input).toBe(parent.text);
        // OpenAI's streamed WAV uses 0xFFFFFFFF while the final byte length is unknown.
        return pcmWavResponse(true);
      }
      expect(String(url)).toMatch(/\/audio\/transcriptions$/u);
      const body = init?.body as FormData;
      expect(body.get("model")).toBe("whisper-1");
      expect(body.get("response_format")).toBe("verbose_json");
      expect(body.get("timestamp_granularities[]")).toBe("word");
      return Response.json({
        words: [
          { word: "If", start: 0.05, end: 0.16 },
          { word: "you", start: 0.18, end: 0.3 },
          // whisper-1 may report a zero-duration word at an otherwise safe boundary.
          { word: "want", start: 0.48, end: 0.48 },
          { word: "continue", start: 0.48, end: 0.88 }
        ]
      });
    }) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    const [first, second] = await Promise.all(parent.shortChunks.map((chunk) =>
      service.prepare("practice-parent-take", chunk.id)
    ));
    const full = await service.prepare("practice-parent-take", parent.id);

    expect(requests.filter((url) => url.endsWith("/audio/speech"))).toHaveLength(1);
    expect(requests.filter((url) => url.endsWith("/audio/transcriptions")))
      .toHaveLength(1);
    expect(String.fromCharCode(...first.audio.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...second.audio.slice(0, 4))).toBe("RIFF");
    expect(first.audio.byteLength).toBeLessThan(full.audio.byteLength);
    expect(second.audio.byteLength).toBeLessThan(full.audio.byteLength);
    expect((await store.getSnapshot(true)).practice!.longChunks[0].shortChunks
      .every(({ aiAudio }) => aiAudio)).toBe(true);
  });

  it("derives Progressive slices when transcription spells out printed numbers", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-spoken-numbers-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-spoken-numbers",
      material: "At the age of 41, I found myself $800,000 in debt,",
      mode: "progressive",
      longChunks: [{
        text: "At the age of 41, I found myself $800,000 in debt,",
        shortChunks: [
          { text: "At the age of 41," },
          { text: " I found myself" },
          { text: " $800,000 in debt," }
        ]
      }]
    });
    const parent = installed.practice!.longChunks[0];
    const fetch = vi.fn(async (url) => String(url).endsWith("/audio/speech")
      ? new Response(pcmWav(3).buffer as ArrayBuffer)
      : Response.json({ words: [
        { word: "At", start: 0.05, end: 0.14 },
        { word: "the", start: 0.15, end: 0.23 },
        { word: "age", start: 0.24, end: 0.35 },
        { word: "of", start: 0.36, end: 0.43 },
        { word: "forty", start: 0.44, end: 0.58 },
        { word: "one", start: 0.59, end: 0.7 },
        { word: "I", start: 0.72, end: 0.78 },
        { word: "found", start: 0.79, end: 0.94 },
        { word: "myself", start: 0.95, end: 1.14 },
        { word: "eight", start: 1.16, end: 1.3 },
        { word: "hundred", start: 1.31, end: 1.5 },
        { word: "thousand", start: 1.51, end: 1.72 },
        { word: "dollars", start: 1.73, end: 1.91 },
        { word: "in", start: 1.93, end: 2 },
        { word: "debt", start: 2.01, end: 2.2 }
      ] })) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    await service.prepare("practice-spoken-numbers", parent.shortChunks[0].id);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await store.getSnapshot(true)).practice!.longChunks[0].shortChunks
      .every(({ aiAudio }) => aiAudio)).toBe(true);
  });

  it("reuses persisted parent and derived child audio without another alignment", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-derived-cache-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-derived-cache",
      material: "First part, second part.",
      mode: "progressive",
      longChunks: [{
        text: "First part, second part.",
        shortChunks: [{ text: "First part, " }, { text: "second part." }]
      }]
    });
    const parent = installed.practice!.longChunks[0];
    const firstFetch = vi.fn(async (url) => String(url).endsWith("/audio/speech")
      ? pcmWavResponse()
      : Response.json({ words: [
        { word: "First", start: 0.05, end: 0.18 },
        { word: "part", start: 0.2, end: 0.38 },
        { word: "second", start: 0.48, end: 0.68 },
        { word: "part", start: 0.7, end: 0.9 }
      ] })) as typeof globalThis.fetch;
    const dependencies = {
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch: firstFetch
    };
    await new ListenRepeatVoiceService(dependencies)
      .prepare("practice-derived-cache", parent.shortChunks[0].id);

    const restartedFetch = vi.fn() as typeof globalThis.fetch;
    const restarted = new ListenRepeatVoiceService({
      ...dependencies,
      store: new LocalListenRepeatStore(root),
      fetch: restartedFetch
    });
    const cached = await restarted.prepare(
      "practice-derived-cache",
      parent.shortChunks[1].id
    );

    expect(cached.cached).toBe(true);
    expect(restartedFetch).not.toHaveBeenCalled();
  });

  it("rejects an unsafe Progressive alignment without synthesizing a child", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-bad-alignment-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-bad-alignment",
      material: "First part, second part.",
      mode: "progressive",
      longChunks: [{
        text: "First part, second part.",
        shortChunks: [{ text: "First part, " }, { text: "second part." }]
      }]
    });
    const parent = installed.practice!.longChunks[0];
    const speechInputs: string[] = [];
    const fetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/audio/speech")) {
        speechInputs.push(JSON.parse(String(init?.body)).input);
        return pcmWavResponse();
      }
      return Response.json({
        words: [{ word: "unrelated", start: 0.1, end: 0.8 }]
      });
    }) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    await expect(service.prepare(
      "practice-bad-alignment",
      parent.shortChunks[0].id
    )).rejects.toThrow(/generate this practice voice/i);
    expect(speechInputs).toEqual([parent.text]);
    expect((await store.getSnapshot(true)).practice!.longChunks[0].shortChunks
      .every(({ aiAudio }) => aiAudio === null)).toBe(true);
  });

  it("rejects a non-PCM parent response before saving derived children", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-invalid-wav-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-invalid-wav",
      material: "First part, second part.",
      mode: "progressive",
      longChunks: [{
        text: "First part, second part.",
        shortChunks: [{ text: "First part, " }, { text: "second part." }]
      }]
    });
    const parent = installed.practice!.longChunks[0];
    const fetch = vi.fn(async (url) => String(url).endsWith("/audio/speech")
      ? new Response(new ArrayBuffer(8))
      : Response.json({ words: [
        { word: "First", start: 0.05, end: 0.18 },
        { word: "part", start: 0.2, end: 0.38 },
        { word: "second", start: 0.48, end: 0.68 },
        { word: "part", start: 0.7, end: 0.9 }
      ] })) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings() },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    await expect(service.prepare(
      "practice-invalid-wav",
      parent.shortChunks[0].id
    )).rejects.toThrow(/generate this practice voice/i);
    const failedPractice = (await store.getSnapshot(true)).practice!;
    expect(failedPractice.longChunks[0].aiAudio).toBeNull();
    expect(failedPractice.longChunks[0].shortChunks
      .every(({ aiAudio }) => aiAudio === null)).toBe(true);
  });

  it("rebuilds the Progressive parent take and slices after tone changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-group-tone-"));
    const store = new LocalListenRepeatStore(root);
    const installed = await store.replacePractice({
      practiceId: "practice-group-tone",
      material: "First part, second part.",
      mode: "progressive",
      longChunks: [{
        text: "First part, second part.",
        shortChunks: [{ text: "First part, " }, { text: "second part." }]
      }]
    });
    const childId = installed.practice!.longChunks[0].shortChunks[0].id;
    let tone: AppSettings["selectionSpeechTone"] = "learning";
    const fetch = vi.fn(async (url) => String(url).endsWith("/audio/speech")
      ? pcmWavResponse()
      : Response.json({ words: [
        { word: "First", start: 0.05, end: 0.18 },
        { word: "part", start: 0.2, end: 0.38 },
        { word: "second", start: 0.48, end: 0.68 },
        { word: "part", start: 0.7, end: 0.9 }
      ] })) as typeof globalThis.fetch;
    const service = new ListenRepeatVoiceService({
      store,
      settingsStore: { load: async () => settings(tone) },
      apiKeyStore: { load: async () => "sk-test" },
      fetch
    });

    await service.prepare("practice-group-tone", childId);
    tone = "natural";
    await service.prepare("practice-group-tone", childId);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

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
