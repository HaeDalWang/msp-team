import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review, overtime } from './fixtures.mjs'

test('leave requests reject insufficient balance and reserve pending requests atomically', async (t) => {
  const { request } = await fixture(t)
  const submit = (date, hours) => request('/api/leave', { method: 'POST', body: { date, hours, reason: '개인 일정' } })
  await request('/api/overtime', { method: 'POST', body: overtime({ startTime: '22:00', endTime: '00:30' }) })
  const record = (await (await request('/api/overtime?userId=user')).json()).records[0]
  await request(`/api/overtime/${record.id}/approve`, { user: 'lead', method: 'POST' })
  assert.equal((await submit('2026-09-10', 3.5)).status, 400)
  assert.equal((await submit('2026-09-10', 4)).status, 409)
  await request('/api/overtime', { method: 'POST', body: overtime({ date: '2026-09-08', startTime: '20:00', endTime: '21:30' }) })
  const extra = (await (await request('/api/overtime?userId=user')).json()).records.find((r) => r.status === 'pending')
  await request(`/api/overtime/${extra.id}/approve`, { user: 'lead', method: 'POST' })
  const results = await Promise.all([submit('2026-09-10', 4), submit('2026-09-11', 4)])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
})

test('review-day absence follows the selected Monday and approved leave only', async (t) => {
  const { request, pool } = await fixture(t)
  await request('/api/schedule', { method: 'PUT', body: { userId: 'user', date: '2026-09-07', type: '휴가' } })
  const entries = async (week) => (await (await request(`/api/reviews?weekEnd=${week}`)).json()).entries
  assert.equal((await entries('2026-09-07')).find((entry) => entry.id === 'user').meetingLeave, '휴가')
  assert.equal((await entries('2026-09-14')).find((entry) => entry.id === 'user').meetingLeave, null)
  await pool.query("INSERT INTO leave_requests(user_id,leave_date,hours,reason,status) VALUES('other','2026-09-07',4,'test','pending')")
  assert.equal((await entries('2026-09-07')).find((entry) => entry.id === 'other').meetingLeave, null)
  await pool.query("UPDATE leave_requests SET status='approved' WHERE user_id='other'")
  assert.equal((await entries('2026-09-07')).find((entry) => entry.id === 'other').meetingLeave, '대체휴가 4시간')
})

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
  assert.equal((await request('/api/leave', { method: 'POST', body: { date: '2026-09-10', hours: 0.5, reason: '개인 일정' } })).status, 400)
})
