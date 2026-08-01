import { describe, expect, it, vi } from "vitest";
import type { SentencePracticeController } from "./sentence-practice-controller";
import { registerSentencePracticeIpc } from "./sentence-practice-ipc";

describe("sentence-practice IPC", () => {
  it("registers only bounded operations and rejects malformed payloads", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const controller = {
      getSnapshot: vi.fn(async () => ({ eligibleCount: 0, session: null })),
      startSession: vi.fn(async () => ({ eligibleCount: 5, session: {} })),
      submit: vi.fn(async () => ({ eligibleCount: 5, session: {} }))
    } as unknown as SentencePracticeController;
    registerSentencePracticeIpc({
      handle: (channel, handler) => handlers.set(channel, handler)
    }, controller);

    expect([...handlers.keys()].sort()).toEqual([
      "sentence-practice:snapshot",
      "sentence-practice:start",
      "sentence-practice:submit"
    ]);
    await handlers.get("sentence-practice:snapshot")?.({});
    expect(controller.getSnapshot).toHaveBeenCalledWith();
    await handlers.get("sentence-practice:start")?.({}, { itemCount: 5 });
    expect(controller.startSession).toHaveBeenCalledWith({ itemCount: 5 });
    await handlers.get("sentence-practice:submit")?.({}, {
      sessionId: "session-1",
      draft: "A short story.",
      explanationLanguage: "zh-TW"
    });
    expect(controller.submit).toHaveBeenCalledWith({
      sessionId: "session-1",
      draft: "A short story.",
      explanationLanguage: "zh-TW"
    });

    expect(() => handlers.get("sentence-practice:start")?.({}, {
      itemCount: 20
    })).toThrow(/Invalid sentence-practice start/);
    expect(() => handlers.get("sentence-practice:submit")?.({}, {
      sessionId: "session-1",
      draft: "Text",
      explanationLanguage: "arbitrary"
    })).toThrow(/Invalid sentence-practice submission/);
  });
});
