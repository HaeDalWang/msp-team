import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'
import { createSessionToken, verifySessionToken } from '../src/auth.mjs'

test('all business reads and writes require authentication', async () => {
  const pool = {
    query: async () => {
      throw new Error('Unauthenticated request reached DB')
    },
  }
  const server = createApp(pool, {
    SLACK_CLIENT_ID: 'test',
    SESSION_SECRET: 'test-secret',
  }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    for (const [method, path] of [
      ['GET', '/api/bootstrap'],
      ['GET', '/api/reviews?weekEnd=2026-09-07'],
      ['PUT', '/api/reviews'],
      ['POST', '/api/overtime'],
      ['GET', '/api/customers'],
    ]) {
      const res = await fetch(
        `http://127.0.0.1:${server.address().port}${path}`,
        { method },
      )
      assert.equal(res.status, 401, `${method} ${path}`)
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('signed sessions still require a finite future expiry and exact format', () => {
  for (const payload of [
    { userId: 'a' },
    { userId: 'a', exp: 'never' },
    { userId: 'a', exp: 0 },
  ]) {
    assert.equal(
      verifySessionToken(createSessionToken(payload, 'secret'), 'secret'),
      null,
    )
  }
  const token = createSessionToken(
    { userId: 'a', exp: Date.now() + 60000 },
    'secret',
  )
  assert.equal(verifySessionToken(`${token}.extra`, 'secret'), null)
  assert.equal(verifySessionToken(token, 'wrong'), null)
  assert.equal(verifySessionToken(token, 'secret').userId, 'a')
})

test('production fails closed when Slack config is missing', () => {
  assert.throws(() => createApp({}, { NODE_ENV: 'production' }), /Slack|SLACK/)
})
