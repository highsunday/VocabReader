import { EventEmitter } from "node:events";
import type {
  ChatMessage,
  ChatSnapshot,
  ConnectionPhase,
  SendChatMessageInput
} from "../shared/contracts";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";

interface ChatControllerOptions {
  createClient(): CodexAppServerClient;
  workingDirectory: string;
}

const isolationConfig = Object.freeze({
  "skills.include_instructions": false,
  "skills.bundled.enabled": false,
  "features.plugins": false,
  "features.apps": false,
  "features.memories": false,
  web_search: "disabled"
});

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function threadIdFrom(value: unknown): string | undefined {
  return object(value) && object(value.thread) && typeof value.thread.id === "string"
    ? value.thread.id
    : undefined;
}

function turnIdFrom(value: unknown): string | undefined {
  return object(value) && object(value.turn) && typeof value.turn.id === "string"
    ? value.turn.id
    : undefined;
}

export function composeCodexInput(input: SendChatMessageInput): string {
  const question = input.text.trim();
  const context = input.context;
  const contextLines = [
    context?.bookTitle ? `Book: ${context.bookTitle}` : "",
    context?.chapterTitle ? `Chapter: ${context.chapterTitle}` : "",
    context?.readingSegment?.trim()
      ? `Current START/END reading segment:\n${context.readingSegment.trim()}`
      : ""
  ].filter(Boolean);
  if (!contextLines.length) return question;
  return [
    "The reader explicitly provided this limited book context.",
    "For claims about the book, use only this segment and prior segments explicitly provided in this conversation.",
    ...contextLines,
    "",
    `User question: ${question}`
  ].join("\n");
}

export class ChatController {
  readonly #options: ChatControllerOptions;
  readonly #events = new EventEmitter();
  readonly #messages: ChatMessage[] = [];
  #client: CodexAppServerClient | undefined;
  #unsubscribeNotification: (() => void) | undefined;
  #unsubscribeExit: (() => void) | undefined;
  #connection: ConnectionPhase = "disconnected";
  #connectionDetail = "Codex is not connected.";
  #account: ChatSnapshot["account"] = null;
  #threadId: string | null = null;
  #activeTurnId: string | null = null;
  #connectPromise: Promise<ChatSnapshot> | undefined;

  constructor(options: ChatControllerOptions) {
    this.#options = options;
  }

  getSnapshot(): ChatSnapshot {
    return {
      connection: this.#connection,
      connectionDetail: this.#connectionDetail,
      account: this.#account ? { ...this.#account } : null,
      threadId: this.#threadId,
      activeTurnId: this.#activeTurnId,
      messages: structuredClone(this.#messages)
    };
  }

  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void {
    this.#events.on("state", listener);
    return () => this.#events.off("state", listener);
  }

  connect(): Promise<ChatSnapshot> {
    if (this.#connection === "ready") return Promise.resolve(this.getSnapshot());
    if (this.#connectPromise) return this.#connectPromise;
    this.#disposeClient();
    this.#setConnection("connecting", "Starting Codex app-server…");
    const client = this.#options.createClient();
    this.#client = client;
    this.#unsubscribeNotification = client.onNotification((notification) =>
      this.#handleNotification(notification)
    );
    this.#unsubscribeExit = client.onExit((error) => {
      if (this.#client !== client) return;
      this.#client = undefined;
      this.#activeTurnId = null;
      this.#setConnection("error", error.message);
    });

    this.#connectPromise = (async () => {
      try {
        await client.initialize({
          name: "reader_ai_range_chat_example",
          title: "Reader AI Range Chat Example",
          version: "0.1.0"
        });
        const account = await client.readAccount();
        if (this.#client !== client) return this.getSnapshot();
        if (!account.account) {
          this.#account = null;
          this.#setConnection(
            "auth-required",
            "Sign in to Codex or ChatGPT on this computer, then restart the example."
          );
          return this.getSnapshot();
        }
        this.#account = { ...account.account };
        this.#setConnection(
          "ready",
          `Connected as ${account.account.email ?? account.account.type}`
        );
        return this.getSnapshot();
      } catch (error) {
        if (this.#client === client) {
          this.#account = null;
          this.#setConnection(
            "error",
            error instanceof Error ? error.message : "Codex connection failed."
          );
          this.#disposeClient();
        }
        return this.getSnapshot();
      } finally {
        this.#connectPromise = undefined;
      }
    })();
    return this.#connectPromise;
  }

  async sendMessage(input: SendChatMessageInput): Promise<ChatSnapshot> {
    const question = input.text.trim();
    if (!question) throw new Error("Enter a question.");
    if (this.#activeTurnId) throw new Error("Wait for the current answer to finish.");
    if (this.#connection !== "ready" || !this.#client) await this.connect();
    if (this.#connection !== "ready" || !this.#client) {
      throw new Error(this.#connectionDetail);
    }
    const client = this.#client;
    if (!this.#threadId) {
      const response = await client.request("thread/start", {
        cwd: this.#options.workingDirectory,
        approvalPolicy: "never",
        sandbox: "read-only",
        threadSource: "user",
        config: isolationConfig,
        environments: [],
        selectedCapabilityRoots: [],
        developerInstructions: [
          "You help a reader understand a book's ideas, arguments, and structure.",
          "Treat START/END reading segments as the only authoritative book text provided by the reader.",
          "Never claim access to text outside explicitly supplied segments.",
          "Do not use tools, shell commands, files, apps, plugins, skills, memories, or web search."
        ].join(" ")
      });
      const threadId = threadIdFrom(response);
      if (!threadId) throw new Error("Codex did not return a thread id.");
      this.#threadId = threadId;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${this.#messages.length}`,
      turnId: null,
      role: "user",
      text: question,
      status: "completed"
    };
    this.#messages.push(userMessage);
    this.#activeTurnId = "starting";
    this.#emit();
    try {
      const response = await client.request("turn/start", {
        threadId: this.#threadId,
        input: [{ type: "text", text: composeCodexInput(input), text_elements: [] }]
      });
      const turnId = turnIdFrom(response);
      if (!turnId) throw new Error("Codex did not return a turn id.");
      userMessage.turnId = turnId;
      if (this.#activeTurnId === "starting") this.#activeTurnId = turnId;
      this.#emit();
      return this.getSnapshot();
    } catch (error) {
      this.#activeTurnId = null;
      this.#emit();
      throw error;
    }
  }

  close(): void {
    this.#disposeClient();
    this.#connection = "disconnected";
    this.#account = null;
    this.#activeTurnId = null;
  }

  #handleNotification(notification: CodexNotification): void {
    const params = notification.params;
    if (!object(params) || params.threadId !== this.#threadId) return;
    if (notification.method === "turn/started" && object(params.turn) &&
      typeof params.turn.id === "string") {
      this.#activeTurnId = params.turn.id;
      this.#emit();
      return;
    }
    if (notification.method === "item/agentMessage/delta" &&
      typeof params.turnId === "string" && typeof params.itemId === "string" &&
      typeof params.delta === "string") {
      let message = this.#messages.find(({ id }) => id === params.itemId);
      if (!message) {
        message = {
          id: params.itemId,
          turnId: params.turnId,
          role: "assistant",
          text: "",
          status: "streaming"
        };
        this.#messages.push(message);
      }
      message.text += params.delta;
      this.#emit();
      return;
    }
    if (notification.method === "item/completed" &&
      typeof params.turnId === "string" && object(params.item) &&
      params.item.type === "agentMessage" && typeof params.item.id === "string" &&
      typeof params.item.text === "string") {
      const completedItem = params.item as {
        type: "agentMessage";
        id: string;
        text: string;
      };
      let message = this.#messages.find(({ id }) => id === completedItem.id);
      if (!message) {
        message = {
          id: completedItem.id,
          turnId: params.turnId,
          role: "assistant",
          text: completedItem.text,
          status: "completed"
        };
        this.#messages.push(message);
      } else {
        message.text = completedItem.text;
        message.status = "completed";
      }
      this.#emit();
      return;
    }
    if (notification.method === "turn/completed" && object(params.turn) &&
      typeof params.turn.id === "string") {
      const completed = params.turn.status === "completed";
      for (const message of this.#messages) {
        if (message.role === "assistant" && message.turnId === params.turn.id) {
          message.status = completed ? "completed" : "failed";
        }
      }
      this.#activeTurnId = null;
      this.#emit();
    }
  }

  #setConnection(connection: ConnectionPhase, detail: string): void {
    this.#connection = connection;
    this.#connectionDetail = detail;
    this.#emit();
  }

  #emit(): void {
    this.#events.emit("state", this.getSnapshot());
  }

  #disposeClient(): void {
    this.#unsubscribeNotification?.();
    this.#unsubscribeExit?.();
    this.#unsubscribeNotification = undefined;
    this.#unsubscribeExit = undefined;
    const client = this.#client;
    this.#client = undefined;
    client?.close();
  }
}
