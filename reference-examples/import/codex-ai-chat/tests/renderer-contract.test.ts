import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

test('exposes only typed controls and renders allowance, model, and effort surfaces', async () => {
  const root = process.cwd()
  const [html, preload, main] = await Promise.all([
    readFile(join(root, 'src/renderer/index.html'), 'utf8'),
    readFile(join(root, 'src/preload/index.cts'), 'utf8'),
    readFile(join(root, 'src/main/index.ts'), 'utf8')
  ])

  assert.match(html, /id="allowance"/)
  assert.match(html, /id="settings-trigger"/)
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /id="settings-popover"/)
  assert.match(html, /id="model-options"/)
  assert.match(html, /id="effort-options"/)
  assert.doesNotMatch(html, /<select/)
  assert.match(preload, /refreshAllowance/)
  assert.match(preload, /updateSettings/)
  assert.doesNotMatch(preload, /rawRequest|sendRaw|spawnProcess/)
  assert.match(main, /chat:refresh-allowance/)
  assert.match(main, /chat:update-settings/)
})
