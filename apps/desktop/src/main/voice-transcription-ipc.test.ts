import { describe, expect, it, vi } from "vitest";
import { registerVoiceTranscriptionIpc } from "./voice-transcription-ipc";

function setup() {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const ipc = {
    handle(channel: string, listener: (...args: any[]) => unknown) {
      handlers.set(channel, listener);
    }
  };
  const service = {
    transcribe: vi.fn(async () => ({ text: "hello" })),
    cancel: vi.fn()
  };
  registerVoiceTranscriptionIpc(ipc, service);
  return { handlers, service };
}

describe("voice transcription IPC", () => {
  it("passes only the whitelisted audio fields", async () => {
    const { handlers, service } = setup();
    const audio = new Uint8Array([1, 2, 3]);

    await handlers.get("voice-transcription:transcribe")?.({}, {
      audio,
      mimeType: "audio/webm;codecs=opus",
      durationMs: 1_200,
      model: "untrusted-model",
      prompt: "answer the question"
    });

    expect(service.transcribe).toHaveBeenCalledWith({
      audio,
      mimeType: "audio/webm;codecs=opus",
      durationMs: 1_200
    });
  });

  it.each([
    null,
    {},
    { audio: [1, 2], mimeType: "audio/webm", durationMs: 1_000 },
    { audio: new Uint8Array([1]), mimeType: "audio/webm", durationMs: "1000" }
  ])("rejects malformed renderer payloads %#", (input) => {
    const { handlers, service } = setup();
    expect(() => handlers.get("voice-transcription:transcribe")?.({}, input))
      .toThrow(/Invalid voice transcription input/);
    expect(service.transcribe).not.toHaveBeenCalled();
  });

  it("registers only transcription and cancellation channels", async () => {
    const { handlers, service } = setup();
    await handlers.get("voice-transcription:cancel")?.({});
    expect([...handlers.keys()].sort()).toEqual([
      "voice-transcription:cancel",
      "voice-transcription:transcribe"
    ]);
    expect(service.cancel).toHaveBeenCalledOnce();
  });
});
