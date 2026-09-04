import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('saving a weekly review persists all four required sections', async () => {
  const calls = []
  const database = { query: async (sql, values = []) => { calls.push({ sql, values }); return { rows: [] } } }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reviews`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'bae-seungdo', weekEnd: '2026-09-06', workHighlights: '고객사 지원', actionItems: '다음 작업', topsProjects: '과제', otherNotes: '없음' }),
    })
    assert.equal(response.status, 204)
    assert.match(calls[0].sql, /INSERT INTO reviews/)
    assert.deepEqual(calls[0].values, ['bae-seungdo', '2026-09-06', '고객사 지원', '다음 작업', '과제', '없음'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
