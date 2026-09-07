import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review, overtime } from './fixtures.mjs'

test('presentation order follows part order then join date and excludes nonparticipants', async (t) => {
  const { request, pool } = await fixture(t)
  for (const [id, joinedOn] of [['user', '2020-01-01'], ['other', '2022-01-01']]) {
    assert.equal((await request(`/api/organization/users/${id}`, { user: 'admin', method: 'PUT', body: { joinedOn, version: 1 } })).status, 204)
  }
  await pool.query("UPDATE users SET part_id=NULL WHERE id='admin'")
  let body = await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  assert.deepEqual(body.entries.map((e) => e.id), ['user', 'other'])
  await pool.query("UPDATE users SET part_id='p2' WHERE id='other'")
  await request('/api/organization/parts/p1', { user: 'admin', method: 'PUT', body: { name: '첫 파트', sortOrder: 2 } })
  await request('/api/organization/parts/p2', { user: 'admin', method: 'PUT', body: { name: '새 파트', sortOrder: 1 } })
  body = await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  assert.deepEqual(body.entries.map((e) => e.id), ['other', 'user'])
  const org = await (await request('/api/organization')).json()
  assert.equal(org.users.user.joinedOn, '2020-01-01')
  await request('/api/reviews', { user: 'lead', method: 'PUT', body: review() })
  const mine = await (await request('/api/reviews?weekEnd=2026-09-07&personal=true', { user: 'lead' })).json()
  assert.equal(mine.entries.length, 1)
  assert.equal(mine.entries[0].id, 'lead')
  assert.equal(mine.entries[0].version, 1)
})

test('blank submitted sections become no-special-notes and can be cleared on revision', async (t) => {
  const { request } = await fixture(t)
  await request('/api/reviews', { method: 'PUT', body: review() })
  assert.equal((await request('/api/reviews', { method: 'PUT', body: review({ version: 1, otherNotes: '  ' }) })).status, 200)
  const body = await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  assert.equal(body.entries.find((e) => e.id === 'user').otherNotes, '특이사항 없음')
})

test('new overtime and leave requests require half-hour increments', async (t) => {
  const { request } = await fixture(t)
  assert.equal((await request('/api/overtime', { method: 'POST', body: overtime({ startTime: '22:01' }) })).status, 400)
  assert.equal((await request('/api/overtime', { method: 'POST', body: overtime({ startTime: '22:30' }) })).status, 201)
  assert.equal((await request('/api/leave', { method: 'POST', body: { date: '2026-09-10', hours: 0.1, reason: '개인 일정' } })).status, 400)
  assert.equal((await request('/api/leave', { method: 'POST', body: { date: '2026-09-10', hours: 0.5, reason: '개인 일정' } })).status, 201)
})
