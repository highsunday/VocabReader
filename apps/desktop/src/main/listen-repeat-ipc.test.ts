import { describe, expect, it, vi } from "vitest";
import type { ListenRepeatController } from "./listen-repeat-controller";
import { registerListenRepeatIpc } from "./listen-repeat-ipc";

describe("listen-and-repeat IPC", () => {
  it("registers bounded operations and validates material, IDs, MIME and bytes", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const controller = {
      getSnapshot: vi.fn(),
      saveDraft: vi.fn(),
      process: vi.fn(),
      saveRecording: vi.fn(),
      getRecording: vi.fn(),
      prepareAiAudio: vi.fn(),
      cancelAiAudio: vi.fn(),
      clear: vi.fn()
    } as unknown as ListenRepeatController;
    registerListenRepeatIpc({
      handle: (channel, handler) => handlers.set(channel, handler)
    }, controller);

    expect([...handlers.keys()].sort()).toEqual([
      "listen-repeat:ai-audio",
      "listen-repeat:cancel-ai-audio",
      "listen-repeat:clear",
      "listen-repeat:draft",
      "listen-repeat:process",
      "listen-repeat:recording",
      "listen-repeat:save-recording",
      "listen-repeat:snapshot"
    ]);
    await handlers.get("listen-repeat:process")?.({}, {
      material: "Practice.",
      mode: "advanced",
      replaceConfirmed: false
    });
    expect(controller.process).toHaveBeenCalledWith({
      material: "Practice.",
      mode: "advanced",
      replaceConfirmed: false
    });
    await handlers.get("listen-repeat:save-recording")?.({}, {
      practiceId: "practice",
      chunkId: "chunk",
      mimeType: "audio/webm",
      audio: new Uint8Array([1])
    });
    expect(controller.saveRecording).toHaveBeenCalled();

    expect(() => handlers.get("listen-repeat:process")?.({}, {
      material: "Practice.",
      mode: "unknown"
    })).toThrow(/process request/i);
    expect(() => handlers.get("listen-repeat:save-recording")?.({}, {
      practiceId: "../bad",
      chunkId: "chunk",
      mimeType: "text/plain",
      audio: new Uint8Array([1])
    })).toThrow(/recording request/i);
  });
});
