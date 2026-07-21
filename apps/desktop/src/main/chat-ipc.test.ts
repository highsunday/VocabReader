import { describe, expect, it, vi } from "vitest";
import type { ChatSnapshot } from "../shared/chat-contracts";
import { registerChatIpc } from "./chat-ipc";

const snapshot: ChatSnapshot = {
  connection: "ready",
  connectionDetail: "ready",
  account: { type: "plus", email: "reader@example.com" },
  allowance: {
    phase: "available",
    fiveHour: null,
    weekly: null,
    detail: "partial"
  },
  messages: [],
  threadId: null,
  activeTurnId: null
};

describe("chat IPC", () => {
  it("registers a narrow chat API and validates structured context", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      })
    };
    const listener = vi.fn();
    const controller = {
      getSnapshot: vi.fn(() => snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn(() => listener)
    };
    const publish = vi.fn();

    const unsubscribe = registerChatIpc(
      ipc,
      controller as never,
      publish
    );

    expect(handlers.has("chat:get-state")).toBe(true);
    expect(handlers.has("chat:connect")).toBe(true);
    expect(handlers.has("chat:send")).toBe(true);
    await handlers.get("chat:send")?.({}, {
      text: "Explain",
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: "inside"
      }
    });
    expect(controller.sendMessage).toHaveBeenCalledWith({
      text: "Explain",
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: "inside"
      }
    });
    expect(() => handlers.get("chat:send")?.({}, {
      text: "bad",
      context: { readingSegment: 42 }
    })).toThrow(/上下文格式錯誤/);
    expect(unsubscribe).toBe(listener);
  });
});
