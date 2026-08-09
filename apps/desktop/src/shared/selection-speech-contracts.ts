import type {
  SelectionSpeechTone,
  SelectionSpeechVoice
} from "./settings-contracts";

export interface SelectionSpeechSettingsSnapshot {
  hasApiKey: boolean;
  voice: SelectionSpeechVoice;
  tone: SelectionSpeechTone;
}

export interface ApplySelectionSpeechSettingsInput {
  apiKey?: string;
  voice: SelectionSpeechVoice;
  tone: SelectionSpeechTone;
}

export interface ApplySelectionSpeechSettingsResult {
  settings: SelectionSpeechSettingsSnapshot;
  previewAudio: Uint8Array;
}

export type SelectionSpeechErrorCode =
  | "auth"
  | "quota"
  | "network"
  | "service"
  | "not-configured"
  | "secure-storage";

export type SelectionSpeechStreamEvent =
  | { type: "audio"; requestId: string; audio: Uint8Array }
  | { type: "done"; requestId: string }
  | {
      type: "error";
      requestId: string;
      code: SelectionSpeechErrorCode;
      message: string;
    };

export interface SelectionSpeechDesktopApi {
  getSettings(): Promise<SelectionSpeechSettingsSnapshot>;
  applySettings(
    input: ApplySelectionSpeechSettingsInput
  ): Promise<ApplySelectionSpeechSettingsResult>;
  removeApiKey(): Promise<SelectionSpeechSettingsSnapshot>;
  start(input: { text: string }): Promise<{ requestId: string }>;
  cancel(requestId: string): Promise<void>;
  onEvent(listener: (event: SelectionSpeechStreamEvent) => void): () => void;
}
