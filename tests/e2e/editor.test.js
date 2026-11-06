import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'
import { PRESETS } from '../../src/core/prompts.js'
import { startStub } from '../helpers/stub.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ORIGINAL = 'def charge_customer(amount_cents):\n    return {"charged": amount_cents}\n'
const WEATHER = 'WEATHER_SENTINEL_Q9\nThe forecast is rain.\n'

async function waitFor(fn, timeout = 20000) {
  const start = Date.now()
  let last = 'timed out'
  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
      last = 'condition was false'
    } catch (error) {
      last = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(last)
}

async function editorText(page) {
  const text = await page.locator('.view-lines').innerText()
  return text.replace(/\u00a0/g, ' ')
}

async function focusEditor(page) {
  await page.locator('.view-lines').click()
}

test('desktop editor session', { timeout: 180000 }, async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-ui-'))
  const billing = path.join(fixture, 'billing.py')
  fs.writeFileSync(billing, ORIGINAL)
  fs.writeFileSync(path.join(fixture, 'weather.md'), WEATHER)
  const stub = await startStub()
  const app = await electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', '--disable-gpu', root],
    cwd: root,
    env: {
      ...process.env,
      LOCAL_EDITOR_AI_URL: stub.url,
      LOCAL_EDITOR_MODEL: 'fixture-model'
    },
    timeout: 60000
  })
  let page
  try {
    page = await app.firstWindow({ timeout: 60000 })
    page.on('console', (message) => console.log('RENDERER', message.type(), message.text()))
    page.on('pageerror', (error) => console.log('PAGEERROR', error.message))
    await page.waitForSelector('.monaco-editor', { timeout: 30000 })

    await page.getByLabel('Question about this project').fill('hello from an empty window')
    await page.getByRole('button', { name: 'Ask' }).click()
    await waitFor(async () => (await page.locator('#chat-error').innerText()).includes('Open a folder first.'))
    assert.equal(stub.requests.length, 0)
    assert.equal(await page.getByRole('button', { name: 'Refactor' }).isDisabled(), true)

    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [folder] })
    }, fixture)
    await page.getByRole('button', { name: 'Open Folder' }).click()
    await page.getByRole('button', { name: 'billing.py', exact: true }).click()
    await waitFor(async () => (await editorText(page)).includes('amount_cents'))
    await page.getByRole('button', { name: 'weather.md', exact: true }).click()
    await waitFor(async () => (await editorText(page)).includes('WEATHER_SENTINEL_Q9'))
    await page.getByRole('button', { name: 'billing.py', exact: true }).click()
    await waitFor(async () => (await editorText(page)).includes('def charge_customer'))

    await focusEditor(page)
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText('saved_marker = 1\n')
    await page.getByRole('button', { name: 'Save' }).click()
    await waitFor(async () => (await page.locator('#ai-status').innerText()).includes('Saved billing.py'))
    assert.match(fs.readFileSync(billing, 'utf8'), /saved_marker = 1/)
    fs.writeFileSync(billing, ORIGINAL)
    await reloadBilling()

    await page.getByLabel('Question about this project').fill(
      'Where is charge_customer defined and what argument does it take?'
    )
    await page.getByRole('button', { name: 'Ask' }).click()
    await waitFor(async () => (await page.locator('#transcript').innerText()).includes('charge_customer takes amount_cents'))
    const transcript = await page.locator('#transcript').innerText()
    assert.match(transcript, /Using billing\.py/)
    assert.equal(transcript.includes('WEATHER_SENTINEL_Q9'), false)
    assert.equal(transcript.includes('WRONG_CONTEXT'), false)
    const chatRequest = stub.requests.find((item) =>
      JSON.stringify(item.messages).includes('Where is charge_customer defined')
    )
    const chatBody = JSON.stringify(chatRequest.messages)
    assert.match(chatBody, /def charge_customer/)
    assert.equal(chatBody.includes('WEATHER_SENTINEL_Q9'), false)

    await page.getByLabel('Question about this project').fill('repeat the argument name')
    await page.getByRole('button', { name: 'Ask' }).click()
    await waitFor(async () => (await page.locator('#transcript').innerText()).includes('still amount_cents'))

    async function reloadBilling() {
      const reject = page.getByRole('button', { name: 'Reject' })
      if (await reject.isVisible()) await reject.click()
      fs.writeFileSync(billing, ORIGINAL)
      await page.getByRole('button', { name: 'billing.py', exact: true }).click()
      await waitFor(async () => {
        const text = await editorText(page)
        return text.includes('amount_cents') && !/saved_marker|REFACTORED_OK|FIXED_OK|DOCUMENTED_OK|GENERATED_OK/.test(text)
      })
      await page.locator('#inline-instruction').fill('')
    }

    async function selectAll(page) {
      await page.locator('#inline-instruction').fill('')
      await focusEditor(page)
      await page.keyboard.press('Control+A')
      await waitFor(async () => (await page.locator('#selection-status').innerText()).includes('Selected'))
    }

    async function accept(marker) {
      await waitFor(async () => (await page.locator('#proposal-code').innerText()).includes(marker))
      assert.equal((await editorText(page)).includes(marker), false)
      await page.getByRole('button', { name: 'Accept' }).click()
      await waitFor(async () => (await editorText(page)).includes(marker))
    }

    await selectAll(page)
    await page.getByRole('button', { name: 'Refactor' }).click()
    await accept('REFACTORED_OK')
    const refactorBody = JSON.stringify(
      stub.requests.find((item) => JSON.stringify(item.messages).includes(`INSTRUCTION: ${PRESETS.refactor}`)).messages
    )
    assert.match(refactorBody, /def charge_customer/)

    await reloadBilling()
    await selectAll(page)
    await page.getByRole('button', { name: 'Fix' }).click()
    await accept('FIXED_OK')
    assert.ok(
      stub.requests.some((item) => JSON.stringify(item.messages).includes(`INSTRUCTION: ${PRESETS.fix}`))
    )

    await reloadBilling()
    await selectAll(page)
    await page.getByRole('button', { name: 'Document' }).click()
    await accept('DOCUMENTED_OK')
    assert.ok(
      stub.requests.some((item) => JSON.stringify(item.messages).includes(`INSTRUCTION: ${PRESETS.document}`))
    )

    await reloadBilling()
    await focusEditor(page)
    await page.keyboard.press('Control+End')
    await waitFor(async () =>
      (await page.locator('#selection-status').innerText()).includes('Select code to refactor')
    )
    await page.locator('#inline-instruction').fill('add a ping function')
    await page.getByRole('button', { name: 'Generate' }).click()
    await accept('GENERATED_OK')
    assert.match(await editorText(page), /charge_customer/)
    assert.match(await editorText(page), /GENERATED_OK/)

    await reloadBilling()
    await selectAll(page)
    const beforeReject = stub.requests.length
    await page.getByRole('button', { name: 'Refactor' }).click()
    await waitFor(async () => (await page.locator('#proposal-code').innerText()).includes('REFACTORED_OK'))
    assert.equal((await editorText(page)).includes('REFACTORED_OK'), false)
    await page.getByRole('button', { name: 'Reject' }).click()
    await waitFor(async () => page.locator('#proposal').isHidden())
    assert.equal((await editorText(page)).includes('REFACTORED_OK'), false)
    assert.match(await editorText(page), /charge_customer/)
    assert.ok(stub.requests.length > beforeReject)

    await selectAll(page)
    await page.locator('#inline-instruction').fill('NO_FENCE')
    await page.getByRole('button', { name: 'Refactor' }).click()
    await waitFor(async () =>
      (await page.locator('#proposal-error').innerText()).includes('The model did not return a code block.')
    )
    assert.equal(await page.getByRole('button', { name: 'Accept' }).isDisabled(), true)
    assert.match(await editorText(page), /charge_customer/)
    assert.equal((await editorText(page)).includes('REFACTORED_OK'), false)

    const beforeFailure = stub.requests.length
    await page.getByLabel('Question about this project').fill('FORCE_500 please')
    await page.getByRole('button', { name: 'Ask' }).click()
    await waitFor(async () => (await page.locator('#chat-error').innerText()).includes('AI request failed (500)'))
    assert.match(await editorText(page), /charge_customer/)
    assert.ok(stub.requests.length > beforeFailure)

    await page.getByRole('button', { name: 'Reject' }).click()
    await focusEditor(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowRight')
    await waitFor(async () =>
      (await page.locator('#selection-status').innerText()).includes('Select code to refactor')
    )
    const quiet = stub.requests.length
    assert.equal(await page.getByRole('button', { name: 'Refactor' }).isDisabled(), true)
    assert.equal(stub.requests.length, quiet)
  } catch (error) {
    if (page) {
      fs.mkdirSync(path.join(root, 'test-results'), { recursive: true })
      await page.screenshot({ path: path.join(root, 'test-results/failure.png') })
    }
    throw error
  } finally {
    await app.close()
    await stub.close()
  }
})
