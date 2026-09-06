import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, overtime } from './fixtures.mjs'
test('overlapping intervals across midnight are rejected, adjacent work is allowed', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (await request('/api/overtime', { method: 'POST', body: overtime() }))
      .status,
    201,
  )
  for (const body of [
    overtime({ startTime: '23:00', endTime: '01:00' }),
    overtime({ date: '2026-09-07', startTime: '01:00', endTime: '03:00' }),
  ]) {
    assert.equal(
      (await request('/api/overtime', { method: 'POST', body })).status,
      409,
    )
  }
  assert.equal(
    (
      await request('/api/overtime', {
        method: 'POST',
        body: overtime({
          date: '2026-09-07',
          startTime: '02:00',
          endTime: '03:00',
        }),
      })
    ).status,
    201,
  )
})
test('overtime hours are calculated on server and duplicate submissions rejected', async (t) => {
  const { request } = await fixture(t)
  assert.equal(
    (
      await request('/api/overtime', {
        method: 'POST',
        body: overtime({ hours: 999 }),
      })
    ).status,
    201,
  )
  let body = await (await request('/api/overtime?userId=user')).json()
  assert.equal(body.records[0].hours, 4)
  assert.equal(body.balanceHours, 0)
  assert.equal(body.pendingHours, 4)
  const id = body.records[0].id
  assert.equal(
    (await request('/api/overtime', { method: 'POST', body: overtime() }))
      .status,
    409,
  )
  assert.equal(
    (
      await request('/api/overtime/' + id + '/approve', {
        user: 'lead',
        method: 'POST',
      })
    ).status,
    204,
  )
  assert.equal(
    (
      await request('/api/overtime/' + id + '/approve', {
        user: 'lead',
        method: 'POST',
      })
    ).status,
    409,
  )
  body = await (await request('/api/overtime?userId=user')).json()
  assert.equal(body.balanceHours, 4)
  assert.equal(
    (await request('/api/overtime/' + id, { method: 'DELETE' })).status,
    409,
  )
})
test('concurrent leave approvals cannot spend the same accrued balance twice', async (t) => {
  const { request } = await fixture(t)
  await request('/api/overtime', { method: 'POST', body: overtime() })
  const id = (await (await request('/api/overtime?userId=user')).json())
    .records[0].id
  await request('/api/overtime/' + id + '/approve', {
    user: 'lead',
    method: 'POST',
  })
  for (const date of ['2026-09-08', '2026-09-09'])
    assert.equal(
      (
        await request('/api/leave', {
          method: 'POST',
          body: { date, hours: 3, reason: '휴가' },
        })
      ).status,
      201,
    )
  const leaves = (await (await request('/api/overtime?userId=user')).json())
    .leaves
  const results = await Promise.all(
    leaves.map((l) =>
      request('/api/leave/' + l.id + '/approve', {
        user: 'lead',
        method: 'POST',
      }),
    ),
  )
  assert.deepEqual(results.map((r) => r.status).sort(), [204, 409])
  const body = await (await request('/api/overtime?userId=user')).json()
  assert.equal(body.balanceHours, 1)
  assert.equal(body.usedHours, 3)
  const summary = (
    await (await request('/api/overtime/summary')).json()
  ).users.find((u) => u.userId === 'user')
  assert.equal(summary.balanceHours, 1)
  assert.equal(summary.pendingLeaveHours, 3)
})
test('pending records can be rejected and deleted only by their owner', async (t) => {
  const { request } = await fixture(t)
  await request('/api/overtime', { method: 'POST', body: overtime() })
  const id = (await (await request('/api/overtime?userId=user')).json())
    .records[0].id
  assert.equal(
    (await request('/api/overtime/' + id, { method: 'DELETE', user: 'other' }))
      .status,
    409,
  )
  assert.equal(
    (
      await request('/api/overtime/' + id + '/reject', {
        method: 'POST',
        user: 'lead',
      })
    ).status,
    204,
  )
  assert.equal(
    (await request('/api/overtime/' + id, { method: 'DELETE' })).status,
    204,
  )
  assert.equal(
    (
      await request('/api/leave', {
        method: 'POST',
        body: { date: '2026-09-10', hours: -1, reason: 'bad' },
      })
    ).status,
    400,
  )
})
