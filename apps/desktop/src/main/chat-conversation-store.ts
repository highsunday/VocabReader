import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import type {
  ChatMessage,
  LearningItemPreparation
} from "../shared/chat-contracts";
import {
  learningItemBatchFromUnknown,
  learningItemInvitationFromUnknown
} from "./learning-item-artifacts";

export interface StoredConversationSource {
  bookTitle?: string;
  chapterTitle?: string;
}

export interface StoredChatConversation {
  id: string;
  threadId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  source: StoredConversationSource | null;
  messages: ChatMessage[];
}

export interface StoredChatState {
  version: 1 | 2;
  selectedConversationId: string | null;
  conversations: StoredChatConversation[];
}

export interface ChatConversationStore {
  load(): StoredChatState;
  save(state: StoredChatState): void;
}

export const MAX_STORED_CHAT_CONVERSATIONS = 10;

export function limitStoredChatConversations(
  conversations: StoredChatConversation[]
): StoredChatConversation[] {
  if (conversations.length <= MAX_STORED_CHAT_CONVERSATIONS) {
    return conversations;
  }
  const retainedIndexes = new Set(conversations
    .map((conversation, index) => ({ conversation, index }))
    .sort((left, right) =>
      right.conversation.updatedAt - left.conversation.updatedAt ||
      right.conversation.createdAt - left.conversation.createdAt ||
      right.index - left.index)
    .slice(0, MAX_STORED_CHAT_CONVERSATIONS)
    .map(({ index }) => index));
  return conversations.filter(
    (_conversation, index) => retainedIndexes.has(index)
  );
}

const emptyState = (): StoredChatState => ({
  version: 2,
  selectedConversationId: null,
  conversations: []
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLearningItemPreparation(
  value: unknown
): LearningItemPreparation {
  if (!isObject(value) ||
    (value.status !== "preparing" &&
      value.status !== "failed" &&
      value.status !== "completed")) {
    throw new Error("Invalid local AI conversation history.");
  }
  const targets = learningItemInvitationFromUnknown(value).targets;
  const explanationLanguage = value.explanationLanguage;
  if (explanationLanguage !== undefined &&
    explanationLanguage !== "source" &&
    explanationLanguage !== "zh-TW" &&
    explanationLanguage !== "en" &&
    explanationLanguage !== "ja") {
    throw new Error("Invalid local AI conversation history.");
  }
  if (value.error !== undefined && typeof value.error !== "string") {
    throw new Error("Invalid local AI conversation history.");
  }
  const interrupted = value.status === "preparing";
  const status: LearningItemPreparation["status"] = interrupted
    ? "failed"
    : value.status;
  const storedError = typeof value.error === "string"
    ? value.error.trim()
    : "";
  return {
    status,
    targets,
    ...(typeof explanationLanguage === "string"
      ? {
          explanationLanguage:
            explanationLanguage as LearningItemPreparation[
              "explanationLanguage"
            ]
        }
      : {}),
    ...((interrupted || storedError)
      ? {
          error: interrupted
            ? "The previous card preparation did not finish. Please retry."
            : storedError
        }
      : {})
  };
}

function parseMessage(value: unknown): ChatMessage {
  const status = isObject(value) ? value.status : undefined;
  if (!isObject(value) || typeof value.id !== "string" ||
    !(typeof value.turnId === "string" || value.turnId === null) ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.text !== "string" ||
    (status !== "streaming" && status !== "completed" && status !== "failed")) {
    throw new Error("Invalid local AI conversation history.");
  }
  const message: ChatMessage = {
    id: value.id,
    turnId: value.turnId,
    role: value.role,
    text: value.text,
    status: status === "streaming" ? "failed" : status
  };
  if (value.learningItemBatch !== undefined) {
    message.learningItemBatch = learningItemBatchFromUnknown(
      value.learningItemBatch
    );
  }
  if (value.learningItemInvitation !== undefined) {
    message.learningItemInvitation = learningItemInvitationFromUnknown(
      value.learningItemInvitation
    );
  }
  if (value.learningItemRequest !== undefined) {
    message.learningItemRequest = learningItemInvitationFromUnknown(
      value.learningItemRequest
    );
  }
  if (value.learningItemPreparation !== undefined) {
    message.learningItemPreparation = parseLearningItemPreparation(
      value.learningItemPreparation
    );
  }
  if (value.artifactError !== undefined) {
    if (typeof value.artifactError !== "string") {
      throw new Error("Invalid local AI conversation history.");
    }
    message.artifactError = value.artifactError;
  }
  return message;
}

function parseSource(value: unknown): StoredConversationSource | null {
  if (value === null) return null;
  if (!isObject(value)) throw new Error("Invalid local AI conversation history.");
  const source: StoredConversationSource = {};
  if (value.bookTitle !== undefined) {
    if (typeof value.bookTitle !== "string") {
      throw new Error("Invalid local AI conversation history.");
    }
    source.bookTitle = value.bookTitle;
  }
  if (value.chapterTitle !== undefined) {
    if (typeof value.chapterTitle !== "string") {
      throw new Error("Invalid local AI conversation history.");
    }
    source.chapterTitle = value.chapterTitle;
  }
  return source;
}

function parseConversation(value: unknown): StoredChatConversation {
  if (!isObject(value) || typeof value.id !== "string" ||
    typeof value.threadId !== "string" || typeof value.title !== "string" ||
    !isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt) ||
    !Array.isArray(value.messages)) {
    throw new Error("Invalid local AI conversation history.");
  }
  return {
    id: value.id,
    threadId: value.threadId,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    source: parseSource(value.source),
    messages: value.messages.map(parseMessage)
  };
}

function parseState(value: unknown): StoredChatState {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2) ||
    !(typeof value.selectedConversationId === "string" ||
      value.selectedConversationId === null) ||
    !Array.isArray(value.conversations)) {
    throw new Error("Invalid local AI conversation history.");
  }
  const conversations = limitStoredChatConversations(
    value.conversations.map(parseConversation)
  );
  const selectedConversationId = value.selectedConversationId &&
    conversations.some(({ id }) => id === value.selectedConversationId)
    ? value.selectedConversationId
    : null;
  return {
    version: 2,
    selectedConversationId,
    conversations
  };
}

export class LocalChatConversationStore implements ChatConversationStore {
  readonly #directory: string;
  readonly #path: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#path = join(directory, "conversations.json");
  }

  load(): StoredChatState {
    try {
      return parseState(JSON.parse(readFileSync(this.#path, "utf8")));
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return emptyState();
      if (error instanceof Error && error.message.includes("AI conversation history")) {
        throw error;
      }
      throw new Error("Unable to load local AI conversation history.", { cause: error });
    }
  }

  save(state: StoredChatState): void {
    const validated = parseState(state);
    mkdirSync(this.#directory, { recursive: true });
    const temporaryPath = join(
      this.#directory,
      `conversations.json.tmp-${process.pid}-${Date.now()}`
    );
    writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    renameSync(temporaryPath, this.#path);
  }
}
