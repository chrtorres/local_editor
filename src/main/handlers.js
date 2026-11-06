import { listTree, readFile, writeFile } from '../core/workspace.js'
import { answerQuestion, proposeEdit } from '../core/session.js'
import { listModels, normalizeModel, parseAiBaseUrl } from '../core/ai.js'

function requireRoot(state) {
  if (!state.root) throw new Error('Open a folder first.')
  return state.root
}

export function registerHandlers(ipcMain, { dialog, getState, setState }) {
  ipcMain.handle('config:get', () => {
    const state = getState()
    return {
      aiBaseUrl: state.aiBaseUrl,
      model: state.model,
      root: state.root,
      modelError: state.modelError || ''
    }
  })

  ipcMain.handle('config:set', (_event, patch) => {
    const next = { ...getState() }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'aiBaseUrl')) {
      next.aiBaseUrl = parseAiBaseUrl(patch.aiBaseUrl)
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'model')) {
      next.model = normalizeModel(patch.model, { allowEmpty: true })
      next.modelError = ''
    }
    setState(next)
    return {
      aiBaseUrl: next.aiBaseUrl,
      model: next.model,
      root: next.root,
      modelError: next.modelError || ''
    }
  })

  ipcMain.handle('workspace:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true }
    const root = result.filePaths[0]
    setState({ ...getState(), root })
    return { canceled: false, root, tree: listTree(root) }
  })

  ipcMain.handle('workspace:list', () => listTree(requireRoot(getState())))

  ipcMain.handle('file:read', (_event, relativePath) => readFile(requireRoot(getState()), relativePath))

  ipcMain.handle('file:write', (_event, relativePath, contents) => {
    writeFile(requireRoot(getState()), relativePath, contents)
    return { ok: true }
  })

  ipcMain.handle('ai:ask', (_event, payload = {}) => {
    const state = getState()
    return answerQuestion({
      root: requireRoot(state),
      ai: { baseUrl: state.aiBaseUrl, model: state.model },
      question: payload.question,
      history: payload.history ?? [],
      activePath: payload.activePath ?? null,
      activeText: payload.activeText ?? ''
    })
  })

  ipcMain.handle('ai:edit', (_event, payload = {}) => {
    const state = getState()
    requireRoot(state)
    return proposeEdit({
      ai: { baseUrl: state.aiBaseUrl, model: state.model },
      kind: payload.kind,
      instruction: payload.instruction,
      path: payload.path,
      selection: payload.selection ?? '',
      fileText: payload.fileText ?? ''
    })
  })

  ipcMain.handle('ai:models', () => listModels(getState().aiBaseUrl))
}
