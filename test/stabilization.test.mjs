import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review, overtime } from './fixtures.mjs'
import { getCurrentReviewEnd } from '../public/dateRange.js'
import { hasHolidayData, holidayDataYears } from '../public/koreanHolidays.js'

test('holiday coverage is explicit rather than silently claiming future lunar dates', () => {
  assert.deepEqual(holidayDataYears, [2025, 2026, 2027])
  assert.equal(hasHolidayData(2026), true)
  assert.equal(hasHolidayData(2028), false)
})

test('current review stays on the current Seoul Monday through Sunday', () => {
  for (const date of ['2026-09-07', '2026-09-08', '2026-09-13'])
    assert.equal(getCurrentReviewEnd(new Date(`${date}T12:00:00+09:00`)), '2026-09-07')
  assert.equal(getCurrentReviewEnd(new Date('2026-09-13T15:00:00Z')), '2026-09-14')
  assert.equal(getCurrentReviewEnd(new Date('2027-01-01T12:00:00+09:00')), '2026-12-28')
})

test('saved reviews remain visible after role and part changes', async (t) => {
  const { request, pool } = await fixture(t)
  await request('/api/reviews', { method: 'PUT', body: review() })
  await pool.query("UPDATE users SET role='lead',part_id=NULL WHERE id='user'")
  const old = await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  assert.ok(old.entries.find((entry) => entry.id === 'user')?.reviewId)
  const next = await (await request('/api/reviews?weekEnd=2026-09-14')).json()
  assert.equal(next.entries.some((entry) => entry.id === 'user'), false)
})

test('approval reversal preserves audit, restores leave balance and protects spent accrual', async (t) => {
  const { request } = await fixture(t)
  await request('/api/overtime', { method: 'POST', body: overtime() })
  const ledger = async () => (await request('/api/overtime?userId=user')).json()
  const id = (await ledger()).records[0].id
  const act = (kind, id, action, user = 'lead', reason = '잘못 등록하여 취소') => request(`/api/${kind}/${id}/${action}`, { method: 'POST', user, body: { reason } })
  assert.equal((await act('overtime', id, 'approve')).status, 204)
  await request('/api/leave', { method: 'POST', body: { date: '2026-09-07', hours: 4, reason: '휴가' } })
  const leave = (await ledger()).leaves[0].id
  assert.equal((await act('overtime', id, 'cancel')).status, 409)
  assert.equal((await act('leave', leave, 'approve')).status, 204)
  await request('/api/schedule', { method: 'PUT', body: { userId: 'user', date: '2026-09-07', type: '외근·출장', note: '기존 일정' } })
  let schedule = await (await request('/api/schedule?month=2026-09')).json()
  assert.equal(schedule.entries.user['2026-09-07'].leaveHours, 4)
  assert.equal(schedule.entries.user['2026-09-07'].type, '외근·출장')
  assert.equal((await act('leave', leave, 'cancel', 'user')).status, 403)
  assert.equal((await act('leave', leave, 'cancel', 'lead', '')).status, 400)
  assert.equal((await act('leave', leave, 'cancel')).status, 204)
  assert.equal((await act('leave', leave, 'cancel')).status, 409)
  assert.equal((await ledger()).balanceHours, 4)
  assert.equal((await ledger()).leaves[0].cancellationReason, '잘못 등록하여 취소')
  assert.equal((await request(`/api/leave/${leave}`, { method: 'DELETE' })).status, 409)
  schedule = await (await request('/api/schedule?month=2026-09')).json()
  assert.equal(schedule.entries.user['2026-09-07'].leaveHours, undefined)
  assert.equal((await act('overtime', id, 'cancel')).status, 204)
  assert.equal((await ledger()).balanceHours, 0)
  assert.equal((await request('/api/overtime', { method: 'POST', body: overtime() })).status, 201)
})

test('schedule range is atomic, bounded and enforces ownership', async (t) => {
  const { request, pool } = await fixture(t)
  const body = { userId: 'user', date: '2026-09-07', endDate: '2026-09-09', type: '외근·출장', note: '기간 출장' }
  assert.equal((await request('/api/schedule', { method: 'PUT', body: { ...body, userId: 'other' } })).status, 403)
  assert.equal((await request('/api/schedule', { method: 'PUT', body: { ...body, endDate: '2026-09-06' } })).status, 400)
  assert.equal((await request('/api/schedule', { method: 'PUT', body: { ...body, endDate: '2027-09-07' } })).status, 400)
  assert.equal((await request('/api/schedule', { method: 'PUT', body })).status, 204)
  assert.equal((await pool.query("SELECT * FROM schedule_entries WHERE user_id='user'")).rowCount, 3)
})

test('concurrent accrual cancellation and leave request cannot spend the same balance', async (t) => {
  const { request } = await fixture(t)
  await request('/api/overtime', { method: 'POST', body: overtime() })
  const ledger = await (await request('/api/overtime?userId=user')).json()
  const id = ledger.records[0].id
  await request(`/api/overtime/${id}/approve`, { method: 'POST', user: 'lead' })
  const results = await Promise.all([
    request(`/api/overtime/${id}/cancel`, { method: 'POST', user: 'lead', body: { reason: '오등록' } }),
    request('/api/leave', { method: 'POST', body: { date: '2026-09-07', hours: 4, reason: '휴가' } }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), results[0].status === 204 ? [204, 409] : [201, 409])
})
