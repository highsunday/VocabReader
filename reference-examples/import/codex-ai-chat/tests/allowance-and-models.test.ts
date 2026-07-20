import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ChatController } from '../src/main/chat-controller.js'
import { SpawnedCodexAppServerClient } from '../src/main/codex-app-server-client.js'
import { createFakeCodexAppServer } from './fake-codex-app-server.js'

function fixture(options: Parameters<typeof createFakeCodexAppServer>[0] = {}) {
  const fake = createFakeCodexAppServer(options)
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({ spawnProcess: () => fake.child }),
    workingDirectory: '/tmp/codex-ai-chat-feature-test'
  })
  return { fake, controller }
}

async function waitUntil(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for state change.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('normalizes allowance and loads visible paginated models', async () => {
  const { controller } = fixture()
  const snapshot = await controller.connect()

  assert.equal(snapshot.allowance.phase, 'available')
  assert.deepEqual(snapshot.allowance.fiveHour, { remainingPercent: 76, resetsAt: 1_700_000_000 })
  assert.deepEqual(snapshot.allowance.weekly, { remainingPercent: 62, resetsAt: 1_800_000_000 })
  assert.deepEqual(snapshot.models.map((model) => model.id), ['gpt-5.4', 'gpt-5.3-codex'])
  assert.deepEqual(snapshot.selectedSettings, { modelId: 'gpt-5.4', reasoningEffort: 'medium' })
  controller.close()
})

test('merges live partial allowance updates without using a turn', async () => {
  const { fake, controller } = fixture()
  await controller.connect()
  fake.emitNotification('account/rateLimits/updated', {
    rateLimits: {
      limitId: 'codex',
      primary: { usedPercent: 50, windowDurationMins: 300, resetsAt: 1_700_000_100 },
      secondary: null,
      rateLimitReachedType: null
    }
  })
  await waitUntil(() => controller.getSnapshot().allowance.fiveHour?.remainingPercent === 50)
  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.allowance.fiveHour?.resetsAt, 1_700_000_100)
  assert.equal(snapshot.allowance.weekly?.remainingPercent, 62)
  assert.equal(fake.requests.filter((request) => request.method === 'turn/start').length, 0)
  controller.close()
})

test('distinguishes an unavailable window from a genuinely exhausted window', async () => {
  const { controller } = fixture({
    rateLimitsResult: {
      rateLimits: {
        limitId: 'codex',
        primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1_700_000_000 },
        secondary: null,
        rateLimitReachedType: 'primary'
      },
      rateLimitsByLimitId: null
    }
  })
  const snapshot = await controller.connect()
  assert.deepEqual(snapshot.allowance.fiveHour, { remainingPercent: 0, resetsAt: 1_700_000_000 })
  assert.equal(snapshot.allowance.weekly, null)
  assert.equal(snapshot.allowance.phase, 'available')
  controller.close()
})

test('allowance refresh failure does not disconnect the conversation', async () => {
  const { fake, controller } = fixture()
  await controller.connect()
  fake.setRateLimitsFailure(true)

  const failed = await controller.refreshAllowance()
  assert.equal(failed.connection, 'ready')
  assert.equal(failed.allowance.phase, 'unavailable')
  assert.match(failed.allowance.detail, /temporarily unavailable/i)

  fake.setRateLimitsFailure(false)
  const recovered = await controller.refreshAllowance()
  assert.equal(recovered.allowance.phase, 'available')
  controller.close()
})

test('preserves compatible effort and falls back for incompatible model changes', async () => {
  const { controller } = fixture()
  await controller.connect()

  let snapshot = controller.updateSettings('gpt-5.4', 'high')
  assert.deepEqual(snapshot.selectedSettings, { modelId: 'gpt-5.4', reasoningEffort: 'high' })

  snapshot = controller.updateSettings('gpt-5.3-codex', 'low')
  assert.deepEqual(snapshot.selectedSettings, { modelId: 'gpt-5.3-codex', reasoningEffort: 'high' })

  snapshot = controller.updateSettings('gpt-5.4', 'high')
  assert.deepEqual(snapshot.selectedSettings, { modelId: 'gpt-5.4', reasoningEffort: 'high' })
  assert.throws(() => controller.updateSettings('made-up-model', 'high'), /not available/i)
  controller.close()
})

test('sends settings to Codex and rejects changes during an active turn', async () => {
  const { fake, controller } = fixture({ turnDelayMs: 30 })
  await controller.connect()
  controller.updateSettings('gpt-5.3-codex', 'medium')

  await controller.sendMessage('Use selected settings')
  assert.throws(() => controller.updateSettings('gpt-5.4', 'low'), /active/i)
  await waitUntil(() => controller.getSnapshot().activeTurnId === null)
  await controller.sendMessage('Keep selected settings')
  await waitUntil(() => controller.getSnapshot().activeTurnId === null)

  const threadStart = fake.requests.find((request) => request.method === 'thread/start')
  const turns = fake.requests.filter((request) => request.method === 'turn/start')
  assert.equal(threadStart?.params?.model, 'gpt-5.3-codex')
  assert.equal(turns.length, 2)
  for (const turn of turns) {
    assert.equal(turn.params?.model, 'gpt-5.3-codex')
    assert.equal(turn.params?.effort, 'medium')
  }
  controller.close()
})

test('keeps chat usable when model catalog is unavailable', async () => {
  const { fake, controller } = fixture({ failModels: true })
  const connected = await controller.connect()
  assert.equal(connected.connection, 'ready')
  assert.deepEqual(connected.models, [])
  assert.equal(connected.selectedSettings, null)

  await controller.sendMessage('Use server defaults')
  await waitUntil(() => controller.getSnapshot().activeTurnId === null)
  const threadStart = fake.requests.find((request) => request.method === 'thread/start')
  const turnStart = fake.requests.find((request) => request.method === 'turn/start')
  assert.equal(threadStart?.params?.model, undefined)
  assert.equal(turnStart?.params?.model, undefined)
  assert.equal(turnStart?.params?.effort, undefined)
  controller.close()
})
