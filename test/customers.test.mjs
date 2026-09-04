import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('GET /api/customers groups customers under their assigned engineer', async () => {
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM customer_assignments')) {
        return { rows: [
          { user_id: 'kim-beomjung', name: '김범중', part: 'Tiger', customer_id: 1, customer_name: '케이비자산운용_DI', since: '2022-06-01', services: ['Advanced Care'], note: '' },
          { user_id: 'bae-seungdo', name: '배승도', part: 'Tiger', customer_id: 2, customer_name: '이동의즐거움', since: '2022-09-01', services: ['MCR', 'Enterprise Care'], note: null },
        ] }
      }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customers`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.owners, [
      { userId: 'kim-beomjung', name: '김범중', part: 'Tiger', customers: [
        { id: 1, name: '케이비자산운용_DI', since: '2022-06-01', services: ['Advanced Care'], note: '' },
      ] },
      { userId: 'bae-seungdo', name: '배승도', part: 'Tiger', customers: [
        { id: 2, name: '이동의즐거움', since: '2022-09-01', services: ['MCR', 'Enterprise Care'], note: '' },
      ] },
    ])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('POST /api/customers creates a customer and assigns it to an engineer', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: sql.includes('INSERT INTO customers') ? [{ id: 9 }] : [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '신규고객사', userId: 'bae-seungdo', services: ['Basic'], since: '2026-09-04', note: '' }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { id: 9 })
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO customers')))
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO customer_assignments')))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
