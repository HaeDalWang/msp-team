import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSeed } from '../src/seed.mjs'

test('normalizeSeed preserves explicit IDs and adds the default engineer role', () => {
  const seed = normalizeSeed({
    parts: [{ id: 'part-tiger', name: 'Tiger', color: '#d76a20' }],
    users: [{ id: 'usr-hong', name: '홍길동', part: 'Tiger', role: 'lead', slackUserId: 'U123' }],
  })

  assert.deepEqual(seed, {
    parts: [{ id: 'part-tiger', name: 'Tiger', color: '#d76a20' }],
    users: [{ id: 'usr-hong', name: '홍길동', partId: 'part-tiger', role: 'lead', slackUserId: 'U123' }],
  })
})

test('normalizeSeed defaults a part color when none is given', () => {
  const seed = normalizeSeed({
    parts: [{ id: 'part-tiger', name: 'Tiger' }],
    users: [],
  })
  assert.equal(seed.parts[0].color, '#5fa8ff')
})

test('normalizeSeed permits an unassigned manager', () => {
  assert.deepEqual(
    normalizeSeed({ parts: [{ id: 'part-tiger', name: 'Tiger' }], users: [{ id: 'usr-lead', name: '조원근', part: null, role: 'lead', slackUserId: 'U5SSTMDGE' }] }).users,
    [{ id: 'usr-lead', name: '조원근', partId: null, role: 'lead', slackUserId: 'U5SSTMDGE' }],
  )
})

test('normalizeSeed rejects a user mapped to a missing part', () => {
  assert.throws(
    () => normalizeSeed({ parts: [{ name: 'Tiger' }], users: [{ name: '홍길동', part: 'Leaf' }] }),
    /unknown part: Leaf/,
  )
})
