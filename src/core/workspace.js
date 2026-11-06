import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'dist'])

function skipName(name) {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new Error('Path is required')
  }
  if (relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    throw new Error('Path is outside the workspace')
  }
  const parts = relativePath.split(/[\\/]+/).filter(Boolean)
  if (parts.some((part) => part === '..' || part.startsWith('.') || SKIP_DIRS.has(part))) {
    throw new Error('Path is outside the workspace')
  }
  const rootReal = fs.realpathSync(path.resolve(root))
  const logical = path.resolve(rootReal, ...parts)
  const parentReal = fs.realpathSync(path.dirname(logical))
  const target = path.join(parentReal, path.basename(logical))
  if (!isInside(rootReal, target)) throw new Error('Path is outside the workspace')
  return target
}

function sorted(nodes) {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function listTree(root) {
  const base = fs.realpathSync(path.resolve(root))

  function walk(dir) {
    const nodes = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipName(entry.name) || entry.isSymbolicLink()) continue
      const absolute = path.join(dir, entry.name)
      const rel = path.relative(base, absolute)
      if (entry.isDirectory()) {
        nodes.push({ name: entry.name, path: rel, type: 'dir', children: walk(absolute) })
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: rel, type: 'file' })
      }
    }
    return sorted(nodes)
  }

  return walk(base)
}

export function readTextFiles(root, { maxFiles = 400, maxBytes = 200_000 } = {}) {
  const base = fs.realpathSync(path.resolve(root))
  const files = []

  function visit(dir) {
    if (files.length >= maxFiles) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return
      if (skipName(entry.name) || entry.isSymbolicLink()) continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(absolute)
        continue
      }
      if (!entry.isFile()) continue
      let stat
      try {
        stat = fs.statSync(absolute)
      } catch {
        continue
      }
      if (!stat.isFile() || stat.size > maxBytes) continue
      const buffer = fs.readFileSync(absolute)
      if (buffer.includes(0)) continue
      files.push({ path: path.relative(base, absolute), text: buffer.toString('utf8') })
    }
  }

  visit(base)
  return files
}

export function readFile(root, relativePath) {
  const target = resolveInside(root, relativePath)
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Path is not a file')
  const buffer = fs.readFileSync(target)
  if (buffer.includes(0)) throw new Error('File is not text')
  return buffer.toString('utf8')
}

export function writeFile(root, relativePath, contents) {
  if (typeof contents !== 'string') throw new Error('File contents must be text')
  const target = resolveInside(root, relativePath)
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Path is not a file')
  fs.writeFileSync(target, contents)
}
