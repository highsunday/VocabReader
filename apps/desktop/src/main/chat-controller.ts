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
  CreateLearningItemInput,
  LearningItem,
  LearningItemDraft,
  LearningItemDraftBatch,
  UpdateLearningItemDraftInput
} from "../shared/learning-contracts";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";
import type {
  ChatConversationStore,
  StoredChatConversation,
  StoredChatState
} from "./chat-conversation-store";
import { parseLearningItemArtifacts } from "./learning-item-artifacts";
import { learningItemBatchFromUnknown } from "./learning-item-artifacts";
import type { LearningItemRecheckDecision } from "./learning-item-artifacts";

interface ChatControllerOptions {
  createClient(): CodexAppServerClient;
  workingDirectory: string;
  annotationExplanationSkillPath: string;
  annotationExplanationSkillInstructions: string;
  readingComprehensionSkillPath: string;
  readingComprehensionSkillInstructions: string;
  learningItemCreationSkillPath?: string;
  learningItemCreationSkillInstructions?: string;
  findLearningItemCandidates?(titles: string[]): Promise<LearningItem[]>;
  createLearningItemsAtomically?(
    inputs: CreateLearningItemInput[]
  ): Promise<LearningItem[]>;
  restoreLearningItem?(itemId: string): Promise<LearningItem>;
  areLearningItemSensesEquivalent?(
    draft: LearningItemDraft,
    candidate: LearningItem
  ): Promise<boolean>;
  classifyLearningItemDuplicates?(
    drafts: LearningItemDraft[],
    candidates: LearningItem[]
  ): Promise<LearningItemRecheckDecision[]>;
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
  readingComprehensionSkillInstructions: string,
  learningItemCreationSkillInstructions?: string
): string {
  const annotationSkill = annotationExplanationSkillInstructions.trim();
  const readingSkill = readingComprehensionSkillInstructions.trim();
  if (!annotationSkill) {
    throw new Error("The built-in annotation explanation skill cannot be empty.");
  }
  if (!readingSkill) {
    throw new Error("The built-in reading comprehension skill cannot be empty.");
  }
  const creationSkill = learningItemCreationSkillInstructions?.trim();
  const instructions = [
    "You are the AI Conversation Panel in an English-learning EPUB reader.",
    "Use the App-provided default response language for each turn unless the user explicitly asks for another language.",
    "Use only the explicitly provided reading segment and prior conversation.",
    "Never claim knowledge of text outside the provided reading segment.",
    "Do not run tools, read arbitrary files, write files, or use the network.",
    `The only app-provided skills available are ${
      creationSkill
        ? "explain-reader-annotations, practice-reading-comprehension, and create-learning-items"
        : "explain-reader-annotations and practice-reading-comprehension"
    }.`,
    "Their complete instructions are already loaded below; do not discover, load, or use any other skill.",
    "Apply explain-reader-annotations only when the user input contains $explain-reader-annotations.",
    "Apply practice-reading-comprehension when the user input contains $practice-reading-comprehension. After this skill creates a quiz, continue using its assessment workflow when the user submits answers to that quiz in the same conversation, even without the marker. Do not apply it to unrelated turns.",
    ...(creationSkill
      ? [
          "Apply create-learning-items when the user input contains $create-learning-items. Continue its clarification workflow only for the user's directly related answer in the same conversation. Do not apply it to unrelated turns.",
          "For every ordinary user turn, decide from meaning rather than keywords whether the user explicitly asks to create or save learning cards. Recognize explicit requests in any language using only the current turn, this conversation, and the finite App-provided reading segment.",
          "If the creation intent and word or phrase targets are clear, output exactly one fenced learning-item-intent JSON block with intent createLearningItems and at most 50 targets. Do not ask the user to confirm clear targets and do not emit learning-item-result in that turn.",
          "Use each target language's dictionary headword or citation form in learning-item-intent targets. Normalize inflection without translating or collapsing distinct derived lexemes; for example dogs to dog, 食べました to 食べる, and libros to libro.",
          "If creation intent is explicit but the targets are unclear, ask one focused target question and end with the same learning-item-intent block using an empty targets array.",
          "Questions about whether something is suitable for a card, hypothetical statements, quotations, negations, and uncertain intent remain ordinary conversation and must not emit learning-item-intent."
        ]
      : []),
    "<app-provided-skill name=\"explain-reader-annotations\">",
    annotationSkill,
    "</app-provided-skill>",
    "<app-provided-skill name=\"practice-reading-comprehension\">",
    readingSkill,
    "</app-provided-skill>",
    ...(creationSkill
      ? [
          "<app-provided-skill name=\"create-learning-items\">",
          creationSkill,
          "</app-provided-skill>"
        ]
      : [])
  ];
  return instructions.join("\n");
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
    throw new Error("The Codex model catalog contains an unrecognized model.");
  }
  const supportsDefault = value.supportedReasoningEfforts.some(
    (option) => isObject(option) &&
      option.reasoningEffort === value.defaultReasoningEffort
  );
  if (!supportsDefault) {
    throw new Error("The Codex model's default reasoning effort is unavailable.");
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
    throw new Error("Codex returned unrecognized allowance data.");
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
      ? "Shared account allowance loaded."
      : "Some usage allowance data is unavailable."
  };
}

function allowanceFromResult(value: unknown): AiUsageAllowance {
  if (!isObject(value)) {
    throw new Error("Codex returned unrecognized allowance data.");
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
    detail: fiveHour && weekly ? "Shared account allowance loaded." : update.detail
  };
}

export function composeCodexInput(
  input: SendChatMessageInput,
  learningItemCandidates: LearningItem[] = []
): string {
  const text = input.text.trim();
  const context = input.context;
  const contextLines = [
    context?.bookTitle ? `Book: ${context.bookTitle}` : "",
    context?.chapterTitle ? `Chapter: ${context.chapterTitle}` : "",
    context?.readingSegment?.trim()
      ? `Current reading segment:\n${context.readingSegment.trim()}`
      : ""
  ].filter(Boolean);
  const base = contextLines.length === 0 ? [text] : [
    "The reader explicitly provided the following limited context. Do not assume any book content outside this segment:",
    ...(context?.readingSegment
      ? ["This is the current version and replaces earlier reading-segment and annotation context in this conversation."]
      : []),
    ...contextLines,
    "",
    `User question: ${text}`
  ];
  const sourceLanguage = context?.readingSegment?.trim()
    ? "Use the same language as the current reading segment"
    : "Use the same language as the user's latest message";
  const language = {
    source: sourceLanguage,
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
  if (input.intent === "createLearningItems") {
    const targets = input.learningItemTargets ?? [];
    const creationLanguage = input.explanationLanguage === "source" ||
      input.explanationLanguage === undefined
      ? [
          "For each learning item, use the language of that requested target title.",
          "English targets use English; Traditional Chinese targets use Traditional Chinese; Japanese targets use Japanese.",
          "A mixed-language batch may use a different explanation language for each card."
        ].join(" ")
      : `Explanation language for every learning item: ${language}.`;
    const candidates = learningItemCandidates.map((candidate) => ({
      itemId: candidate.id,
      title: candidate.title,
      sense: candidate.sense,
      status: candidate.status,
      markdownContent: candidate.markdownContent
    }));
    return [
      "$create-learning-items",
      ...base,
      "",
      ...(input.explanationLanguage === "source" ||
        input.explanationLanguage === undefined
        ? [`Explanation language: ${creationLanguage}`]
        : [creationLanguage]),
      `Requested learning-item targets: ${JSON.stringify(targets)}.`,
      "The App selected the following candidates using exact normalized title lookup:",
      `<learning-item-candidates>${JSON.stringify(candidates)}</learning-item-candidates>`,
      ...(targets.length === 0
        ? [
            "No trusted requested target was supplied.",
            "Use the user's explicit request and prior conversation to identify proposed word or phrase targets.",
            "Ask one focused confirmation or clarification and emit a learning-item-request block with those proposed targets.",
            "Do not emit a learning-item-result until the App supplies trusted requested targets."
          ]
        : []),
      "Use only these candidates for duplicate comparison. Never request or infer other learning-library data."
    ].join("\n");
  }
  if (input.intent !== "explainAnnotations") {
    return [
      ...base,
      "",
      `Default response language: ${language}.`,
      "Use another language only when the user explicitly asks for it in this turn."
    ].join("\n");
  }
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
  readingSkillPath: string,
  learningItemCreationSkillPath?: string,
  learningItemCandidates: LearningItem[] = []
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [{
    type: "text",
    text: composeCodexInput(input, learningItemCandidates),
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
  } else if (input.intent === "createLearningItems") {
    if (!learningItemCreationSkillPath) {
      throw new Error("The built-in learning-item creation skill is not configured.");
    }
    items.push({
      type: "skill",
      name: "create-learning-items",
      path: learningItemCreationSkillPath
    });
  }
  return items;
}

function normalizedLearningItemTitle(value: string) {
  return value.trim().toLocaleLowerCase();
}

function validateLearningItemBatchScope(
  batch: LearningItemDraftBatch,
  targets: string[],
  candidates: LearningItem[]
) {
  const requested = new Set(targets.map(normalizedLearningItemTitle));
  if (requested.size === 0) {
    throw new Error("The learning-item draft has no corresponding requested target.");
  }
  const covered = new Set<string>();
  for (const draft of batch.drafts) {
    const resolvedTargets = (draft.requestedTitles ?? [draft.title])
      .map(normalizedLearningItemTitle);
    if (resolvedTargets.some((target) => !requested.has(target))) {
      throw new Error("AI returned an unrequested learning-item draft.");
    }
    for (const target of resolvedTargets) covered.add(target);
  }
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const matchIds = new Set<string>();
  for (const match of [...batch.existing, ...batch.trashed]) {
    const candidate = candidateById.get(match.itemId);
    const resolvedTargets = (match.requestedTitles ?? [match.title])
      .map(normalizedLearningItemTitle);
    if (!candidate || matchIds.has(match.itemId) ||
      candidate.status !== match.status ||
      normalizedLearningItemTitle(candidate.title) !==
        normalizedLearningItemTitle(match.title) ||
      candidate.sense.trim() !== match.sense.trim() ||
      resolvedTargets.some((target) => !requested.has(target))) {
      throw new Error("AI returned an invalid learning-item candidate.");
    }
    matchIds.add(match.itemId);
    for (const target of resolvedTargets) covered.add(target);
  }
  if ([...requested].some((title) => !covered.has(title))) {
    throw new Error("AI did not process every learning-item target.");
  }
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
  #connectionDetail = "Codex is not connected.";
  #account: ChatSnapshot["account"] = null;
  #threadId: string | null = null;
  #resumedThreadId: string | null = null;
  #activeTurnId: string | null = null;
  #managementBusy = false;
  #conversationError: string | null = null;
  #allowance = unavailableAllowance("AI usage allowance is not available yet.");
  #models: ConversationModel[] = [];
  #selectedModelId: string | null = null;
  #modelCatalogDetail = "Available models have not been loaded.";
  #stopRequested = false;
  #stopPromise: Promise<ChatSnapshot> | undefined;
  #turnReadyPromise: Promise<string | null> | undefined;
  #resolveTurnReady: ((turnId: string | null) => void) | undefined;
  #connectPromise: Promise<ChatSnapshot> | undefined;
  #allowanceRefreshTimer: ReturnType<typeof setInterval> | undefined;
  #allowanceRefreshClientInFlight: CodexAppServerClient | undefined;
  readonly #learningItemTurnScopes = new Map<string, {
    targets: string[];
    candidates: LearningItem[];
  }>();
  readonly #turnInputs = new Map<string, {
    input: SendChatMessageInput;
    userMessageId: string;
  }>();
  readonly #routedLearningItemTurns = new Map<string, {
    input: SendChatMessageInput;
    userMessageId: string;
    targets: NonNullable<SendChatMessageInput["learningItemTargets"]>;
  }>();

  constructor(options: ChatControllerOptions) {
    this.#options = options;
    this.#developerInstructions = composeDeveloperInstructions(
      options.annotationExplanationSkillInstructions,
      options.readingComprehensionSkillInstructions,
      options.learningItemCreationSkillInstructions
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
        : "Unable to load local AI conversation history.";
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
    if (!conversation) throw new Error("AI conversation not found.");
    this.#activateConversation(conversation);
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  selectModel(modelId: string): ChatSnapshot {
    this.#assertManagementAvailable();
    const model = this.#models.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error("The selected AI model is currently unavailable.");
    this.#selectedModelId = model.id;
    this.#emit();
    return this.getSnapshot();
  }

  updateLearningItemDraft(input: UpdateLearningItemDraftInput): ChatSnapshot {
    this.#assertManagementAvailable();
    const batch = this.#pendingLearningItemBatch(input.batchId);
    const index = batch.drafts.findIndex((draft) => draft.id === input.draftId);
    if (index < 0) throw new Error("Learning-item draft not found.");
    const current = batch.drafts[index]!;
    const validated = learningItemBatchFromUnknown({
      id: batch.id,
      status: batch.status,
      drafts: [{
        ...input,
        id: current.id,
        ...(current.requestedTitles
          ? { requestedTitles: current.requestedTitles }
          : {}),
        state: current.state
      }],
      existing: [],
      trashed: []
    }).drafts[0]!;
    batch.drafts[index] = validated;
    this.#touchActiveConversation();
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  setLearningItemDraftState(
    batchId: string,
    draftId: string,
    state: "included" | "excluded"
  ): ChatSnapshot {
    this.#assertManagementAvailable();
    if (state !== "included" && state !== "excluded") {
      throw new Error("Invalid learning-item draft state.");
    }
    const batch = this.#pendingLearningItemBatch(batchId);
    const draft = batch.drafts.find((candidate) => candidate.id === draftId);
    if (!draft) throw new Error("Learning-item draft not found.");
    draft.state = state;
    this.#touchActiveConversation();
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  abandonLearningItemBatch(batchId: string): ChatSnapshot {
    this.#assertManagementAvailable();
    const batch = this.#pendingLearningItemBatch(batchId);
    batch.status = "abandoned";
    batch.abandonedAt = this.#now();
    this.#touchActiveConversation();
    this.#persist();
    this.#emit();
    return this.getSnapshot();
  }

  async retryLearningItemPreparation(messageId: string): Promise<ChatSnapshot> {
    this.#assertManagementAvailable();
    const id = typeof messageId === "string" ? messageId.trim() : "";
    const message = this.#messages.find(
      (candidate) => candidate.id === id && candidate.role === "user"
    );
    const preparation = message?.learningItemPreparation;
    if (!message || !preparation || preparation.status !== "failed" ||
      preparation.targets.length === 0) {
      throw new Error("No retryable learning-item preparation was found.");
    }
    if (this.#connection !== "ready" || !this.#client) await this.connect();
    if (this.#connection !== "ready" || !this.#client) {
      throw new Error(this.#connectionDetail);
    }
    preparation.status = "preparing";
    delete preparation.error;
    this.#activeTurnId = "starting";
    this.#touchActiveConversation();
    this.#persist();
    this.#emit();
    await this.#startRoutedLearningItemTurn({
      input: {
        text: message.text,
        ...(preparation.explanationLanguage
          ? { explanationLanguage: preparation.explanationLanguage }
          : {})
      },
      userMessageId: message.id,
      targets: structuredClone(preparation.targets)
    });
    return this.getSnapshot();
  }

  async restoreLearningItemMatch(
    batchId: string,
    itemId: string
  ): Promise<ChatSnapshot> {
    this.#assertManagementAvailable();
    const batch = this.#learningItemBatch(batchId);
    if (batch.status === "abandoned") {
      throw new Error("The learning-item draft batch was discarded.");
    }
    const matchIndex = batch.trashed.findIndex(
      (candidate) => candidate.itemId === itemId
    );
    if (matchIndex < 0) throw new Error("Learning item not found in Trash.");
    if (!this.#options.restoreLearningItem) {
      throw new Error("Learning-item restore is not configured.");
    }
    this.#managementBusy = true;
    this.#emit();
    try {
      const restored = await this.#options.restoreLearningItem(itemId);
      const original = batch.trashed[matchIndex]!;
      batch.trashed.splice(matchIndex, 1);
      batch.existing.push({
        ...original,
        title: restored.title,
        sense: restored.sense,
        status: "active"
      });
      this.#touchActiveConversation();
      this.#persist();
    } finally {
      this.#managementBusy = false;
      this.#emit();
    }
    return this.getSnapshot();
  }

  async submitLearningItemBatch(batchId: string): Promise<ChatSnapshot> {
    this.#assertManagementAvailable();
    const batch = this.#pendingLearningItemBatch(batchId);
    const included = batch.drafts.filter((draft) => draft.state === "included");
    if (included.length === 0) throw new Error("There are no learning-item drafts to submit.");
    if (!this.#options.findLearningItemCandidates ||
      !this.#options.createLearningItemsAtomically) {
      throw new Error("Learning-item submission is not configured.");
    }
    this.#managementBusy = true;
    this.#emit();
    try {
      const candidates = await this.#options.findLearningItemCandidates(
        included.map(({ title }) => title)
      );
      const toCreate: LearningItemDraft[] = [];
      const existing = [...batch.existing];
      const trashed = [...batch.trashed];
      const decisions = candidates.length > 0 &&
        this.#options.classifyLearningItemDuplicates
        ? await this.#options.classifyLearningItemDuplicates(
            included,
            candidates
          )
        : undefined;
      const decisionByDraftId = new Map(
        decisions?.map((decision) => [decision.draftId, decision])
      );
      if (decisions && (decisionByDraftId.size !== included.length ||
        decisions.length !== included.length ||
        included.some((draft) => !decisionByDraftId.has(draft.id)))) {
        throw new Error("AI did not classify every learning-item draft.");
      }
      for (const draft of included) {
        const title = draft.title.trim().toLocaleLowerCase();
        const sameTitle = candidates.filter(
          (candidate) => candidate.title.trim().toLocaleLowerCase() === title
        );
        let duplicate: LearningItem | undefined;
        const decision = decisionByDraftId.get(draft.id);
        if (decision && decision.decision !== "create") {
          duplicate = sameTitle.find(
            (candidate) => candidate.id === decision.itemId &&
              candidate.status === (
                decision.decision === "existing" ? "active" : "trashed"
              )
          );
          if (!duplicate) {
            throw new Error("AI returned an invalid learning-item candidate decision.");
          }
        } else if (!decisions) {
          for (const candidate of sameTitle) {
            const equivalent = this.#options.areLearningItemSensesEquivalent
              ? await this.#options.areLearningItemSensesEquivalent(
                  draft,
                  candidate
                )
              : draft.sense.trim().toLocaleLowerCase() ===
                candidate.sense.trim().toLocaleLowerCase();
            if (equivalent) {
              duplicate = candidate;
              break;
            }
          }
        }
        if (!duplicate) {
          toCreate.push(draft);
          continue;
        }
        const match = {
          itemId: duplicate.id,
          title: duplicate.title,
          sense: duplicate.sense,
          status: duplicate.status
        } as const;
        const matches = duplicate.status === "active" ? existing : trashed;
        if (!matches.some((candidate) => candidate.itemId === match.itemId)) {
          matches.push(match);
        }
      }
      const created = toCreate.length > 0
        ? await this.#options.createLearningItemsAtomically(
            toCreate.map((draft) => ({
              title: draft.title,
              itemType: draft.itemType,
              language: draft.language,
              cefr: draft.cefr,
              sense: draft.sense,
              markdownContent: draft.markdownContent
            }))
          )
        : [];
      batch.status = "submitted";
      batch.submittedAt = this.#now();
      batch.createdItemIds = created.map(({ id }) => id);
      batch.existing = existing;
      batch.trashed = trashed;
      this.#touchActiveConversation();
      this.#persist();
    } finally {
      this.#managementBusy = false;
      this.#emit();
    }
    return this.getSnapshot();
  }

  stopResponse(): Promise<ChatSnapshot> {
    if (this.#stopPromise) return this.#stopPromise;
    if (this.#stopRequested) return Promise.resolve(this.getSnapshot());
    if (!this.#activeTurnId || !this.#client) {
      return Promise.reject(new Error("There is no AI response to stop."));
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
    if (!conversation) throw new Error("AI conversation not found.");
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
        : "Unable to remove the AI conversation.";
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
    this.#allowance = unavailableAllowance("AI usage allowance is not available yet.");
    this.#setConnection("connecting", "Starting Codex…");
    const client = this.#options.createClient();
    this.#client = client;
    this.#unsubscribeNotification = client.onNotification((notification) => {
      this.#handleNotification(notification);
    });
    this.#unsubscribeExit = client.onExit((error) => {
      if (this.#client !== client) return;
      this.#stopAllowancePolling(client);
      this.#client = undefined;
      this.#activeTurnId = null;
      this.#stopRequested = false;
      this.#setConnection("error", error.message);
    });

    this.#connectPromise = (async () => {
      try {
        await client.initialize({
          name: "vocabreader",
          title: "VocabReader",
          version: "0.1.0"
        });
        const account = await client.readAccount();
        if (this.#client !== client) return this.getSnapshot();
        if (!account.account) {
          this.#setConnection(
            "auth-required",
            "Sign in to Codex or ChatGPT on this computer first."
          );
          return this.getSnapshot();
        }
        this.#account = account.account;
        this.#allowance = {
          phase: "loading",
          fiveHour: null,
          weekly: null,
          detail: "Loading shared account allowance…"
        };
        this.#setConnection("ready", "Codex is connected.");
        await Promise.all([
          this.#loadAllowance(client),
          this.#loadModelCatalog(client)
        ]);
        if (this.#client === client && this.#connection === "ready") {
          this.#startAllowancePolling(client);
        }
        return this.getSnapshot();
      } catch (error) {
        if (this.#client === client) {
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
    const text = input.text.trim();
    if (!text) throw new Error("Enter a message.");
    const requestInput = this.#continuedLearningItemInput({
      ...input,
      text
    });
    if (this.#activeTurnId) throw new Error("Wait for the current AI response to finish.");
    if (this.#connection !== "ready" || !this.#client) await this.connect();
    if (this.#connection !== "ready" || !this.#client) {
      throw new Error(this.#connectionDetail);
    }
    const learningItemCandidates =
      requestInput.intent === "createLearningItems" &&
      requestInput.learningItemTargets?.length
      ? await (this.#options.findLearningItemCandidates?.(
          requestInput.learningItemTargets.map(({ title }) => title)
        ) ?? Promise.resolve([]))
      : [];

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
          throw new Error("Codex could not resume this AI conversation.");
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
        if (!threadId) throw new Error("Codex did not return a conversation identifier.");
        this.#threadId = threadId;
        this.#resumedThreadId = threadId;
        const timestamp = this.#now();
        const conversation: StoredChatConversation = {
          id: this.#createConversationId(),
          threadId,
          title: this.#titleFrom(text),
          createdAt: timestamp,
          updatedAt: timestamp,
          source: this.#sourceFrom(requestInput),
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
        status: "completed",
        ...(requestInput.intent === "createLearningItems"
          ? {
              learningItemRequest: {
                targets: structuredClone(
                  requestInput.learningItemTargets ?? []
                )
              }
            }
          : {})
      };
      this.#messages.push(userMessage);
      this.#touchActiveConversation(requestInput);
      this.#persist();
      this.#emit();
      const response = await client.request("turn/start", {
        threadId: this.#threadId,
        ...this.#selectedModelSettings(),
        input: composeTurnInput(
          requestInput,
          this.#options.annotationExplanationSkillPath,
          this.#options.readingComprehensionSkillPath,
          this.#options.learningItemCreationSkillPath,
          learningItemCandidates
        )
      });
      const turnId = turnIdFrom(response);
      if (!turnId) throw new Error("Codex did not return a response identifier.");
      userMessage.turnId = turnId;
      if (requestInput.intent === "createLearningItems") {
        this.#learningItemTurnScopes.set(turnId, {
          targets: (requestInput.learningItemTargets ?? [])
            .map(({ title }) => title),
          candidates: learningItemCandidates
        });
      }
      this.#turnInputs.set(turnId, {
        input: structuredClone(requestInput),
        userMessageId: userMessage.id
      });
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
        : "Unable to send the message.";
      this.#emit();
      throw error;
    }
  }

  close(): void {
    this.#disposeClient();
    this.#connection = "disconnected";
    this.#connectionDetail = "The Codex connection is closed.";
    this.#activeTurnId = null;
    this.#stopRequested = false;
    this.#learningItemTurnScopes.clear();
    this.#turnInputs.clear();
    this.#routedLearningItemTurns.clear();
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
      const artifacts = parseLearningItemArtifacts(completedItem.text);
      const turnInput = this.#turnInputs.get(params.turnId);
      if (artifacts.intent && turnInput &&
        turnInput.input.intent === undefined) {
        const targets = artifacts.intent.targets;
        const userMessage = this.#messages.find(
          (message) => message.id === turnInput.userMessageId
        );
        if (userMessage) {
          userMessage.learningItemRequest = {
            targets: structuredClone(targets)
          };
          if (targets.length > 0) {
            userMessage.learningItemPreparation = {
              status: "preparing",
              targets: structuredClone(targets),
              ...(turnInput.input.explanationLanguage
                ? {
                    explanationLanguage:
                      turnInput.input.explanationLanguage
                  }
                : {})
            };
          }
        }
        if (targets.length > 0) {
          this.#routedLearningItemTurns.set(params.turnId, {
            input: structuredClone(turnInput.input),
            userMessageId: turnInput.userMessageId,
            targets: structuredClone(targets)
          });
          this.#messages = this.#messages.filter(
            (message) => message.id !== completedItem.id
          );
          this.#touchActiveConversation();
          this.#tryPersist();
          this.#emit();
          return;
        }
        artifacts.request = { targets: [] };
      }
      if (artifacts.batch) {
        try {
          const scope = this.#learningItemTurnScopes.get(params.turnId);
          if (!scope) {
            throw new Error("The learning-item draft is missing its trusted candidate scope.");
          }
          validateLearningItemBatchScope(
            artifacts.batch,
            scope.targets,
            scope.candidates
          );
        } catch (error) {
          artifacts.batch = undefined;
          artifacts.error = error instanceof Error
            ? error.message
            : "Learning-item draft candidate validation failed.";
        }
      }
      const preparationMessage = turnInput
        ? this.#messages.find(
            (message) => message.id === turnInput.userMessageId
          )
        : undefined;
      if (preparationMessage?.learningItemPreparation) {
        if (artifacts.batch) {
          preparationMessage.learningItemPreparation.status = "completed";
          delete preparationMessage.learningItemPreparation.error;
        } else if (artifacts.request) {
          preparationMessage.learningItemPreparation.status = "completed";
          delete preparationMessage.learningItemPreparation.error;
        } else if (artifacts.error) {
          preparationMessage.learningItemPreparation.status = "failed";
          preparationMessage.learningItemPreparation.error = artifacts.error;
        } else if (turnInput?.input.intent === "createLearningItems") {
          artifacts.error = "AI did not produce a usable learning-item draft. Please try again.";
          preparationMessage.learningItemPreparation.status = "failed";
          preparationMessage.learningItemPreparation.error = artifacts.error;
        }
      }
      let message = this.#messages.find((item) => item.id === completedItem.id);
      if (!message) {
        message = {
          id: completedItem.id,
          turnId: params.turnId,
          role: "assistant",
          text: artifacts.text,
          status: "completed"
        };
        this.#messages.push(message);
      } else {
        message.text = artifacts.text;
        message.status = "completed";
      }
      if (artifacts.batch) message.learningItemBatch = artifacts.batch;
      if (artifacts.invitation) {
        message.learningItemInvitation = artifacts.invitation;
      }
      if (artifacts.request) {
        message.learningItemRequest = artifacts.request;
      }
      if (artifacts.error) message.artifactError = artifacts.error;
      this.#touchActiveConversation();
      this.#tryPersist();
      this.#emit();
      return;
    }

    if (notification.method === "turn/completed" && isObject(params.turn) &&
      typeof params.turn.id === "string") {
      const routed = this.#routedLearningItemTurns.get(params.turn.id);
      const completedTurnInput = this.#turnInputs.get(params.turn.id);
      this.#learningItemTurnScopes.delete(params.turn.id);
      this.#turnInputs.delete(params.turn.id);
      this.#routedLearningItemTurns.delete(params.turn.id);
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
          : "The AI response was not completed.";
        const preparation = completedTurnInput
          ? this.#messages.find(
              (message) => message.id === completedTurnInput.userMessageId
            )?.learningItemPreparation
          : undefined;
        if (preparation) {
          preparation.status = "failed";
          preparation.error = this.#connectionDetail;
        }
      }
      this.#touchActiveConversation();
      this.#tryPersist();
      if (completed && routed) {
        this.#activeTurnId = "starting";
        this.#emit();
        void this.#startRoutedLearningItemTurn(routed);
      } else {
        this.#emit();
      }
    }
  }

  async #startRoutedLearningItemTurn(routed: {
    input: SendChatMessageInput;
    userMessageId: string;
    targets: NonNullable<SendChatMessageInput["learningItemTargets"]>;
  }): Promise<void> {
    this.#turnReadyPromise = new Promise((resolve) => {
      this.#resolveTurnReady = resolve;
    });
    const client = this.#client;
    const threadId = this.#threadId;
    if (!client || !threadId) {
      this.#resolveTurnReady?.(null);
      this.#resolveTurnReady = undefined;
      this.#activeTurnId = null;
      this.#connectionDetail = "The Codex connection was interrupted, so learning-item drafts could not be prepared.";
      const preparation = this.#messages.find(
        (message) => message.id === routed.userMessageId
      )?.learningItemPreparation;
      if (preparation) {
        preparation.status = "failed";
        preparation.error = this.#connectionDetail;
      }
      this.#tryPersist();
      this.#emit();
      return;
    }
    const input: SendChatMessageInput = {
      ...routed.input,
      intent: "createLearningItems",
      learningItemTargets: structuredClone(routed.targets)
    };
    try {
      const candidates = await (
        this.#options.findLearningItemCandidates?.(
          routed.targets.map(({ title }) => title)
        ) ?? Promise.resolve([])
      );
      const response = await client.request("turn/start", {
        threadId,
        ...this.#selectedModelSettings(),
        input: composeTurnInput(
          input,
          this.#options.annotationExplanationSkillPath,
          this.#options.readingComprehensionSkillPath,
          this.#options.learningItemCreationSkillPath,
          candidates
        )
      });
      const turnId = turnIdFrom(response);
      if (!turnId) throw new Error("Codex did not return a response identifier.");
      this.#learningItemTurnScopes.set(turnId, {
        targets: routed.targets.map(({ title }) => title),
        candidates
      });
      this.#turnInputs.set(turnId, {
        input: structuredClone(input),
        userMessageId: routed.userMessageId
      });
      if (this.#activeTurnId === "starting") this.#activeTurnId = turnId;
      this.#resolveTurnReady?.(turnId);
      this.#resolveTurnReady = undefined;
      this.#persist();
      this.#emit();
    } catch (error) {
      this.#resolveTurnReady?.(null);
      this.#resolveTurnReady = undefined;
      this.#activeTurnId = null;
      const detail = error instanceof Error
        ? error.message
        : "Unable to prepare learning-item drafts.";
      this.#connectionDetail = detail;
      const preparation = this.#messages.find(
        (message) => message.id === routed.userMessageId
      )?.learningItemPreparation;
      if (preparation) {
        preparation.status = "failed";
        preparation.error = detail;
      }
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
      throw new Error("Wait for the current AI response to finish.");
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

  #pendingLearningItemBatch(batchId: string): LearningItemDraftBatch {
    const batch = this.#learningItemBatch(batchId);
    if (batch.status !== "pending") {
      throw new Error(batch.status === "abandoned"
        ? "The learning-item draft batch was discarded."
        : "The learning-item draft batch was submitted.");
    }
    return batch;
  }

  #learningItemBatch(batchId: string): LearningItemDraftBatch {
    const id = typeof batchId === "string" ? batchId.trim() : "";
    if (!id) throw new Error("Invalid learning-item draft batch.");
    for (const message of this.#messages) {
      if (message.learningItemBatch?.id !== id) continue;
      return message.learningItemBatch;
    }
    throw new Error("Learning-item draft batch not found.");
  }

  #continuedLearningItemInput(
    input: SendChatMessageInput
  ): SendChatMessageInput {
    if (input.intent && input.intent !== "createLearningItems") return input;
    if (input.intent === "createLearningItems" &&
      input.learningItemTargets?.length) {
      return input;
    }
    const lastUserIndex = this.#messages.findLastIndex(
      (message) => message.role === "user"
    );
    const request = lastUserIndex >= 0
      ? this.#messages[lastUserIndex]?.learningItemRequest
      : undefined;
    const response = lastUserIndex >= 0
      ? this.#messages.slice(lastUserIndex + 1).findLast(
          (message) => message.role === "assistant"
        )
      : undefined;
    if (!request || !response || response.status !== "completed" ||
      response.learningItemBatch || response.artifactError) {
      return input;
    }
    const clarifiedTargets = response.learningItemRequest?.targets ?? [];
    const requestedTargets = clarifiedTargets.length > 0
      ? clarifiedTargets
      : request.targets;
    const targets = requestedTargets.length > 0
      ? requestedTargets.map((target) => ({
          title: target.title,
          senseHint: [target.senseHint, input.text.trim()]
            .filter(Boolean)
            .join(" — ")
        }))
      : [...new Set(
          input.text
            .split(/[\n,，]+/)
            .map((title) => title.trim())
            .filter(Boolean)
        )].slice(0, 50).map((title) => ({ title }));
    return {
      ...input,
      intent: "createLearningItems",
      learningItemTargets: targets
    };
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
    return text.replace(/\s+/g, " ").trim().slice(0, 60) || "New conversation";
  }

  #createConversationId(): string {
    return this.#options.createConversationId?.() ?? randomUUID();
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }

  #storedState(): StoredChatState {
    return {
      version: 2,
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
        : "Unable to save local AI conversation history.";
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

  async #loadAllowance(
    client: CodexAppServerClient,
    preserveCurrentOnError = false
  ): Promise<void> {
    try {
      const allowance = allowanceFromResult(
        await client.request("account/rateLimits/read")
      );
      if (this.#client !== client) return;
      this.#allowance = allowance;
    } catch (error) {
      if (this.#client !== client) return;
      if (preserveCurrentOnError) return;
      this.#allowance = unavailableAllowance(
        error instanceof Error ? error.message : "AI usage allowance is unavailable."
      );
    }
    this.#emit();
  }

  #startAllowancePolling(client: CodexAppServerClient): void {
    this.#stopAllowancePolling();
    this.#allowanceRefreshTimer = setInterval(() => {
      if (this.#client !== client ||
        this.#connection !== "ready" ||
        this.#allowanceRefreshClientInFlight === client) {
        return;
      }
      this.#allowanceRefreshClientInFlight = client;
      void this.#loadAllowance(client, true).finally(() => {
        if (this.#allowanceRefreshClientInFlight === client) {
          this.#allowanceRefreshClientInFlight = undefined;
        }
      });
    }, 60_000);
  }

  #stopAllowancePolling(client?: CodexAppServerClient): void {
    if (this.#allowanceRefreshTimer) {
      clearInterval(this.#allowanceRefreshTimer);
      this.#allowanceRefreshTimer = undefined;
    }
    if (!client || this.#allowanceRefreshClientInFlight === client) {
      this.#allowanceRefreshClientInFlight = undefined;
    }
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
          throw new Error("The Codex model catalog returned unrecognized data.");
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
      if (models.length === 0) throw new Error("No AI models are available.");
      this.#models = models.map(({ isDefault: _isDefault, ...model }) => model);
      const selectedStillExists = this.#selectedModelId && models.some(
        (model) => model.id === this.#selectedModelId
      );
      if (!selectedStillExists) {
        this.#selectedModelId = models.find((model) => model.isDefault)?.id ??
          models[0]?.id ?? null;
      }
      this.#modelCatalogDetail = "Available conversation models loaded.";
    } catch (error) {
      this.#models = [];
      this.#selectedModelId = null;
      this.#modelCatalogDetail = error instanceof Error
        ? error.message
        : "Unable to load available AI models.";
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
    const client = this.#client;
    this.#stopAllowancePolling(client);
    this.#unsubscribeNotification?.();
    this.#unsubscribeExit?.();
    this.#unsubscribeNotification = undefined;
    this.#unsubscribeExit = undefined;
    this.#client = undefined;
    client?.close();
  }
}
