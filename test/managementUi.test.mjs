import test from 'node:test'
import assert from 'node:assert/strict'
import { session } from '../public/session.js'
import {
  loadCustomers,
  renderCustomers,
  bindCustomers,
} from '../public/views/customers.js'
import {
  daysInMonth,
  loadSchedule,
  renderSchedule,
  bindSchedule,
} from '../public/views/schedule.js'
import {
  loadOrganization,
  renderOrganization,
} from '../public/views/organization.js'
import {
  loadCompLeave,
  renderCompLeave,
  calculateHours,
  bindCompLeave,
} from '../public/views/compLeave.js'

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
function element(dataset = {}) {
  return {
    dataset,
    handlers: {},
    addEventListener(event, handler) {
      this.handlers[event] = handler
    },
  }
}
function root(single = {}, multiple = {}) {
  return {
    querySelector: (selector) => single[selector] ?? null,
    querySelectorAll: (selector) => multiple[selector] ?? [],
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
test.beforeEach(() => {
  globalThis.window = {}
})
test.afterEach(() => {
  delete globalThis.window
})

test('schedule generates real month lengths including leap years and year boundary', () => {
  assert.equal(daysInMonth('2024-02').length, 29)
  assert.equal(daysInMonth('2025-02').length, 28)
  assert.equal(daysInMonth('2026-12').at(-1).date, '2026-12-31')
  assert.equal(daysInMonth('2027-01')[0].weekday, '금')
})

test('all management views use escaped live data and dynamically include new parts', async (t) => {
  session.user = { userId: 'u1', role: 'admin' }
  const hostile = '<img src=x onerror="alert(1)">'
  t.mock.method(globalThis, 'fetch', async (path) => {
    if (path === '/api/customers')
      return json({
        owners: [
          {
            userId: 'u1',
            name: hostile,
            part: '새로운 파트',
            customers: [
              { id: 'c1', name: hostile, tier: hostile, note: hostile },
            ],
          },
        ],
      })
    if (path === '/api/organization')
      return json({
        parts: [
          { id: 'p1', name: '새로운 파트', color: 'red; background:url(evil)' },
        ],
        users: {
          u1: { name: hostile, partId: 'p1', role: 'admin', email: hostile },
        },
      })
    if (path === '/api/bootstrap')
      return json({
        users: [
          { id: 'u1', name: hostile, part: '새로운 파트' },
          { id: 'u2', name: '둘째', part: '다른 파트' },
        ],
      })
    if (path === '/api/holidays') return json({ holidays: [] })
    if (path.startsWith('/api/schedule')) return json({ entries: {} })
    if (path === '/api/overtime/summary')
      return json({
        users: [
          {
            userId: 'u1',
            balanceHours: 7,
            pendingHours: 2,
            pendingLeaveHours: 1,
            usedHours: 3,
          },
        ],
      })
    if (path.startsWith('/api/overtime?'))
      return json({
        records: [
          {
            id: 'o1',
            date: '2026-09-01',
            customer: hostile,
            detail: hostile,
            evidence: hostile,
            hours: 1,
            status: 'pending',
          },
        ],
        leaves: [
          {
            id: 'l1',
            date: '2026-09-02',
            reason: hostile,
            hours: 1,
            status: 'pending',
          },
        ],
      })
    throw new Error(`Unexpected ${path}`)
  })
  await loadCustomers()
  await loadSchedule()
  await loadOrganization()
  await loadCompLeave()
  for (const html of [
    renderCustomers(),
    renderSchedule(),
    renderOrganization(),
    renderCompLeave(),
  ]) {
    assert.ok(html.includes('새로운 파트'))
    assert.ok(!html.includes(hostile))
    assert.ok(html.includes('&lt;img'))
    assert.ok(!html.includes('@csg.example'))
  }
  assert.ok(
    renderCompLeave().includes('미조회'),
    'Missing summaries must not be represented as zero',
  )
  assert.match(renderCompLeave(), /data-testid="comp-leave-balance">7시간/)
})

test('customer failed save retains entered values and blocks duplicate requests', async (t) => {
  session.user = { userId: 'u1', role: 'engineer' }
  let posts = 0
  let release
  t.mock.method(globalThis, 'fetch', async (path, options = {}) => {
    if (!options.method)
      return json({ owners: [{ userId: 'u1', name: '담당자', customers: [] }] })
    posts++
    await new Promise((resolve) => {
      release = resolve
    })
    return new Response(JSON.stringify({ error: '저장 실패' }), { status: 500 })
  })
  await loadCustomers()
  const add = element({ addCustomer: 'u1' })
  bindCustomers(root({}, { '[data-add-customer]': [add] }), () => {})
  add.handlers.click()
  const input = element({ draft: 'name' })
  input.type = 'text'
  const form = element()
  bindCustomers(
    root({ '#customer-form': form }, { '[data-draft]': [input] }),
    () => {},
  )
  input.handlers.input({ target: { value: '유지할 고객사' } })
  form.handlers.submit({ preventDefault() {} })
  form.handlers.submit({ preventDefault() {} })
  await tick()
  release()
  await tick()
  assert.equal(posts, 1)
  assert.ok(renderCustomers().includes('유지할 고객사'))
  assert.ok(renderCustomers().includes('저장 실패'))
})

test('schedule saves edited note and retains it after a failed write', async (t) => {
  session.user = { userId: 'u1', role: 'engineer' }
  let payload
  t.mock.method(globalThis, 'fetch', async (path, options = {}) => {
    if (options.method === 'PUT') {
      payload = JSON.parse(options.body)
      return new Response(JSON.stringify({ error: '일정 저장 실패' }), {
        status: 500,
      })
    }
    if (path === '/api/bootstrap')
      return json({ users: [{ id: 'u1', name: '본인' }] })
    if (path === '/api/holidays') return json({ holidays: [] })
    return json({ entries: {} })
  })
  await loadSchedule()
  const cell = element({ user: 'u1', date: '2026-09-04' })
  bindSchedule(root({}, { '[data-user]': [cell] }), () => {})
  cell.handlers.click()
  const note = element()
  const type = element()
  const form = element()
  bindSchedule(
    root({
      '#schedule-note': note,
      '#schedule-type': type,
      '#schedule-form': form,
    }),
    () => {},
  )
  note.handlers.input({ target: { value: '고객사 방문 이유' } })
  type.handlers.change({ target: { value: '외근' } })
  form.handlers.submit({ preventDefault() {} })
  await tick()
  assert.equal(payload.note, '고객사 방문 이유')
  assert.equal(payload.type, '외근')
  assert.ok(renderSchedule().includes('고객사 방문 이유'))
  assert.ok(renderSchedule().includes('일정 저장 실패'))
})

test('overtime preview handles overnight work and rejects impossible clock values', () => {
  assert.equal(calculateHours('23:00', '01:30'), 2.5)
  assert.equal(calculateHours('12:00', '12:00'), 0)
  assert.equal(calculateHours('25:00', '26:00'), 0)
})

test('failed leave submission retains reason and requested hours', async (t) => {
  session.user = { userId: 'u1', role: 'engineer' }
  let payload
  t.mock.method(globalThis, 'fetch', async (_path, options) => {
    payload = JSON.parse(options.body)
    return new Response(JSON.stringify({ error: '잔여 시간 부족' }), {
      status: 409,
    })
  })
  const date = element({ leave: 'date' })
  const hours = element({ leave: 'hours' })
  const reason = element({ leave: 'reason' })
  const form = element()
  bindCompLeave(
    root({ '#leave-form': form }, { '[data-leave]': [date, hours, reason] }),
    () => {},
  )
  date.handlers.input({ target: { value: '2026-09-07' } })
  hours.handlers.input({ target: { value: '4' } })
  reason.handlers.input({ target: { value: '개인 일정' } })
  form.handlers.submit({ preventDefault() {} })
  await tick()
  assert.deepEqual(payload, {
    date: '2026-09-07',
    hours: 4,
    reason: '개인 일정',
  })
  assert.ok(renderCompLeave().includes('개인 일정'))
  assert.ok(renderCompLeave().includes('잔여 시간 부족'))
})
