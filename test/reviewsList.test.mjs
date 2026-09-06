import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review } from './fixtures.mjs'
test('missing reviews have version zero and historical records survive deactivation', async (t) => {
  const { request, pool } = await fixture(t)
  let entries = (
    await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  ).entries
  assert.equal(entries.length, 4)
  assert.ok(
    entries.every(
      (e) => e.status === 'missing' && e.version === 0 && e.reviewId === null,
    ),
  )
  await request('/api/reviews', { method: 'PUT', body: review() })
  await pool.query("UPDATE users SET active=false WHERE id='user'")
  entries = (
    await (
      await request('/api/reviews?weekEnd=2026-09-07', { user: 'admin' })
    ).json()
  ).entries
  assert.equal(entries.find((e) => e.id === 'user').status, 'submitted')
})
