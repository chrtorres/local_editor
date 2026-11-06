const STOP = new Set(
  'a an the what which where who whom why how does do did is are was were this that these those in on of to for and or with from it its be can about into function method class code file please defined take takes argument arguments'.split(
    ' '
  )
)

export function tokenize(query) {
  return String(query)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((term) => term.length >= 3 && !STOP.has(term))
}

export function scoreFile(query, relativePath, text) {
  const terms = tokenize(query)
  if (terms.length === 0) return 0
  const pathText = relativePath.toLowerCase()
  const body = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (pathText.includes(term)) score += 5
    let from = 0
    let count = 0
    while (count < 30) {
      const at = body.indexOf(term, from)
      if (at < 0) break
      count += 1
      score += 1
      from = at + term.length
    }
  }
  return score
}

export function selectContext(files, query, { limit = 4, excerptChars = 8000 } = {}) {
  return files
    .map((file) => ({ ...file, score: scoreFile(query, file.path, file.text) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((file) => ({
      path: file.path,
      score: file.score,
      excerpt: file.text.slice(0, excerptChars)
    }))
}
