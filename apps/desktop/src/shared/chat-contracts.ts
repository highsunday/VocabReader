import type {
  LearningItemDraftBatch,
  UpdateLearningItemDraftInput
} from "./learning-contracts";

export type ConnectionPhase =
  | "disconnected"
  | "connecting"
  | "ready"
  | "auth-required"
  | "error";

export interface CodexAccount {
  type: string;
  email?: string;
}

export interface ChatMessage {
  id: string;
  turnId: string | null;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "completed" | "failed";
  learningItemBatch?: LearningItemDraftBatch;
  learningItemInvitation?: {
    targets: LearningItemTarget[];
  };
  learningItemRequest?: {
    targets: LearningItemTarget[];
  };
  learningItemPreparation?: LearningItemPreparation;
  artifactError?: string;
}

export interface AiUsageAllowanceWindow {
  remainingPercent: number;
  resetsAt: number;
}

export interface AiUsageAllowance {
  phase: "loading" | "available" | "unavailable";
  fiveHour: AiUsageAllowanceWindow | null;
  weekly: AiUsageAllowanceWindow | null;
  detail: string;
}

export interface ConversationModel {
  id: string;
  displayName: string;
  defaultReasoningEffort: string;
}

export interface ChatContext {
  bookTitle?: string;
  chapterTitle?: string;
  readingSegment?: string;
}

export interface LearningItemTarget {
  title: string;
  senseHint?: string;
}

export interface LearningItemPreparation {
  status: "preparing" | "failed" | "completed";
  targets: LearningItemTarget[];
  explanationLanguage?: "source" | "zh-TW" | "en" | "ja";
  error?: string;
}

export interface SendChatMessageInput {
  text: string;
  context?: ChatContext;
  intent?: "explainAnnotations" | "practiceReading" | "practiceRetelling" |
    "createLearningItems";
  explanationLanguage?: "source" | "zh-TW" | "en" | "ja";
  learningItemTargets?: LearningItemTarget[];
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  source: Pick<ChatContext, "bookTitle" | "chapterTitle"> | null;
}

export interface ChatSnapshot {
  connection: ConnectionPhase;
  connectionDetail: string;
  account: CodexAccount | null;
  threadId: string | null;
  activeTurnId: string | null;
  allowance: AiUsageAllowance;
  messages: ChatMessage[];
  conversations: ChatConversationSummary[];
  activeConversationId: string | null;
  managementBusy: boolean;
  conversationError?: string | null;
  models?: ConversationModel[];
  selectedModelId?: string | null;
  modelCatalogDetail?: string;
  stopRequested?: boolean;
}

export interface ChatDesktopApi {
  getState(): Promise<ChatSnapshot>;
  connect(): Promise<ChatSnapshot>;
  sendMessage(input: SendChatMessageInput): Promise<ChatSnapshot>;
  startNewConversation(): Promise<ChatSnapshot>;
  selectConversation(conversationId: string): Promise<ChatSnapshot>;
  removeConversation(conversationId: string): Promise<ChatSnapshot>;
  selectModel(modelId: string): Promise<ChatSnapshot>;
  stopResponse(): Promise<ChatSnapshot>;
  retryLearningItemPreparation(messageId: string): Promise<ChatSnapshot>;
  updateLearningItemDraft(
    input: UpdateLearningItemDraftInput
  ): Promise<ChatSnapshot>;
  setLearningItemDraftState(
    batchId: string,
    draftId: string,
    state: "included" | "excluded"
  ): Promise<ChatSnapshot>;
  abandonLearningItemBatch(batchId: string): Promise<ChatSnapshot>;
  submitLearningItemBatch(batchId: string): Promise<ChatSnapshot>;
  restoreLearningItemMatch(
    batchId: string,
    itemId: string
  ): Promise<ChatSnapshot>;
  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
}
