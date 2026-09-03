import { describe, expect, it, vi } from "vitest";
import {
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  VoiceTranscriptionService
} from "./voice-transcription-service";

function setup(options?: {
  apiKey?: string;
  fetch?: typeof fetch;
}) {
  const apiKeyStore = {
    load: vi.fn(async () => options?.apiKey)
  };
  const service = new VoiceTranscriptionService({
    apiKeyStore,
    ...(options?.fetch ? { fetch: options.fetch } : {})
  });
  return { service };
}

describe("VoiceTranscriptionService", () => {
  it("sends one bounded recording with a fixed model and transcription-only prompt", async () => {
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = init?.body as FormData;
      expect(body.get("model")).toBe("gpt-4o-transcribe");
      expect(String(body.get("prompt"))).toMatch(/do not translate/i);
      expect(String(body.get("prompt"))).toMatch(/Traditional Chinese.*English.*Japanese.*Korean/i);
      expect([...body.keys()].sort()).toEqual(["file", "model", "prompt"]);
      return Response.json({ text: "  我今天 studied Japanese.  " });
    }) as typeof globalThis.fetch;
    const { service } = setup({ apiKey: "sk-test", fetch });

    const result = await service.transcribe({
      audio: new Uint8Array([1, 2, 3, 4]),
      mimeType: "audio/webm;codecs=opus",
      durationMs: 3_200
    });

    expect(result).toEqual({ text: "我今天 studied Japanese." });
  });

  it.each([
    { audio: new Uint8Array(), mimeType: "audio/webm", durationMs: 1_000 },
    { audio: new Uint8Array([1]), mimeType: "audio/flac", durationMs: 1_000 },
    { audio: new Uint8Array([1]), mimeType: "audio/webm", durationMs: 15_001 },
    {
      audio: new Uint8Array(MAX_TRANSCRIPTION_AUDIO_BYTES + 1),
      mimeType: "audio/webm",
      durationMs: 1_000
    }
  ])("rejects invalid audio before reading credentials or calling OpenAI %#", async (input) => {
    const fetch = vi.fn();
    const { service } = setup({ apiKey: "sk-test", fetch: fetch as typeof globalThis.fetch });

    await expect(service.transcribe(input)).rejects.toMatchObject({ code: "invalid-audio" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows sequential explicit recordings without a cumulative daily cap", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ text: "hello" })) as typeof globalThis.fetch;
    const { service } = setup({ apiKey: "sk-test", fetch });
    const input = {
      audio: new Uint8Array([1, 2]),
      mimeType: "audio/ogg",
      durationMs: 15_000
    };

    await expect(service.transcribe(input)).resolves.toEqual({ text: "hello" });
    await expect(service.transcribe(input)).resolves.toEqual({ text: "hello" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("allows one active request and aborts it explicitly", async () => {
    let rejectPending: ((error: Error) => void) | undefined;
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      rejectPending = reject;
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as typeof globalThis.fetch;
    const { service } = setup({ apiKey: "sk-test", fetch });
    const input = {
      audio: new Uint8Array([1, 2]),
      mimeType: "audio/webm",
      durationMs: 1_000
    };

    const pending = service.transcribe(input);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await expect(service.transcribe(input)).rejects.toMatchObject({ code: "busy" });
    service.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    rejectPending?.(new Error("cleanup"));
  });

  it("returns safe credential and API errors", async () => {
    const missing = setup();
    await expect(missing.service.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/mp4",
      durationMs: 1_000
    })).rejects.toMatchObject({ code: "not-configured" });

    const unauthorized = setup({
      apiKey: "sk-test",
      fetch: vi.fn(async () => new Response("no", { status: 401 })) as typeof globalThis.fetch
    });
    await expect(unauthorized.service.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/mp4",
      durationMs: 1_000
    })).rejects.toMatchObject({ code: "auth" });
  });
});
