import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('GET /api/organization returns parts and users keyed by id with version', async () => {
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM parts')) return { rows: [{ id: 'part-tiger', name: 'Tiger', color: '#d76a20' }] }
      if (sql.includes('FROM users')) return { rows: [{ id: 'bae-seungdo', name: '배승도', part_id: 'part-tiger', role: 'admin', version: 3 }] }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.parts, [{ id: 'part-tiger', name: 'Tiger', color: '#d76a20' }])
    assert.deepEqual(body.users['bae-seungdo'], { name: '배승도', partId: 'part-tiger', role: 'admin', version: 3 })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/organization/parts creates a new part', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: sql.includes('INSERT INTO parts') ? [{ id: 'part-platform' }] : [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization/parts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Platform' }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { id: 'part-platform' })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('PUT /api/organization/users/:id enforces optimistic concurrency via version', async () => {
  const calls = []
  const database = {
    query: async (sql, values = []) => {
      calls.push({ sql, values })
      if (sql.includes('UPDATE users')) return { rowCount: 0 }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/organization/users/bae-seungdo`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ partId: 'part-tiger', version: 1 }),
    })
    assert.equal(response.status, 409)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
