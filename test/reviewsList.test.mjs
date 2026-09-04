import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

test('GET /api/reviews returns every user for the week with review fields when present', async () => {
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM users')) {
        return { rows: [
          { id: 'kim-beomjung', name: '김범중', part: 'Tiger', role: 'engineer', work_highlights: 'DI 구성', action_items: '튜닝 확정', tops_projects: 'Terraform Generator', other_notes: '인수인계', status: 'submitted', tickets_new: 12, tickets_in_progress: 7, tickets_done: 9 },
          { id: 'jo-suhyeon', name: '조수현', part: 'Dragon', role: 'engineer', work_highlights: null, action_items: null, tops_projects: null, other_notes: null, status: null, tickets_new: 0, tickets_in_progress: 0, tickets_done: 0 },
        ] }
      }
      return { rows: [] }
    },
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reviews?weekEnd=2026-09-06`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.entries[0], {
      id: 'kim-beomjung', name: '김범중', part: 'Tiger', role: 'engineer',
      workHighlights: 'DI 구성', actionItems: '튜닝 확정', topsProjects: 'Terraform Generator', otherNotes: '인수인계',
      status: 'submitted', tickets: [12, 7, 9],
    })
    assert.deepEqual(body.entries[1], {
      id: 'jo-suhyeon', name: '조수현', part: 'Dragon', role: 'engineer',
      workHighlights: '', actionItems: '', topsProjects: '', otherNotes: '',
      status: 'missing', tickets: [0, 0, 0],
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
