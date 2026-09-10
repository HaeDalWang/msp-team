import { transaction } from './db.mjs'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${field}이(가) 비어 있습니다.`)
  return value.trim()
}

function calendarDate(value, field) {
  const text = requiredText(value, field)
  const match = DATE.exec(text)
  const parsed = match && new Date(`${text}T00:00:00Z`)
  if (
    !match ||
    parsed.getUTCFullYear() !== Number(text.slice(0, 4)) ||
    parsed.getUTCMonth() + 1 !== Number(text.slice(5, 7)) ||
    parsed.getUTCDate() !== Number(text.slice(8, 10))
  )
    throw new Error(`${field}이(가) 올바른 날짜가 아닙니다: ${text}`)
  return text
}

function clock(value, field) {
  const text = requiredText(value, field)
  if (!TIME.test(text)) throw new Error(`${field}이(가) 올바른 시간이 아닙니다: ${text}`)
  return text
}

function unique(rows, key, label) {
  const seen = new Set()
  for (const row of rows) {
    const value = key(row)
    if (seen.has(value)) throw new Error(`중복된 ${label} 기록입니다: ${value}`)
    seen.add(value)
  }
}

export function normalizeInitialData(input) {
  if (!input || input.version !== 1)
    throw new Error(`지원하지 않는 데이터 버전입니다: ${input?.version ?? '없음'}`)

  const customers = (input.customers ?? []).map((row) => ({
    name: requiredText(row.name, '고객사명'),
    active: row.active !== false,
    ownerUserId: row.ownerUserId
      ? requiredText(row.ownerUserId, '고객사 담당자')
      : null,
    since: row.since ? calendarDate(row.since, '담당 시작일') : null,
    tier: requiredText(row.tier ?? 'Standard', '서비스 등급'),
    mcr: row.mcr === true,
    keyAccount: row.keyAccount === true,
    note: String(row.note ?? '').trim(),
  }))
  const overtime = (input.overtime ?? []).map((row) => {
    const hours = Number(row.hours)
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(hours * 2))
      throw new Error(`초과근무 시간이 올바르지 않습니다: ${row.hours}`)
    return {
      userId: requiredText(row.userId, '초과근무 사용자'),
      date: calendarDate(row.date, '초과근무 일자'),
      type: requiredText(row.type, '초과근무 유형'),
      customer: requiredText(row.customer, '초과근무 고객사'),
      startTime: clock(row.startTime, '초과근무 시작 시간'),
      endTime: clock(row.endTime, '초과근무 종료 시간'),
      hours,
      detail: requiredText(row.detail, '초과근무 업무 내용'),
      evidence: String(row.evidence ?? '').trim(),
    }
  })
  const leave = (input.leave ?? []).map((row) => {
    const hours = Number(row.hours)
    if (![4, 8].includes(hours))
      throw new Error(`대체휴가 시간이 올바르지 않습니다: ${row.hours}`)
    return {
      userId: requiredText(row.userId, '대체휴가 사용자'),
      date: calendarDate(row.date, '대체휴가 일자'),
      hours,
      reason: requiredText(row.reason, '대체휴가 사유'),
    }
  })

  unique(customers, (row) => row.name, '고객사')
  unique(
    overtime,
    (row) => [row.userId, row.date, row.startTime, row.endTime].join('|'),
    '초과근무',
  )
  unique(
    leave,
    (row) => [row.userId, row.date].join('|'),
    '대체휴가',
  )
  return { version: 1, customers, overtime, leave }
}

async function assertUsersExist(db, data) {
  const ids = [
    ...new Set([
      ...data.customers.map((row) => row.ownerUserId).filter(Boolean),
      ...data.overtime.map((row) => row.userId),
      ...data.leave.map((row) => row.userId),
    ]),
  ]
  if (!ids.length) return
  const { rows } = await db.query('SELECT id FROM users WHERE id = ANY($1)', [ids])
  const found = new Set(rows.map((row) => row.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) throw new Error(`DB에 없는 사용자: ${missing.join(', ')}`)
}

const emptyResult = (data, mode) => ({
  mode,
  customers: { source: data.customers.length, insert: 0, existing: 0 },
  assignments: {
    source: data.customers.filter((row) => row.ownerUserId).length,
    insert: 0,
    existing: 0,
    skipped: 0,
  },
  overtime: { source: data.overtime.length, insert: 0, existing: 0 },
  leave: { source: data.leave.length, insert: 0, existing: 0 },
})

async function customerId(db, row, apply) {
  const existing = await db.query('SELECT id FROM customers WHERE name=$1', [row.name])
  if (existing.rowCount) return { id: existing.rows[0].id, existing: true }
  if (!apply) return { id: null, existing: false }
  const inserted = await db.query(
    `INSERT INTO customers(name,note,since,tier,mcr,key_account,active,archived_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7 THEN NULL ELSE now() END)
     RETURNING id`,
    [row.name, row.note, row.since, row.tier, row.mcr, row.keyAccount, row.active],
  )
  return { id: inserted.rows[0].id, existing: false }
}

async function exists(db, table, values) {
  const statements = {
    overtime_records: `SELECT 1 FROM overtime_records
      WHERE user_id=$1 AND status IN ('pending','approved')
      AND tsrange(work_date + start_time,
        work_date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 day' END, '[)')
      && tsrange($2::date + $3::time,
        $2::date + $4::time + CASE WHEN $4::time < $3::time THEN interval '1 day' ELSE interval '0 day' END, '[)')
      LIMIT 1`,
    leave_requests: `SELECT 1 FROM leave_requests
      WHERE user_id=$1 AND leave_date=$2 AND status IN ('pending','approved') LIMIT 1`,
  }
  const result = await db.query(statements[table], values)
  return result.rowCount > 0
}

export async function importInitialData(pool, input, { apply = false } = {}) {
  const data = normalizeInitialData(input)
  return transaction(pool, async (db) => {
    if (apply)
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext('msp-approved-initial-data'))",
      )
    await assertUsersExist(db, data)
    const result = emptyResult(data, apply ? 'apply' : 'preview')

    for (const row of data.customers) {
      const customer = await customerId(db, row, apply)
      result.customers[customer.existing ? 'existing' : 'insert']++
      if (!row.ownerUserId) continue
      const assignmentExists = customer.id
        ? (
            await db.query(
              'SELECT 1 FROM customer_assignments WHERE customer_id=$1 AND user_id=$2',
              [customer.id, row.ownerUserId],
            )
          ).rowCount > 0
        : false
      if (assignmentExists) result.assignments.existing++
      else if (customer.existing) result.assignments.skipped++
      else result.assignments.insert++
      if (apply && !assignmentExists && !customer.existing)
        await db.query(
          'INSERT INTO customer_assignments(customer_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [customer.id, row.ownerUserId],
        )
    }

    for (const row of data.overtime) {
      const values = [
        row.userId,
        row.date,
        row.startTime,
        row.endTime,
      ]
      const alreadyExists = await exists(db, 'overtime_records', values)
      result.overtime[alreadyExists ? 'existing' : 'insert']++
      if (apply && !alreadyExists)
        await db.query(
          `INSERT INTO overtime_records
           (user_id,work_date,type,customer,start_time,end_time,hours,detail,evidence,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved')`,
          [
            row.userId,
            row.date,
            row.type,
            row.customer,
            row.startTime,
            row.endTime,
            row.hours,
            row.detail,
            row.evidence,
          ],
        )
    }

    for (const row of data.leave) {
      const values = [row.userId, row.date]
      const alreadyExists = await exists(db, 'leave_requests', values)
      result.leave[alreadyExists ? 'existing' : 'insert']++
      if (apply && !alreadyExists)
        await db.query(
          `INSERT INTO leave_requests(user_id,leave_date,hours,reason,status)
           VALUES($1,$2,$3,$4,'approved')`,
          [row.userId, row.date, row.hours, row.reason],
        )
    }
    return result
  })
}
