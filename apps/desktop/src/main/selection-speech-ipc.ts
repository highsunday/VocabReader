import type {
  ApplySelectionSpeechSettingsInput,
  SelectionSpeechStreamEvent
} from "../shared/selection-speech-contracts";
import {
  isSelectionSpeechTone,
  isSelectionSpeechVoice
} from "../shared/settings-contracts";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: any[]) => unknown): unknown;
}

interface SelectionSpeechController {
  getSettings(): unknown;
  applySettings(input: ApplySelectionSpeechSettingsInput): unknown;
  removeApiKey(): unknown;
  start(text: string, emit: (event: SelectionSpeechStreamEvent) => void): {
    requestId: string;
  };
  cancel(requestId: string): unknown;
}

export function registerSelectionSpeechIpc(
  ipc: IpcRegistrar,
  service: SelectionSpeechController
) {
  ipc.handle("selection-speech:get-settings", () => service.getSettings());
  ipc.handle("selection-speech:apply-settings", (_event, rawInput) => {
    const input = rawInput as Partial<ApplySelectionSpeechSettingsInput> | null;
    if (
      !input ||
      !isSelectionSpeechVoice(input.voice) ||
      !isSelectionSpeechTone(input.tone) ||
      (input.apiKey !== undefined &&
        (typeof input.apiKey !== "string" ||
          !input.apiKey.trim() ||
          input.apiKey.length > 1024))
    ) {
      throw new Error("Invalid AI voice settings");
    }
    return service.applySettings({
      ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
      voice: input.voice,
      tone: input.tone
    });
  });
  ipc.handle("selection-speech:remove-api-key", () => service.removeApiKey());
  ipc.handle("selection-speech:start", (event, rawInput) => {
    const text = (rawInput as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || !text.trim() || text.length > 200_000) {
      throw new Error("Invalid selection speech text");
    }
    return service.start(text, (streamEvent) => {
      event.sender.send("selection-speech:event", streamEvent);
    });
  });
  ipc.handle("selection-speech:cancel", (_event, requestId) => {
    if (typeof requestId !== "string" || !requestId) {
      throw new Error("Invalid selection speech request");
    }
    service.cancel(requestId);
  });
}
