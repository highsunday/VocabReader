import { describe, expect, it, vi } from "vitest";
import { registerLearningItemEditIpc } from "./learning-item-edit-ipc";

describe("learning-item edit IPC", () => {
  it("accepts only ids and a bounded user request from Renderer", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const controller = {
      start: vi.fn(async () => ({ sessionId: "session-1" })),
      send: vi.fn(async () => ({ sessionId: "session-1" })),
      stop: vi.fn(),
      apply: vi.fn(),
      discard: vi.fn()
    };
    registerLearningItemEditIpc({
      handle(channel, listener) {
        handlers.set(channel, listener);
      }
    }, controller as never);

    await handlers.get("learning-edit:start")?.({}, "item-1");
    await handlers.get("learning-edit:send")?.({}, "session-1", "Add a comparison");
    expect(controller.start).toHaveBeenCalledWith("item-1");
    expect(controller.send).toHaveBeenCalledWith("session-1", "Add a comparison");
    expect(() => handlers.get("learning-edit:send")?.(
      {}, "session-1", { request: "edit", markdownContent: "forged" }
    )).toThrow(/Invalid AI edit request/);
  });
});
