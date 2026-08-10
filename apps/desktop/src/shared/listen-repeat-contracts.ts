export const LISTEN_REPEAT_MATERIAL_LIMIT = 2_000;
export const LISTEN_REPEAT_RECORDING_LIMIT = 24 * 1024 * 1024;
export const DEFAULT_LISTEN_REPEAT_SHORT_CHUNK_LENGTH = "short";

export type ListenRepeatMode = "progressive" | "advanced";
export type ListenRepeatShortChunkLength = "short" | "medium" | "long";
export type ListenRepeatChunkKind = "short" | "long";

export interface ListenRepeatRecordingSummary {
  mimeType: string;
  bytes: number;
  updatedAt: string;
}

export interface ListenRepeatAiAudioSummary {
  fingerprint: string;
  bytes: number;
}

export interface ListenRepeatChunk {
  id: string;
  kind: ListenRepeatChunkKind;
  text: string;
  parentId: string | null;
  recording: ListenRepeatRecordingSummary | null;
  aiAudio: ListenRepeatAiAudioSummary | null;
  recordingUnlocked: boolean;
  shortChunks: ListenRepeatChunk[];
}

export interface ListenRepeatPractice {
  id: string;
  material: string;
  mode: ListenRepeatMode;
  shortChunkLength: ListenRepeatShortChunkLength;
  phase: "draft" | "processing" | "ready" | "error";
  longChunks: ListenRepeatChunk[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListenRepeatProgress {
  shortCompleted: number;
  shortTotal: number;
  longCompleted: number;
  longTotal: number;
  complete: boolean;
}

export interface ListenRepeatSnapshot {
  practice: ListenRepeatPractice | null;
  progress: ListenRepeatProgress;
  hasAiVoice: boolean;
}

export interface ProcessListenRepeatInput {
  material: string;
  mode: ListenRepeatMode;
  shortChunkLength?: ListenRepeatShortChunkLength;
  replaceConfirmed?: boolean;
}

export interface SaveListenRepeatDraftInput {
  material: string;
  mode: ListenRepeatMode;
  shortChunkLength?: ListenRepeatShortChunkLength;
}

export interface SaveListenRepeatRecordingInput {
  practiceId: string;
  chunkId: string;
  mimeType: string;
  audio: Uint8Array;
}

export interface ListenRepeatAudioResult {
  mimeType: string;
  audio: Uint8Array;
  cached: boolean;
}

export interface ListenRepeatDesktopApi {
  getSnapshot(): Promise<ListenRepeatSnapshot>;
  saveDraft(input: SaveListenRepeatDraftInput): Promise<ListenRepeatSnapshot>;
  process(input: ProcessListenRepeatInput): Promise<ListenRepeatSnapshot>;
  saveRecording(input: SaveListenRepeatRecordingInput): Promise<ListenRepeatSnapshot>;
  getRecording(input: { practiceId: string; chunkId: string }): Promise<ListenRepeatAudioResult>;
  prepareAiAudio(input: { practiceId: string; chunkId: string }): Promise<ListenRepeatAudioResult>;
  cancelAiAudio(input: { practiceId: string; chunkId?: string }): Promise<void>;
  clear(): Promise<ListenRepeatSnapshot>;
}

export type ListenRepeatMaterialValidation =
  | { valid: true; count: number }
  | { valid: false; count: number; reason: "empty" | "too-long" };

function fallbackGraphemes(value: string): number {
  const codePoints = Array.from(value);
  let count = 0;
  let joinNext = false;
  for (const point of codePoints) {
    if (/\p{M}/u.test(point) || point === "\ufe0f" || point === "\ufe0e") {
      continue;
    }
    if (point === "\u200d") {
      joinNext = true;
      continue;
    }
    if (joinNext) {
      joinNext = false;
      continue;
    }
    count += 1;
  }
  return count;
}

export function countListenRepeatGraphemes(value: string): number {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" })
      .segment(value)].length;
  }
  return fallbackGraphemes(value);
}

export function validateListenRepeatMaterial(
  material: string
): ListenRepeatMaterialValidation {
  const count = countListenRepeatGraphemes(material);
  if (!material.trim()) return { valid: false, count, reason: "empty" };
  if (count > LISTEN_REPEAT_MATERIAL_LIMIT) {
    return { valid: false, count, reason: "too-long" };
  }
  return { valid: true, count };
}

export function isListenRepeatMode(value: unknown): value is ListenRepeatMode {
  return value === "progressive" || value === "advanced";
}

export function isListenRepeatShortChunkLength(
  value: unknown
): value is ListenRepeatShortChunkLength {
  return value === "short" || value === "medium" || value === "long";
}
