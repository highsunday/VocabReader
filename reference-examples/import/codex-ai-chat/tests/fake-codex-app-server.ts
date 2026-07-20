import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

export interface RecordedRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

interface FakeCodexOptions {
  failModels?: boolean
  rateLimitsResult?: unknown
  turnDelayMs?: number
}

export function createFakeCodexAppServer(options: FakeCodexOptions = {}): {
  child: ChildProcessWithoutNullStreams
  requests: RecordedRequest[]
  emitNotification(method: string, params: unknown): void
  setRateLimitsFailure(fail: boolean): void
} {
  const events = new EventEmitter() as EventEmitter & Partial<ChildProcessWithoutNullStreams>
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const requests: RecordedRequest[] = []
  let buffer = ''
  let turnCount = 0
  let failRateLimits = false

  Object.assign(events, {
    stdin,
    stdout,
    stderr,
    kill: () => true
  })

  stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      const message = JSON.parse(line) as RecordedRequest
      requests.push(message)
      if (typeof message.id !== 'number') continue

      if (message.method === 'initialize') {
        stdout.write(`${JSON.stringify({ id: message.id, result: { serverInfo: { version: 'fake-1.0.0' } } })}\n`)
      } else if (message.method === 'account/read') {
        stdout.write(`${JSON.stringify({
          id: message.id,
          result: { account: { type: 'chatgpt', email: 'learner@example.com' }, requiresOpenaiAuth: true }
        })}\n`)
      } else if (message.method === 'account/rateLimits/read') {
        if (failRateLimits) {
          stdout.write(`${JSON.stringify({ id: message.id, error: { code: -1, message: 'Allowance temporarily unavailable.' } })}\n`)
        } else {
          stdout.write(`${JSON.stringify({
            id: message.id,
            result: options.rateLimitsResult ?? {
              rateLimits: allowanceSnapshot(10, 20),
              rateLimitsByLimitId: { codex: allowanceSnapshot(24, 38) }
            }
          })}\n`)
        }
      } else if (message.method === 'model/list') {
        if (options.failModels) {
          stdout.write(`${JSON.stringify({ id: message.id, error: { code: -1, message: 'Model catalog unavailable.' } })}\n`)
        } else if (message.params?.cursor === 'page-2') {
          stdout.write(`${JSON.stringify({
            id: message.id,
            result: {
              data: [{
                id: 'gpt-5.3-codex',
                displayName: 'GPT-5.3 Codex',
                hidden: false,
                supportedReasoningEfforts: [
                  { reasoningEffort: 'medium', description: 'Balanced' },
                  { reasoningEffort: 'high', description: 'Thorough' }
                ],
                defaultReasoningEffort: 'high',
                isDefault: false
              }],
              nextCursor: null
            }
          })}\n`)
        } else {
          stdout.write(`${JSON.stringify({
            id: message.id,
            result: {
              data: [
                {
                  id: 'gpt-5.4',
                  displayName: 'GPT-5.4',
                  hidden: false,
                  supportedReasoningEfforts: [
                    { reasoningEffort: 'low', description: 'Fast' },
                    { reasoningEffort: 'medium', description: 'Balanced' },
                    { reasoningEffort: 'high', description: 'Thorough' }
                  ],
                  defaultReasoningEffort: 'medium',
                  isDefault: true
                },
                {
                  id: 'hidden-model',
                  displayName: 'Hidden',
                  hidden: true,
                  supportedReasoningEfforts: [],
                  defaultReasoningEffort: 'medium',
                  isDefault: false
                }
              ],
              nextCursor: 'page-2'
            }
          })}\n`)
        }
      } else if (message.method === 'thread/start') {
        stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: 'thread-1' } } })}\n`)
      } else if (message.method === 'turn/start') {
        const turnId = `turn-${++turnCount}`
        const params = message.params ?? {}
        const input = Array.isArray(params.input) ? params.input[0] : undefined
        const prompt = input && typeof input === 'object' && 'text' in input && typeof input.text === 'string'
          ? input.text
          : ''
        const answer = `Fake Codex answer to: ${prompt}`
        const itemId = `assistant-${turnCount}`
        stdout.write(`${JSON.stringify({ id: message.id, result: { turn: { id: turnId } } })}\n`)
        setTimeout(() => {
          stdout.write(`${JSON.stringify({
            method: 'turn/started',
            params: { threadId: 'thread-1', turn: { id: turnId } }
          })}\n`)
          stdout.write(`${JSON.stringify({
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-1', turnId, itemId, delta: answer.slice(0, 12) }
          })}\n`)
          stdout.write(`${JSON.stringify({
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-1', turnId, itemId, delta: answer.slice(12) }
          })}\n`)
          stdout.write(`${JSON.stringify({
            method: 'item/completed',
            params: { threadId: 'thread-1', turnId, item: { type: 'agentMessage', id: itemId, text: answer } }
          })}\n`)
          stdout.write(`${JSON.stringify({
            method: 'turn/completed',
            params: { threadId: 'thread-1', turn: { id: turnId, status: 'completed', error: null } }
          })}\n`)
        }, options.turnDelayMs ?? 0)
      }
    }
  })

  return {
    child: events as ChildProcessWithoutNullStreams,
    requests,
    emitNotification(method, params) {
      stdout.write(`${JSON.stringify({ method, params })}\n`)
    },
    setRateLimitsFailure(fail) {
      failRateLimits = fail
    }
  }
}

function allowanceSnapshot(fiveHourUsed: number, weeklyUsed: number) {
  return {
    limitId: 'codex',
    primary: {
      usedPercent: weeklyUsed,
      windowDurationMins: 10_080,
      resetsAt: 1_800_000_000
    },
    secondary: {
      usedPercent: fiveHourUsed,
      windowDurationMins: 300,
      resetsAt: 1_700_000_000
    },
    rateLimitReachedType: null
  }
}
