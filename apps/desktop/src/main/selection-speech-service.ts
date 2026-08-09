import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ApplySelectionSpeechSettingsInput,
  ApplySelectionSpeechSettingsResult,
  SelectionSpeechErrorCode,
  SelectionSpeechSettingsSnapshot,
  SelectionSpeechStreamEvent
} from "../shared/selection-speech-contracts";
import type {
  AppSettings,
  SelectionSpeechTone,
  SelectionSpeechVoice
} from "../shared/settings-contracts";

const OPENAI_SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_SPEECH_MODEL = "gpt-4o-mini-tts";
const PREVIEW_TEXT =
  "Listen carefully: the little door creaked open. Was someone there? Suddenly, a bright light filled the room!";
export const MAX_SELECTION_SPEECH_INPUT_LENGTH = 1000;
export const SELECTION_SPEECH_CACHE_LIMIT = 32 * 1024 * 1024;

const toneProfiles: Record<SelectionSpeechTone, {
  instructions: string;
  speed: number;
}> = {
  learning: {
    instructions:
      "Speak like a patient English tutor. Use a deliberately slow learning pace, crisp consonants, fully articulated word endings, clear sentence stress, and a distinct pause at every punctuation mark. Keep the delivery neutral and instructional.",
    speed: 0.78
  },
  natural: {
    instructions:
      "Speak as if having an everyday conversation with one person. Use relaxed connected speech, a comfortable rhythm, subtle sentence stress, and short pauses. Keep the delivery spontaneous and unperformed.",
    speed: 1
  },
  calm: {
    instructions:
      "Speak in a calm, soft, reassuring, low-energy voice; lower the pitch slightly, keep the rhythm smooth and even, and use noticeably longer pauses at commas and sentence endings. Let the delivery feel quiet and restful.",
    speed: 0.86
  },
  expressive: {
    instructions:
      "Perform this as lively storytelling. Use strong pitch movement, energetic emphasis on key words, clear emotional contrast, and quick shifts around questions and exclamations. Make the expression obvious rather than subtle.",
    speed: 1.12
  }
};

interface EncryptionAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface SettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<AppSettings>;
}

interface ApiKeyStore {
  load(): Promise<string | undefined>;
  save(value: string): Promise<void>;
  remove(): Promise<void>;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export class SelectionSpeechServiceError extends Error {
  constructor(
    readonly code: SelectionSpeechErrorCode,
    message: string
  ) {
    super(message);
  }
}

export class EncryptedSelectionSpeechApiKeyStore implements ApiKeyStore {
  readonly #path: string;

  constructor(
    directory: string,
    private readonly encryption: EncryptionAdapter
  ) {
    this.#path = join(directory, "openai-tts-key.bin");
  }

  async load(): Promise<string | undefined> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.#path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (!this.encryption.isEncryptionAvailable()) {
      throw new SelectionSpeechServiceError(
        "secure-storage",
        "Secure credential storage is unavailable on this device."
      );
    }
    try {
      const value = this.encryption.decryptString(encrypted).trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  async save(value: string): Promise<void> {
    const apiKey = value.trim();
    if (!apiKey) {
      throw new SelectionSpeechServiceError("auth", "Enter an OpenAI API key.");
    }
    if (!this.encryption.isEncryptionAvailable()) {
      throw new SelectionSpeechServiceError(
        "secure-storage",
        "Secure credential storage is unavailable on this device."
      );
    }
    const encrypted = this.encryption.encryptString(apiKey);
    const directory = dirname(this.#path);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.#path}.next`;
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, this.#path);
  }

  async remove(): Promise<void> {
    try {
      await unlink(this.#path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class PcmSelectionSpeechCache {
  readonly #entries = new Map<string, Buffer>();
  #size = 0;

  constructor(readonly limit = SELECTION_SPEECH_CACHE_LIMIT) {}

  get size() {
    return this.#size;
  }

  get(key: string): Buffer | undefined {
    const value = this.#entries.get(key);
    if (!value) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: Buffer) {
    if (value.byteLength > this.limit) return;
    const existing = this.#entries.get(key);
    if (existing) {
      this.#entries.delete(key);
      this.#size -= existing.byteLength;
    }
    while (this.#size + value.byteLength > this.limit) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.#entries.get(oldestKey);
      this.#entries.delete(oldestKey);
      this.#size -= oldest?.byteLength ?? 0;
    }
    this.#entries.set(key, value);
    this.#size += value.byteLength;
  }

  clear() {
    this.#entries.clear();
    this.#size = 0;
  }
}

export function normalizeSelectionSpeechText(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\r\n]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function lastRegexBoundary(text: string, expression: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(expression)) {
    last = (match.index ?? 0) + match[0].length;
  }
  return last;
}

export function splitSelectionSpeechText(
  text: string,
  maximum = MAX_SELECTION_SPEECH_INPUT_LENGTH
): string[] {
  const normalized = normalizeSelectionSpeechText(text);
  if (!normalized) return [];
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("Selection speech maximum must be a positive integer");
  }
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maximum) {
    const window = remaining.slice(0, maximum);
    const boundaries = [
      window.lastIndexOf("\n\n") + 2,
      lastRegexBoundary(window, /[.!?。！？]["'”’)]?\s+/gu),
      lastRegexBoundary(window, /[,;:，；：]\s+/gu),
      window.lastIndexOf(" ") + 1,
      window.lastIndexOf("\n") + 1
    ].filter((boundary) => boundary > 0 && boundary <= maximum);
    const boundary = boundaries.find((candidate) => candidate >= maximum / 2) ??
      boundaries[0] ?? maximum;
    chunks.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function safeError(code: SelectionSpeechErrorCode): SelectionSpeechServiceError {
  return new SelectionSpeechServiceError(code, {
    auth: "OpenAI rejected the API key. Update it in AI Voice Settings.",
    quota: "OpenAI rate or credit limit reached. Check your API account and retry.",
    network: "Unable to reach OpenAI. Check your connection and retry.",
    service: "OpenAI could not generate this voice. Please retry.",
    "not-configured": "Set up AI Voice in Settings before playing selected text.",
    "secure-storage": "Secure credential storage is unavailable on this device."
  }[code]);
}

function cacheKey(
  text: string,
  voice: SelectionSpeechVoice,
  tone: SelectionSpeechTone
) {
  return createHash("sha256")
    .update(`${OPENAI_SPEECH_MODEL}\0pcm-v3\0${voice}\0${tone}\0${text}`)
    .digest("hex");
}

export class SelectionSpeechService {
  readonly #active = new Map<string, AbortController>();
  readonly #cache: PcmSelectionSpeechCache;

  constructor(private readonly dependencies: {
    settingsStore: SettingsStore;
    apiKeyStore: ApiKeyStore;
    fetch?: FetchLike;
    cache?: PcmSelectionSpeechCache;
  }) {
    this.#cache = dependencies.cache ?? new PcmSelectionSpeechCache();
  }

  async getSettings(): Promise<SelectionSpeechSettingsSnapshot> {
    const [settings, apiKey] = await Promise.all([
      this.dependencies.settingsStore.load(),
      this.dependencies.apiKeyStore.load()
    ]);
    return {
      hasApiKey: Boolean(apiKey),
      voice: settings.selectionSpeechVoice,
      tone: settings.selectionSpeechTone
    };
  }

  async applySettings(
    input: ApplySelectionSpeechSettingsInput
  ): Promise<ApplySelectionSpeechSettingsResult> {
    const previousSettings = await this.dependencies.settingsStore.load();
    const previousKey = await this.dependencies.apiKeyStore.load();
    const candidateKey = input.apiKey?.trim() || previousKey;
    if (!candidateKey) throw safeError("not-configured");

    const previewAudio = await this.#completeSpeechRequest({
      apiKey: candidateKey,
      text: PREVIEW_TEXT,
      voice: input.voice,
      tone: input.tone,
      format: "wav"
    });

    try {
      if (input.apiKey?.trim()) {
        await this.dependencies.apiKeyStore.save(candidateKey);
      }
      const saved = await this.dependencies.settingsStore.save({
        ...previousSettings,
        selectionSpeechVoice: input.voice,
        selectionSpeechTone: input.tone
      });
      return {
        settings: {
          hasApiKey: true,
          voice: saved.selectionSpeechVoice,
          tone: saved.selectionSpeechTone
        },
        previewAudio: new Uint8Array(previewAudio)
      };
    } catch (error) {
      if (input.apiKey?.trim()) {
        if (previousKey) await this.dependencies.apiKeyStore.save(previousKey);
        else await this.dependencies.apiKeyStore.remove();
      }
      throw error;
    }
  }

  async removeApiKey(): Promise<SelectionSpeechSettingsSnapshot> {
    this.cancelAll();
    this.#cache.clear();
    await this.dependencies.apiKeyStore.remove();
    const settings = await this.dependencies.settingsStore.load();
    return {
      hasApiKey: false,
      voice: settings.selectionSpeechVoice,
      tone: settings.selectionSpeechTone
    };
  }

  start(
    text: string,
    emit: (event: SelectionSpeechStreamEvent) => void
  ): { requestId: string } {
    const requestId = randomUUID();
    const controller = new AbortController();
    this.#active.set(requestId, controller);
    queueMicrotask(() => {
      void this.#run(requestId, text, controller, emit);
    });
    return { requestId };
  }

  cancel(requestId: string) {
    this.#active.get(requestId)?.abort();
    this.#active.delete(requestId);
  }

  cancelAll() {
    for (const controller of this.#active.values()) controller.abort();
    this.#active.clear();
  }

  dispose() {
    this.cancelAll();
    this.#cache.clear();
  }

  async #run(
    requestId: string,
    rawText: string,
    controller: AbortController,
    emit: (event: SelectionSpeechStreamEvent) => void
  ) {
    try {
      const text = normalizeSelectionSpeechText(rawText);
      if (!text) throw new SelectionSpeechServiceError("service", "No text selected.");
      const [settings, apiKey] = await Promise.all([
        this.dependencies.settingsStore.load(),
        this.dependencies.apiKeyStore.load()
      ]);
      if (!apiKey) throw safeError("not-configured");
      const key = cacheKey(
        text,
        settings.selectionSpeechVoice,
        settings.selectionSpeechTone
      );
      const cached = this.#cache.get(key);
      if (cached) {
        if (!controller.signal.aborted) {
          emit({ type: "audio", requestId, audio: new Uint8Array(cached) });
          emit({ type: "done", requestId });
        }
        return;
      }

      const collected: Buffer[] = [];
      let collectedSize = 0;
      for (const chunkText of splitSelectionSpeechText(text)) {
        const generated = await this.#streamSpeechRequest({
          apiKey,
          text: chunkText,
          voice: settings.selectionSpeechVoice,
          tone: settings.selectionSpeechTone,
          signal: controller.signal,
          onChunk: (audio) => {
            if (controller.signal.aborted) return;
            emit({ type: "audio", requestId, audio: new Uint8Array(audio) });
            if (collectedSize <= this.#cache.limit) {
              collected.push(Buffer.from(audio));
              collectedSize += audio.byteLength;
            }
          }
        });
        if (!generated && controller.signal.aborted) return;
      }
      if (controller.signal.aborted) return;
      if (collectedSize <= this.#cache.limit) {
        this.#cache.set(key, Buffer.concat(collected, collectedSize));
      }
      emit({ type: "done", requestId });
    } catch (error) {
      if (controller.signal.aborted) return;
      const safe = error instanceof SelectionSpeechServiceError
        ? error
        : safeError("network");
      emit({
        type: "error",
        requestId,
        code: safe.code,
        message: safe.message
      });
    } finally {
      this.#active.delete(requestId);
    }
  }

  async #completeSpeechRequest(input: {
    apiKey: string;
    text: string;
    voice: SelectionSpeechVoice;
    tone: SelectionSpeechTone;
    format: "wav";
  }): Promise<Buffer> {
    const response = await this.#request(input);
    return Buffer.from(await response.arrayBuffer());
  }

  async #streamSpeechRequest(input: {
    apiKey: string;
    text: string;
    voice: SelectionSpeechVoice;
    tone: SelectionSpeechTone;
    signal: AbortSignal;
    onChunk(chunk: Uint8Array): void;
  }): Promise<boolean> {
    const response = await this.#request({ ...input, format: "pcm" });
    if (!response.body) {
      input.onChunk(new Uint8Array(await response.arrayBuffer()));
      return true;
    }
    const reader = response.body.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (input.signal.aborted) {
        await reader.cancel();
        return false;
      }
      if (next.value.byteLength) input.onChunk(next.value);
    }
    return true;
  }

  async #request(input: {
    apiKey: string;
    text: string;
    voice: SelectionSpeechVoice;
    tone: SelectionSpeechTone;
    format: "wav" | "pcm";
    signal?: AbortSignal;
  }): Promise<Response> {
    let response: Response;
    try {
      const request = this.dependencies.fetch ?? globalThis.fetch;
      const profile = toneProfiles[input.tone];
      response = await request(OPENAI_SPEECH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_SPEECH_MODEL,
          voice: input.voice,
          input: input.text,
          instructions: profile.instructions,
          speed: profile.speed,
          response_format: input.format
        }),
        ...(input.signal ? { signal: input.signal } : {})
      });
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
