import './styles.css'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { PRESETS } from '../../core/prompts.js'

const LANGUAGE = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  htm: 'html'
}

const ui = {
  openFolder: document.querySelector('#open-folder'),
  save: document.querySelector('#save-file'),
  workspace: document.querySelector('#workspace-label'),
  tree: document.querySelector('#tree'),
  tabs: document.querySelector('#tabs'),
  empty: document.querySelector('#empty-state'),
  selection: document.querySelector('#selection-status'),
  instruction: document.querySelector('#inline-instruction'),
  refactor: document.querySelector('#refactor'),
  fix: document.querySelector('#fix'),
  document: document.querySelector('#document'),
  generate: document.querySelector('#generate'),
  proposal: document.querySelector('#proposal'),
  proposalTitle: document.querySelector('#proposal-title'),
  proposalCode: document.querySelector('#proposal-code'),
  proposalError: document.querySelector('#proposal-error'),
  accept: document.querySelector('#accept'),
  reject: document.querySelector('#reject'),
  transcript: document.querySelector('#transcript'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  ask: document.querySelector('#ask'),
  chatError: document.querySelector('#chat-error'),
  aiStatus: document.querySelector('#ai-status'),
  model: document.querySelector('#model'),
  aiUrl: document.querySelector('#ai-url'),
  detect: document.querySelector('#detect-models')
}

const history = []
const state = { root: null, path: null, pending: null, editor: null, monaco: null }

function errorText(error) {
  const parts = String(error?.message || error).split('Error: ')
  return parts[parts.length - 1].trim() || 'Request failed'
}

function languageFor(filePath) {
  const extension = filePath.split('.').pop()?.toLowerCase()
  return LANGUAGE[extension] || 'plaintext'
}

function setAiStatus(config) {
  ui.aiStatus.textContent = config.model
    ? `Model ${config.model}`
    : config.modelError || 'Set an AI model. The default AI URL is a local Ollama server.'
}

function selectedText() {
  const range = state.editor.getSelection()
  if (!range) return ''
  return state.editor.getModel().getValueInRange(range)
}

function updateSelection() {
  const text = state.path ? selectedText() : ''
  const ready = Boolean(text.trim())
  ui.refactor.disabled = !ready
  ui.fix.disabled = !ready
  ui.document.disabled = !ready
  ui.selection.textContent = ready
    ? `Selected ${text.length} characters.`
    : 'Select code to refactor, fix, or document.'
}

function renderTree(nodes, container) {
  container.replaceChildren()
  for (const node of nodes) {
    if (node.type === 'dir') {
      const details = document.createElement('details')
      details.open = true
      const summary = document.createElement('summary')
      summary.textContent = node.name
      const inner = document.createElement('div')
      renderTree(node.children, inner)
      details.append(summary, inner)
      container.append(details)
    } else {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'file'
      button.textContent = node.name
      button.addEventListener('click', () => openFile(node.path))
      container.append(button)
    }
  }
}

function renderTab() {
  ui.tabs.replaceChildren()
  if (!state.path) return
  const tab = document.createElement('button')
  tab.type = 'button'
  tab.role = 'tab'
  tab.setAttribute('aria-selected', 'true')
  tab.textContent = state.path
  ui.tabs.append(tab)
}

async function openFile(relativePath) {
  const contents = await window.editorApi.readFile(relativePath)
  state.path = relativePath
  state.monaco.editor.setModelLanguage(state.editor.getModel(), languageFor(relativePath))
  state.editor.setValue(contents)
  ui.empty.hidden = true
  ui.save.disabled = false
  ui.generate.disabled = false
  renderTab()
  clearProposal()
  updateSelection()
}

async function save() {
  if (!state.path) {
    ui.proposalError.textContent = 'Open a file first.'
    return
  }
  await window.editorApi.writeFile(state.path, state.editor.getValue())
  ui.aiStatus.textContent = `Saved ${state.path}`
}

function clearProposal() {
  state.pending = null
  ui.proposal.hidden = true
  ui.proposalCode.textContent = ''
  ui.proposalError.textContent = ''
  ui.accept.disabled = true
}

function showProposal(title, code) {
  ui.proposal.hidden = false
  ui.proposalTitle.textContent = title
  ui.proposalCode.textContent = code
  ui.proposalError.textContent = ''
  ui.accept.disabled = false
}

function showProposalError(message) {
  state.pending = null
  ui.proposal.hidden = false
  ui.proposalTitle.textContent = 'Edit'
  ui.proposalCode.textContent = ''
  ui.proposalError.textContent = message
  ui.accept.disabled = true
}

function appendMessage(role, content, paths = []) {
  const article = document.createElement('article')
  article.className = `message ${role}`
  if (role === 'assistant') {
    const using = document.createElement('p')
    using.className = 'using'
    using.textContent = paths.length ? `Using ${paths.join(', ')}` : 'Using no project files'
    article.append(using)
  }
  const body = document.createElement('p')
  body.className = 'body'
  body.textContent = content
  article.append(body)
  ui.transcript.append(article)
  ui.transcript.scrollTop = ui.transcript.scrollHeight
}

async function persistConfig() {
  const config = await window.editorApi.setConfig({
    aiBaseUrl: ui.aiUrl.value,
    model: ui.model.value
  })
  setAiStatus(config)
}

async function runEdit(kind) {
  if (!state.path) {
    showProposalError('Open a file first.')
    return
  }
  const preset = PRESETS[kind] || ''
  const instruction = ui.instruction.value.trim() || preset
  const range = state.editor.getSelection()
  const selection = state.editor.getModel().getValueInRange(range)
  const buttons = [ui.refactor, ui.fix, ui.document, ui.generate]
  buttons.forEach((button) => {
    button.disabled = true
  })
  try {
    const result = await window.editorApi.edit({
      kind,
      instruction,
      path: state.path,
      selection,
      fileText: state.editor.getValue()
    })
    state.pending = {
      path: state.path,
      code: result.code,
      range: {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn
      }
    }
    const titles = { refactor: 'Refactor', fix: 'Fix', document: 'Document', generate: 'Generate' }
    showProposal(titles[kind], result.code)
  } catch (error) {
    showProposalError(errorText(error))
  } finally {
    updateSelection()
    ui.generate.disabled = !state.path
  }
}

function acceptEdit() {
  if (!state.pending || state.pending.path !== state.path) {
    showProposalError('Open the original file to accept this edit.')
    return
  }
  const range = state.pending.range
  state.editor.executeEdits('ai', [
    {
      range: new state.monaco.Range(
        range.startLineNumber,
        range.startColumn,
        range.endLineNumber,
        range.endColumn
      ),
      text: state.pending.code,
      forceMoveMarkers: true
    }
  ])
  clearProposal()
  updateSelection()
}

async function ask(question) {
  ui.chatError.textContent = ''
  if (!state.root) {
    ui.chatError.textContent = 'Open a folder first.'
    return
  }
  const prior = history.slice()
  history.push({ role: 'user', content: question })
  appendMessage('user', question)
  ui.ask.disabled = true
  try {
    const result = await window.editorApi.ask({
      question,
      history: prior,
      activePath: state.path,
      activeText: state.path ? state.editor.getValue() : ''
    })
    history.push({ role: 'assistant', content: result.answer })
    appendMessage('assistant', result.answer, result.paths)
  } catch (error) {
    history.pop()
    ui.chatError.textContent = errorText(error)
  } finally {
    ui.ask.disabled = false
  }
}

async function boot() {
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
  const monaco = await import('monaco-editor/editor/editor.api.js')
  await Promise.all([
    import('monaco-editor/languages/definitions/python/register.js'),
    import('monaco-editor/languages/definitions/javascript/register.js'),
    import('monaco-editor/languages/definitions/typescript/register.js'),
    import('monaco-editor/languages/definitions/css/register.js'),
    import('monaco-editor/languages/definitions/html/register.js'),
    import('monaco-editor/languages/definitions/markdown/register.js'),
    import('monaco-editor/languages/features/json/register.js')
  ])
  state.monaco = monaco
  state.editor = monaco.editor.create(document.querySelector('#editor'), {
    value: '',
    language: 'plaintext',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    fontFamily: 'ui-monospace, "Ubuntu Mono", monospace',
    scrollBeyondLastLine: false
  })
  state.editor.onDidChangeCursorSelection(updateSelection)

  const config = await window.editorApi.getConfig()
  state.root = config.root
  ui.model.value = config.model
  ui.aiUrl.value = config.aiBaseUrl
  setAiStatus(config)
  if (config.root) {
    ui.workspace.textContent = config.root
    renderTree(await window.editorApi.listFiles(), ui.tree)
  }

  ui.openFolder.addEventListener('click', async () => {
    const result = await window.editorApi.openFolder()
    if (result.canceled) return
    state.root = result.root
    ui.workspace.textContent = result.root
    renderTree(result.tree, ui.tree)
  })
  ui.save.addEventListener('click', () => {
    save().catch((error) => {
      ui.chatError.textContent = errorText(error)
    })
  })
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      save().catch((error) => {
        ui.chatError.textContent = errorText(error)
      })
    }
  })
  ui.refactor.addEventListener('click', () => runEdit('refactor'))
  ui.fix.addEventListener('click', () => runEdit('fix'))
  ui.document.addEventListener('click', () => runEdit('document'))
  ui.generate.addEventListener('click', () => runEdit('generate'))
  ui.accept.addEventListener('click', acceptEdit)
  ui.reject.addEventListener('click', clearProposal)
  ui.chatForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const question = ui.chatInput.value.trim()
    if (!question) return
    ui.chatInput.value = ''
    ask(question)
  })
  ui.model.addEventListener('change', () => {
    persistConfig().catch((error) => {
      ui.aiStatus.textContent = errorText(error)
    })
  })
  ui.aiUrl.addEventListener('change', () => {
    persistConfig().catch((error) => {
      ui.aiStatus.textContent = errorText(error)
    })
  })
  ui.detect.addEventListener('click', async () => {
    try {
      const models = await window.editorApi.listModels()
      if (!models.length) {
        ui.aiStatus.textContent = 'No models reported by the AI server.'
        return
      }
      ui.model.value = models[0]
      await persistConfig()
    } catch (error) {
      ui.aiStatus.textContent = errorText(error)
    }
  })
  updateSelection()
}

boot().catch((error) => {
  ui.chatError.textContent = errorText(error)
})
