import { describe, expect, it, vi } from "vitest";
import { registerSelectionSpeechIpc } from "./selection-speech-ipc";

function setup() {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const ipc = {
    handle(channel: string, listener: (...args: any[]) => unknown) {
      handlers.set(channel, listener);
    }
  };
  const service = {
    getSettings: vi.fn(async () => ({ hasApiKey: false, voice: "cedar", tone: "learning" })),
    applySettings: vi.fn(async (input) => ({ settings: input, previewAudio: new Uint8Array() })),
    removeApiKey: vi.fn(async () => ({ hasApiKey: false, voice: "cedar", tone: "learning" })),
    start: vi.fn((_text, emit) => {
      emit({ type: "done", requestId: "request-1" });
      return { requestId: "request-1" };
    }),
    cancel: vi.fn()
  };
  registerSelectionSpeechIpc(ipc, service);
  return { handlers, service };
}

describe("selection speech IPC", () => {
  it("accepts only a key plus whitelisted voice and tone settings", async () => {
    const { handlers, service } = setup();

    await handlers.get("selection-speech:apply-settings")?.({}, {
      apiKey: "sk-test",
      voice: "marin",
      tone: "calm"
    });

    expect(service.applySettings).toHaveBeenCalledWith({
      apiKey: "sk-test",
      voice: "marin",
      tone: "calm"
    });
  });

  it.each([
    { apiKey: "", voice: "cedar", tone: "learning" },
    { apiKey: "sk-test", voice: "unknown", tone: "learning" },
    { apiKey: "sk-test", voice: "cedar", tone: "angry" },
    {
      apiKey: "sk-test",
      voice: "cedar",
      tone: "learning",
      model: "arbitrary-model",
      instructions: "arbitrary instructions"
    }
  ])("rejects or strips untrusted AI voice input %#", async (input) => {
    const { handlers, service } = setup();
    if ("model" in input) {
      await handlers.get("selection-speech:apply-settings")?.({}, input);
      expect(service.applySettings).toHaveBeenCalledWith({
        apiKey: "sk-test",
        voice: "cedar",
        tone: "learning"
      });
      return;
    }
    expect(() => handlers.get("selection-speech:apply-settings")?.({}, input))
      .toThrow(/Invalid AI voice settings/);
    expect(service.applySettings).not.toHaveBeenCalled();
  });

  it("routes stream events only through the fixed event channel", () => {
    const { handlers, service } = setup();
    const send = vi.fn();

    const result = handlers.get("selection-speech:start")?.(
      { sender: { send } },
      { text: "Selected reader text." }
    );

    expect(result).toEqual({ requestId: "request-1" });
    expect(service.start).toHaveBeenCalledWith(
      "Selected reader text.",
      expect.any(Function)
    );
    expect(send).toHaveBeenCalledWith("selection-speech:event", {
      type: "done",
      requestId: "request-1"
    });
  });

  it("validates start and cancel request boundaries", () => {
    const { handlers, service } = setup();
    expect(() => handlers.get("selection-speech:start")?.(
      { sender: { send: vi.fn() } },
      { text: "   " }
    )).toThrow(/Invalid selection speech text/);
    expect(() => handlers.get("selection-speech:cancel")?.({}, ""))
      .toThrow(/Invalid selection speech request/);
    expect(service.start).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });
});
