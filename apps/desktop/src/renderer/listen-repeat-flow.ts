import type {
  ListenRepeatChunk,
  ListenRepeatPractice
} from "../shared/listen-repeat-contracts";

export const LISTEN_REPEAT_SILENCE_MS = 1_500;
export const LISTEN_REPEAT_NO_SPEECH_MS = 8_000;
export const LISTEN_REPEAT_MAX_RECORDING_MS = 30_000;
export const LISTEN_REPEAT_VOICE_THRESHOLD = 0.08;

export interface VoiceActivityState {
  startedAt: number;
  speechStarted: boolean;
  lastVoiceAt: number | null;
  level: number;
  outcome: "listening" | "complete" | "no-speech";
}

export function flattenListenRepeatPractice(
  practice: ListenRepeatPractice
): ListenRepeatChunk[] {
  if (practice.mode === "advanced") return [...practice.longChunks];
  return practice.longChunks.flatMap((long) => [...long.shortChunks, long]);
}

function eligible(practice: ListenRepeatPractice, chunk: ListenRepeatChunk) {
  return practice.mode === "advanced" || chunk.recordingUnlocked;
}

export function findResumeChunkId(
  practice: ListenRepeatPractice
): string | undefined {
  return flattenListenRepeatPractice(practice)
    .find((chunk) => eligible(practice, chunk) && !chunk.recording)?.id;
}

export function hasRecordingAtOrAfter(
  practice: ListenRepeatPractice,
  chunkId: string
): boolean {
  const chunks = flattenListenRepeatPractice(practice);
  const start = chunks.findIndex(({ id }) => id === chunkId);
  return start >= 0 && chunks.slice(start).some(({ recording }) => recording);
}

export function continuousPreparationWindow(
  practice: ListenRepeatPractice,
  chunkId: string
): ListenRepeatChunk[] {
  const chunks = flattenListenRepeatPractice(practice);
  const start = chunks.findIndex(({ id }) => id === chunkId);
  return start < 0 ? [] : chunks.slice(start, start + 2);
}

export function createVoiceActivityState(now: number): VoiceActivityState {
  return {
    startedAt: now,
    speechStarted: false,
    lastVoiceAt: null,
    level: 0,
    outcome: "listening"
  };
}

export function advanceVoiceActivity(
  previous: VoiceActivityState,
  sample: { now: number; level: number }
): VoiceActivityState {
  if (previous.outcome !== "listening") return previous;
  const voice = sample.level >= LISTEN_REPEAT_VOICE_THRESHOLD;
  const speechStarted = previous.speechStarted || voice;
  const lastVoiceAt = voice ? sample.now : previous.lastVoiceAt;
  let outcome: VoiceActivityState["outcome"] = "listening";
  if (!speechStarted && sample.now - previous.startedAt >= LISTEN_REPEAT_NO_SPEECH_MS) {
    outcome = "no-speech";
  } else if (speechStarted &&
    ((lastVoiceAt !== null && sample.now - lastVoiceAt >= LISTEN_REPEAT_SILENCE_MS) ||
      sample.now - previous.startedAt >= LISTEN_REPEAT_MAX_RECORDING_MS)) {
    outcome = "complete";
  }
  return {
    ...previous,
    speechStarted,
    lastVoiceAt,
    level: sample.level,
    outcome
  };
}

export function recordingCompletion(
  activity: VoiceActivityState,
  saveRequested: boolean
): "save" | "cancel" | "no-speech" {
  if (!saveRequested) return "cancel";
  return activity.speechStarted ? "save" : "no-speech";
}
