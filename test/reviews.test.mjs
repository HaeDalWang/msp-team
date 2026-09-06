import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, review } from './fixtures.mjs'
test('draft, submission, reload, comments and review completion persist; stale updates conflict', async (t) => {
  const { request } = await fixture(t)
  let res = await request('/api/reviews', {
    method: 'PUT',
    body: review({ status: 'draft', workHighlights: '', actionItems: '' }),
  })
  assert.equal(res.status, 200)
  let saved = await res.json()
  assert.equal(saved.version, 1)
  assert.equal(saved.status, 'draft')
  assert.equal(
    (
      await request('/api/reviews/' + saved.id + '/complete', {
        user: 'lead',
        method: 'POST',
        body: { version: 1 },
      })
    ).status,
    409,
  )
  res = await request('/api/reviews', {
    method: 'PUT',
    body: review({ version: 1 }),
  })
  saved = await res.json()
  assert.equal(saved.status, 'submitted')
  assert.equal(saved.version, 2)
  assert.equal(
    (
      await request('/api/reviews', {
        method: 'PUT',
        body: review({ version: 1 }),
      })
    ).status,
    409,
  )
  const listed = (
    await (await request('/api/reviews?weekEnd=2026-09-07')).json()
  ).entries.find((e) => e.id === 'user')
  assert.equal(listed.workHighlights, '고객사 지원')
  assert.deepEqual(listed.tickets, [3, 2, 5])
  assert.equal(listed.version, 2)
  res = await request('/api/reviews/' + saved.id + '/comments', {
    method: 'POST',
    user: 'other',
    body: { body: '<b>literal</b>' },
  })
  assert.equal(res.status, 201)
  const comments = (
    await (await request('/api/reviews/' + saved.id + '/comments')).json()
  ).comments
  assert.equal(comments[0].body, '<b>literal</b>')
  assert.equal(comments[0].authorId, 'other')
  assert.equal(
    (
      await request('/api/reviews/' + saved.id + '/complete', {
        method: 'POST',
        body: { version: 2 },
      })
    ).status,
    403,
  )
  res = await request('/api/reviews/' + saved.id + '/complete', {
    method: 'POST',
    user: 'lead',
    body: { version: 2 },
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).status, 'reviewed')
  res = await request('/api/reviews', {
    method: 'PUT',
    body: review({ version: 3 }),
  })
  assert.equal((await res.json()).status, 'submitted')
})
test('submitted review requires content and nonnegative integer tickets', async (t) => {
  const { request } = await fixture(t)
  for (const change of [
    { workHighlights: '' },
    { ticketsDone: -1 },
    { ticketsNew: 1.5 },
    { ticketsNew: 'hello' },
    { weekEnd: '2026-02-30' },
    { status: 'reviewed' },
    { version: -1 },
  ])
    assert.equal(
      (await request('/api/reviews', { method: 'PUT', body: review(change) }))
        .status,
      400,
    )
})
test('simultaneous creation cannot silently overwrite a review', async (t) => {
  const { request } = await fixture(t)
  const results = await Promise.all([
    request('/api/reviews', { method: 'PUT', body: review() }),
    request('/api/reviews', {
      method: 'PUT',
      body: review({ workHighlights: 'second' }),
    }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
})
