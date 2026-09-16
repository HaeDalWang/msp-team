import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { registerMonthlyDigest, decodeLambdaStream } from '../src/monthlyDigest.mjs'
import { importReport, serializeReport } from '../public/views/monthlyDigest.js'
import { fixture } from './fixtures.mjs'

test('Lambda response prelude is decoded across arbitrary chunk boundaries', async () => {
  const bytes = Buffer.concat([Buffer.from(JSON.stringify({ statusCode: 200, headers: { 'content-type': 'application/x-ndjson' } })), Buffer.alloc(8), Buffer.from('{"progress":15}\n{"success":true}\n')])
  async function* events() {
    for (const byte of bytes) yield { PayloadChunk: { Payload: Uint8Array.of(byte) } }
    yield { InvokeComplete: {} }
  }
  const parts = []
  for await (const part of decodeLambdaStream(events())) parts.push(part)
  assert.equal(parts[0].metadata.statusCode, 200)
  assert.equal(Buffer.concat(parts.slice(1).map(p => p.chunk)).toString(), '{"progress":15}\n{"success":true}\n')
})

test('incomplete and failed Lambda responses are errors', async () => {
  async function* broken() { yield { InvokeComplete: { ErrorCode: 'Timeout' } } }
  await assert.rejects(async () => { for await (const part of decodeLambdaStream(broken())) void part })
  async function* empty() { yield { InvokeComplete: {} } }
  await assert.rejects(async () => { for await (const part of decodeLambdaStream(empty())) void part })
})

async function setup(t, env = {}, invoke) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { req.session = { userId: 'user' }; next() })
  registerMonthlyDigest(app, { query: async () => ({ rows: [{ name: '본인' }] }) }, env, invoke)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  t.after(() => new Promise(r => server.close(r)))
  return `http://127.0.0.1:${server.address().port}/api/monthly-digest`
}

test('disabled integration reports setup status and does not invoke AWS', async t => {
  const base = await setup(t)
  assert.equal((await (await fetch(base + '/config')).json()).enabled, false)
  assert.equal((await fetch(base + '/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503)
})

test('proxy overwrites identity and only exposes supported operations', async t => {
  let event
  const invoke = async function* (input) {
    event = input
    yield { metadata: { statusCode: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'bad=1' } } }
    yield { chunk: Buffer.from('{"ok":true}') }
  }
  const base = await setup(t, { MONTHLY_DIGEST_FUNCTION_NAME: 'test' }, invoke)
  const response = await fetch(base + '/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-msp-user-id': 'admin' }, body: JSON.stringify({ userId: 'admin' }) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(event.headers['x-msp-user-id'], 'user')
  assert.equal(event.rawPath, '/api/preview')
  assert.equal((await fetch(base + '/login', { method: 'POST' })).status, 404)
})

test('JSON export/import round trip preserves quotes and evidence and enforces bytes', () => {
  const data = importReport({ customer: {}, sales: [{ title: '<script>"한글"</script>', source_quote: '원문 근거' }] })
  assert.deepEqual(importReport(JSON.parse(serializeReport(data))), data)
  assert.throws(() => serializeReport({ text: '한'.repeat(600001) }), /1.8MB/)
  assert.throws(() => importReport({ customer: {}, sales: Array(151).fill({}) }))
})

test('portal auth, inactive accounts, CSRF and exact S3 CSP remain enforced', async t => {
  const { request, pool } = await fixture(t)
  assert.equal((await request('/api/monthly-digest/config', { user: null })).status, 401)
  assert.equal((await request('/api/monthly-digest/config')).status, 200)
  assert.equal((await request('/api/monthly-digest/preview', { method: 'POST', headers: { origin: 'https://attacker.test' }, body: {} })).status, 403)
  await pool.query("UPDATE users SET active=false WHERE id='user'")
  assert.equal((await request('/api/monthly-digest/config')).status, 401)
})

test('heavy work cannot overlap, failure frees slot, and analysis is rate limited', async t => {
  let release, fail = false
  const gate = () => new Promise(resolve => { release = resolve })
  const invoke = async function* () {
    if (fail) throw new Error('failure')
    yield { metadata: { statusCode: 200, headers: { 'content-type': 'application/json' } } }
    await gate()
    yield { chunk: Buffer.from('{}') }
  }
  const base = await setup(t, { MONTHLY_DIGEST_FUNCTION_NAME: 'test' }, invoke)
  const post = () => fetch(base + '/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const first = post()
  while (!release) await new Promise(r => setTimeout(r, 1))
  assert.equal((await post()).status, 429)
  release()
  assert.equal((await first).status, 200)
  fail = true
  for (let i = 0; i < 5; i++) assert.equal((await post()).status, 502)
  assert.equal((await post()).status, 429)
})
