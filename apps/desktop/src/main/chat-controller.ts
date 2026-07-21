import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  AiUsageAllowance,
  AiUsageAllowanceWindow,
  ChatMessage,
  ChatSnapshot,
  ConversationModel,
  ConnectionPhase,
  SendChatMessageInput
} from "../shared/chat-contracts";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";
import type {
  ChatConversationStore,
  StoredChatConversation,
  StoredChatState
} from "./chat-conversation-store";

interface ChatControllerOptions {
  createClient(): CodexAppServerClient;
  workingDirectory: string;
  annotationExplanationSkillPath: string;
  annotationExplanationSkillInstructions: string;
  readingComprehensionSkillPath: string;
  readingComprehensionSkillInstructions: string;
  conversationStore?: ChatConversationStore;
  createConversationId?(): string;
  now?(): number;
}

const isolationConfig = Object.freeze({
  "skills.include_instructions": false,
  "skills.bundled.enabled": false,
  "features.plugins": false,
  "features.apps": false,
  "features.memories": false,
  web_search: "disabled"
});

export function composeDeveloperInstructions(
  annotationExplanationSkillInstructions: string,
  readingComprehensionSkillInstructions: string
): string {
  const annotationSkill = annotationExplanationSkillInstructions.trim();
  const readingSkill = readingComprehensionSkillInstructions.trim();
  if (!annotationSkill) {
    throw new Error("App 內建的標記解析 skill 內容不可為空。");
  }
  if (!readingSkill) {
    throw new Error("App 內建的閱讀理解 skill 內容不可為空。");
  }
  return [
    "You are the AI Conversation Panel in an English-learning EPUB reader.",
    "Answer in the language used by the user unless they ask otherwise.",
    "Use only the explicitly provided reading segment and prior conversation.",
    "Never claim knowledge of text outside the provided reading segment.",
    "Do not run tools, read arbitrary files, write files, or use the network.",
    "The only app-provided skills available are explain-reader-annotations and practice-reading-comprehension.",
    "Their complete instructions are already loaded below; do not discover, load, or use any other skill.",
    "Apply explain-reader-annotations only when the user input contains $explain-reader-annotations.",
    "Apply practice-reading-comprehension when the user input contains $practice-reading-comprehension. After this skill creates a quiz, continue using its assessment workflow when the user submits answers to that quiz in the same conversation, even without the marker. Do not apply it to unrelated turns.",
    "<app-provided-skill name=\"explain-reader-annotations\">",
    annotationSkill,
    "</app-provided-skill>",
    "<app-provided-skill name=\"practice-reading-comprehension\">",
    readingSkill,
    "</app-provided-skill>"
  ].join("\n");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function threadIdFrom(value: unknown): string | undefined {
  return isObject(value) && isObject(value.thread) &&
    typeof value.thread.id === "string"
    ? value.thread.id
    : undefined;
}

function turnIdFrom(value: unknown): string | undefined {
  return isObject(value) && isObject(value.turn) &&
    typeof value.turn.id === "string"
    ? value.turn.id
    : undefined;
}

function modelFrom(value: unknown): ConversationModel | null {
  if (!isObject(value) || value.hidden === true) return null;
  if (typeof value.id !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.defaultReasoningEffort !== "string" ||
    !Array.isArray(value.supportedReasoningEfforts) ||
    typeof value.isDefault !== "boolean") {
    throw new Error("Codex 模型目錄包含無法辨識的模型。");
  }
  const supportsDefault = value.supportedReasoningEfforts.some(
    (option) => isObject(option) &&
      option.reasoningEffort === value.defaultReasoningEffort
  );
  if (!supportsDefault) {
    throw new Error("Codex 模型的預設推理強度不可用。");
  }
  return {
    id: value.id,
    displayName: value.displayName,
    defaultReasoningEffort: value.defaultReasoningEffort
  };
}

function unavailableAllowance(detail: string): AiUsageAllowance {
  return { phase: "unavailable", fiveHour: null, weekly: null, detail };
}

function allowanceWindow(
  value: unknown
): (AiUsageAllowanceWindow & { windowDurationMins: number }) | null {
  if (!isObject(value) ||
    typeof value.usedPercent !== "number" ||
    !Number.isFinite(value.usedPercent) ||
    typeof value.windowDurationMins !== "number" ||
    !Number.isFinite(value.windowDurationMins) ||
    typeof value.resetsAt !== "number" ||
    !Number.isFinite(value.resetsAt)) {
    return null;
  }
  return {
    remainingPercent: Math.round(
      Math.max(0, Math.min(100, 100 - value.usedPercent))
    ),
    windowDurationMins: value.windowDurationMins,
    resetsAt: Math.trunc(value.resetsAt)
  };
}

function allowanceFromSnapshot(value: unknown): AiUsageAllowance {
  if (!isObject(value)) {
    throw new Error("Codex 額度回傳了無法辨識的資料。");
  }
  const windows = [allowanceWindow(value.primary), allowanceWindow(value.secondary)];
  const fiveHour = windows.find(
    (window) => window?.windowDurationMins === 300
  ) ?? null;
  const weekly = windows.find(
    (window) => window?.windowDurationMins === 10_080
  ) ?? null;
  return {
    phase: fiveHour || weekly ? "available" : "unavailable",
    fiveHour: fiveHour
      ? {
          remainingPercent: fiveHour.remainingPercent,
          resetsAt: fiveHour.resetsAt
        }
      : null,
    weekly: weekly
      ? {
          remainingPercent: weekly.remainingPercent,
          resetsAt: weekly.resetsAt
        }
      : null,
    detail: fiveHour && weekly
      ? "已取得帳戶共用額度。"
      : "部分使用額度無法取得。"
  };
}

function allowanceFromResult(value: unknown): AiUsageAllowance {
  if (!isObject(value)) {
    throw new Error("Codex 額度回傳了無法辨識的資料。");
  }
  const byLimitId = isObject(value.rateLimitsByLimitId)
    ? value.rateLimitsByLimitId
    : null;
  return allowanceFromSnapshot(
    byLimitId && isObject(byLimitId.codex)
      ? byLimitId.codex
      : value.rateLimits
  );
}

function mergeAllowance(
  current: AiUsageAllowance,
  update: AiUsageAllowance
): AiUsageAllowance {
  const fiveHour = update.fiveHour ?? current.fiveHour;
  const weekly = update.weekly ?? current.weekly;
  return {
    phase: fiveHour || weekly ? "available" : update.phase,
    fiveHour,
    weekly,
    detail: fiveHour && weekly ? "已取得帳戶共用額度。" : update.detail
  };
}

export function composeCodexInput(input: SendChatMessageInput): string {
  const text = input.text.trim();
  const context = input.context;
  const contextLines = [
    context?.bookTitle ? `書籍：${context.bookTitle}` : "",
    context?.chapterTitle ? `章節：${context.chapterTitle}` : "",
    context?.readingSegment?.trim()
      ? `目前閱讀區段：\n${context.readingSegment.trim()}`
      : ""
  ].filter(Boolean);
  const base = contextLines.length === 0 ? [text] : [
    "以下是閱讀器明確提供的有限上下文。請勿假設區段之外的書籍內容：",
    ...(context?.readingSegment
      ? ["這是目前版本，取代這段 AI 對話先前的閱讀區段與標記上下文。"]
      : []),
    ...contextLines,
    "",
    `使用者問題：${text}`
  ];
  const language = {
    source: "Use the same language as the current reading segment",
    "zh-TW": "Traditional Chinese",
    en: "English",
    ja: "Japanese"
  }[input.explanationLanguage ?? "source"];
  if (input.intent === "practiceReading") {
    return [
      "$practice-reading-comprehension",
      ...base,
      "",
      `Quiz language: ${language}.`,
      `Answer language for open-ended questions: ${language}.`,
      "Do not impose a sentence-count requirement on open-ended answers.",
      "Do not use or infer content outside the current reading segment.",
      "Use the App-provided practice-reading-comprehension workflow for quiz creation and later grading."
    ].join("\n");
  }
  if (input.intent !== "explainAnnotations") return base.join("\n");
  const hasAnnotations = Boolean(
    context?.readingSegment?.includes("<reader-annotation ")
  );
  return [
    "$explain-reader-annotations",
    ...base,
    "",
    `Explanation language: ${language}.`,
    ...(!hasAnnotations
      ? ["The current reading segment contains no reader annotations."]
      : [])
  ].join("\n");
}

function composeTurnInput(
  input: SendChatMessageInput,
  annotationSkillPath: string,
  readingSkillPath: string
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [{
    type: "text",
    text: composeCodexInput(input),
    text_elements: []
  }];
  if (input.intent === "explainAnnotations") {
    items.push({
      type: "skill",
      name: "explain-reader-annotations",
      path: annotationSkillPath
    });
  } else if (input.intent === "practiceReading") {
    items.push({
      type: "skill",
      name: "practice-reading-comprehension",
      path: readingSkillPath
    });
  }
  return items;
}

export class ChatController {
  readonly #options: ChatControllerOptions;
  readonly #developerInstructions: string;
  readonly #events = new EventEmitter();
  #conversations: StoredChatConversation[] = [];
  #activeConversationId: string | null = null;
  #messages: ChatMessage[] = [];
  #client: CodexAppServerClient | undefined;
  #unsubscribeNotification: (() => void) | undefined;
  #unsubscribeExit: (() => void) | undefined;
  #connection: ConnectionPhase = "disconnected";
  #connectionDetail = "尚未連線 Codex。";
  #account: ChatSnapshot["account"] = null;
  #threadId: string | null = null;
  #resumedThreadId: string | null = null;
  #activeTurnId: string | null = null;
  #managementBusy = false;
  #conversationError: string | null = null;
  #allowance = unavailableAllowance("尚未取得 AI 使用額度。");
  #models: ConversationModel[] = [];
  #selectedModelId: string | null = null;
  #modelCatalogDetail = "尚未取得可用模型。";
  #stopRequested = false;
  #stopPromise: Promise<ChatSnapshot> | undefined;
  #turnReadyPromise: Promise<string | null> | undefined;
  #resolveTurnReady: ((turnId: string | null) => void) | undefined;
  #connectPromise: Promise<ChatSnapshot> | undefined;

  constructor(options: ChatControllerOptions) {
    this.#options = options;
    this.#developerInstructions = composeDeveloperInstructions(
      options.annotationExplanationSkillInstructions,
      options.readingComprehensionSkillInstructions
    );
    try {
      const stored = options.conversationStore?.load();
      if (stored) {
        this.#conversations = stored.conversations;
        const selected = stored.selectedConversationId
          ? this.#conversations.find(
              (conversation) => conversation.id === stored.selectedConversationId
            )
          : undefined;
        if (selected) this.#activateConversation(selected);
      }
    } catch (error) {
      this.#conversationError = error instanceof Error
        ? error.message
        : "無法讀取本機 AI 對話紀錄。";
    }
  }

  getSnapshot(): ChatSnapshot {
    return {
      connection: this.#connection,
      connectionDetail: this.#connectionDetail,
      account: this.#account ? { ...this.#account } : null,
      threadId: this.#threadId,
      activeTurnId: this.#activeTurnId,
      allowance: structuredClone(this.#allowance),
      messages: structuredClone(this.#messages),
      conversations: this.#conversations
        .map(({ id, title, createdAt, updatedAt, source }) => ({
          id,
          title,
          createdAt,
          updatedAt,
          source: source ? { ...source } : null
        }))
        .sort((left, right) => right.updatedAt - left.updatedAt),
      activeConversationId: this.#activeConversationId,
      managementBusy: this.#managementBusy,
      conversationError: this.#conversationError,
      models: structuredClone(this.#models),
      selectedModelId: this.#selectedModelId,
      modelCatalogDetail: this.#modelCatalogDetail,
      stopRequested: this.#stopRequested
    };
  }

  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void {
    this.#events.on("state", listener);
    return () => this.#events.off("state", listener);
  }

  startNewConversation(): ChatSnapshot {
    this.#assertManagementAvailable();
    this.#activeConversationId = null;
    this.#threadId = null;
    this.#resumedThreadId = null;
    this.#messages = [];
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  selectConversation(conversationId: string): ChatSnapshot {
    this.#assertManagementAvailable();
    const conversation = this.#conversations.find(
      (candidate) => candidate.id === conversationId
    );
    if (!conversation) throw new Error("找不到這筆 AI 對話。");
    this.#activateConversation(conversation);
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  selectModel(modelId: string): ChatSnapshot {
    this.#assertManagementAvailable();
    const model = this.#models.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error("選取的 AI 模型目前不可用。");
    this.#selectedModelId = model.id;
    this.#emit();
    return this.getSnapshot();
  }

  stopResponse(): Promise<ChatSnapshot> {
    if (this.#stopPromise) return this.#stopPromise;
    if (this.#stopRequested) return Promise.resolve(this.getSnapshot());
    if (!this.#activeTurnId || !this.#client) {
      return Promise.reject(new Error("目前沒有可停止的 AI 回覆。"));
    }
    const client = this.#client;
    this.#stopRequested = true;
    this.#emit();
    this.#stopPromise = (async () => {
      const turnId = this.#activeTurnId === "starting"
        ? await this.#turnReadyPromise
        : this.#activeTurnId;
      const threadId = this.#threadId;
      if (!turnId || turnId === "starting" || !threadId ||
        !this.#activeTurnId) return this.getSnapshot();
      await client.request("turn/interrupt", { threadId, turnId });
      return this.getSnapshot();
    })()
      .catch((error) => {
        this.#stopRequested = false;
        this.#emit();
        throw error;
      })
      .finally(() => {
        this.#stopPromise = undefined;
      });
    return this.#stopPromise;
  }

  async removeConversation(conversationId: string): Promise<ChatSnapshot> {
    this.#assertManagementAvailable();
    const conversation = this.#conversations.find(
      (candidate) => candidate.id === conversationId
    );
    if (!conversation) throw new Error("找不到這筆 AI 對話。");
    if (this.#connection !== "ready" || !this.#client) await this.connect();
    if (this.#connection !== "ready" || !this.#client) {
      throw new Error(this.#connectionDetail);
    }

    this.#managementBusy = true;
    this.#emit();
    let archived = false;
    const previous = {
      conversations: this.#conversations,
      activeConversationId: this.#activeConversationId,
      threadId: this.#threadId,
      resumedThreadId: this.#resumedThreadId,
      messages: this.#messages
    };
    try {
      await this.#client.request("thread/archive", {
        threadId: conversation.threadId
      });
      archived = true;
      this.#conversations = this.#conversations.filter(
        (candidate) => candidate.id !== conversationId
      );
      if (this.#activeConversationId === conversationId) {
        this.#activeConversationId = null;
        this.#threadId = null;
        this.#resumedThreadId = null;
        this.#messages = [];
      }
      this.#persist();
    } catch (error) {
      if (archived) {
        this.#conversations = previous.conversations;
        this.#activeConversationId = previous.activeConversationId;
        this.#threadId = previous.threadId;
        this.#resumedThreadId = previous.resumedThreadId;
        this.#messages = previous.messages;
        try {
          await this.#client.request("thread/unarchive", {
            threadId: conversation.threadId
          });
        } catch {
          // Keep the local record visible when cross-system rollback is incomplete.
        }
      }
      this.#conversationError = error instanceof Error
        ? error.message
        : "無法移除 AI 對話。";
      throw error;
    } finally {
      this.#managementBusy = false;
      this.#emit();
    }
    return this.getSnapshot();
  }

  connect(): Promise<ChatSnapshot> {
    if (this.#connection === "ready") {
      return Promise.resolve(this.getSnapshot());
    }
    if (this.#connectPromise) return this.#connectPromise;

    this.#disposeClient();
    this.#account = null;
    this.#allowance = unavailableAllowance("尚未取得 AI 使用額度。");
    this.#setConnection("connecting", "正在啟動 Codex…");
    const client = this.#options.createClient();
    this.#client = client;
    this.#unsubscribeNotification = client.onNotification((notification) => {
      this.#handleNotification(notification);
    });
    this.#unsubscribeExit = client.onExit((error) => {
      if (this.#client !== client) return;
      this.#client = undefined;
      this.#activeTurnId = null;
      this.#stopRequested = false;
      this.#setConnection("error", error.message);
    });

    this.#connectPromise = (async () => {
      try {
        await client.initialize({
          name: "lingoshelf",
          title: "LingoShelf",
          version: "0.1.0"
        });
        const account = await client.readAccount();
        if (this.#client !== client) return this.getSnapshot();
        if (!account.account) {
          this.#setConnection(
            "auth-required",
            "請先在這台電腦完成 Codex 或 ChatGPT 登入。"
          );
          return this.getSnapshot();
        }
        this.#account = account.account;
        this.#allowance = {
          phase: "loading",
          fiveHour: null,
          weekly: null,
          detail: "正在取得帳戶共用額度…"
        };
        this.#setConnection("ready", "Codex 已連線。");
        await Promise.all([
          this.#loadAllowance(client),
          this.#loadModelCatalog(client)
        ]);
        return this.getSnapshot();
      } catch (error) {
        if (this.#client === client) {
          this.#setConnection(
            "error",
            error instanceof Error ? error.message : "Codex 連線失敗。"
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
    const text = input.text.trim();
    if (!text) throw new Error("請輸入訊息。");
    if (this.#activeTurnId) throw new Error("請等待目前的 AI 回覆完成。");
    if (this.#connection !== "ready" || !this.#client) await this.connect();
    if (this.#connection !== "ready" || !this.#client) {
      throw new Error(this.#connectionDetail);
    }

    const client = this.#client;
    this.#activeTurnId = "starting";
    this.#stopRequested = false;
    this.#turnReadyPromise = new Promise((resolve) => {
      this.#resolveTurnReady = resolve;
    });
    this.#emit();

    try {
      if (this.#threadId && this.#resumedThreadId !== this.#threadId) {
        const resumed = await client.request("thread/resume", {
          threadId: this.#threadId,
          cwd: this.#options.workingDirectory,
          approvalPolicy: "never",
          sandbox: "read-only",
          config: isolationConfig,
          developerInstructions: this.#developerInstructions
        });
        const resumedThreadId = threadIdFrom(resumed);
        if (resumedThreadId !== this.#threadId) {
          throw new Error("Codex 無法恢復這筆 AI 對話。");
        }
        this.#resumedThreadId = resumedThreadId;
      } else if (!this.#threadId) {
        const threadResponse = await client.request("thread/start", {
          cwd: this.#options.workingDirectory,
          approvalPolicy: "never",
          sandbox: "read-only",
          threadSource: "user",
          config: isolationConfig,
          environments: [],
          selectedCapabilityRoots: [],
          ...(this.#selectedModelId
            ? { model: this.#selectedModelId }
            : {}),
          developerInstructions: this.#developerInstructions
        });
        const threadId = threadIdFrom(threadResponse);
        if (!threadId) throw new Error("Codex 未回傳對話識別碼。");
        this.#threadId = threadId;
        this.#resumedThreadId = threadId;
        const timestamp = this.#now();
        const conversation: StoredChatConversation = {
          id: this.#createConversationId(),
          threadId,
          title: this.#titleFrom(text),
          createdAt: timestamp,
          updatedAt: timestamp,
          source: this.#sourceFrom(input),
          messages: []
        };
        this.#conversations.push(conversation);
        this.#activateConversation(conversation, true);
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}-${this.#messages.length}`,
        turnId: null,
        role: "user",
        text,
        status: "completed"
      };
      this.#messages.push(userMessage);
      this.#touchActiveConversation(input);
      this.#persist();
      this.#emit();
      const response = await client.request("turn/start", {
        threadId: this.#threadId,
        ...this.#selectedModelSettings(),
        input: composeTurnInput(
          { ...input, text },
          this.#options.annotationExplanationSkillPath,
          this.#options.readingComprehensionSkillPath
        )
      });
      const turnId = turnIdFrom(response);
      if (!turnId) throw new Error("Codex 未回傳回答識別碼。");
      userMessage.turnId = turnId;
      if (this.#activeTurnId === "starting") this.#activeTurnId = turnId;
      this.#resolveTurnReady?.(turnId);
      this.#resolveTurnReady = undefined;
      this.#persist();
      this.#emit();
      return this.getSnapshot();
    } catch (error) {
      this.#resolveTurnReady?.(null);
      this.#resolveTurnReady = undefined;
      this.#activeTurnId = null;
      this.#stopRequested = false;
      this.#connectionDetail = error instanceof Error
        ? error.message
        : "無法送出訊息。";
      this.#emit();
      throw error;
    }
  }

  close(): void {
    this.#disposeClient();
    this.#connection = "disconnected";
    this.#connectionDetail = "Codex 連線已關閉。";
    this.#activeTurnId = null;
    this.#stopRequested = false;
  }

  #handleNotification(notification: CodexNotification): void {
    const params = notification.params;
    if (notification.method === "account/rateLimits/updated" &&
      isObject(params) && "rateLimits" in params) {
      try {
        this.#allowance = mergeAllowance(
          this.#allowance,
          allowanceFromSnapshot(params.rateLimits)
        );
        this.#emit();
      } catch {
        // Keep the last validated account allowance when a live update is malformed.
      }
      return;
    }
    if (!isObject(params) || typeof params.threadId !== "string" ||
      params.threadId !== this.#threadId) {
      return;
    }

    if (notification.method === "turn/started" && isObject(params.turn) &&
      typeof params.turn.id === "string") {
      this.#activeTurnId = params.turn.id;
      this.#emit();
      return;
    }

    if (notification.method === "item/agentMessage/delta" &&
      typeof params.turnId === "string" &&
      typeof params.itemId === "string" &&
      typeof params.delta === "string") {
      let message = this.#messages.find((item) => item.id === params.itemId);
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
      message.status = "streaming";
      this.#touchActiveConversation();
      this.#tryPersist();
      this.#emit();
      return;
    }

    if (notification.method === "item/completed" &&
      typeof params.turnId === "string" && isObject(params.item) &&
      params.item.type === "agentMessage" &&
      typeof params.item.id === "string" &&
      typeof params.item.text === "string") {
      const completedItem = params.item as {
        type: "agentMessage";
        id: string;
        text: string;
      };
      let message = this.#messages.find((item) => item.id === completedItem.id);
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
      this.#touchActiveConversation();
      this.#tryPersist();
      this.#emit();
      return;
    }

    if (notification.method === "turn/completed" && isObject(params.turn) &&
      typeof params.turn.id === "string") {
      const completed = params.turn.status === "completed";
      for (const message of this.#messages) {
        if (message.role === "assistant" && message.turnId === params.turn.id) {
          message.status = completed ? "completed" : "failed";
        }
      }
      this.#activeTurnId = null;
      this.#stopRequested = false;
      this.#resolveTurnReady?.(null);
      this.#resolveTurnReady = undefined;
      if (!completed) {
        this.#connectionDetail = isObject(params.turn.error) &&
          typeof params.turn.error.message === "string"
          ? params.turn.error.message
          : "AI 回覆未完成。";
      }
      this.#touchActiveConversation();
      this.#tryPersist();
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

  #assertManagementAvailable(): void {
    if (this.#activeTurnId || this.#managementBusy) {
      throw new Error("請等待目前的 AI 回覆完成。");
    }
  }

  #activateConversation(
    conversation: StoredChatConversation,
    alreadyResumed = false
  ): void {
    this.#activeConversationId = conversation.id;
    this.#threadId = conversation.threadId;
    this.#resumedThreadId = alreadyResumed ? conversation.threadId : null;
    this.#messages = conversation.messages;
  }

  #activeConversation(): StoredChatConversation | undefined {
    return this.#activeConversationId
      ? this.#conversations.find(
          (conversation) => conversation.id === this.#activeConversationId
        )
      : undefined;
  }

  #touchActiveConversation(input?: SendChatMessageInput): void {
    const conversation = this.#activeConversation();
    if (!conversation) return;
    conversation.updatedAt = this.#now();
    if (input) conversation.source = this.#sourceFrom(input);
  }

  #sourceFrom(input: SendChatMessageInput) {
    const bookTitle = input.context?.bookTitle?.trim();
    const chapterTitle = input.context?.chapterTitle?.trim();
    return bookTitle || chapterTitle
      ? {
          ...(bookTitle ? { bookTitle } : {}),
          ...(chapterTitle ? { chapterTitle } : {})
        }
      : null;
  }

  #titleFrom(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, 60) || "新對話";
  }

  #createConversationId(): string {
    return this.#options.createConversationId?.() ?? randomUUID();
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }

  #storedState(): StoredChatState {
    return {
      version: 1,
      selectedConversationId: this.#activeConversationId,
      conversations: this.#conversations
    };
  }

  #persist(): void {
    if (!this.#options.conversationStore) return;
    try {
      this.#options.conversationStore.save(this.#storedState());
      this.#conversationError = null;
    } catch (error) {
      this.#conversationError = error instanceof Error
        ? error.message
        : "無法保存本機 AI 對話紀錄。";
      throw error;
    }
  }

  #tryPersist(): void {
    try {
      this.#persist();
    } catch {
      // The snapshot exposes the persistence error without crashing notification flow.
    }
  }

  async #loadAllowance(client: CodexAppServerClient): Promise<void> {
    try {
      this.#allowance = allowanceFromResult(
        await client.request("account/rateLimits/read")
      );
    } catch (error) {
      this.#allowance = unavailableAllowance(
        error instanceof Error ? error.message : "AI 使用額度無法取得。"
      );
    }
    this.#emit();
  }

  async #loadModelCatalog(client: CodexAppServerClient): Promise<void> {
    try {
      const models: Array<ConversationModel & { isDefault?: boolean }> = [];
      let cursor: string | null = null;
      do {
        const response = await client.request("model/list", {
          cursor,
          includeHidden: false
        });
        if (!isObject(response) || !Array.isArray(response.data)) {
          throw new Error("Codex 模型目錄回傳了無法辨識的資料。");
        }
        for (const candidate of response.data) {
          const model = modelFrom(candidate);
          if (model) {
            models.push({
              ...model,
              isDefault: isObject(candidate) && candidate.isDefault === true
            });
          }
        }
        cursor = typeof response.nextCursor === "string"
          ? response.nextCursor
          : null;
      } while (cursor);
      if (models.length === 0) throw new Error("沒有可用的 AI 模型。");
      this.#models = models.map(({ isDefault: _isDefault, ...model }) => model);
      const selectedStillExists = this.#selectedModelId && models.some(
        (model) => model.id === this.#selectedModelId
      );
      if (!selectedStillExists) {
        this.#selectedModelId = models.find((model) => model.isDefault)?.id ??
          models[0]?.id ?? null;
      }
      this.#modelCatalogDetail = "已取得可用對話模型。";
    } catch (error) {
      this.#models = [];
      this.#selectedModelId = null;
      this.#modelCatalogDetail = error instanceof Error
        ? error.message
        : "無法取得可用的 AI 模型。";
    }
    this.#emit();
  }

  #selectedModelSettings(): { model: string; effort: string } | object {
    const model = this.#models.find(
      (candidate) => candidate.id === this.#selectedModelId
    );
    return model
      ? { model: model.id, effort: model.defaultReasoningEffort }
      : {};
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
