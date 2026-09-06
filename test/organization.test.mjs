import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
test('organization user/part CRUD supports new parts, unassigned users and stale version guards', async (t) => {
  const { request } = await fixture(t)
  const { id } = await (
    await request('/api/organization/parts', {
      user: 'admin',
      method: 'POST',
      body: { name: 'Platform' },
    })
  ).json()
  assert.equal(
    (
      await request('/api/organization/parts/' + id, {
        user: 'admin',
        method: 'PUT',
        body: { name: 'New Platform' },
      })
    ).status,
    204,
  )
  let res = await request('/api/organization/users', {
    user: 'admin',
    method: 'POST',
    body: {
      name: 'New person',
      slackUserId: 'UNEW',
      partId: id,
      role: 'engineer',
      workStart: '08:30',
      workEnd: '17:30',
    },
  })
  assert.equal(res.status, 201)
  const person = await res.json()
  assert.equal(
    (
      await request('/api/organization/parts/' + id, {
        user: 'admin',
        method: 'DELETE',
      })
    ).status,
    409,
  )
  res = await request('/api/organization/users/' + person.id, {
    user: 'admin',
    method: 'PUT',
    body: { partId: null, version: 1 },
  })
  assert.equal(res.status, 204)
  assert.equal(
    (
      await request('/api/organization/users/' + person.id, {
        user: 'admin',
        method: 'PUT',
        body: { role: 'lead', version: 1 },
      })
    ).status,
    409,
  )
  const body = await (
    await request('/api/organization', { user: 'admin' })
  ).json()
  assert.equal(body.users[person.id].partId, null)
  assert.equal(body.users[person.id].workStart, '08:30')
  assert.equal(
    (
      await request('/api/organization/parts/' + id, {
        user: 'admin',
        method: 'DELETE',
      })
    ).status,
    204,
  )
})
test('last administrator cannot be removed and invalid roles fail', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (
      await request('/api/organization/users/admin', {
        user: 'admin',
        method: 'PUT',
        body: { role: 'engineer', version: 1 },
      })
    ).status,
    409,
  )
  assert.equal(
    (
      await request('/api/organization/users/admin', {
        user: 'admin',
        method: 'PUT',
        body: { active: false, version: 1 },
      })
    ).status,
    409,
  )
  assert.equal(
    (
      await request('/api/organization/users/user', {
        user: 'admin',
        method: 'PUT',
        body: { role: 'superadmin', version: 1 },
      })
    ).status,
    400,
  )
})
