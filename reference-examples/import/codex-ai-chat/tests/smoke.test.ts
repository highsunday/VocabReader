import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ChatController } from '../src/main/chat-controller.js'
import { SpawnedCodexAppServerClient } from '../src/main/codex-app-server-client.js'
import { createFakeCodexAppServer } from './fake-codex-app-server.js'

async function waitUntil(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the fake Codex response.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('connects, streams answers, and continues two turns on one Codex thread', async () => {
  const fake = createFakeCodexAppServer()
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({ spawnProcess: () => fake.child }),
    workingDirectory: '/tmp/codex-ai-chat-smoke-test'
  })

  const connected = await controller.connect()
  assert.equal(connected.connection, 'ready')

  await controller.sendMessage('First question')
  await waitUntil(() => controller.getSnapshot().activeTurnId === null)
  await controller.sendMessage('Follow-up question')
  await waitUntil(() => controller.getSnapshot().activeTurnId === null)

  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.threadId, 'thread-1')
  assert.deepEqual(
    snapshot.messages.map((message) => [message.role, message.text, message.status]),
    [
      ['user', 'First question', 'completed'],
      ['assistant', 'Fake Codex answer to: First question', 'completed'],
      ['user', 'Follow-up question', 'completed'],
      ['assistant', 'Fake Codex answer to: Follow-up question', 'completed']
    ]
  )

  const threadStarts = fake.requests.filter((request) => request.method === 'thread/start')
  const turnStarts = fake.requests.filter((request) => request.method === 'turn/start')
  assert.equal(threadStarts.length, 1)
  assert.equal(turnStarts.length, 2)
  assert.equal(turnStarts[0]?.params?.threadId, 'thread-1')
  assert.equal(turnStarts[1]?.params?.threadId, 'thread-1')
  controller.close()
})
