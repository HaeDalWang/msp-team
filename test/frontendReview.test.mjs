import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from '../public/api.js'
import { escapeHtml, escapeAttr } from '../public/html.js'
import {
  weeksInMonth,
  buildMonthlyTeamOutput,
} from '../public/monthlyOutput.js'

test('API failures preserve server error and distinguish successful empty responses', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: '다른 사용자가 수정했습니다.' }), {
        status: 409,
      }),
  )
  await assert.rejects(
    api('/api/reviews'),
    (error) => error.status === 409 && error.message.includes('수정'),
  )
  globalThis.fetch = async () => new Response(null, { status: 204 })
  assert.equal(await api('/api/reviews'), null)
  globalThis.fetch = async () => new Response(null, { status: 201 })
  assert.equal(await api('/api/overtime'), null)
})

test('user text remains text in both element and attribute contexts', () => {
  const input = '<img src=x onerror="alert(1)">\'&'
  assert.equal(
    escapeHtml(input),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;',
  )
  assert.equal(escapeAttr(input), escapeHtml(input))
})

test('month selection includes real Mondays across leap years and five-week months', () => {
  assert.deepEqual(weeksInMonth('2024-02-12'), [
    '2024-02-05',
    '2024-02-12',
    '2024-02-19',
    '2024-02-26',
  ])
  assert.equal(weeksInMonth('2026-08-31').length, 5)
})

test('monthly output accepts live API text fields without dropping work or splitting characters', () => {
  const result = buildMonthlyTeamOutput('2026-09-07', [
    {
      reviewEnd: '2026-09-07',
      totalTickets: 3,
      entries: [
        {
          name: '팀원',
          workHighlights: '업무 A\n업무 B',
          actionItems: '다음 계획',
          topsProjects: '과제 진행',
          otherNotes: '인수인계',
        },
      ],
    },
  ])
  assert.match(result.markdown, /총 티켓 처리 건수: \*\*3건\*\*/)
  for (const text of ['업무 A', '업무 B', '다음 계획', '과제 진행', '인수인계'])
    assert.ok(result.markdown.includes(text))
})
