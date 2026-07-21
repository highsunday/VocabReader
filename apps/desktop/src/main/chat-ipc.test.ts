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
  activeTurnId: null,
  conversations: [],
  activeConversationId: null,
  managementBusy: false
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
      startNewConversation: vi.fn().mockReturnValue(snapshot),
      selectConversation: vi.fn().mockReturnValue(snapshot),
      removeConversation: vi.fn().mockResolvedValue(snapshot),
      selectModel: vi.fn().mockReturnValue(snapshot),
      stopResponse: vi.fn().mockResolvedValue(snapshot),
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
    expect(handlers.has("chat:new")).toBe(true);
    expect(handlers.has("chat:select")).toBe(true);
    expect(handlers.has("chat:remove")).toBe(true);
    expect(handlers.has("chat:select-model")).toBe(true);
    expect(handlers.has("chat:stop")).toBe(true);
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
    await handlers.get("chat:new")?.({});
    await handlers.get("chat:select")?.({}, "conversation-a");
    await handlers.get("chat:remove")?.({}, "conversation-a");
    await handlers.get("chat:select-model")?.({}, "gpt-reader");
    await handlers.get("chat:stop")?.({});
    expect(controller.startNewConversation).toHaveBeenCalledOnce();
    expect(controller.selectConversation).toHaveBeenCalledWith("conversation-a");
    expect(controller.removeConversation).toHaveBeenCalledWith("conversation-a");
    expect(controller.selectModel).toHaveBeenCalledWith("gpt-reader");
    expect(controller.stopResponse).toHaveBeenCalledOnce();
    expect(() => handlers.get("chat:select")?.({}, ""))
      .toThrow(/對話識別碼/);
    expect(unsubscribe).toBe(listener);
  });
});
