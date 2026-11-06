import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PRESETS } from '../../src/core/prompts.js'
import { answerQuestion, proposeEdit } from '../../src/core/session.js'
import { startStub } from '../helpers/stub.js'

const billing = 'def charge_customer(amount_cents):\n    return {"charged": amount_cents}\n'
const weather = 'WEATHER_SENTINEL_Q9\nThe forecast is rain.\n'

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-session-'))
  fs.writeFileSync(path.join(root, 'billing.py'), billing)
  fs.writeFileSync(path.join(root, 'weather.md'), weather)
  return root
}

test('a codebase question sends the defining file and not the decoy', async () => {
  const stub = await startStub()
  const root = project()
  try {
    const result = await answerQuestion({
      root,
      ai: { baseUrl: stub.url, model: 'fixture-model' },
      question: 'Where is charge_customer defined and what argument does it take?',
      activePath: 'billing.py',
      activeText: billing
    })
    assert.deepEqual(result.paths, ['billing.py'])
    assert.equal(result.answer, 'charge_customer takes amount_cents')
    const body = JSON.stringify(stub.requests.at(-1))
    assert.match(body, /def charge_customer/)
    assert.equal(body.includes('WEATHER_SENTINEL_Q9'), false)
  } finally {
    await stub.close()
  }
})

test('a follow-up includes the earlier answer', async () => {
  const stub = await startStub()
  const root = project()
  try {
    const first = await answerQuestion({
      root,
      ai: { baseUrl: stub.url, model: 'fixture-model' },
      question: 'Where is charge_customer defined and what argument does it take?',
      activePath: 'billing.py',
      activeText: billing
    })
    const second = await answerQuestion({
      root,
      ai: { baseUrl: stub.url, model: 'fixture-model' },
      question: 'repeat the argument name',
      history: [
        { role: 'user', content: 'Where is charge_customer defined and what argument does it take?' },
        { role: 'assistant', content: first.answer }
      ],
      activePath: 'billing.py',
      activeText: billing
    })
    assert.equal(second.answer, 'still amount_cents')
  } finally {
    await stub.close()
  }
})

test('inline edits send the selection and return only the fenced code', async () => {
  const stub = await startStub()
  try {
    const result = await proposeEdit({
      ai: { baseUrl: stub.url, model: 'fixture-model' },
      kind: 'refactor',
      instruction: PRESETS.refactor,
      path: 'billing.py',
      selection: billing,
      fileText: billing
    })
    assert.equal(result.code, 'REFACTORED_OK')
    const body = JSON.stringify(stub.requests.at(-1))
    assert.match(body, /INSTRUCTION: Refactor the selected code/)
    assert.match(body, /def charge_customer/)
  } finally {
    await stub.close()
  }
})

test('an empty selection does not call the model', async () => {
  const stub = await startStub()
  try {
    await assert.rejects(
      () =>
        proposeEdit({
          ai: { baseUrl: stub.url, model: 'fixture-model' },
          kind: 'fix',
          instruction: PRESETS.fix,
          path: 'billing.py',
          selection: '   ',
          fileText: billing
        }),
      /Select some code first/
    )
    assert.equal(stub.requests.length, 0)
  } finally {
    await stub.close()
  }
})

test('prose without a code fence is rejected', async () => {
  const stub = await startStub()
  try {
    await assert.rejects(
      () =>
        proposeEdit({
          ai: { baseUrl: stub.url, model: 'fixture-model' },
          kind: 'refactor',
          instruction: 'NO_FENCE',
          path: 'billing.py',
          selection: billing,
          fileText: billing
        }),
      /did not return a code block/
    )
  } finally {
    await stub.close()
  }
})

test('a model HTTP 500 is reported and not turned into code', async () => {
  const stub = await startStub()
  const root = project()
  try {
    await assert.rejects(
      () =>
        answerQuestion({
          root,
          ai: { baseUrl: stub.url, model: 'fixture-model' },
          question: 'FORCE_500 please'
        }),
      /AI request failed \(500\)/
    )
  } finally {
    await stub.close()
  }
})
