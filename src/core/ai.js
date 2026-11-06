export function parseAiBaseUrl(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw new Error('AI URL is not valid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI URL must be http or https')
  }
  return url.href.replace(/\/$/, '')
}

export function normalizeModel(value, { allowEmpty = false } = {}) {
  const model = String(value ?? '').trim()
  if (!model && allowEmpty) return ''
  if (!model) throw new Error('Set an AI model first.')
  if (/[\r\n]/.test(model)) throw new Error('Model name cannot contain line breaks')
  return model
}

export function replyText(data) {
  const text = data?.message?.content ?? data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI returned an empty reply')
  return text
}

export async function complete(ai, messages) {
  const baseUrl = parseAiBaseUrl(ai.baseUrl)
  const model = normalizeModel(ai.model)
  let response
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(120000)
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('AI request timed out')
    }
    throw new Error(`AI endpoint unreachable (${baseUrl})`)
  }
  if (!response.ok) throw new Error(`AI request failed (${response.status})`)
  return replyText(await response.json())
}

export async function listModels(baseUrl) {
  const base = parseAiBaseUrl(baseUrl)
  let response
  try {
    response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(10000) })
  } catch {
    throw new Error(`AI endpoint unreachable (${base})`)
  }
  if (!response.ok) throw new Error(`AI request failed (${response.status})`)
  const data = await response.json()
  return (data.models ?? []).map((model) => model.name).filter(Boolean)
}
