import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "../shared/chat-contracts";

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
  version: 1;
  selectedConversationId: string | null;
  conversations: StoredChatConversation[];
}

export interface ChatConversationStore {
  load(): StoredChatState;
  save(state: StoredChatState): void;
}

const emptyState = (): StoredChatState => ({
  version: 1,
  selectedConversationId: null,
  conversations: []
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMessage(value: unknown): ChatMessage {
  const status = isObject(value) ? value.status : undefined;
  if (!isObject(value) || typeof value.id !== "string" ||
    !(typeof value.turnId === "string" || value.turnId === null) ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.text !== "string" ||
    (status !== "streaming" && status !== "completed" && status !== "failed")) {
    throw new Error("本機 AI 對話紀錄格式錯誤。");
  }
  return {
    id: value.id,
    turnId: value.turnId,
    role: value.role,
    text: value.text,
    status: status === "streaming" ? "failed" : status
  };
}

function parseSource(value: unknown): StoredConversationSource | null {
  if (value === null) return null;
  if (!isObject(value)) throw new Error("本機 AI 對話紀錄格式錯誤。");
  const source: StoredConversationSource = {};
  if (value.bookTitle !== undefined) {
    if (typeof value.bookTitle !== "string") {
      throw new Error("本機 AI 對話紀錄格式錯誤。");
    }
    source.bookTitle = value.bookTitle;
  }
  if (value.chapterTitle !== undefined) {
    if (typeof value.chapterTitle !== "string") {
      throw new Error("本機 AI 對話紀錄格式錯誤。");
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
    throw new Error("本機 AI 對話紀錄格式錯誤。");
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
  if (!isObject(value) || value.version !== 1 ||
    !(typeof value.selectedConversationId === "string" ||
      value.selectedConversationId === null) ||
    !Array.isArray(value.conversations)) {
    throw new Error("本機 AI 對話紀錄格式錯誤。");
  }
  return {
    version: 1,
    selectedConversationId: value.selectedConversationId,
    conversations: value.conversations.map(parseConversation)
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
      if (error instanceof Error && error.message.includes("AI 對話紀錄")) {
        throw error;
      }
      throw new Error("無法讀取本機 AI 對話紀錄。", { cause: error });
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
