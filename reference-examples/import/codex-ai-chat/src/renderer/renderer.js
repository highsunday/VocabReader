const connection = document.querySelector('#connection')
const messages = document.querySelector('#messages')
const composer = document.querySelector('#composer')
const question = document.querySelector('#question')
const send = document.querySelector('#send')
const hint = document.querySelector('#hint')
const allowanceFiveHour = document.querySelector('#allowance-five-hour')
const allowanceWeekly = document.querySelector('#allowance-weekly')
const refreshAllowance = document.querySelector('#refresh-allowance')
const settingsDetail = document.querySelector('#settings-detail')
const settingsTrigger = document.querySelector('#settings-trigger')
const settingsSummary = document.querySelector('#settings-summary')
const settingsPopover = document.querySelector('#settings-popover')
const modelOptions = document.querySelector('#model-options')
const effortOptions = document.querySelector('#effort-options')
const allowance = document.querySelector('#allowance')
let currentSnapshot

const effortLabels = {
  none: '無',
  minimal: '極低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '最高'
}

function resetLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return ''
  const value = new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  return ` · ${value} 重置`
}

function allowanceLabel(window, phase) {
  if (window) return `剩餘 ${window.remainingPercent}%${resetLabel(window.resetsAt)}`
  return phase === 'loading' ? '取得中…' : '無法取得'
}

function compactAllowanceLabel(window, phase) {
  if (window) return `${window.remainingPercent}%`
  return phase === 'loading' ? '…' : '—'
}

function effortLabel(value) {
  return effortLabels[value] ?? value
}

function compactModelName(value) {
  return value.replace(/^gpt-/i, '').replaceAll('-', ' ')
}

function closeSettingsPopover() {
  settingsPopover.hidden = true
  settingsTrigger.setAttribute('aria-expanded', 'false')
}

function createSettingsOption({ label, description, selected, onSelect }) {
  const option = document.createElement('button')
  option.type = 'button'
  option.className = `settings-option${selected ? ' selected' : ''}`
  option.setAttribute('role', 'radio')
  option.setAttribute('aria-checked', String(selected))

  const copy = document.createElement('span')
  copy.className = 'settings-option-copy'
  const name = document.createElement('strong')
  name.textContent = label
  copy.append(name)
  if (description) {
    const detail = document.createElement('small')
    detail.textContent = description
    copy.append(detail)
  }

  const check = document.createElement('span')
  check.className = 'settings-check'
  check.setAttribute('aria-hidden', 'true')
  check.textContent = selected ? '✓' : ''
  option.append(copy, check)
  option.addEventListener('click', onSelect)
  return option
}

function renderSettings(snapshot, busy) {
  const selectedModel = snapshot.models.find((item) => item.id === snapshot.selectedSettings?.modelId)
  const selectedEffort = snapshot.selectedSettings?.reasoningEffort
  const unavailable = snapshot.models.length === 0 || !selectedModel

  settingsSummary.textContent = selectedModel
    ? `${compactModelName(selectedModel.displayName)}${selectedEffort ? `　${effortLabel(selectedEffort)}` : ''}`
    : '模型設定'
  settingsTrigger.disabled = busy || unavailable
  settingsTrigger.title = busy ? '回覆完成後可變更模型' : (snapshot.modelCatalogDetail ?? '')
  settingsDetail.textContent = snapshot.models.length === 0 ? snapshot.modelCatalogDetail : ''
  if (settingsTrigger.disabled) closeSettingsPopover()

  modelOptions.replaceChildren()
  for (const item of snapshot.models) {
    modelOptions.append(createSettingsOption({
      label: item.displayName,
      description: item.id,
      selected: item.id === selectedModel?.id,
      onSelect: async () => {
        const currentEffort = currentSnapshot?.selectedSettings?.reasoningEffort
        const requestedEffort = item.supportedReasoningEfforts.some(
          (supported) => supported.reasoningEffort === currentEffort
        ) ? currentEffort : item.defaultReasoningEffort
        closeSettingsPopover()
        try {
          render(await window.codexChat.updateSettings(item.id, requestedEffort))
        } catch (error) {
          hint.textContent = error instanceof Error ? error.message : String(error)
        }
      }
    }))
  }

  effortOptions.replaceChildren()
  for (const item of selectedModel?.supportedReasoningEfforts ?? []) {
    effortOptions.append(createSettingsOption({
      label: effortLabel(item.reasoningEffort),
      description: item.description,
      selected: item.reasoningEffort === selectedEffort,
      onSelect: async () => {
        closeSettingsPopover()
        try {
          render(await window.codexChat.updateSettings(selectedModel.id, item.reasoningEffort))
        } catch (error) {
          hint.textContent = error instanceof Error ? error.message : String(error)
        }
      }
    }))
  }
}

function render(snapshot) {
  currentSnapshot = snapshot
  const busy = Boolean(snapshot.activeTurnId)
  const labels = {
    disconnected: '尚未連線',
    connecting: '連線中…',
    ready: 'Codex 已連線',
    'auth-required': '需要登入',
    error: '連線失敗'
  }
  connection.textContent = labels[snapshot.connection] ?? snapshot.connection
  connection.dataset.phase = snapshot.connection
  connection.title = snapshot.connectionDetail
  send.disabled = snapshot.connection === 'connecting' || busy
  question.disabled = busy
  hint.textContent = busy ? 'Codex 正在回覆…' : snapshot.connectionDetail
  const fiveHourLabel = allowanceLabel(snapshot.allowance.fiveHour, snapshot.allowance.phase)
  const weeklyLabel = allowanceLabel(snapshot.allowance.weekly, snapshot.allowance.phase)
  allowanceFiveHour.textContent = compactAllowanceLabel(snapshot.allowance.fiveHour, snapshot.allowance.phase)
  allowanceWeekly.textContent = compactAllowanceLabel(snapshot.allowance.weekly, snapshot.allowance.phase)
  allowanceFiveHour.setAttribute('aria-label', `5 小時 ${fiveHourLabel}`)
  allowanceWeekly.setAttribute('aria-label', `一週 ${weeklyLabel}`)
  refreshAllowance.disabled = snapshot.connection !== 'ready' || snapshot.allowance.phase === 'loading'
  allowance.title = `5 小時：${fiveHourLabel}\n一週：${weeklyLabel}`
  renderSettings(snapshot, busy)

  messages.replaceChildren()
  if (snapshot.messages.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    const title = document.createElement('h2')
    title.textContent = '從一個問題開始'
    const body = document.createElement('p')
    body.textContent = '此範例使用本機 Codex 登入狀態，對話只保留到程式關閉為止。'
    empty.append(title, body)
    messages.append(empty)
    return
  }

  for (const message of snapshot.messages) {
    const article = document.createElement('article')
    article.className = `message ${message.role}`
    const role = document.createElement('div')
    role.className = 'role'
    role.textContent = message.role === 'user' ? '你' : 'Codex'
    const text = document.createElement('div')
    text.className = 'message-text'
    text.textContent = message.text || '…'
    article.append(role, text)
    messages.append(article)
  }
  messages.scrollTop = messages.scrollHeight
}

window.codexChat.onStateChanged(render)
window.codexChat.getState().then(render)
window.codexChat.connect().then(render)

composer.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = question.value.trim()
  if (!text) return
  hint.textContent = ''
  try {
    await window.codexChat.sendMessage(text)
    question.value = ''
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : String(error)
  }
})

refreshAllowance.addEventListener('click', async () => {
  hint.textContent = ''
  try {
    render(await window.codexChat.refreshAllowance())
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : String(error)
  }
})

settingsTrigger.addEventListener('click', () => {
  const willOpen = settingsPopover.hidden
  settingsPopover.hidden = !willOpen
  settingsTrigger.setAttribute('aria-expanded', String(willOpen))
  if (willOpen) {
    settingsPopover.querySelector('[aria-checked="true"]')?.focus()
  }
})

document.addEventListener('pointerdown', (event) => {
  if (
    !settingsPopover.hidden &&
    !settingsPopover.contains(event.target) &&
    !settingsTrigger.contains(event.target)
  ) closeSettingsPopover()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsPopover.hidden) {
    closeSettingsPopover()
    settingsTrigger.focus()
  }
})

question.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    composer.requestSubmit()
  }
})
