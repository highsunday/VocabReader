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
      updateLearningItemDraft: vi.fn().mockReturnValue(snapshot),
      setLearningItemDraftState: vi.fn().mockReturnValue(snapshot),
      submitLearningItemBatch: vi.fn().mockResolvedValue(snapshot),
      restoreLearningItemMatch: vi.fn().mockResolvedValue(snapshot),
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
    expect(handlers.has("chat:update-learning-item-draft")).toBe(true);
    expect(handlers.has("chat:set-learning-item-draft-state")).toBe(true);
    expect(handlers.has("chat:submit-learning-item-batch")).toBe(true);
    expect(handlers.has("chat:restore-learning-item-match")).toBe(true);
    await handlers.get("chat:send")?.({}, {
      text: "Explain",
      intent: "explainAnnotations",
      explanationLanguage: "ja",
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: "inside"
      }
    });
    expect(controller.sendMessage).toHaveBeenCalledWith({
      text: "Explain",
      intent: "explainAnnotations",
      explanationLanguage: "ja",
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: "inside"
      }
    });
    await handlers.get("chat:send")?.({}, {
      text: "新增 bank",
      intent: "createLearningItems",
      explanationLanguage: "zh-TW",
      learningItemTargets: [{
        title: "bank",
        senseHint: "side of a river"
      }]
    });
    expect(controller.sendMessage).toHaveBeenCalledWith({
      text: "新增 bank",
      intent: "createLearningItems",
      explanationLanguage: "zh-TW",
      learningItemTargets: [{
        title: "bank",
        senseHint: "side of a river"
      }]
    });
    await handlers.get("chat:send")?.({}, {
      text: "開始閱讀測驗",
      intent: "practiceReading",
      explanationLanguage: "ja",
      context: { readingSegment: "inside" }
    });
    expect(controller.sendMessage).toHaveBeenCalledWith({
      text: "開始閱讀測驗",
      intent: "practiceReading",
      explanationLanguage: "ja",
      context: { readingSegment: "inside" }
    });
    expect(() => handlers.get("chat:send")?.({}, {
      text: "bad",
      context: { readingSegment: 42 }
    })).toThrow(/上下文格式錯誤/);
    expect(() => handlers.get("chat:send")?.({}, {
      text: "bad",
      intent: "arbitrary-system-prompt",
      explanationLanguage: "klingon"
    })).toThrow(/AI 訊息格式錯誤/);
    expect(() => handlers.get("chat:send")?.({}, {
      text: "bad",
      intent: "createLearningItems",
      learningItemTargets: [{ title: "", arbitrary: "data" }]
    })).toThrow(/AI 訊息格式錯誤/);
    const draftInput = {
      batchId: "batch-a",
      draftId: "draft-a",
      title: "reluctant",
      itemType: "word",
      cefr: "B2",
      sense: "unwilling",
      markdownContent: "## Meaning\n不情願。"
    };
    await handlers.get("chat:update-learning-item-draft")?.({}, draftInput);
    await handlers.get("chat:set-learning-item-draft-state")?.({}, {
      batchId: "batch-a",
      draftId: "draft-a",
      state: "excluded"
    });
    await handlers.get("chat:submit-learning-item-batch")?.({}, "batch-a");
    await handlers.get("chat:restore-learning-item-match")?.(
      {},
      { batchId: "batch-a", itemId: "item-a" }
    );
    expect(controller.updateLearningItemDraft).toHaveBeenCalledWith(draftInput);
    expect(controller.setLearningItemDraftState)
      .toHaveBeenCalledWith("batch-a", "draft-a", "excluded");
    expect(controller.submitLearningItemBatch).toHaveBeenCalledWith("batch-a");
    expect(controller.restoreLearningItemMatch)
      .toHaveBeenCalledWith("batch-a", "item-a");
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
