import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCodeBlock } from '../../src/core/edit.js'

test('extracts a fenced replacement and keeps the language tag off the code', () => {
  const result = extractCodeBlock('Sure.\n```python\ndef charge_customer():\n    return 1\n```\nThanks.')
  assert.equal(result.ok, true)
  assert.equal(result.code, 'def charge_customer():\n    return 1')
})

test('prose without a fence is not an edit', () => {
  const result = extractCodeBlock('I would rename the function.')
  assert.equal(result.ok, false)
  assert.match(result.error, /code block/)
})

test('an empty fence is not an edit', () => {
  const result = extractCodeBlock('```\n   \n```')
  assert.equal(result.ok, false)
})
