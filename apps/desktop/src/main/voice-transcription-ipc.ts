import type { VoiceTranscriptionInput } from "../shared/voice-transcription-contracts";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: any[]) => unknown): unknown;
}

interface VoiceTranscriptionController {
  transcribe(input: VoiceTranscriptionInput): unknown;
  cancel(): unknown;
}

export function registerVoiceTranscriptionIpc(
  ipc: IpcRegistrar,
  service: VoiceTranscriptionController
) {
  ipc.handle("voice-transcription:transcribe", (_event, rawInput) => {
    const input = rawInput as Partial<VoiceTranscriptionInput> | null;
    if (
      !input ||
      !(input.audio instanceof Uint8Array) ||
      typeof input.mimeType !== "string" ||
      typeof input.durationMs !== "number"
    ) {
      throw new Error("Invalid voice transcription input");
    }
    return service.transcribe({
      audio: input.audio,
      mimeType: input.mimeType,
      durationMs: input.durationMs
    });
  });
  ipc.handle("voice-transcription:cancel", () => service.cancel());
}
