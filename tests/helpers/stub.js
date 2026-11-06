import http from 'node:http'
import { PRESETS } from '../../src/core/prompts.js'

export function startStub() {
  const requests = []
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url.startsWith('/api/tags')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ models: [{ name: 'fixture-model' }] }))
      return
    }
    if (request.method !== 'POST' || !request.url.startsWith('/api/chat')) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      requests.push(body)
      const messages = body.messages ?? []
      const last = messages[messages.length - 1]?.content ?? ''
      const blob = JSON.stringify(messages)
      const send = (status, payload) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
      }
      if (last.includes('FORCE_500')) {
        send(500, 'no')
        return
      }
      if (last.includes('NO_FENCE')) {
        send(200, { message: { role: 'assistant', content: 'I will only talk about the code.' } })
        return
      }
      const fence = (code) => send(200, { message: { role: 'assistant', content: '```\n' + code + '\n```' } })
      if (last.includes(`INSTRUCTION: ${PRESETS.fix}`)) return fence('FIXED_OK')
      if (last.includes(`INSTRUCTION: ${PRESETS.document}`)) return fence('DOCUMENTED_OK')
      if (last.includes(`INSTRUCTION: ${PRESETS.refactor}`)) return fence('REFACTORED_OK')
      if (last.includes('INSTRUCTION: add a ping function')) return fence('GENERATED_OK')
      if (last.includes('repeat the argument')) {
        const ok =
          blob.includes('charge_customer takes amount_cents') &&
          blob.includes('def charge_customer') &&
          !blob.includes('WEATHER_SENTINEL_Q9')
        send(200, { message: { role: 'assistant', content: ok ? 'still amount_cents' : 'WRONG_CONTEXT' } })
        return
      }
      const ok = blob.includes('def charge_customer') && !blob.includes('WEATHER_SENTINEL_Q9')
      send(200, { message: { role: 'assistant', content: ok ? 'charge_customer takes amount_cents' : 'WRONG_CONTEXT' } })
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done())))
      })
    })
  })
}
