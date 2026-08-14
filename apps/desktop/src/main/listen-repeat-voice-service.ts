import { createHash } from "node:crypto";
import type {
  AppSettings,
  SelectionSpeechTone
} from "../shared/settings-contracts";
import {
  deriveListenRepeatAudioSlices,
  validateListenRepeatPcmWav
} from "./listen-repeat-audio-alignment";
import { SelectionSpeechServiceError } from "./selection-speech-service";
import type {
  ListenRepeatAudioContext,
  LocalListenRepeatStore
} from "./listen-repeat-store";

const OPENAI_SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_TRANSCRIPTION_ENDPOINT =
  "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_MODEL = "gpt-4o-mini-tts";
const OPENAI_ALIGNMENT_MODEL = "whisper-1";
const INSTRUCTIONS_REVISION = "listen-repeat-v2-parent-take";
const ALIGNMENT_REVISION = "listen-repeat-alignment-v2-anchored-numbers";

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

interface AudioResult {
  mimeType: string;
  audio: Uint8Array;
  cached: boolean;
}

interface ActiveRequest {
  practiceId: string;
  chunkIds: Set<string>;
  controller: AbortController;
}

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
    "Preserve the natural phrasing, continuation intonation, connected speech, and sentence-level rhythm of the complete input so a language learner can practice both the whole sentence and exact excerpts from this same take."
  ].join(" ");
}

function hash(parts: string[]) {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function parentFingerprint(input: {
  text: string;
  voice: AppSettings["selectionSpeechVoice"];
  tone: SelectionSpeechTone;
}) {
  return hash([
    OPENAI_SPEECH_MODEL,
    INSTRUCTIONS_REVISION,
    input.voice,
    input.tone,
    input.text
  ]);
}

function childFingerprints(
  context: ListenRepeatAudioContext,
  parentKey: string
): Map<string, string> {
  const group = hash([
    ALIGNMENT_REVISION,
    OPENAI_ALIGNMENT_MODEL,
    parentKey,
    context.parent.text,
    ...context.children.flatMap(({ id, text }) => [id, text])
  ]);
  return new Map(context.children.map(({ id, text }, index) => [
    id,
    hash([group, String(index), id, text])
  ]));
}

function classifyResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) throw safeError("auth");
  if (response.status === 429) throw safeError("quota");
  throw safeError("service");
}

function parseWords(value: unknown): Array<{
  word: string;
  start: number;
  end: number;
}> {
  if (!value || typeof value !== "object" ||
    !Array.isArray((value as { words?: unknown }).words)) {
    throw safeError("service");
  }
  const words = (value as { words: unknown[] }).words;
  if (!words.every((word) => word && typeof word === "object" &&
    typeof (word as { word?: unknown }).word === "string" &&
    typeof (word as { start?: unknown }).start === "number" &&
    typeof (word as { end?: unknown }).end === "number")) {
    throw safeError("service");
  }
  return words as Array<{ word: string; start: number; end: number }>;
}

export class ListenRepeatVoiceService {
  readonly #active = new Map<string, ActiveRequest>();
  readonly #pendingLong = new Map<string, Promise<AudioResult>>();
  readonly #pendingGroup = new Map<string, Promise<void>>();

  constructor(private readonly dependencies: {
    store: LocalListenRepeatStore;
    settingsStore: SettingsStore;
    apiKeyStore: ApiKeyStore;
    fetch?: FetchLike;
  }) {}

  async hasApiKey() {
    return Boolean(await this.dependencies.apiKeyStore.load());
  }

  async prepare(practiceId: string, chunkId: string): Promise<AudioResult> {
    const [context, settings, apiKey] = await Promise.all([
      this.dependencies.store.getAudioContext(practiceId, chunkId),
      this.dependencies.settingsStore.load(),
      this.dependencies.apiKeyStore.load()
    ]);
    if (!apiKey) throw safeError("not-configured");
    const parentKey = parentFingerprint({
      text: context.parent.text,
      voice: settings.selectionSpeechVoice,
      tone: settings.selectionSpeechTone
    });
    if (context.requested.kind === "long" || context.children.length === 0) {
      return this.#prepareLong({
        practiceId,
        context,
        settings,
        apiKey,
        parentKey
      });
    }

    const childKeys = childFingerprints(context, parentKey);
    const requestedKey = childKeys.get(context.requested.id);
    if (!requestedKey) throw safeError("service");
    const cached = await this.dependencies.store.getAiAudio(
      practiceId,
      context.requested.id,
      requestedKey
    );
    if (cached) return cached;

    const groupKey = `${practiceId}:${context.parent.id}:${parentKey}:${ALIGNMENT_REVISION}`;
    let pending = this.#pendingGroup.get(groupKey);
    if (!pending) {
      pending = this.#prepareGroup({
        practiceId,
        context,
        settings,
        apiKey,
        parentKey,
        childKeys,
        groupKey
      });
      this.#pendingGroup.set(groupKey, pending);
    }
    try {
      await pending;
    } finally {
      if (this.#pendingGroup.get(groupKey) === pending) {
        this.#pendingGroup.delete(groupKey);
      }
    }
    const prepared = await this.dependencies.store.getAiAudio(
      practiceId,
      context.requested.id,
      requestedKey
    );
    if (!prepared) throw safeError("service");
    return prepared;
  }

  async #prepareLong(input: {
    practiceId: string;
    context: ListenRepeatAudioContext;
    settings: AppSettings;
    apiKey: string;
    parentKey: string;
  }): Promise<AudioResult> {
    const cached = await this.dependencies.store.getAiAudio(
      input.practiceId,
      input.context.parent.id,
      input.parentKey
    );
    if (cached) return cached;
    const requestKey = `${input.practiceId}:${input.context.parent.id}:${input.parentKey}`;
    const existing = this.#pendingLong.get(requestKey);
    if (existing) return existing;
    const pending = this.#generateLong(input, requestKey);
    this.#pendingLong.set(requestKey, pending);
    try {
      return await pending;
    } finally {
      this.#pendingLong.delete(requestKey);
    }
  }

  async #generateLong(input: {
    practiceId: string;
    context: ListenRepeatAudioContext;
    settings: AppSettings;
    apiKey: string;
    parentKey: string;
  }, requestKey: string): Promise<AudioResult> {
    const controller = new AbortController();
    this.#active.set(requestKey, {
      practiceId: input.practiceId,
      chunkIds: new Set([
        input.context.parent.id,
        ...input.context.children.map(({ id }) => id)
      ]),
      controller
    });
    let response: Response;
    try {
      const request = this.dependencies.fetch ?? globalThis.fetch;
      const profile = toneProfiles[input.settings.selectionSpeechTone];
      response = await request(OPENAI_SPEECH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_SPEECH_MODEL,
          voice: input.settings.selectionSpeechVoice,
          input: input.context.parent.text,
          instructions: instructions(input.settings.selectionSpeechTone),
          speed: profile.speed,
          response_format: "wav"
        }),
        signal: controller.signal
      });
      classifyResponse(response);
      const audio = new Uint8Array(await response.arrayBuffer());
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (input.context.children.length > 0) {
        try {
          validateListenRepeatPcmWav(audio);
        } catch {
          throw safeError("service");
        }
      }
      await this.dependencies.store.saveAiAudio({
        practiceId: input.practiceId,
        chunkId: input.context.parent.id,
        fingerprint: input.parentKey,
        audio
      });
      return { mimeType: "audio/wav", audio, cached: false };
    } catch (error) {
      if ((error as Error).name === "AbortError" ||
        error instanceof SelectionSpeechServiceError) throw error;
      throw safeError("network");
    } finally {
      this.#active.delete(requestKey);
    }
  }

  async #prepareGroup(input: {
    practiceId: string;
    context: ListenRepeatAudioContext;
    settings: AppSettings;
    apiKey: string;
    parentKey: string;
    childKeys: Map<string, string>;
    groupKey: string;
  }): Promise<void> {
    const cachedChildren = await Promise.all(input.context.children.map((child) =>
      this.dependencies.store.getAiAudio(
        input.practiceId,
        child.id,
        input.childKeys.get(child.id) ?? ""
      )
    ));
    if (cachedChildren.every(Boolean)) return;
    const parent = await this.#prepareLong(input);
    const controller = new AbortController();
    this.#active.set(input.groupKey, {
      practiceId: input.practiceId,
      chunkIds: new Set([
        input.context.parent.id,
        ...input.context.children.map(({ id }) => id)
      ]),
      controller
    });
    try {
      const form = new FormData();
      form.append("file", new Blob([Uint8Array.from(parent.audio)], {
        type: "audio/wav"
      }), "listen-repeat-parent.wav");
      form.append("model", OPENAI_ALIGNMENT_MODEL);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("prompt", input.context.parent.text);
      const request = this.dependencies.fetch ?? globalThis.fetch;
      const response = await request(OPENAI_TRANSCRIPTION_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}` },
        body: form,
        signal: controller.signal
      });
      classifyResponse(response);
      const words = parseWords(await response.json());
      const slices = deriveListenRepeatAudioSlices({
        parentText: input.context.parent.text,
        childTexts: input.context.children.map(({ text }) => text),
        audio: parent.audio,
        words
      });
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      await this.dependencies.store.saveAiAudioBatch(
        input.context.children.map((child, index) => ({
          practiceId: input.practiceId,
          chunkId: child.id,
          fingerprint: input.childKeys.get(child.id)!,
          audio: slices[index]
        }))
      );
    } catch (error) {
      if ((error as Error).name === "AbortError" ||
        error instanceof SelectionSpeechServiceError) throw error;
      throw safeError("service");
    } finally {
      this.#active.delete(input.groupKey);
    }
  }

  cancel(practiceId: string, chunkId?: string) {
    for (const [key, active] of this.#active) {
      if ((practiceId === "*" || active.practiceId === practiceId) &&
        (!chunkId || active.chunkIds.has(chunkId))) {
        active.controller.abort();
        this.#active.delete(key);
      }
    }
  }

  dispose() {
    this.cancel("*");
  }
}
