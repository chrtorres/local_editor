import { readTextFiles } from './workspace.js'
import { selectContext } from './context.js'
import { buildChatPrompt, buildEditPrompt } from './prompts.js'
import { complete } from './ai.js'
import { extractCodeBlock } from './edit.js'

const QUESTION_LIMIT = 8000
const ACTIONS = new Set(['refactor', 'fix', 'document', 'generate'])

export async function answerQuestion({ root, ai, question, history = [], activePath = null, activeText = '' }) {
  const text = String(question ?? '').trim()
  if (!text) throw new Error('Enter a question.')
  if (text.length > QUESTION_LIMIT) throw new Error('Question is too long.')
  const matches = selectContext(readTextFiles(root), text)
  const active = activePath ? { path: activePath, excerpt: String(activeText ?? '') } : null
  const built = buildChatPrompt({ question: text, matches, active, history })
  const answer = await complete(ai, built.messages)
  return { answer, paths: built.paths }
}

export async function proposeEdit({ ai, kind, instruction, path, selection = '', fileText = '' }) {
  if (!ACTIONS.has(kind)) throw new Error('Unknown edit action.')
  const selected = String(selection ?? '')
  if (kind !== 'generate' && !selected.trim()) throw new Error('Select some code first.')
  const text = String(instruction ?? '').trim()
  if (!text) throw new Error(kind === 'generate' ? 'Describe the code to generate.' : 'Describe the edit.')
  const messages = buildEditPrompt({
    kind,
    instruction: text,
    path,
    selection: selected,
    fileText
  })
  const raw = await complete(ai, messages)
  const extracted = extractCodeBlock(raw)
  if (!extracted.ok) throw new Error(extracted.error)
  return { code: extracted.code }
}
