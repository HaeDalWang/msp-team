import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'
import { createSessionToken } from '../src/auth.mjs'

const env = { SLACK_CLIENT_ID: 'client-id', SLACK_CLIENT_SECRET: 'secret', SLACK_REDIRECT_URI: 'http://localhost:3000/auth/slack/callback', SESSION_SECRET: 'test-secret-please-change' }

function sessionCookie(payload) {
  const token = createSessionToken({ exp: Date.now() + 60_000, ...payload }, env.SESSION_SECRET)
  return `msp_session=${token}`
}

test('POST /api/organization/parts requires a session when Slack auth is configured', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization/parts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Platform' }),
    })
    assert.equal(response.status, 401)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/organization/parts rejects an engineer session with 403', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization/parts`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ name: 'Platform' }),
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/organization/parts allows an admin session', async () => {
  const database = { query: async (sql) => (sql.includes('INSERT INTO parts') ? { rows: [{ id: 'part-platform' }] } : { rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization/parts`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'bae-seungdo', name: '배승도', role: 'admin' }) },
      body: JSON.stringify({ name: 'Platform' }),
    })
    assert.equal(response.status, 201)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
