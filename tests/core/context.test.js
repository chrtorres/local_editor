import test from 'node:test'
import assert from 'node:assert/strict'
import { selectContext } from '../../src/core/context.js'

const files = [
  {
    path: 'billing.py',
    text: 'def charge_customer(amount_cents):\n    return {"charged": amount_cents}\n'
  },
  {
    path: 'weather.md',
    text: 'WEATHER_SENTINEL_Q9\nThe forecast is rain.\n'
  }
]

test('symbol question selects the defining file and leaves the decoy out', () => {
  const hit = selectContext(files, 'Where is charge_customer defined and what argument does it take?')
  assert.deepEqual(
    hit.map((file) => file.path),
    ['billing.py']
  )
  assert.match(hit[0].excerpt, /def charge_customer/)
  assert.equal(hit[0].excerpt.includes('WEATHER_SENTINEL_Q9'), false)
})

test('forecast question selects the weather note only', () => {
  const hit = selectContext(files, 'What is the forecast?')
  assert.deepEqual(
    hit.map((file) => file.path),
    ['weather.md']
  )
})

test('empty and stopword-only questions select nothing', () => {
  assert.deepEqual(selectContext(files, '   '), [])
  assert.deepEqual(selectContext(files, 'the and of'), [])
})

test('excerpts honor the character cap', () => {
  const hit = selectContext([{ path: 'a.txt', text: 'x'.repeat(100) }], 'xxx', { excerptChars: 10 })
  assert.equal(hit[0].excerpt.length, 10)
})
