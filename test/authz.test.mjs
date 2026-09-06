import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
test('organization mutations require current admin permission', async (t) => {
  const { request, pool } = await fixture(t)
  for (const [user, status] of [
    [null, 401],
    ['user', 403],
    ['lead', 403],
    ['admin', 201],
  ])
    assert.equal(
      (
        await request('/api/organization/parts', {
          method: 'POST',
          user,
          body: { name: 'Platform' },
        })
      ).status,
      status,
    )
  await pool.query("UPDATE users SET role='engineer' WHERE id='admin'")
  assert.equal(
    (
      await request('/api/organization/parts', {
        method: 'POST',
        user: 'admin',
        body: { name: 'Another' },
      })
    ).status,
    403,
  )
})
test('inactive users and malformed cookies cannot authenticate', async (t) => {
  const { request, pool } = await fixture(t)
  await pool.query("UPDATE users SET active=false WHERE id='user'")
  assert.equal((await request('/api/me')).status, 401)
  assert.equal(
    (
      await request('/api/me', {
        user: null,
        headers: { cookie: 'msp_session=%ZZ' },
      })
    ).status,
    401,
  )
})
