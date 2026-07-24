import type { SendChatMessageInput } from "../shared/chat-contracts";
import type {
  CefrLevel,
  LearningItemType,
  UpdateLearningItemDraftInput
} from "../shared/learning-contracts";
import { isExplanationLanguage } from "../shared/settings-contracts";
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validItemType(value: unknown): value is LearningItemType {
  return value === "word" || value === "phrase";
}

function validCefr(value: unknown): value is CefrLevel {
  return value === "A1" || value === "A2" || value === "B1" ||
    value === "B2" || value === "C1" || value === "C2";
}

function parseSendInput(value: unknown): SendChatMessageInput {
  if (!isObject(value) || typeof value.text !== "string") {
    throw new Error("AI 訊息格式錯誤。");
  }
  if (value.intent !== undefined &&
    value.intent !== "explainAnnotations" &&
    value.intent !== "practiceReading" &&
    value.intent !== "createLearningItems") {
    throw new Error("AI 訊息格式錯誤。");
  }
  if (value.explanationLanguage !== undefined &&
    !isExplanationLanguage(value.explanationLanguage)) {
    throw new Error("AI 訊息格式錯誤。");
  }
  const intent = value.intent === "explainAnnotations"
    ? "explainAnnotations" as const
    : value.intent === "practiceReading"
      ? "practiceReading" as const
      : value.intent === "createLearningItems"
        ? "createLearningItems" as const
        : undefined;
  let learningItemTargets: SendChatMessageInput["learningItemTargets"];
  if (value.learningItemTargets !== undefined) {
    if (intent !== "createLearningItems" ||
      !Array.isArray(value.learningItemTargets) ||
      value.learningItemTargets.length > 50) {
      throw new Error("AI 訊息格式錯誤。");
    }
    learningItemTargets = value.learningItemTargets.map((target) => {
      if (!isObject(target) || !nonEmptyString(target.title) ||
        Object.keys(target).some((key) =>
          key !== "title" && key !== "senseHint") ||
        (target.senseHint !== undefined &&
          typeof target.senseHint !== "string")) {
        throw new Error("AI 訊息格式錯誤。");
      }
      return {
        title: target.title.trim(),
        ...(typeof target.senseHint === "string" && target.senseHint.trim()
          ? { senseHint: target.senseHint.trim() }
          : {})
      };
    });
  }
  const extras = {
    ...(intent ? { intent } : {}),
    ...(isExplanationLanguage(value.explanationLanguage)
      ? { explanationLanguage: value.explanationLanguage }
      : {}),
    ...(learningItemTargets ? { learningItemTargets } : {})
  };
  if (value.context === undefined) return { text: value.text, ...extras };
  if (!isObject(value.context)) throw new Error("AI 上下文格式錯誤。");
  const context: NonNullable<SendChatMessageInput["context"]> = {};
  for (const key of ["bookTitle", "chapterTitle", "readingSegment"] as const) {
    const field = value.context[key];
    if (field !== undefined && typeof field !== "string") {
      throw new Error("AI 上下文格式錯誤。");
    }
    if (typeof field === "string") context[key] = field;
  }
  return { text: value.text, ...extras, context };
}

function parseConversationId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AI 對話識別碼格式錯誤。");
  }
  return value;
}

function parseDraftUpdate(value: unknown): UpdateLearningItemDraftInput {
  if (!isObject(value) || !nonEmptyString(value.batchId) ||
    !nonEmptyString(value.draftId) || !nonEmptyString(value.title) ||
    !validItemType(value.itemType) || !validCefr(value.cefr) ||
    !nonEmptyString(value.sense) || !nonEmptyString(value.markdownContent)) {
    throw new Error("學習項目草稿更新格式錯誤。");
  }
  return {
    batchId: value.batchId.trim(),
    draftId: value.draftId.trim(),
    title: value.title.trim(),
    itemType: value.itemType,
    cefr: value.cefr,
    sense: value.sense.trim(),
    markdownContent: value.markdownContent.trim()
  };
}

function parseDraftState(value: unknown): {
  batchId: string;
  draftId: string;
  state: "included" | "excluded";
} {
  if (!isObject(value) || !nonEmptyString(value.batchId) ||
    !nonEmptyString(value.draftId) ||
    (value.state !== "included" && value.state !== "excluded")) {
    throw new Error("學習項目草稿狀態格式錯誤。");
  }
  return {
    batchId: value.batchId.trim(),
    draftId: value.draftId.trim(),
    state: value.state
  };
}

function parseRestoreMatch(value: unknown) {
  if (!isObject(value) || !nonEmptyString(value.batchId) ||
    !nonEmptyString(value.itemId)) {
    throw new Error("學習項目還原格式錯誤。");
  }
  return {
    batchId: value.batchId.trim(),
    itemId: value.itemId.trim()
  };
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
  ipc.handle("chat:retry-learning-item-preparation", (_event, messageId) => {
    return controller.retryLearningItemPreparation(
      parseConversationId(messageId)
    );
  });
  ipc.handle("chat:update-learning-item-draft", (_event, input) => {
    return controller.updateLearningItemDraft(parseDraftUpdate(input));
  });
  ipc.handle("chat:set-learning-item-draft-state", (_event, input) => {
    const parsed = parseDraftState(input);
    return controller.setLearningItemDraftState(
      parsed.batchId,
      parsed.draftId,
      parsed.state
    );
  });
  ipc.handle("chat:abandon-learning-item-batch", (_event, batchId) => {
    return controller.abandonLearningItemBatch(parseConversationId(batchId));
  });
  ipc.handle("chat:submit-learning-item-batch", (_event, batchId) => {
    return controller.submitLearningItemBatch(parseConversationId(batchId));
  });
  ipc.handle("chat:restore-learning-item-match", (_event, input) => {
    const parsed = parseRestoreMatch(input);
    return controller.restoreLearningItemMatch(parsed.batchId, parsed.itemId);
  });
  return controller.onStateChanged(publish);
}
