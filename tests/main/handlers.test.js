import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHandlers } from '../../src/main/handlers.js'

function harness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-ipc-'))
  fs.writeFileSync(path.join(root, 'billing.py'), 'hello\n')
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'node_modules', 'secret.js'), 'SECRET_NODE\n')
  const state = {
    root: null,
    aiBaseUrl: 'http://127.0.0.1:9',
    model: 'fixture-model',
    modelError: ''
  }
  const handlers = new Map()
  let dialogPaths = [root]
  registerHandlers(
    { handle: (name, fn) => handlers.set(name, fn) },
    {
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: dialogPaths })
      },
      getState: () => state,
      setState: (next) => Object.assign(state, next)
    }
  )
  return { root, state, handlers, setDialog: (paths) => { dialogPaths = paths } }
}

test('opening a folder and reading a file stays inside that folder', async () => {
  const { root, handlers } = harness()
  const opened = await handlers.get('workspace:open')()
  assert.equal(opened.canceled, false)
  assert.equal(opened.root, root)
  assert.match(JSON.stringify(opened.tree), /billing\.py/)
  assert.equal(await handlers.get('file:read')({}, 'billing.py'), 'hello\n')
  await handlers.get('file:write')({}, 'billing.py', 'saved\n')
  assert.equal(fs.readFileSync(path.join(root, 'billing.py'), 'utf8'), 'saved\n')
})

test('handler rejects workspace escapes and non-http AI URLs', async () => {
  const { root, handlers } = harness()
  await handlers.get('workspace:open')()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-ipc-out-'))
  const outside = path.join(outsideDir, 'secret.txt')
  fs.writeFileSync(outside, 'nope')
  const escapePath = path.relative(root, outside)
  await assert.rejects(async () => handlers.get('file:read')({}, escapePath), /outside/)
  await assert.rejects(async () => handlers.get('file:write')({}, escapePath, 'x'), /outside/)
  await assert.rejects(async () => handlers.get('file:read')({}, 'node_modules/secret.js'), /outside/)
  await assert.rejects(
    async () => handlers.get('config:set')({}, { aiBaseUrl: 'file:///etc/passwd' }),
    /http/
  )
  assert.equal(fs.readFileSync(outside, 'utf8'), 'nope')
})

test('chat and edits ask for a folder before calling the model', async () => {
  const { handlers } = harness()
  await assert.rejects(async () => handlers.get('ai:ask')({}, { question: 'hi' }), /Open a folder first/)
  await assert.rejects(
    async () => handlers.get('ai:edit')({}, { kind: 'generate', instruction: 'ping', path: 'billing.py' }),
    /Open a folder first/
  )
})
