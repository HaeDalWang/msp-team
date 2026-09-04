import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

const env = { SLACK_CLIENT_ID: 'client-id', SLACK_CLIENT_SECRET: 'client-secret', SLACK_REDIRECT_URI: 'http://localhost:3000/auth/slack/callback', SESSION_SECRET: 'test-secret-please-change' }

test('GET /auth/slack redirects to Slack authorize URL with state cookie', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/slack`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location'))
    assert.equal(location.origin, 'https://slack.com')
    assert.equal(location.pathname, '/openid/connect/authorize')
    assert.equal(location.searchParams.get('client_id'), 'client-id')
    assert.equal(location.searchParams.get('redirect_uri'), env.SLACK_REDIRECT_URI)
    assert.ok(location.searchParams.get('state'))
    assert.match(response.headers.get('set-cookie') ?? '', /slack_oauth_state=/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('GET /auth/slack/callback rejects a mismatched state to block CSRF', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/slack/callback?code=abc&state=wrong`, {
      redirect: 'manual', headers: { cookie: 'slack_oauth_state=expected' },
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('GET /api/me returns 401 without a session cookie', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/me`)
    assert.equal(response.status, 401)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
