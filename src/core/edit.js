export function extractCodeBlock(text) {
  const match = String(text ?? '').match(/```[^\n]*\n([\s\S]*?)```/)
  if (!match) return { ok: false, error: 'The model did not return a code block.' }
  const code = match[1].replace(/\n$/, '')
  if (!code.trim()) return { ok: false, error: 'The model returned an empty code block.' }
  return { ok: true, code }
}
