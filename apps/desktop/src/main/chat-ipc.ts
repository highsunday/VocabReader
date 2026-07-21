import type { SendChatMessageInput } from "../shared/chat-contracts";
import type { ChatController } from "./chat-controller";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown
  ): unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSendInput(value: unknown): SendChatMessageInput {
  if (!isObject(value) || typeof value.text !== "string") {
    throw new Error("AI 訊息格式錯誤。");
  }
  if (value.context === undefined) return { text: value.text };
  if (!isObject(value.context)) throw new Error("AI 上下文格式錯誤。");
  const context: NonNullable<SendChatMessageInput["context"]> = {};
  for (const key of ["bookTitle", "chapterTitle", "readingSegment"] as const) {
    const field = value.context[key];
    if (field !== undefined && typeof field !== "string") {
      throw new Error("AI 上下文格式錯誤。");
    }
    if (typeof field === "string") context[key] = field;
  }
  return { text: value.text, context };
}

function parseConversationId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AI 對話識別碼格式錯誤。");
  }
  return value;
}

export function registerChatIpc(
  ipc: IpcRegistrar,
  controller: ChatController,
  publish: (snapshot: ReturnType<ChatController["getSnapshot"]>) => void
) {
  ipc.handle("chat:get-state", () => controller.getSnapshot());
  ipc.handle("chat:connect", () => controller.connect());
  ipc.handle("chat:send", (_event, input) => {
    return controller.sendMessage(parseSendInput(input));
  });
  ipc.handle("chat:new", () => controller.startNewConversation());
  ipc.handle("chat:select", (_event, conversationId) => {
    return controller.selectConversation(parseConversationId(conversationId));
  });
  ipc.handle("chat:remove", (_event, conversationId) => {
    return controller.removeConversation(parseConversationId(conversationId));
  });
  ipc.handle("chat:select-model", (_event, modelId) => {
    return controller.selectModel(parseConversationId(modelId));
  });
  ipc.handle("chat:stop", () => controller.stopResponse());
  return controller.onStateChanged(publish);
}
