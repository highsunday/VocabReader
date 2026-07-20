import { EventEmitter } from 'node:events'

import type {
  AiUsageAllowance,
  AiUsageAllowanceWindow,
  ChatMessage,
  ChatSnapshot,
  ConnectionPhase,
  ConversationModel,
  ConversationSettings
} from '../shared/chat-contracts.js'
import type { CodexAppServerClient, CodexNotification } from './codex-app-server-client.js'

interface ChatControllerOptions {
  createClient(): CodexAppServerClient
  workingDirectory: string
}

const isolationConfig = Object.freeze({
  'skills.include_instructions': false,
  'skills.bundled.enabled': false,
  'features.plugins': false,
  'features.apps': false,
  'features.memories': false,
  web_search: 'disabled'
})

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function threadIdFrom(value: unknown): string | undefined {
  return isObject(value) && isObject(value.thread) && typeof value.thread.id === 'string'
    ? value.thread.id
    : undefined
}

function turnIdFrom(value: unknown): string | undefined {
  return isObject(value) && isObject(value.turn) && typeof value.turn.id === 'string'
    ? value.turn.id
    : undefined
}

function unavailableAllowance(detail: string): AiUsageAllowance {
  return { phase: 'unavailable', fiveHour: null, weekly: null, detail }
}

function allowanceWindow(value: unknown): (AiUsageAllowanceWindow & { windowDurationMins: number }) | null {
  if (!isObject(value)
    || typeof value.usedPercent !== 'number'
    || !Number.isFinite(value.usedPercent)
    || typeof value.windowDurationMins !== 'number'
    || !Number.isFinite(value.windowDurationMins)
    || typeof value.resetsAt !== 'number'
    || !Number.isFinite(value.resetsAt)) return null
  return {
    remainingPercent: Math.round(Math.max(0, Math.min(100, 100 - value.usedPercent))),
    windowDurationMins: value.windowDurationMins,
    resetsAt: Math.trunc(value.resetsAt)
  }
}

function allowanceFromSnapshot(value: unknown): AiUsageAllowance {
  if (!isObject(value)) throw new Error('Codex allowance returned an unexpected response.')
  const windows = [allowanceWindow(value.primary), allowanceWindow(value.secondary)]
  const fiveHour = windows.find((window) => window?.windowDurationMins === 300) ?? null
  const weekly = windows.find((window) => window?.windowDurationMins === 10_080) ?? null
  return {
    phase: fiveHour || weekly ? 'available' : 'unavailable',
    fiveHour: fiveHour ? { remainingPercent: fiveHour.remainingPercent, resetsAt: fiveHour.resetsAt } : null,
    weekly: weekly ? { remainingPercent: weekly.remainingPercent, resetsAt: weekly.resetsAt } : null,
    detail: fiveHour && weekly ? '已取得帳戶共用額度。' : '部分使用額度無法取得。'
  }
}

function allowanceFromResult(value: unknown): AiUsageAllowance {
  if (!isObject(value)) throw new Error('Codex allowance returned an unexpected response.')
  const byLimitId = isObject(value.rateLimitsByLimitId) ? value.rateLimitsByLimitId : null
  return allowanceFromSnapshot(byLimitId && isObject(byLimitId.codex) ? byLimitId.codex : value.rateLimits)
}

function mergeAllowance(current: AiUsageAllowance, update: AiUsageAllowance): AiUsageAllowance {
  const fiveHour = update.fiveHour ?? current.fiveHour
  const weekly = update.weekly ?? current.weekly
  return {
    phase: fiveHour || weekly ? 'available' : update.phase,
    fiveHour,
    weekly,
    detail: fiveHour && weekly ? '已取得帳戶共用額度。' : update.detail
  }
}

function modelFrom(value: unknown): ConversationModel | null {
  if (!isObject(value) || value.hidden === true) return null
  if (typeof value.id !== 'string'
    || typeof value.displayName !== 'string'
    || !Array.isArray(value.supportedReasoningEfforts)
    || typeof value.defaultReasoningEffort !== 'string'
    || typeof value.isDefault !== 'boolean') {
    throw new Error('Codex model catalog returned an invalid model.')
  }
  const supportedReasoningEfforts = value.supportedReasoningEfforts.map((option) => {
    if (!isObject(option) || typeof option.reasoningEffort !== 'string' || typeof option.description !== 'string') {
      throw new Error('Codex model catalog returned an invalid reasoning effort.')
    }
    return { reasoningEffort: option.reasoningEffort, description: option.description }
  })
  if (!supportedReasoningEfforts.some((option) => option.reasoningEffort === value.defaultReasoningEffort)) {
    throw new Error('Codex model catalog default reasoning effort is not supported.')
  }
  return {
    id: value.id,
    displayName: value.displayName,
    supportedReasoningEfforts,
    defaultReasoningEffort: value.defaultReasoningEffort,
    isDefault: value.isDefault
  }
}

export class ChatController {
  readonly #options: ChatControllerOptions
  readonly #events = new EventEmitter()
  readonly #messages: ChatMessage[] = []
  #client: CodexAppServerClient | undefined
  #unsubscribeNotification: (() => void) | undefined
  #unsubscribeExit: (() => void) | undefined
  #connection: ConnectionPhase = 'disconnected'
  #connectionDetail = '尚未連線 Codex。'
  #threadId: string | null = null
  #activeTurnId: string | null = null
  #allowance: AiUsageAllowance = unavailableAllowance('尚未取得 AI 使用額度。')
  #models: ConversationModel[] = []
  #modelCatalogDetail = '尚未取得對話模型。'
  #selectedSettings: ConversationSettings | null = null
  #connectPromise: Promise<ChatSnapshot> | undefined

  constructor(options: ChatControllerOptions) {
    this.#options = options
  }

  getSnapshot(): ChatSnapshot {
    return {
      connection: this.#connection,
      connectionDetail: this.#connectionDetail,
      threadId: this.#threadId,
      activeTurnId: this.#activeTurnId,
      allowance: structuredClone(this.#allowance),
      models: structuredClone(this.#models),
      modelCatalogDetail: this.#modelCatalogDetail,
      selectedSettings: this.#selectedSettings ? { ...this.#selectedSettings } : null,
      messages: structuredClone(this.#messages)
    }
  }

  onStateChanged(listener: (snapshot: ChatSnapshot) => void): () => void {
    this.#events.on('state', listener)
    return () => this.#events.off('state', listener)
  }

  connect(): Promise<ChatSnapshot> {
    if (this.#connection === 'ready') return Promise.resolve(this.getSnapshot())
    if (this.#connectPromise) return this.#connectPromise

    this.#disposeClient()
    this.#setConnection('connecting', '正在啟動 Codex app-server…')
    const client = this.#options.createClient()
    this.#client = client
    this.#unsubscribeNotification = client.onNotification((notification) => this.#handleNotification(notification))
    this.#unsubscribeExit = client.onExit((error) => {
      if (this.#client !== client) return
      this.#client = undefined
      this.#activeTurnId = null
      this.#setConnection('error', error.message)
    })

    this.#connectPromise = (async () => {
      try {
        await client.initialize({
          name: 'codex_ai_chat_example',
          title: 'Codex AI Chat Example',
          version: '0.1.0'
        })
        const account = await client.readAccount()
        if (this.#client !== client) return this.getSnapshot()
        if (!account.account) {
          this.#setConnection('auth-required', '請先在這台電腦完成 Codex 或 ChatGPT 登入。')
          return this.getSnapshot()
        }
        const label = account.account.email ?? account.account.type
        this.#setConnection('ready', `已連線：${label}`)
        await Promise.all([this.#loadAllowance(client), this.#loadModelCatalog(client)])
        return this.getSnapshot()
      } catch (error) {
        if (this.#client === client) {
          this.#setConnection('error', error instanceof Error ? error.message : 'Codex 連線失敗。')
          this.#disposeClient()
        }
        return this.getSnapshot()
      } finally {
        this.#connectPromise = undefined
      }
    })()
    return this.#connectPromise
  }

  async refreshAllowance(): Promise<ChatSnapshot> {
    if (this.#connection !== 'ready' || !this.#client) throw new Error('Codex 尚未連線。')
    this.#allowance = { phase: 'loading', fiveHour: this.#allowance.fiveHour, weekly: this.#allowance.weekly, detail: '正在重新整理額度…' }
    this.#emit()
    await this.#loadAllowance(this.#client)
    return this.getSnapshot()
  }

  updateSettings(modelId: string, reasoningEffort: string): ChatSnapshot {
    if (this.#activeTurnId) throw new Error('Conversation settings cannot change during an active turn.')
    const model = this.#models.find((candidate) => candidate.id === modelId)
    if (!model) throw new Error('The selected Conversation Model is not available.')
    const effort = model.supportedReasoningEfforts.some((option) => option.reasoningEffort === reasoningEffort)
      ? reasoningEffort
      : model.defaultReasoningEffort
    this.#selectedSettings = { modelId: model.id, reasoningEffort: effort }
    this.#emit()
    return this.getSnapshot()
  }

  async sendMessage(rawText: string): Promise<ChatSnapshot> {
    const text = rawText.trim()
    if (!text) throw new Error('請輸入訊息。')
    if (this.#activeTurnId) throw new Error('請等待目前的 AI 回覆完成。')
    if (this.#connection !== 'ready' || !this.#client) {
      await this.connect()
    }
    if (this.#connection !== 'ready' || !this.#client) {
      throw new Error(this.#connectionDetail)
    }

    const client = this.#client
    if (!this.#threadId) {
      const response = await client.request('thread/start', {
        cwd: this.#options.workingDirectory,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        threadSource: 'user',
        config: isolationConfig,
        environments: [],
        selectedCapabilityRoots: [],
        ...(this.#selectedSettings ? { model: this.#selectedSettings.modelId } : {}),
        developerInstructions: [
          'You are a focused AI conversation assistant.',
          'Answer only from the user messages and prior conversation history.',
          'Do not run tools or shell commands, and do not read or write files.'
        ].join(' ')
      })
      const threadId = threadIdFrom(response)
      if (!threadId) throw new Error('Codex thread/start did not return a thread id.')
      this.#threadId = threadId
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${this.#messages.length}`,
      turnId: null,
      role: 'user',
      text,
      status: 'completed'
    }
    this.#messages.push(userMessage)
    this.#activeTurnId = 'starting'
    this.#emit()

    try {
      const response = await client.request('turn/start', {
        threadId: this.#threadId,
        ...(this.#selectedSettings ? {
          model: this.#selectedSettings.modelId,
          effort: this.#selectedSettings.reasoningEffort
        } : {}),
        input: [{ type: 'text', text, text_elements: [] }]
      })
      const turnId = turnIdFrom(response)
      if (!turnId) throw new Error('Codex turn/start did not return a turn id.')
      userMessage.turnId = turnId
      if (this.#activeTurnId === 'starting') this.#activeTurnId = turnId
      this.#emit()
      return this.getSnapshot()
    } catch (error) {
      this.#activeTurnId = null
      this.#connectionDetail = error instanceof Error ? error.message : '無法送出訊息。'
      this.#emit()
      throw error
    }
  }

  close(): void {
    this.#disposeClient()
    this.#connection = 'disconnected'
    this.#connectionDetail = 'Codex 連線已關閉。'
    this.#activeTurnId = null
  }

  #handleNotification(notification: CodexNotification): void {
    const params = notification.params
    if (notification.method === 'account/rateLimits/updated' && isObject(params) && 'rateLimits' in params) {
      try {
        this.#allowance = mergeAllowance(this.#allowance, allowanceFromSnapshot(params.rateLimits))
        this.#emit()
      } catch {
        // Preserve the last validated allowance when a live update is malformed.
      }
      return
    }
    if (!isObject(params) || typeof params.threadId !== 'string' || params.threadId !== this.#threadId) return

    if (notification.method === 'turn/started' && isObject(params.turn) && typeof params.turn.id === 'string') {
      this.#activeTurnId = params.turn.id
      this.#emit()
      return
    }

    if (notification.method === 'item/agentMessage/delta'
      && typeof params.turnId === 'string'
      && typeof params.itemId === 'string'
      && typeof params.delta === 'string') {
      let message = this.#messages.find((item) => item.id === params.itemId)
      if (!message) {
        message = {
          id: params.itemId,
          turnId: params.turnId,
          role: 'assistant',
          text: '',
          status: 'streaming'
        }
        this.#messages.push(message)
      }
      message.text += params.delta
      message.status = 'streaming'
      this.#emit()
      return
    }

    if (notification.method === 'item/completed'
      && typeof params.turnId === 'string'
      && isObject(params.item)
      && params.item.type === 'agentMessage'
      && typeof params.item.id === 'string'
      && typeof params.item.text === 'string') {
      const completedItem = params.item as { type: 'agentMessage'; id: string; text: string }
      let message = this.#messages.find((item) => item.id === completedItem.id)
      if (!message) {
        message = {
          id: completedItem.id,
          turnId: params.turnId,
          role: 'assistant',
          text: completedItem.text,
          status: 'completed'
        }
        this.#messages.push(message)
      } else {
        message.text = completedItem.text
        message.status = 'completed'
      }
      this.#emit()
      return
    }

    if (notification.method === 'turn/completed' && isObject(params.turn) && typeof params.turn.id === 'string') {
      const status = params.turn.status
      const completed = status === 'completed'
      for (const message of this.#messages) {
        if (message.role === 'assistant' && message.turnId === params.turn.id) {
          message.status = completed ? 'completed' : 'failed'
        }
      }
      this.#activeTurnId = null
      if (!completed) {
        const detail = isObject(params.turn.error) && typeof params.turn.error.message === 'string'
          ? params.turn.error.message
          : 'AI 回覆未完成。'
        this.#connectionDetail = detail
      }
      this.#emit()
    }
  }

  #setConnection(connection: ConnectionPhase, detail: string): void {
    this.#connection = connection
    this.#connectionDetail = detail
    this.#emit()
  }

  #emit(): void {
    this.#events.emit('state', this.getSnapshot())
  }

  async #loadAllowance(client: CodexAppServerClient): Promise<void> {
    try {
      this.#allowance = allowanceFromResult(await client.request('account/rateLimits/read'))
    } catch (error) {
      this.#allowance = unavailableAllowance(error instanceof Error ? error.message : 'AI 使用額度無法取得。')
    }
    this.#emit()
  }

  async #loadModelCatalog(client: CodexAppServerClient): Promise<void> {
    try {
      const models: ConversationModel[] = []
      let cursor: string | null = null
      do {
        const response = await client.request('model/list', { cursor, includeHidden: false })
        if (!isObject(response) || !Array.isArray(response.data)) {
          throw new Error('Codex model catalog returned an unexpected response.')
        }
        for (const candidate of response.data) {
          const model = modelFrom(candidate)
          if (model) models.push(model)
        }
        cursor = typeof response.nextCursor === 'string' ? response.nextCursor : null
      } while (cursor)
      if (models.length === 0) throw new Error('Codex model catalog did not contain a visible model.')
      this.#models = models
      this.#modelCatalogDetail = '已取得可用對話模型。'
      const defaultModel = models.find((model) => model.isDefault) ?? models[0]
      this.#selectedSettings = { modelId: defaultModel.id, reasoningEffort: defaultModel.defaultReasoningEffort }
    } catch (error) {
      this.#models = []
      this.#selectedSettings = null
      this.#modelCatalogDetail = error instanceof Error ? error.message : '對話模型無法取得。'
    }
    this.#emit()
  }

  #disposeClient(): void {
    this.#unsubscribeNotification?.()
    this.#unsubscribeExit?.()
    this.#unsubscribeNotification = undefined
    this.#unsubscribeExit = undefined
    const client = this.#client
    this.#client = undefined
    client?.close()
  }
}
