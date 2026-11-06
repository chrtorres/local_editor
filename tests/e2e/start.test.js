import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const electronBin = 'local_editor/node_modules/electron/dist/electron'

function electronCommands() {
  const commands = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const command = readFileSync(`/proc/${entry}/cmdline`).toString('utf8').replaceAll('\0', ' ')
      if (command.includes(electronBin)) commands.push(command)
    } catch {
      // The process can exit between the directory listing and the read.
    }
  }
  return commands
}

function startApp() {
  const child = spawn('npm', ['start'], {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  return {
    child,
    text: () => output,
    stop() {
      if (!child.pid) return
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
  }
}

test('npm start opens the editor instead of aborting on the sandbox helper', { timeout: 60000 }, async () => {
  assert.equal(
    electronCommands().length,
    0,
    'a Local Editor Electron process is already running'
  )
  const app = startApp()
  try {
    let commands = []
    const started = Date.now()
    while (Date.now() - started < 30000) {
      const text = app.text()
      if (text.includes('SUID sandbox helper') || text.includes('No usable sandbox')) {
        throw new Error(text)
      }
      if (app.child.exitCode !== null) break
      commands = electronCommands()
      const main = commands.some((command) => command.includes('--no-sandbox .'))
      const renderer = commands.some(
        (command) => command.includes('--type=renderer') && command.includes('--app-path=') && command.includes(root)
      )
      if (main && renderer) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(app.child.exitCode, null)
    assert.match(app.text(), /starting electron app/)
    assert.equal(app.text().includes('SUID sandbox helper'), false)
    assert.equal(
      commands.some((command) => command.includes('--no-sandbox .')),
      true
    )
    assert.equal(
      commands.some(
        (command) => command.includes('--type=renderer') && command.includes('--app-path=') && command.includes(root)
      ),
      true
    )
  } finally {
    app.stop()
  }
})
