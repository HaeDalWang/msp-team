import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('GET /api/overtime returns balance and records for a user', async () => {
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM overtime_records')) {
        return { rows: [
          { id: 1, user_id: 'bae-seungdo', work_date: '2026-08-31', type: '기술지원', customer: '한국일보', start_time: '20:00:00', end_time: '22:00:00', hours: '2.0', detail: '야간 지원', evidence: 'SUP-1842', status: 'pending' },
          { id: 2, user_id: 'bae-seungdo', work_date: '2026-08-27', type: '작업', customer: '케이비자산운용_DI', start_time: '19:30:00', end_time: '23:30:00', hours: '4.0', detail: '네트워크 전환', evidence: 'CHG-921', status: 'approved' },
        ] }
      }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/overtime?userId=bae-seungdo`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.balanceHours, 4)
    assert.equal(body.records.length, 2)
    assert.deepEqual(body.records[0], { id: 1, date: '2026-08-31', type: '기술지원', customer: '한국일보', startTime: '20:00', endTime: '22:00', hours: 2, detail: '야간 지원', evidence: 'SUP-1842', status: 'pending' })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/overtime creates a pending record', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/overtime`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'bae-seungdo', date: '2026-09-05', type: '기술지원', customer: '한국일보', startTime: '20:00', endTime: '22:00', hours: 2, detail: '야간 지원', evidence: 'SUP-1900' }),
    })
    assert.equal(response.status, 201)
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO overtime_records')))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/overtime/:id/approve marks a record approved', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/overtime/1/approve`, { method: 'POST' })
    assert.equal(response.status, 204)
    assert.ok(calls.some((call) => call.sql.includes("SET status = 'approved'")))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
