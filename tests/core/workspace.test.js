import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listTree, readFile, readTextFiles, writeFile } from '../../src/core/workspace.js'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-'))
  fs.writeFileSync(path.join(root, 'billing.py'), 'def charge_customer():\n    return 1\n')
  fs.mkdirSync(path.join(root, 'pkg'))
  fs.writeFileSync(path.join(root, 'pkg', 'util.py'), 'VALUE = 1\n')
  fs.mkdirSync(path.join(root, '.git'))
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n')
  fs.writeFileSync(path.join(root, '.env'), 'SECRET_ENV=1\n')
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'node_modules', 'secret.js'), 'SECRET_NODE\n')
  return root
}

test('lists project files and skips dotfiles, git metadata, and dependencies', () => {
  const root = fixture()
  const tree = listTree(root)
  const flat = JSON.stringify(tree)
  assert.match(flat, /billing\.py/)
  assert.match(flat, /util\.py/)
  assert.equal(flat.includes('.git'), false)
  assert.equal(flat.includes('.env'), false)
  assert.equal(flat.includes('secret.js'), false)
  const indexed = readTextFiles(root)
  assert.equal(indexed.some((file) => file.text.includes('SECRET_ENV')), false)
  assert.equal(indexed.some((file) => file.text.includes('SECRET_NODE')), false)
  assert.equal(indexed.some((file) => file.path === 'billing.py'), true)
})

test('reads and writes a file inside the workspace', () => {
  const root = fixture()
  assert.match(readFile(root, 'billing.py'), /charge_customer/)
  writeFile(root, 'pkg/util.py', 'VALUE = 2\n')
  assert.equal(readFile(root, 'pkg/util.py'), 'VALUE = 2\n')
})

test('refuses paths that escape the workspace', () => {
  const root = fixture()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-out-'))
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret-value')
  assert.throws(() => readFile(root, '../secret.txt'), /outside/)
  assert.throws(() => readFile(root, path.join(outside, 'secret.txt')), /outside/)
  assert.throws(() => writeFile(root, '../secret.txt', 'x'), /outside/)
  assert.throws(() => readFile(root, 'node_modules/secret.js'), /outside/)
  assert.throws(() => readFile(root, '.env'), /outside/)
})

test('does not follow a symlink out of the workspace', () => {
  const root = fixture()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'local-editor-link-'))
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret-value')
  fs.symlinkSync(outside, path.join(root, 'linked'))
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'secret.txt'))
  assert.throws(() => readFile(root, 'linked/secret.txt'), /outside|not a file/)
  assert.throws(() => readFile(root, 'secret.txt'), /outside|not a file/)
  assert.equal(readTextFiles(root).some((file) => file.text.includes('secret-value')), false)
  assert.equal(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8'), 'secret-value')
})
