import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review, overtime } from './fixtures.mjs'
test('engineers can transfer customers but cannot write others personal records', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (
      await request('/api/customers', {
        method: 'POST',
        body: { name: 'shared', userId: 'other' },
      })
    ).status,
    201,
  )
  for (const [path, method, body] of [
    ['/api/reviews', 'PUT', review({ userId: 'other' })],
    ['/api/overtime', 'POST', overtime({ userId: 'other' })],
    [
      '/api/schedule',
      'PUT',
      { userId: 'other', date: '2026-09-01', type: '휴가' },
    ],
  ])
    assert.equal((await request(path, { method, body })).status, 403)
  assert.equal(
    (
      await request('/api/schedule', {
        method: 'PUT',
        user: 'lead',
        body: { userId: 'other', date: '2026-09-01', type: '휴가' },
      })
    ).status,
    204,
  )
})
test('holidays and approvals are lead/admin only; cross-site mutations fail', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (
      await request('/api/holidays', {
        method: 'POST',
        body: { date: '2026-09-01', name: '휴일' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/holidays', {
        method: 'POST',
        user: 'lead',
        body: { date: '2026-09-01', name: '휴일' },
      })
    ).status,
    201,
  )
  assert.equal(
    (await request('/api/overtime/1/approve', { method: 'POST' })).status,
    403,
  )
  assert.equal(
    (
      await request('/api/reviews', {
        method: 'PUT',
        body: review(),
        headers: { origin: 'https://evil.example' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/reviews', {
        method: 'PUT',
        body: review(),
        headers: { 'sec-fetch-site': 'cross-site' },
      })
    ).status,
    403,
  )
})
