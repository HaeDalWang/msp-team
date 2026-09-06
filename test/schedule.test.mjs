import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
test('schedule notes and date-only values survive save/reload across months', async (t) => {
  const { request } = await fixture(t)
  const body = {
    userId: 'user',
    date: '2026-12-31',
    type: '외근',
    note: '고객 방문',
  }
  assert.equal(
    (await request('/api/schedule', { method: 'PUT', body })).status,
    204,
  )
  let entries = (await (await request('/api/schedule?month=2026-12')).json())
    .entries
  assert.deepEqual(entries.user['2026-12-31'], {
    type: '외근',
    note: '고객 방문',
  })
  assert.deepEqual(
    (await (await request('/api/schedule?month=2027-01')).json()).entries,
    {},
  )
  assert.equal(
    (
      await request('/api/schedule', {
        method: 'PUT',
        body: { ...body, type: '', note: '' },
      })
    ).status,
    204,
  )
  assert.deepEqual(
    (await (await request('/api/schedule?month=2026-12')).json()).entries,
    {},
  )
  assert.equal((await request('/api/schedule?month=2026-13')).status, 400)
  assert.equal(
    (
      await request('/api/schedule', {
        method: 'PUT',
        body: { ...body, date: '2026-02-30' },
      })
    ).status,
    400,
  )
})
test('holidays persist with exact date and can be removed by leads', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (
      await request('/api/holidays', {
        user: 'lead',
        method: 'POST',
        body: { date: '2027-01-01', name: '신정' },
      })
    ).status,
    201,
  )
  assert.deepEqual((await (await request('/api/holidays')).json()).holidays, [
    { date: '2027-01-01', name: '신정' },
  ])
  assert.equal(
    (
      await request('/api/holidays/2027-01-01', {
        user: 'lead',
        method: 'DELETE',
      })
    ).status,
    204,
  )
  assert.deepEqual((await (await request('/api/holidays')).json()).holidays, [])
})
