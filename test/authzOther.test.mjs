import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'
import { createSessionToken } from '../src/auth.mjs'

const env = { SLACK_CLIENT_ID: 'client-id', SLACK_CLIENT_SECRET: 'secret', SLACK_REDIRECT_URI: 'http://localhost:3000/auth/slack/callback', SESSION_SECRET: 'test-secret-please-change' }

function sessionCookie(payload) {
  const token = createSessionToken({ exp: Date.now() + 60_000, ...payload }, env.SESSION_SECRET)
  return `msp_session=${token}`
}

test('POST /api/customers allows the owning engineer to add their own customer', async () => {
  const database = { query: async (sql) => (sql.includes('INSERT INTO customers') ? { rows: [{ id: 1 }] } : { rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customers`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ name: '신규고객사', userId: 'kim-beomjung', services: [], since: '2026-09-04', note: '' }),
    })
    assert.equal(response.status, 201)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/customers rejects an engineer adding a customer for someone else', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customers`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ name: '신규고객사', userId: 'bae-seungdo', services: [], since: '2026-09-04', note: '' }),
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('PUT /api/schedule allows an engineer to edit their own schedule', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/schedule`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ userId: 'kim-beomjung', date: '2026-09-08', type: '휴가', note: '' }),
    })
    assert.equal(response.status, 204)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('PUT /api/schedule rejects an engineer editing someone else schedule', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/schedule`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ userId: 'bae-seungdo', date: '2026-09-08', type: '휴가', note: '' }),
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/holidays rejects an engineer session', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/holidays`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
      body: JSON.stringify({ date: '2026-09-18', name: '창립기념일' }),
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/holidays allows a lead session', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/holidays`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie({ userId: 'jo-wonkeun', name: '조원근', role: 'lead' }) },
      body: JSON.stringify({ date: '2026-09-18', name: '창립기념일' }),
    })
    assert.equal(response.status, 201)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/overtime/:id/approve rejects an engineer session', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/overtime/1/approve`, {
      method: 'POST', headers: { cookie: sessionCookie({ userId: 'kim-beomjung', name: '김범중', role: 'engineer' }) },
    })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/overtime/:id/approve allows a lead session', async () => {
  const database = { query: async () => ({ rows: [] }) }
  const server = createApp(database, env).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/overtime/1/approve`, {
      method: 'POST', headers: { cookie: sessionCookie({ userId: 'jo-wonkeun', name: '조원근', role: 'lead' }) },
    })
    assert.equal(response.status, 204)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
