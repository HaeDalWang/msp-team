import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'

test('engineers edit their own email and join date with version checks, not identity or privileges', async (t) => {
  const { request } = await fixture(t)
  assert.equal((await request('/api/profile', { user: null })).status, 401)
  const profile = await (await request('/api/profile')).json()
  const body = { ...profile, email: 'engineer@example.com', joinedOn: '2020-03-02' }
  for (const extra of [{ role: 'admin' }, { userId: 'other' }, { workStart: '08:00' }])
    assert.equal((await request('/api/profile', { method: 'PUT', body: { ...body, ...extra } })).status, 400)
  assert.equal((await request('/api/profile', { method: 'PUT', body: { ...body, email: 'invalid' } })).status, 400)
  assert.equal((await request('/api/profile', { method: 'PUT', body: { ...body, joinedOn: '2026-02-30' } })).status, 400)
  assert.equal((await request('/api/profile', { method: 'PUT', body })).status, 200)
  assert.equal((await request('/api/profile', { method: 'PUT', body })).status, 409)
  const saved = await (await request('/api/profile')).json()
  assert.equal(saved.email, body.email)
  assert.equal(saved.joinedOn, body.joinedOn)
  assert.equal((await (await request('/api/profile', { user: 'other' })).json()).email, '')
  const reviews = await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  assert.equal(reviews.entries[0].id, 'user')
})
