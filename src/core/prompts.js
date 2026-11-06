export const PRESETS = {
  refactor: 'Refactor the selected code. Preserve behavior.',
  fix: 'Fix bugs in the selected code.',
  document: 'Add documentation comments to the selected code. Preserve behavior.'
}

export function buildChatPrompt({ question, matches, active, history = [] }) {
  const excerpts = new Map()
  for (const match of matches) excerpts.set(match.path, match.excerpt)
  if (active?.path) excerpts.set(active.path, String(active.excerpt ?? '').slice(0, 8000))
  const paths = [...excerpts.keys()]
  const blocks = paths.map((filePath) => `--- ${filePath}\n${excerpts.get(filePath)}`)
  const prior = history.slice(-6).map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn.content ?? '').slice(0, 2000)
  }))
  const context = blocks.length > 0 ? blocks.join('\n\n') : '(no matching project files)'
  return {
    paths,
    messages: [
      {
        role: 'system',
        content:
          'You are a pair programmer inside a local code editor. Answer from the project excerpts. If they do not contain the answer, say you cannot find it in the project.'
      },
      ...prior,
      {
        role: 'user',
        content: `Project excerpts:\n${context}\n\nQuestion:\n${question}`
      }
    ]
  }
}

export function buildEditPrompt({ kind, instruction, path, selection, fileText }) {
  const clipped = String(fileText ?? '').slice(0, 12000)
  const task =
    kind === 'generate'
      ? 'Return only one fenced code block with the new code to insert at the cursor. Do not explain.'
      : 'Return only one fenced code block containing the full replacement for the selection. Do not explain.'
  const focus =
    kind === 'generate'
      ? `Cursor file:\n${clipped}`
      : `Selected code:\n${selection}\n\nFile ${path}:\n${clipped}`
  return [
    { role: 'system', content: task },
    { role: 'user', content: `INSTRUCTION: ${instruction}\nPath: ${path}\n\n${focus}` }
  ]
}
