import test from 'node:test'
import assert from 'node:assert/strict'
import { complete, parseAiBaseUrl, replyText } from '../../src/core/ai.js'
import { startStub } from '../helpers/stub.js'

test('AI URL must be http or https', () => {
  assert.equal(parseAiBaseUrl('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434')
  assert.throws(() => parseAiBaseUrl('file:///etc/passwd'), /http/)
  assert.throws(() => parseAiBaseUrl('not a url'), /not valid/)
})

test('reads an Ollama chat reply and an OpenAI-shaped reply', () => {
  assert.equal(replyText({ message: { content: 'ollama' } }), 'ollama')
  assert.equal(replyText({ choices: [{ message: { content: 'openai' } }] }), 'openai')
  assert.throws(() => replyText({ message: { content: '   ' } }), /empty/)
})

test('complete returns the stub reply and surfaces HTTP failures', async () => {
  const stub = await startStub()
  try {
    const text = await complete(
      { baseUrl: stub.url, model: 'fixture-model' },
      [{ role: 'user', content: 'def charge_customer(amount_cents):\n    return {"charged": amount_cents}\n' }]
    )
    assert.equal(text, 'charge_customer takes amount_cents')
    await assert.rejects(
      () => complete({ baseUrl: stub.url, model: 'fixture-model' }, [{ role: 'user', content: 'FORCE_500 please' }]),
      /AI request failed \(500\)/
    )
  } finally {
    await stub.close()
  }
})

test('an unreachable AI endpoint fails before a reply is invented', async () => {
  await assert.rejects(
    () => complete({ baseUrl: 'http://127.0.0.1:9', model: 'fixture-model' }, [{ role: 'user', content: 'hi' }]),
    /unreachable/
  )
})
