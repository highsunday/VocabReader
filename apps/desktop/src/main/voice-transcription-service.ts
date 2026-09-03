import type {
  VoiceTranscriptionErrorCode,
  VoiceTranscriptionInput,
  VoiceTranscriptionResult
} from "../shared/voice-transcription-contracts";
import {
  VOICE_TRANSCRIPTION_MAX_DURATION_MS,
  voiceTranscriptionMimeTypes
} from "../shared/voice-transcription-contracts";

const OPENAI_TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const TRANSCRIPTION_PROMPT =
  "The speaker is answering a short language-learning review question. " +
  "The answer may mix Traditional Chinese, English, Japanese, or Korean. " +
  "Transcribe exactly what was said; do not translate, correct, explain, or answer. " +
  "Use Traditional Chinese characters for Chinese speech.";

export const MAX_TRANSCRIPTION_AUDIO_BYTES = 2 * 1024 * 1024;

interface ApiKeyStore {
  load(): Promise<string | undefined>;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export class VoiceTranscriptionError extends Error {
  constructor(
    readonly code: VoiceTranscriptionErrorCode,
    message: string
  ) {
    super(message);
  }
}

function safeError(code: VoiceTranscriptionErrorCode): VoiceTranscriptionError {
  return new VoiceTranscriptionError(code, {
    "invalid-audio": "This recording could not be sent. Record a new short answer and retry.",
    "not-configured": "Set up an OpenAI API key in Voice & Speech Settings, or keep typing.",
    busy: "Another voice answer is still being processed. Wait for it to finish and retry.",
    auth: "OpenAI rejected the API key. Update it in Voice & Speech Settings.",
    quota: "OpenAI rate or credit limit reached. Check your API account, or keep typing.",
    network: "Unable to reach OpenAI. Check your connection, then record again.",
    service: "OpenAI could not transcribe this recording. Record again, or keep typing."
  }[code]);
}

function normalizedMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase().replace(/\s+/gu, "");
}

function validateInput(input: VoiceTranscriptionInput): VoiceTranscriptionInput {
  const mimeType = normalizedMimeType(input.mimeType);
  if (
    !(input.audio instanceof Uint8Array) ||
    input.audio.byteLength < 1 ||
    input.audio.byteLength > MAX_TRANSCRIPTION_AUDIO_BYTES ||
    !voiceTranscriptionMimeTypes.includes(mimeType as never) ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs <= 0 ||
    input.durationMs > VOICE_TRANSCRIPTION_MAX_DURATION_MS
  ) {
    throw safeError("invalid-audio");
  }
  return {
    audio: input.audio,
    mimeType,
    durationMs: Math.ceil(input.durationMs)
  };
}

function audioExtension(mimeType: string): string {
  if (mimeType.startsWith("audio/ogg")) return ".ogg";
  if (mimeType === "audio/mp4") return ".m4a";
  if (mimeType === "audio/wav") return ".wav";
  return ".webm";
}

export class VoiceTranscriptionService {
  #active?: AbortController;

  constructor(private readonly dependencies: {
    apiKeyStore: ApiKeyStore;
    fetch?: FetchLike;
  }) {}

  async transcribe(rawInput: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult> {
    const input = validateInput(rawInput);
    if (this.#active) throw safeError("busy");
    const controller = new AbortController();
    this.#active = controller;

    try {
      const apiKey = await this.dependencies.apiKeyStore.load();
      if (!apiKey) throw safeError("not-configured");

      const form = new FormData();
      form.set(
        "file",
        new Blob([input.audio.slice().buffer as ArrayBuffer], { type: input.mimeType }),
        `voice-answer${audioExtension(input.mimeType)}`
      );
      form.set("model", OPENAI_TRANSCRIPTION_MODEL);
      form.set("prompt", TRANSCRIPTION_PROMPT);

      const response = await this.#request(apiKey, form, controller.signal);
      const payload = await response.json() as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) throw safeError("service");
      return { text };
    } finally {
      if (this.#active === controller) this.#active = undefined;
    }
  }

  cancel() {
    this.#active?.abort();
    this.#active = undefined;
  }

  dispose() {
    this.cancel();
  }

  async #request(apiKey: string, form: FormData, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await (this.dependencies.fetch ?? globalThis.fetch)(
        OPENAI_TRANSCRIPTION_ENDPOINT,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal
        }
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw safeError("network");
    }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) throw safeError("auth");
    if (response.status === 429) throw safeError("quota");
    throw safeError("service");
  }
}
