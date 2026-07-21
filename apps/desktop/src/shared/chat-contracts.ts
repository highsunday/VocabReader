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

export interface ChatContext {
  bookTitle?: string;
  chapterTitle?: string;
  readingSegment?: string;
}

export interface SendChatMessageInput {
  text: string;
  context?: ChatContext;
}

export interface ChatSnapshot {
  connection: ConnectionPhase;
  connectionDetail: string;
  account: CodexAccount | null;
  threadId: string | null;
  activeTurnId: string | null;
  allowance: AiUsageAllowance;
  messages: ChatMessage[];
}

export interface ChatDesktopApi {
  getState(): Promise<ChatSnapshot>;
  connect(): Promise<ChatSnapshot>;
  sendMessage(input: SendChatMessageInput): Promise<ChatSnapshot>;
  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
}
