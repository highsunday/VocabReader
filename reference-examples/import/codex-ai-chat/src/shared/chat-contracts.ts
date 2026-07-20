export type ConnectionPhase = 'disconnected' | 'connecting' | 'ready' | 'auth-required' | 'error'

export interface ChatMessage {
  id: string
  turnId: string | null
  role: 'user' | 'assistant'
  text: string
  status: 'streaming' | 'completed' | 'failed'
}

export interface AiUsageAllowanceWindow {
  remainingPercent: number
  resetsAt: number
}

export interface AiUsageAllowance {
  phase: 'loading' | 'available' | 'unavailable'
  fiveHour: AiUsageAllowanceWindow | null
  weekly: AiUsageAllowanceWindow | null
  detail: string
}

export interface ReasoningEffortOption {
  reasoningEffort: string
  description: string
}

export interface ConversationModel {
  id: string
  displayName: string
  supportedReasoningEfforts: ReasoningEffortOption[]
  defaultReasoningEffort: string
  isDefault: boolean
}

export interface ConversationSettings {
  modelId: string
  reasoningEffort: string
}

export interface ChatSnapshot {
  connection: ConnectionPhase
  connectionDetail: string
  threadId: string | null
  activeTurnId: string | null
  allowance: AiUsageAllowance
  models: ConversationModel[]
  modelCatalogDetail: string
  selectedSettings: ConversationSettings | null
  messages: ChatMessage[]
}

export interface CodexChatApi {
  getState(): Promise<ChatSnapshot>
  connect(): Promise<ChatSnapshot>
  refreshAllowance(): Promise<ChatSnapshot>
  updateSettings(modelId: string, reasoningEffort: string): Promise<ChatSnapshot>
  sendMessage(text: string): Promise<ChatSnapshot>
  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void
}
