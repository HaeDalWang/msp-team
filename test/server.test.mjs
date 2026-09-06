import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
test('health checks real database and bootstrap returns active users with hours', async (t) => {
  const { request, pool } = await fixture(t)
  assert.equal((await request('/health', { user: null })).status, 200)
  const res = await request('/api/bootstrap')
  assert.equal(res.status, 200)
  const { users } = await res.json()
  assert.equal(users.length, 4)
  assert.equal(users[0].workStart, '09:00')
  await pool.query("UPDATE users SET active=false WHERE id='other'")
  assert.equal((await (await request('/api/bootstrap')).json()).users.length, 3)
})
