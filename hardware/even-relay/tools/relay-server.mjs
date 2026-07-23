import http from 'node:http'

const port = Number(process.env.PORT ?? 8787)
const forwardUrl = process.env.FORWARD_URL ?? ''
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1024 * 1024)

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
  if (request.method !== 'POST' || url.pathname !== '/even') {
    sendJson(response, 404, { ok: false, error: 'POST /even expected' })
    return
  }

  try {
    const body = await readBody(request, maxBodyBytes)
    const payload = parseJsonBody(body)
    const gesture = payload?.event?.gesture ?? 'unknown'
    const source = payload?.event?.source?.label ?? 'unknown'
    const action = payload?.action?.name ?? 'none'

    console.log(`[${new Date().toISOString()}] ${source} ${gesture} action=${action}`)

    let forwarded = false
    if (forwardUrl) {
      const forwardResponse = await fetch(forwardUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      forwarded = forwardResponse.ok

      if (!forwardResponse.ok) {
        throw new Error(`FORWARD_URL returned HTTP ${forwardResponse.status}`)
      }
    }

    sendJson(response, 200, { ok: true, forwarded })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[relay-error] ${message}`)
    sendJson(response, 500, { ok: false, error: message })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Even R1 relay listening on http://0.0.0.0:${port}/even`)
  if (forwardUrl) console.log(`Forwarding payloads to ${forwardUrl}`)
})

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function parseJsonBody(body) {
  if (!body.trim()) return {}
  return JSON.parse(body)
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []

    request.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error(`Request body exceeded ${limit} bytes`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
