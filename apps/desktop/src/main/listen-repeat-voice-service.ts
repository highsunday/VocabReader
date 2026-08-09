import { createHash } from "node:crypto";
import type {
  AppSettings,
  SelectionSpeechTone
} from "../shared/settings-contracts";
import { SelectionSpeechServiceError } from "./selection-speech-service";
import type { LocalListenRepeatStore } from "./listen-repeat-store";

const OPENAI_SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_SPEECH_MODEL = "gpt-4o-mini-tts";
const INSTRUCTIONS_REVISION = "listen-repeat-v1";

const toneProfiles: Record<SelectionSpeechTone, {
  directions: string;
  speed: number;
}> = {
  learning: {
    directions: "Use a patient learning pace, clear articulation, natural stress, and distinct punctuation pauses.",
    speed: 0.78
  },
  natural: {
    directions: "Use a natural conversational pace, connected speech, and comfortable rhythm.",
    speed: 1
  },
  calm: {
    directions: "Use a calm, soft, even delivery with slightly longer natural pauses.",
    speed: 0.86
  },
  expressive: {
    directions: "Use lively but not exaggerated expression with clear emphasis and pitch movement.",
    speed: 1.12
  }
};

interface SettingsStore {
  load(): Promise<AppSettings>;
}

interface ApiKeyStore {
  load(): Promise<string | undefined>;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function safeError(
  code: "auth" | "quota" | "network" | "service" | "not-configured"
) {
  return new SelectionSpeechServiceError(code, {
    auth: "OpenAI rejected the API key. Update it in AI Voice Settings.",
    quota: "OpenAI rate or credit limit reached. Check your API account and retry.",
    network: "Unable to reach OpenAI. Check your connection and retry.",
    service: "OpenAI could not generate this practice voice. Please retry.",
    "not-configured": "Set up AI Voice in Settings before playing practice audio."
  }[code]);
}

function instructions(tone: SelectionSpeechTone) {
  return [
    "Speak in the same language as the input and read the exact text without translating, correcting, omitting, adding, or reordering anything.",
    toneProfiles[tone].directions,
    "Preserve natural phrasing so a language learner can listen and repeat."
  ].join(" ");
}

function fingerprint(input: {
  text: string;
  voice: AppSettings["selectionSpeechVoice"];
  tone: SelectionSpeechTone;
}) {
  return createHash("sha256").update([
    OPENAI_SPEECH_MODEL,
    INSTRUCTIONS_REVISION,
    input.voice,
    input.tone,
    input.text
  ].join("\0")).digest("hex");
}

export class ListenRepeatVoiceService {
  readonly #active = new Map<string, AbortController>();
  readonly #pending = new Map<string, Promise<{
    mimeType: string;
    audio: Uint8Array;
    cached: boolean;
  }>>();

  constructor(private readonly dependencies: {
    store: LocalListenRepeatStore;
    settingsStore: SettingsStore;
    apiKeyStore: ApiKeyStore;
    fetch?: FetchLike;
  }) {}

  async hasApiKey() {
    return Boolean(await this.dependencies.apiKeyStore.load());
  }

  async prepare(practiceId: string, chunkId: string) {
    const requestKey = `${practiceId}:${chunkId}`;
    const existing = this.#pending.get(requestKey);
    if (existing) return existing;
    const pending = this.#generate(practiceId, chunkId, requestKey);
    this.#pending.set(requestKey, pending);
    try {
      return await pending;
    } finally {
      this.#pending.delete(requestKey);
    }
  }

  async #generate(practiceId: string, chunkId: string, requestKey: string) {
    const [text, settings, apiKey] = await Promise.all([
      this.dependencies.store.getChunkText(practiceId, chunkId),
      this.dependencies.settingsStore.load(),
      this.dependencies.apiKeyStore.load()
    ]);
    if (!apiKey) throw safeError("not-configured");
    const key = fingerprint({
      text,
      voice: settings.selectionSpeechVoice,
      tone: settings.selectionSpeechTone
    });
    const cached = await this.dependencies.store.getAiAudio(
      practiceId,
      chunkId,
      key
    );
    if (cached) return cached;

    const controller = new AbortController();
    this.#active.set(requestKey, controller);
    let response: Response;
    try {
      const request = this.dependencies.fetch ?? globalThis.fetch;
      const profile = toneProfiles[settings.selectionSpeechTone];
      response = await request(OPENAI_SPEECH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_SPEECH_MODEL,
          voice: settings.selectionSpeechVoice,
          input: text,
          instructions: instructions(settings.selectionSpeechTone),
          speed: profile.speed,
          response_format: "wav"
        }),
        signal: controller.signal
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw safeError("network");
    } finally {
      this.#active.delete(requestKey);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw safeError("auth");
      if (response.status === 429) throw safeError("quota");
      throw safeError("service");
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    await this.dependencies.store.saveAiAudio({
      practiceId,
      chunkId,
      fingerprint: key,
      audio
    });
    return { mimeType: "audio/wav", audio, cached: false };
  }

  cancel(practiceId: string, chunkId?: string) {
    const prefix = practiceId === "*" ? "" : `${practiceId}:`;
    for (const [key, controller] of this.#active) {
      if ((chunkId ? key === `${practiceId}:${chunkId}` : key.startsWith(prefix))) {
        controller.abort();
        this.#active.delete(key);
      }
    }
  }

  dispose() {
    this.cancel("*");
  }
}
