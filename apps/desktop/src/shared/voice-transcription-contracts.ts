export const VOICE_TRANSCRIPTION_MAX_DURATION_MS = 15_000;
export const VOICE_TRANSCRIPTION_NO_SPEECH_MS = 8_000;
export const VOICE_TRANSCRIPTION_SILENCE_MS = 1_500;

export const voiceTranscriptionMimeTypes = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/wav"
] as const;

export type VoiceTranscriptionMimeType = typeof voiceTranscriptionMimeTypes[number];

export interface VoiceTranscriptionInput {
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
}

export interface VoiceTranscriptionResult {
  text: string;
}

export type VoiceTranscriptionErrorCode =
  | "invalid-audio"
  | "not-configured"
  | "busy"
  | "auth"
  | "quota"
  | "network"
  | "service";

export interface VoiceTranscriptionDesktopApi {
  transcribe(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult>;
  cancel(): Promise<void>;
}
