import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  ListenRepeatAudioResult,
  ListenRepeatChunk,
  ListenRepeatMode,
  ListenRepeatPractice,
  ListenRepeatProgress,
  ListenRepeatSnapshot,
  SaveListenRepeatRecordingInput
} from "../shared/listen-repeat-contracts";
import { LISTEN_REPEAT_RECORDING_LIMIT } from "../shared/listen-repeat-contracts";
import type { ParsedListenRepeatChunk } from "./listen-repeat-artifacts";

interface StoredChunk extends Omit<ListenRepeatChunk, "shortChunks"> {
  shortChunks: StoredChunk[];
  recordingFile?: string;
  aiAudioFile?: string;
}

interface StoredPractice extends Omit<ListenRepeatPractice, "longChunks"> {
  longChunks: StoredChunk[];
}

interface ReplacePracticeInput {
  practiceId: string;
  material: string;
  mode: ListenRepeatMode;
  longChunks: ParsedListenRepeatChunk[];
}

export interface ListenRepeatAudioContext {
  requested: {
    id: string;
    kind: "short" | "long";
    text: string;
  };
  parent: {
    id: string;
    text: string;
  };
  children: Array<{
    id: string;
    text: string;
  }>;
}

interface StoreOptions {
  now?: () => Date;
}

const allowedMimeTypes: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "m4a"
};

const MAXIMUM_AI_AUDIO_BYTES = 32 * 1024 * 1024;

function publicChunk(chunk: StoredChunk): ListenRepeatChunk {
  return {
    id: chunk.id,
    kind: chunk.kind,
    text: chunk.text,
    parentId: chunk.parentId,
    recording: chunk.recording ? { ...chunk.recording } : null,
    aiAudio: chunk.aiAudio ? { ...chunk.aiAudio } : null,
    recordingUnlocked: chunk.recordingUnlocked,
    shortChunks: chunk.shortChunks.map(publicChunk)
  };
}

function publicPractice(practice: StoredPractice): ListenRepeatPractice {
  return {
    id: practice.id,
    material: practice.material,
    mode: practice.mode,
    phase: practice.phase,
    longChunks: practice.longChunks.map(publicChunk),
    error: practice.error,
    createdAt: practice.createdAt,
    updatedAt: practice.updatedAt
  };
}

function allChunks(practice: StoredPractice): StoredChunk[] {
  return practice.longChunks.flatMap((long) => [long, ...long.shortChunks]);
}

function progress(practice: StoredPractice | null): ListenRepeatProgress {
  if (!practice) {
    return {
      shortCompleted: 0,
      shortTotal: 0,
      longCompleted: 0,
      longTotal: 0,
      complete: false
    };
  }
  const shorts = practice.longChunks.flatMap(({ shortChunks }) => shortChunks);
  const longCompleted = practice.longChunks.filter(({ recording }) => recording).length;
  return {
    shortCompleted: shorts.filter(({ recording }) => recording).length,
    shortTotal: shorts.length,
    longCompleted,
    longTotal: practice.longChunks.length,
    complete: practice.longChunks.length > 0 &&
      longCompleted === practice.longChunks.length
  };
}

function validStoredPractice(value: unknown): value is StoredPractice {
  if (!value || typeof value !== "object") return false;
  const practice = value as Partial<StoredPractice>;
  return typeof practice.id === "string" &&
    typeof practice.material === "string" &&
    (practice.mode === "progressive" || practice.mode === "advanced") &&
    Array.isArray(practice.longChunks);
}

function safeFileName(value: string | undefined): value is string {
  return Boolean(value) && basename(value!) === value && !value!.includes("..\\");
}

export class LocalListenRepeatStore {
  readonly #metadataPath: string;
  readonly #recordingsPath: string;
  readonly #aiAudioPath: string;
  #practice: StoredPractice | null | undefined;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly options: StoreOptions = {}
  ) {
    this.#metadataPath = join(root, "current.json");
    this.#recordingsPath = join(root, "recordings");
    this.#aiAudioPath = join(root, "ai-audio");
  }

  #now() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  async #load(): Promise<StoredPractice | null> {
    if (this.#practice !== undefined) return this.#practice;
    await Promise.all((await readdir(this.root).catch(() => []))
      .filter((file) => file.startsWith("current.json") && file.endsWith(".next"))
      .map((file) => unlink(join(this.root, file)).catch(() => undefined)));
    try {
      const parsed = JSON.parse(await readFile(this.#metadataPath, "utf8"));
      this.#practice = validStoredPractice(parsed) ? parsed : null;
      if (this.#practice) await this.#reconcile(this.#practice);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof SyntaxError)) throw error;
      this.#practice = null;
    }
    return this.#practice;
  }

  async #reconcile(practice: StoredPractice): Promise<void> {
    let changed = false;
    const referencedRecordings = new Set<string>();
    const referencedAiAudio = new Set<string>();
    for (const chunk of allChunks(practice)) {
      if (chunk.recording) {
        if (!safeFileName(chunk.recordingFile)) {
          chunk.recording = null;
          delete chunk.recordingFile;
          changed = true;
        } else {
          try {
            await access(join(this.#recordingsPath, chunk.recordingFile));
            referencedRecordings.add(chunk.recordingFile);
          } catch {
            chunk.recording = null;
            delete chunk.recordingFile;
            changed = true;
          }
        }
      }
      if (chunk.aiAudio) {
        if (!safeFileName(chunk.aiAudioFile)) {
          chunk.aiAudio = null;
          delete chunk.aiAudioFile;
          changed = true;
        } else {
          try {
            await access(join(this.#aiAudioPath, chunk.aiAudioFile));
            referencedAiAudio.add(chunk.aiAudioFile);
          } catch {
            chunk.aiAudio = null;
            delete chunk.aiAudioFile;
            changed = true;
          }
        }
      }
    }
    const removeOrphans = async (directory: string, referenced: Set<string>) => {
      await Promise.all((await readdir(directory).catch(() => []))
        .filter((file) => !referenced.has(file))
        .map((file) => rm(join(directory, file), { recursive: true, force: true })));
    };
    await Promise.all([
      removeOrphans(this.#recordingsPath, referencedRecordings),
      removeOrphans(this.#aiAudioPath, referencedAiAudio)
    ]);
    if (changed) await this.#save(practice);
  }

  async #save(practice: StoredPractice): Promise<void> {
    const write = this.#writeQueue.then(async () => {
      await mkdir(this.root, { recursive: true });
      const next = `${this.#metadataPath}.${randomUUID()}.next`;
      await writeFile(next, `${JSON.stringify(practice, null, 2)}\n`, "utf8");
      await rename(next, this.#metadataPath);
    });
    this.#writeQueue = write.catch(() => undefined);
    await write;
  }

  async getSnapshot(hasAiVoice: boolean): Promise<ListenRepeatSnapshot> {
    const practice = await this.#load();
    return {
      practice: practice ? publicPractice(practice) : null,
      progress: progress(practice),
      hasAiVoice
    };
  }

  async replacePractice(input: ReplacePracticeInput): Promise<ListenRepeatSnapshot> {
    const timestamp = this.#now();
    const practice: StoredPractice = {
      id: input.practiceId,
      material: input.material,
      mode: input.mode,
      phase: "ready",
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      longChunks: input.longChunks.map((longChunk) => {
        const longId = randomUUID();
        return {
          id: longId,
          kind: "long",
          text: longChunk.text,
          parentId: null,
          recording: null,
          aiAudio: null,
          recordingUnlocked: input.mode === "advanced",
          shortChunks: longChunk.shortChunks.map((shortChunk) => ({
            id: randomUUID(),
            kind: "short",
            text: shortChunk.text,
            parentId: longId,
            recording: null,
            aiAudio: null,
            recordingUnlocked: true,
            shortChunks: []
          }))
        };
      })
    };
    await this.#save(practice);
    this.#practice = practice;
    await Promise.all([
      rm(this.#recordingsPath, { recursive: true, force: true }),
      rm(this.#aiAudioPath, { recursive: true, force: true })
    ]);
    return this.getSnapshot(false);
  }

  async saveDraft(input: {
    material: string;
    mode: ListenRepeatMode;
  }): Promise<ListenRepeatSnapshot> {
    const current = await this.#load();
    if (current && current.phase !== "draft") return this.getSnapshot(false);
    const timestamp = this.#now();
    const practice: StoredPractice = current ?? {
      id: randomUUID(),
      material: "",
      mode: input.mode,
      phase: "draft",
      longChunks: [],
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    practice.material = input.material;
    practice.mode = input.mode;
    practice.updatedAt = timestamp;
    await this.#save(practice);
    this.#practice = practice;
    return this.getSnapshot(false);
  }

  async saveRecording(
    input: SaveListenRepeatRecordingInput
  ): Promise<ListenRepeatSnapshot> {
    const practice = await this.#load();
    if (!practice || practice.id !== input.practiceId) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    const chunk = allChunks(practice).find(({ id }) => id === input.chunkId);
    if (!chunk) throw new Error("Invalid listen-and-repeat chunk");
    if (!chunk.recordingUnlocked) {
      throw new Error("This long chunk is still locked");
    }
    const extension = allowedMimeTypes[input.mimeType];
    if (!extension) throw new Error("Unsupported recording audio format");
    if (!(input.audio instanceof Uint8Array) || input.audio.byteLength === 0 ||
      input.audio.byteLength > LISTEN_REPEAT_RECORDING_LIMIT) {
      throw new Error("Invalid recording audio size");
    }

    await mkdir(this.#recordingsPath, { recursive: true });
    const file = `${chunk.id}-${randomUUID()}.${extension}`;
    const finalPath = join(this.#recordingsPath, file);
    const temporaryPath = `${finalPath}.next`;
    await writeFile(temporaryPath, input.audio);
    await rename(temporaryPath, finalPath);

    const previous = {
      recording: chunk.recording,
      recordingFile: chunk.recordingFile,
      updatedAt: practice.updatedAt
    };
    chunk.recording = {
      mimeType: input.mimeType,
      bytes: input.audio.byteLength,
      updatedAt: this.#now()
    };
    chunk.recordingFile = file;
    if (chunk.kind === "short" && chunk.parentId) {
      const parent = practice.longChunks.find(({ id }) => id === chunk.parentId);
      if (parent && parent.shortChunks.every(({ recording }) => recording)) {
        parent.recordingUnlocked = true;
      }
    }
    practice.updatedAt = this.#now();
    try {
      await this.#save(practice);
    } catch (error) {
      chunk.recording = previous.recording;
      chunk.recordingFile = previous.recordingFile;
      practice.updatedAt = previous.updatedAt;
      await unlink(finalPath).catch(() => undefined);
      throw error;
    }
    if (safeFileName(previous.recordingFile)) {
      await unlink(join(this.#recordingsPath, previous.recordingFile))
        .catch(() => undefined);
    }
    return this.getSnapshot(false);
  }

  async getRecording(
    practiceId: string,
    chunkId: string
  ): Promise<ListenRepeatAudioResult> {
    const practice = await this.#load();
    if (!practice || practice.id !== practiceId) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    const chunk = allChunks(practice).find(({ id }) => id === chunkId);
    if (!chunk?.recording || !safeFileName(chunk.recordingFile)) {
      throw new Error("Recording is unavailable");
    }
    return {
      mimeType: chunk.recording.mimeType,
      audio: new Uint8Array(await readFile(join(
        this.#recordingsPath,
        chunk.recordingFile
      ))),
      cached: true
    };
  }

  async getChunkText(practiceId: string, chunkId: string): Promise<string> {
    const practice = await this.#load();
    if (!practice || practice.id !== practiceId) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    const chunk = allChunks(practice).find(({ id }) => id === chunkId);
    if (!chunk) throw new Error("Invalid listen-and-repeat chunk");
    return chunk.text;
  }

  async getAudioContext(
    practiceId: string,
    chunkId: string
  ): Promise<ListenRepeatAudioContext> {
    const practice = await this.#load();
    if (!practice || practice.id !== practiceId) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    const requested = allChunks(practice).find(({ id }) => id === chunkId);
    if (!requested) throw new Error("Invalid listen-and-repeat chunk");
    const parent = requested.kind === "long"
      ? requested
      : practice.longChunks.find(({ id }) => id === requested.parentId);
    if (!parent) throw new Error("Invalid listen-and-repeat parent chunk");
    return {
      requested: {
        id: requested.id,
        kind: requested.kind,
        text: requested.text
      },
      parent: {
        id: parent.id,
        text: parent.text
      },
      children: parent.shortChunks.map(({ id, text }) => ({ id, text }))
    };
  }

  async getAiAudio(
    practiceId: string,
    chunkId: string,
    fingerprint: string
  ): Promise<ListenRepeatAudioResult | undefined> {
    const practice = await this.#load();
    if (!practice || practice.id !== practiceId) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    const chunk = allChunks(practice).find(({ id }) => id === chunkId);
    if (!chunk) throw new Error("Invalid listen-and-repeat chunk");
    if (chunk.aiAudio?.fingerprint !== fingerprint ||
      !safeFileName(chunk.aiAudioFile)) return undefined;
    try {
      return {
        mimeType: "audio/wav",
        audio: new Uint8Array(await readFile(join(this.#aiAudioPath, chunk.aiAudioFile))),
        cached: true
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async saveAiAudio(input: {
    practiceId: string;
    chunkId: string;
    fingerprint: string;
    audio: Uint8Array;
  }): Promise<void> {
    await this.saveAiAudioBatch([input]);
  }

  async saveAiAudioBatch(inputs: Array<{
    practiceId: string;
    chunkId: string;
    fingerprint: string;
    audio: Uint8Array;
  }>): Promise<void> {
    if (inputs.length === 0) return;
    const practice = await this.#load();
    const practiceId = inputs[0].practiceId;
    if (!practice || practice.id !== practiceId ||
      inputs.some((input) => input.practiceId !== practiceId)) {
      throw new Error("Invalid listen-and-repeat practice");
    }
    if (new Set(inputs.map(({ chunkId }) => chunkId)).size !== inputs.length) {
      throw new Error("Invalid AI audio batch");
    }
    const entries = inputs.map((input) => {
      const chunk = allChunks(practice).find(({ id }) => id === input.chunkId);
      if (!chunk) throw new Error("Invalid listen-and-repeat chunk");
      if (!(input.audio instanceof Uint8Array) || input.audio.byteLength === 0 ||
        input.audio.byteLength > MAXIMUM_AI_AUDIO_BYTES ||
        !/^[a-f0-9]{64}$/u.test(input.fingerprint)) {
        throw new Error("Invalid AI audio");
      }
      const file = `${chunk.id}-${input.fingerprint}.wav`;
      return {
        input,
        chunk,
        file,
        finalPath: join(this.#aiAudioPath, file),
        oldAudio: chunk.aiAudio,
        oldFile: chunk.aiAudioFile
      };
    });
    await mkdir(this.#aiAudioPath, { recursive: true });
    const written: string[] = [];
    const previousUpdatedAt = practice.updatedAt;
    try {
      for (const entry of entries) {
        const temporaryPath = `${entry.finalPath}.next`;
        await writeFile(temporaryPath, entry.input.audio);
        await rename(temporaryPath, entry.finalPath);
        written.push(entry.finalPath);
        entry.chunk.aiAudio = {
          fingerprint: entry.input.fingerprint,
          bytes: entry.input.audio.byteLength
        };
        entry.chunk.aiAudioFile = entry.file;
      }
      practice.updatedAt = this.#now();
      await this.#save(practice);
    } catch (error) {
      for (const entry of entries) {
        entry.chunk.aiAudio = entry.oldAudio;
        entry.chunk.aiAudioFile = entry.oldFile;
      }
      practice.updatedAt = previousUpdatedAt;
      await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
      throw error;
    }
    await Promise.all(entries.map(({ oldFile, file }) =>
      safeFileName(oldFile) && oldFile !== file
        ? unlink(join(this.#aiAudioPath, oldFile)).catch(() => undefined)
        : undefined
    ));
  }

  async clear(hasAiVoice: boolean): Promise<ListenRepeatSnapshot> {
    await this.#writeQueue;
    await rm(this.root, { recursive: true, force: true });
    this.#practice = null;
    return this.getSnapshot(hasAiVoice);
  }
}
