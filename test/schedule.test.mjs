import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('GET /api/schedule returns each user entries keyed by date for the month', async () => {
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM schedule_entries')) {
        return { rows: [
          { user_id: 'kim-beomjung', work_date: '2026-09-08', type: '휴가', note: '오후 연차' },
        ] }
      }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/schedule?month=2026-09`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.entries, { 'kim-beomjung': { '2026-09-08': { type: '휴가', note: '오후 연차' } } })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('PUT /api/schedule upserts one day for one user', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/schedule`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'kim-beomjung', date: '2026-09-08', type: '휴가', note: '오후 연차' }),
    })
    assert.equal(response.status, 204)
    assert.match(calls[0].sql, /INSERT INTO schedule_entries/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/holidays adds a manager-defined holiday note as a shared schedule entry', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/holidays`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-18', name: '창립기념일' }),
    })
    assert.equal(response.status, 201)
    assert.match(calls[0].sql, /INSERT INTO holidays/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
