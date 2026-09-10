import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
import {
  importInitialData,
  normalizeInitialData,
} from '../src/initialData.mjs'

const sample = {
  version: 1,
  customers: [
    {
      name: '검수 고객사',
      active: true,
      ownerUserId: 'user',
      since: '2026-01-01',
      tier: 'Advanced',
      mcr: true,
      keyAccount: false,
      note: '기존 자료',
    },
  ],
  overtime: [
    {
      userId: 'user',
      date: '2026-01-02',
      type: '기존 기록',
      customer: '기존 엑셀 이관',
      startTime: '18:00',
      endTime: '20:00',
      hours: 2,
      detail: '야간 작업',
      evidence: '',
    },
  ],
  leave: [
    {
      userId: 'user',
      date: '2026-01-05',
      hours: 4,
      reason: '휴식',
    },
  ],
}

test('normalizeInitialData rejects malformed and duplicate source rows', () => {
  assert.throws(
    () => normalizeInitialData({ ...sample, version: 2 }),
    /지원하지 않는 데이터 버전/,
  )
  assert.throws(
    () =>
      normalizeInitialData({
        ...sample,
        overtime: [...sample.overtime, ...sample.overtime],
      }),
    /중복된 초과근무/,
  )
  assert.throws(
    () =>
      normalizeInitialData({
        ...sample,
        leave: [{ ...sample.leave[0], date: '2026-02-30' }],
      }),
    /올바른 날짜가 아닙니다/,
  )
})

test('initial data defaults to a read-only preview', async (t) => {
  const { pool } = await fixture(t)
  const result = await importInitialData(pool, sample)

  assert.deepEqual(result, {
    mode: 'preview',
    customers: { source: 1, insert: 1, existing: 0 },
    assignments: { source: 1, insert: 1, existing: 0, skipped: 0 },
    overtime: { source: 1, insert: 1, existing: 0 },
    leave: { source: 1, insert: 1, existing: 0 },
  })
  assert.equal(
    Number((await pool.query('SELECT count(*) FROM customers')).rows[0].count),
    0,
  )
})

test('initial data apply is transactional and idempotent', async (t) => {
  const { pool } = await fixture(t)

  const first = await importInitialData(pool, sample, { apply: true })
  assert.equal(first.mode, 'apply')
  assert.equal(first.customers.insert, 1)
  assert.equal(first.overtime.insert, 1)
  assert.equal(first.leave.insert, 1)

  const second = await importInitialData(pool, sample, { apply: true })
  assert.deepEqual(second.customers, { source: 1, insert: 0, existing: 1 })
  assert.deepEqual(second.assignments, {
    source: 1,
    insert: 0,
    existing: 1,
    skipped: 0,
  })
  assert.deepEqual(second.overtime, { source: 1, insert: 0, existing: 1 })
  assert.deepEqual(second.leave, { source: 1, insert: 0, existing: 1 })

  const counts = await pool.query(`SELECT
    (SELECT count(*)::int FROM customers) customers,
    (SELECT count(*)::int FROM customer_assignments) assignments,
    (SELECT count(*)::int FROM overtime_records) overtime,
    (SELECT count(*)::int FROM leave_requests) leave`)
  assert.deepEqual(counts.rows[0], {
    customers: 1,
    assignments: 1,
    overtime: 1,
    leave: 1,
  })
})

test('initial data never changes an existing customer or its assignments', async (t) => {
  const { pool } = await fixture(t)
  const existing = await pool.query(
    "INSERT INTO customers(name,note,tier) VALUES('검수 고객사','현재 메모','Standard') RETURNING id",
  )
  await pool.query(
    'INSERT INTO customer_assignments(customer_id,user_id) VALUES($1,$2)',
    [existing.rows[0].id, 'other'],
  )
  await pool.query(
    `INSERT INTO overtime_records
     (user_id,work_date,type,customer,start_time,end_time,hours,detail,status)
     VALUES('user','2026-01-02','작업','기존','18:30','19:00',0.5,'기존 시간','approved')`,
  )
  await pool.query(
    `INSERT INTO leave_requests(user_id,leave_date,hours,reason,status)
     VALUES('user','2026-01-05',8,'기존 휴가','approved')`,
  )

  const result = await importInitialData(pool, sample, { apply: true })
  assert.deepEqual(result.assignments, {
    source: 1,
    insert: 0,
    existing: 0,
    skipped: 1,
  })
  assert.deepEqual(result.overtime, { source: 1, insert: 0, existing: 1 })
  assert.deepEqual(result.leave, { source: 1, insert: 0, existing: 1 })
  const customer = await pool.query(
    `SELECT c.note,c.tier,array_agg(ca.user_id ORDER BY ca.user_id) owners
     FROM customers c JOIN customer_assignments ca ON ca.customer_id=c.id
     WHERE c.id=$1 GROUP BY c.id`,
    [existing.rows[0].id],
  )
  assert.deepEqual(customer.rows[0], {
    note: '현재 메모',
    tier: 'Standard',
    owners: ['other'],
  })
})

test('initial data aborts before writing when a user mapping is missing', async (t) => {
  const { pool } = await fixture(t)
  await assert.rejects(
    importInitialData(
      pool,
      {
        ...sample,
        overtime: [{ ...sample.overtime[0], userId: 'missing-user' }],
      },
      { apply: true },
    ),
    /DB에 없는 사용자/,
  )
  assert.equal(
    Number((await pool.query('SELECT count(*) FROM customers')).rows[0].count),
    0,
  )
})
