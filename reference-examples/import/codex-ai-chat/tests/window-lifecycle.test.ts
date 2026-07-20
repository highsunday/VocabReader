import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import { createWindowManager } from '../src/main/window-manager.js'

class FakeWindow extends EventEmitter {
  destroyed = false
  focusCount = 0

  isDestroyed(): boolean {
    return this.destroyed
  }

  focus(): void {
    this.focusCount += 1
  }

  close(): void {
    this.destroyed = true
    this.emit('closed')
  }
}

test('retains the main window until it closes and creates a replacement afterward', () => {
  const created: FakeWindow[] = []
  const manager = createWindowManager(() => {
    const window = new FakeWindow()
    created.push(window)
    return window
  })

  const first = manager.open()
  assert.equal(manager.current(), first)
  assert.equal(manager.open(), first)
  assert.equal(first.focusCount, 1)

  first.close()
  assert.equal(manager.current(), null)

  const second = manager.open()
  assert.notEqual(second, first)
  assert.equal(created.length, 2)
})
