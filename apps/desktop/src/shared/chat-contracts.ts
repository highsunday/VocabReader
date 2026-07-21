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

export interface SendChatMessageInput {
  text: string;
  context?: ChatContext;
  intent?: "explainAnnotations" | "practiceReading";
  explanationLanguage?: "source" | "zh-TW" | "en" | "ja";
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
  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
}
