import crypto from 'node:crypto'
import { LambdaClient, InvokeWithResponseStreamCommand } from '@aws-sdk/client-lambda'

// Lambda Web Adapter prefixes streamed HTTP bodies with JSON and eight NUL bytes.
export async function* decodeLambdaStream(events) {
  let prelude = Buffer.alloc(0)
  let started = false
  let complete = false
  for await (const event of events ?? []) {
    if (event.InvokeComplete) {
      if (event.InvokeComplete.ErrorCode) throw new Error('월간 리포트 처리에 실패했습니다.')
      complete = true
    }
    if (!event.PayloadChunk) continue
    const chunk = Buffer.from(event.PayloadChunk.Payload)
    if (started) { yield { chunk }; continue }
    prelude = Buffer.concat([prelude, chunk])
    const boundary = prelude.indexOf(Buffer.alloc(8))
    if (boundary < 0) {
      if (prelude.length > 65536) throw new Error('잘못된 리포트 응답입니다.')
      continue
    }
    if (boundary > 65536) throw new Error('잘못된 리포트 응답입니다.')
    const metadata = JSON.parse(prelude.subarray(0, boundary).toString())
    if (!Number.isInteger(metadata.statusCode) || metadata.statusCode < 200 || metadata.statusCode > 599)
      throw new Error('잘못된 리포트 응답입니다.')
    started = true
    yield { metadata }
    if (prelude.length > boundary + 8) yield { chunk: prelude.subarray(boundary + 8) }
    prelude = null
  }
  if (!started || !complete) throw new Error('리포트 응답이 중간에 끊겼습니다.')
}

export function registerMonthlyDigest(app, pool, env, invokeOverride) {
  const enabled = () => Boolean(env.MONTHLY_DIGEST_FUNCTION_NAME)
  let client
  async function* invoke(event) {
    client ??= new LambdaClient({ region: env.AWS_REGION || 'ap-northeast-2', maxAttempts: 1 })
    const response = await client.send(new InvokeWithResponseStreamCommand({
      FunctionName: env.MONTHLY_DIGEST_FUNCTION_NAME,
      Payload: Buffer.from(JSON.stringify(event)),
    }), { abortSignal: AbortSignal.timeout(660000) })
    yield* decodeLambdaStream(response.EventStream)
  }
  const run = invokeOverride || invoke
  const busy = new Set()
  const analysisTimes = new Map()
  const operations = new Set(['config', 'upload-url', 'analyze', 'preview', 'pdf', 'download-all', 'slack-notify'])
  const expensive = new Set(['analyze', 'pdf', 'download-all', 'slack-notify'])
  app.all('/api/monthly-digest/:operation', async (req, res) => {
    const operation = req.params.operation
    if (!operations.has(operation) || req.method !== (operation === 'config' ? 'GET' : 'POST'))
      return res.status(404).json({ error: '지원하지 않는 리포트 요청입니다.' })
    if (!enabled()) return operation === 'config'
      ? res.json({ enabled: false })
      : res.status(503).json({ error: '월간 리포트 연결이 아직 설정되지 않았습니다.' })
    const userId = req.session.userId
    const heavy = expensive.has(operation)
    if (heavy && (busy.has(userId) || busy.size >= 2))
      return res.status(429).json({ error: '리포트를 처리 중입니다. 완료 후 다시 시도해 주세요.' })
    if (operation === 'analyze') {
      const now = Date.now()
      for (const [id, times] of analysisTimes) {
        const recent = times.filter(time => now - time < 3600000)
        if (recent.length) analysisTimes.set(id, recent)
        else analysisTimes.delete(id)
      }
      const times = analysisTimes.get(userId) || []
      if (times.length >= 6) return res.status(429).json({ error: '분석은 한 시간에 6회까지 가능합니다.' })
      analysisTimes.set(userId, [...times, now])
    }
    if (heavy) busy.add(userId)
    const requestId = crypto.randomUUID()
    let ok = false
    try {
      const { rows } = await pool.query('SELECT name FROM users WHERE id=$1', [userId])
      if (!rows.length) return res.status(401).json({ error: '로그인이 필요합니다.' })
      const rawPath = `/api/${operation}`
      const event = {
        version: '2.0', routeKey: '$default', rawPath, rawQueryString: '',
        headers: { 'content-type': 'application/json', 'x-msp-user-id': userId,
          'x-msp-user-name': encodeURIComponent(rows[0].name), host: 'monthly-digest.internal' },
        requestContext: { requestId, stage: '$default', timeEpoch: Date.now(),
          http: { method: req.method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'MSP' } },
        body: req.method === 'GET' ? undefined : JSON.stringify(req.body), isBase64Encoded: false,
      }
      for await (const part of run(event)) {
        if (part.metadata) {
          res.status(part.metadata.statusCode)
          for (const [key, value] of Object.entries(part.metadata.headers || {})) {
            if (['content-type', 'content-disposition'].includes(key.toLowerCase())) res.setHeader(key, value)
          }
          res.setHeader('Cache-Control', 'no-store, no-transform')
          res.setHeader('X-Accel-Buffering', 'no')
        } else if (!res.destroyed && !res.write(part.chunk)) {
          // A disconnected browser must not release its analysis slot while Lambda still runs.
          await new Promise(resolve => {
            const done = () => { res.off('drain', done); res.off('close', done); resolve() }
            res.once('drain', done)
            res.once('close', done)
          })
        }
      }
      ok = res.statusCode < 400
      if (!res.destroyed) res.end()
    } catch (error) {
      console.error('monthly-digest request failed', { requestId, operation, error: error.name })
      if (!res.headersSent) res.status(502).json({ error: '리포트 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
      else if (!res.destroyed) res.destroy()
    } finally {
      if (heavy) busy.delete(userId)
      console.info('monthly-digest', { requestId, userId, operation, ok })
    }
  })
}
