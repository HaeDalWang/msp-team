import express from 'express'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { connectDatabase, transaction } from './db.mjs'
import {
  registerAuthRoutes,
  requireRole,
  requireSelfOrRole,
  requireSession,
} from './auth.mjs'
import * as v from './validation.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const roles = ['engineer', 'lead', 'executive', 'admin']
const scheduleTypes = [
  '',
  '출근',
  '휴가',
  '오전반차',
  '오후반차',
  '외근',
  '외근·출장',
  '오전출장',
  '오후출장',
  '종일출장',
]
const tiers = ['Standard', 'Advanced', 'Enterprise']
const reviewFields = [
  'workHighlights',
  'actionItems',
  'topsProjects',
  'otherNotes',
]
const calendarDate = (value) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : value
const has = (obj, key) => Object.hasOwn(obj, key)

async function activeUser(db, id) {
  const result = await db.query(
    'SELECT id FROM users WHERE id = $1 AND active = true',
    [id],
  )
  if (!result.rows.length) v.fail(400, '활성 구성원을 선택하세요.')
}

function userFields(body) {
  const fields = {}
  if (has(body, 'name')) fields.name = v.text(body.name, '이름', { max: 100 })
  if (has(body, 'partId'))
    fields.part_id =
      body.partId === null ? null : v.text(body.partId, '파트', { max: 100 })
  if (has(body, 'role')) fields.role = v.choice(body.role, roles, '역할')
  if (has(body, 'active')) fields.active = v.bool(body.active)
  if (has(body, 'joinedOn')) fields.joined_on = body.joinedOn === null || body.joinedOn === '' ? null : v.date(body.joinedOn)
  if (has(body, 'slackUserId'))
    fields.slack_user_id = v.text(body.slackUserId, 'Slack 사용자 ID', {
      max: 100,
    })
  if (has(body, 'email')) {
    fields.email = v.text(body.email, '이메일', { required: false, max: 254 })
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
      v.fail(400, '이메일 형식을 확인하세요.')
  }
  if (has(body, 'workStart')) fields.work_start = v.time(body.workStart)
  if (has(body, 'workEnd')) fields.work_end = v.time(body.workEnd)
  return fields
}

export function createApp(pool, env = process.env) {
  if (env.NODE_ENV === 'production') {
    for (const key of [
      'SLACK_CLIENT_ID',
      'SLACK_CLIENT_SECRET',
      'SLACK_REDIRECT_URI',
      'SESSION_SECRET',
      'ALLOWED_SLACK_TEAM_ID',
    ])
      if (!env[key]) throw new Error(`Slack 운영 설정이 필요합니다: ${key}`)
    if (
      !env.SLACK_REDIRECT_URI.startsWith('https://') ||
      env.SESSION_SECRET.length < 32
    )
      throw new Error(
        '운영 환경에는 HTTPS와 32자 이상 SESSION_SECRET이 필요합니다.',
      )
  }
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    )
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/'))
      res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '128kb' }))
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1')
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })
  registerAuthRoutes(app, pool, env)
  app.use('/api', requireSession(env, pool))
  const limits = new Map()
  app.use('/api', (req, res, next) => {
    const now = Date.now()
    for (const [key, value] of limits) if (value.until < now) limits.delete(key)
    const key = req.session.userId
    const limit = limits.get(key) ?? { count: 0, until: now + 60000 }
    limits.set(key, limit)
    if (++limit.count > 600)
      return res
        .status(429)
        .json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return res
          .status(403)
          .json({ error: '다른 사이트의 요청은 허용되지 않습니다.' })
      if (req.headers.origin) {
        const expected = env.APP_PUBLIC_URL
          ? new URL(env.APP_PUBLIC_URL).origin
          : env.SLACK_REDIRECT_URI
            ? new URL(env.SLACK_REDIRECT_URI).origin
            : `http://${req.headers.host}`
        if (req.headers.origin !== expected)
          return res
            .status(403)
            .json({ error: '요청 출처가 올바르지 않습니다.' })
      }
      if (
        req.body !== undefined &&
        (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      )
        return res.status(400).json({ error: 'JSON 객체가 필요합니다.' })
    }
    req.body ??= {}
    next()
  })
  const adminOnly = requireRole(env, ['admin'])
  const leadOnly = requireRole(env, ['admin', 'lead'])
  const selfOnly = requireSelfOrRole(
    env,
    [],
    (req) => req.body.userId ?? req.session.userId,
  )
  const selfOrLead = requireSelfOrRole(
    env,
    ['admin', 'lead'],
    (req) => req.body.userId,
  )

  app.get('/api/bootstrap', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT u.id, u.name, p.name AS part, u.role, u.work_start, u.work_end FROM users u LEFT JOIN parts p ON p.id = u.part_id WHERE u.active = true ORDER BY p.name NULLS FIRST, u.name',
    )
    res.json({
      users: rows.map(({ work_start, work_end, ...row }) => ({
        ...row,
        workStart: String(work_start).slice(0, 5),
        workEnd: String(work_end).slice(0, 5),
      })),
    })
  })

  app.get('/api/profile', async (req, res) => {
    const { rows } = await pool.query('SELECT email,joined_on AS "joinedOn",version FROM users WHERE id=$1', [req.session.userId])
    res.json(rows[0])
  })
  app.put('/api/profile', async (req, res) => {
    if (Object.keys(req.body).some((key) => !['email', 'joinedOn', 'version'].includes(key)))
      v.fail(400, '내 정보에서는 이메일과 입사일만 수정할 수 있습니다.')
    const version = v.integer(req.body.version, 'version')
    const fields = userFields({ email: req.body.email, joinedOn: req.body.joinedOn })
    const { rows } = await pool.query('UPDATE users SET email=$1,joined_on=$2,version=version+1 WHERE id=$3 AND version=$4 RETURNING email,joined_on AS "joinedOn",version', [fields.email, fields.joined_on, req.session.userId, version])
    if (!rows.length) v.fail(409, '다른 곳에서 프로필이 변경되었습니다. 다시 불러온 후 저장하세요.')
    res.json(rows[0])
  })

  app.get('/api/reviews', async (req, res) => {
    const week = v.date(req.query.weekEnd)
    const { rows } = await pool.query(
      `SELECT (SELECT type FROM schedule_entries WHERE user_id=u.id AND work_date=$1) AS meeting_schedule,(SELECT SUM(hours) FROM leave_requests WHERE user_id=u.id AND leave_date=$1 AND status='approved') AS meeting_leave_hours,u.id,u.name,p.name AS part,u.role,r.id AS review_id,r.work_highlights,r.action_items,r.tops_projects,r.other_notes,r.status,r.tickets_new,r.tickets_in_progress,r.tickets_done,r.version,r.updated_at,r.reviewed_by FROM users u LEFT JOIN parts p ON p.id=u.part_id LEFT JOIN reviews r ON r.user_id=u.id AND r.week_end=$1 WHERE (u.active=true OR r.id IS NOT NULL) AND (($3 AND u.id=$2) OR (NOT $3 AND (r.id IS NOT NULL OR (u.part_id IS NOT NULL AND u.role NOT IN ('lead','executive'))))) ORDER BY p.sort_order,p.name,u.joined_on NULLS LAST,u.name,u.id`,
      [week, req.session.userId, req.query.personal === 'true'],
    )
    res.json({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        part: row.part,
        role: row.role,
        reviewId: row.review_id ?? null,
        workHighlights: row.work_highlights ?? '',
        actionItems: row.action_items ?? '',
        topsProjects: row.tops_projects ?? '',
        otherNotes: row.other_notes ?? '',
        status: row.status ?? 'missing',
        tickets: [
          row.tickets_new ?? 0,
          row.tickets_in_progress ?? 0,
          row.tickets_done ?? 0,
        ],
        version: row.version ?? 0,
        updatedAt: row.updated_at ?? null,
        reviewedBy: row.reviewed_by ?? null,
        meetingLeave: ['휴가', '오전반차', '오후반차'].includes(row.meeting_schedule)
          ? row.meeting_schedule
          : Number(row.meeting_leave_hours) > 0 ? `대체휴가 ${Number(row.meeting_leave_hours)}시간` : null,
      })),
    })
  })
  app.put('/api/reviews', selfOnly, async (req, res) => {
    const b = req.body
    const week = v.date(b.weekEnd)
    const version = v.integer(b.version, 'version')
    const status = v.choice(b.status, ['draft', 'submitted'], '회고 상태')
    const values = reviewFields.map((field) => {
      const text = v.text(b[field] ?? '', field, { required: false })
      return status === 'submitted' && !text.trim() ? '특이사항 없음' : text
    })
    const tickets = ['ticketsNew', 'ticketsInProgress', 'ticketsDone'].map(
      (field) => v.integer(b[field] === '' ? 0 : (b[field] ?? 0), '티켓 수'),
    )
    const result = await transaction(pool, async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        req.session.userId,
      ])
      const old = await db.query(
        'SELECT id,version FROM reviews WHERE user_id=$1 AND week_end=$2 FOR UPDATE',
        [req.session.userId, week],
      )
      if ((old.rows[0]?.version ?? 0) !== version)
        v.fail(
          409,
          '회고가 다른 창에서 변경되었습니다. 작성 내용을 복사한 후 새로 불러오세요.',
        )
      return db.query(
        `INSERT INTO reviews(user_id,week_end,work_highlights,action_items,tops_projects,other_notes,tickets_new,tickets_in_progress,tickets_done,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,week_end) DO UPDATE SET work_highlights=EXCLUDED.work_highlights,action_items=EXCLUDED.action_items,tops_projects=EXCLUDED.tops_projects,other_notes=EXCLUDED.other_notes,tickets_new=EXCLUDED.tickets_new,tickets_in_progress=EXCLUDED.tickets_in_progress,tickets_done=EXCLUDED.tickets_done,status=EXCLUDED.status,version=reviews.version+1,updated_at=now(),reviewed_by=NULL RETURNING id,version,status`,
        [req.session.userId, week, ...values, ...tickets, status],
      )
    })
    res.json(result.rows[0])
  })
  app.post('/api/reviews/:id/complete', leadOnly, async (req, res) => {
    const version = v.integer(req.body.version, 'version')
    const result = await pool.query(
      "UPDATE reviews SET status='reviewed',reviewed_by=$1,version=version+1,updated_at=now() WHERE id=$2 AND version=$3 AND status='submitted' RETURNING version,status",
      [req.session.userId, req.params.id, version],
    )
    if (!result.rowCount)
      v.fail(
        409,
        '제출된 최신 회고만 검토 완료할 수 있습니다. 새로 불러오세요.',
      )
    res.json(result.rows[0])
  })
  app.get('/api/reviews/:id/comments', async (req, res) => {
    const { rows } = await pool.query(
      'SELECT c.id,c.author_id,c.body,c.created_at,u.name FROM review_comments c JOIN users u ON u.id=c.author_id WHERE review_id=$1 ORDER BY c.created_at,c.id',
      [req.params.id],
    )
    res.json({
      comments: rows.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        authorName: row.name,
        body: row.body,
        createdAt: row.created_at,
      })),
    })
  })
  app.post('/api/reviews/:id/comments', async (req, res) => {
    const body = v.text(req.body.body, '댓글', { max: 5000 })
    const result = await pool.query(
      'INSERT INTO review_comments(review_id,author_id,body) VALUES($1,$2,$3) RETURNING id,created_at',
      [req.params.id, req.session.userId, body],
    )
    res.status(201).json({
      id: result.rows[0].id,
      authorId: req.session.userId,
      authorName: req.session.name,
      body,
      createdAt: result.rows[0].created_at,
    })
  })

  app.get('/api/customers', async (_req, res) => {
    const users = await pool.query(
      'SELECT u.id,u.name,p.name AS part FROM users u LEFT JOIN parts p ON p.id=u.part_id WHERE u.active=true OR EXISTS(SELECT 1 FROM customer_assignments ca WHERE ca.user_id=u.id) ORDER BY p.name NULLS FIRST,u.name',
    )
    const assignments = await pool.query(
      'SELECT ca.user_id,c.* FROM customer_assignments ca JOIN customers c ON c.id=ca.customer_id ORDER BY c.name',
    )
    res.json({
      owners: users.rows.map((u) => ({
        userId: u.id,
        name: u.name,
        part: u.part,
        customers: assignments.rows
          .filter((c) => c.user_id === u.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            since: calendarDate(c.since),
            tier: c.tier,
            mcr: c.mcr,
            keyAccount: c.key_account,
            note: c.note,
          })),
      })),
    })
  })
  function customerFields(b) {
    const fields = {}
    if (has(b, 'name'))
      fields.name = v.text(b.name, '고객사 이름', { max: 200 })
    if (has(b, 'since'))
      fields.since = b.since === null || b.since === '' ? null : v.date(b.since)
    if (has(b, 'tier')) fields.tier = v.choice(b.tier, tiers, '등급')
    if (has(b, 'mcr')) fields.mcr = v.bool(b.mcr)
    if (has(b, 'keyAccount')) fields.key_account = v.bool(b.keyAccount)
    if (has(b, 'note'))
      fields.note = v.text(b.note, '메모', { required: false })
    return fields
  }
  app.post('/api/customers', async (req, res) => {
    const b = req.body,
      fields = customerFields(b)
    v.text(b.userId, '담당자')
    v.text(b.name, '고객사 이름', { max: 200 })
    const id = await transaction(pool, async (db) => {
      await activeUser(db, b.userId)
      const cols = Object.keys(fields)
      const result = await db.query(
        `INSERT INTO customers(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
        Object.values(fields),
      )
      await db.query(
        'INSERT INTO customer_assignments(customer_id,user_id) VALUES($1,$2)',
        [result.rows[0].id, b.userId],
      )
      return result.rows[0].id
    })
    res.status(201).json({ id })
  })
  app.put('/api/customers/:id', async (req, res) => {
    const b = req.body,
      fields = customerFields(b)
    v.text(b.userId, '담당자')
    await transaction(pool, async (db) => {
      const existing = await db.query(
        'SELECT id FROM customers WHERE id=$1 FOR UPDATE',
        [req.params.id],
      )
      if (!existing.rowCount) v.fail(404, '고객사를 찾을 수 없습니다.')
      await activeUser(db, b.userId)
      const cols = Object.keys(fields)
      if (cols.length)
        await db.query(
          `UPDATE customers SET ${cols.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE id=$${cols.length + 1}`,
          [...Object.values(fields), req.params.id],
        )
      await db.query('DELETE FROM customer_assignments WHERE customer_id=$1', [
        req.params.id,
      ])
      await db.query(
        'INSERT INTO customer_assignments(customer_id,user_id) VALUES($1,$2)',
        [req.params.id, b.userId],
      )
    })
    res.status(204).end()
  })
  app.delete('/api/customers/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM customers WHERE id=$1', [
      req.params.id,
    ])
    if (!result.rowCount) v.fail(404, '고객사를 찾을 수 없습니다.')
    res.status(204).end()
  })

  app.get('/api/schedule', async (req, res) => {
    const month = v.month(req.query.month)
    const { rows } = await pool.query(
      "SELECT user_id,work_date,type,note FROM schedule_entries WHERE work_date >= ($1 || '-01')::date AND work_date < ($1 || '-01')::date + interval '1 month'",
      [month],
    )
    const entries = {}
    for (const row of rows) {
      entries[row.user_id] ??= {}
      entries[row.user_id][calendarDate(row.work_date)] = {
        type: row.type,
        note: row.note,
      }
    }
    const leaves = await pool.query(
      "SELECT user_id,leave_date,SUM(hours) AS hours FROM leave_requests WHERE status='approved' AND leave_date >= ($1 || '-01')::date AND leave_date < ($1 || '-01')::date + interval '1 month' GROUP BY user_id,leave_date",
      [month],
    )
    for (const row of leaves.rows) {
      entries[row.user_id] ??= {}
      const date = calendarDate(row.leave_date)
      entries[row.user_id][date] ??= { note: '' }
      entries[row.user_id][date].leaveHours = Number(row.hours)
    }
    res.json({ entries })
  })
  app.put('/api/schedule', selfOrLead, async (req, res) => {
    const b = req.body
    v.text(b.userId, '사용자')
    v.date(b.date)
    const endDate = v.date(b.endDate ?? b.date)
    const span = (Date.parse(endDate) - Date.parse(b.date)) / 86400000
    if (span < 0 || span > 30) v.fail(400, '기간은 시작일부터 최대 31일 이내로 선택하세요.')
    v.choice(b.type, scheduleTypes, '일정 유형')
    v.text(b.note ?? '', '사유', { required: false })
    await activeUser(pool, b.userId)
    await transaction(pool, async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [b.userId])
      if (!b.type && !b.note)
        await db.query('DELETE FROM schedule_entries WHERE user_id=$1 AND work_date BETWEEN $2 AND $3', [b.userId, b.date, endDate])
      else
        await db.query("INSERT INTO schedule_entries(user_id,work_date,type,note) SELECT $1,day::date,$4,$5 FROM generate_series($2::date,$3::date,interval '1 day') AS day ON CONFLICT(user_id,work_date) DO UPDATE SET type=EXCLUDED.type,note=EXCLUDED.note", [b.userId, b.date, endDate, b.type, b.note ?? ''])
    })
    res.status(204).end()
  })
  app.get('/api/holidays', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT holiday_date,name FROM holidays ORDER BY holiday_date',
    )
    res.json({
      holidays: rows.map((row) => ({
        date: calendarDate(row.holiday_date),
        name: row.name,
      })),
    })
  })
  app.post('/api/holidays', leadOnly, async (req, res) => {
    await pool.query(
      'INSERT INTO holidays(holiday_date,name) VALUES($1,$2) ON CONFLICT(holiday_date) DO UPDATE SET name=EXCLUDED.name',
      [v.date(req.body.date), v.text(req.body.name, '휴일 이름', { max: 100 })],
    )
    res.status(201).end()
  })
  app.delete('/api/holidays/:date', leadOnly, async (req, res) => {
    await pool.query('DELETE FROM holidays WHERE holiday_date=$1', [
      v.date(req.params.date),
    ])
    res.status(204).end()
  })

  app.get('/api/organization', async (req, res) => {
    const parts = await pool.query(
      'SELECT id,name,color,sort_order AS "sortOrder" FROM parts ORDER BY sort_order,name',
    )
    const people = await pool.query(
      'SELECT id,name,part_id,role,version,email,work_start,work_end,slack_user_id,active,joined_on FROM users ORDER BY joined_on NULLS LAST,name,id',
    )
    res.json({
      parts: parts.rows,
      users: Object.fromEntries(
        people.rows.map((u) => [
          u.id,
          {
            name: u.name,
            partId: u.part_id,
            role: u.role,
            version: u.version,
            email: u.email,
            workStart: String(u.work_start).slice(0, 5),
            workEnd: String(u.work_end).slice(0, 5),
            active: u.active,
            joinedOn: u.joined_on,
            ...(req.session.role === 'admin'
              ? { slackUserId: u.slack_user_id }
              : {}),
          },
        ]),
      ),
    })
  })
  app.post('/api/organization/parts', adminOnly, async (req, res) => {
    const id = crypto.randomUUID()
    await pool.query('INSERT INTO parts(id,name) VALUES($1,$2)', [
      id,
      v.text(req.body.name, '파트 이름', { max: 100 }),
    ])
    res.status(201).json({ id })
  })
  app.put('/api/organization/parts/:id', adminOnly, async (req, res) => {
    const name = v.text(req.body.name, '파트 이름', { max: 100 })
    const result = await pool.query('UPDATE parts SET name=$1,sort_order=COALESCE($3,sort_order) WHERE id=$2', [
      name,
      req.params.id,
      req.body.sortOrder === undefined ? null : v.integer(req.body.sortOrder, '발표 순서'),
    ])
    if (!result.rowCount) v.fail(404, '파트가 없습니다.')
    res.status(204).end()
  })
  app.delete('/api/organization/parts/:id', adminOnly, async (req, res) => {
    await pool.query('DELETE FROM parts WHERE id=$1', [req.params.id])
    res.status(204).end()
  })
  app.post('/api/organization/users', adminOnly, async (req, res) => {
    v.text(req.body.name, '이름')
    v.text(req.body.slackUserId, 'Slack 사용자 ID')
    const fields = userFields(req.body),
      cols = Object.keys(fields),
      id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO users(id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => `$${i + 2}`).join(',')})`,
      [id, ...Object.values(fields)],
    )
    res.status(201).json({ id })
  })
  app.put('/api/organization/users/:id', adminOnly, async (req, res) => {
    const fields = userFields(req.body),
      version = v.integer(req.body.version, 'version'),
      cols = Object.keys(fields)
    if (!cols.length) v.fail(400, '변경할 항목이 없습니다.')
    await transaction(pool, async (db) => {
      // Serialize admin demotions to prevent concurrently removing the final administrator.
      await db.query(
        "SELECT id FROM users WHERE role='admin' AND active=true ORDER BY id FOR UPDATE",
      )
      const current = await db.query(
        'SELECT role,active FROM users WHERE id=$1',
        [req.params.id],
      )
      if (!current.rows.length) v.fail(404, '사용자가 없습니다.')
      if (
        current.rows[0].role === 'admin' &&
        current.rows[0].active &&
        (fields.active === false || (fields.role && fields.role !== 'admin'))
      ) {
        const count = await db.query(
          "SELECT count(*)::int AS count FROM users WHERE role='admin' AND active=true",
        )
        if (count.rows[0].count <= 1)
          v.fail(
            409,
            '마지막 관리자는 비활성화하거나 권한을 해제할 수 없습니다.',
          )
      }
      const result = await db.query(
        `UPDATE users SET ${cols.map((key, i) => `${key}=$${i + 1}`).join(',')},version=version+1 WHERE id=$${cols.length + 1} AND version=$${cols.length + 2}`,
        [...Object.values(fields), req.params.id, version],
      )
      if (!result.rowCount)
        v.fail(409, '다른 사용자가 먼저 변경했습니다. 새로 불러오세요.')
    })
    res.status(204).end()
  })

  registerLeaveRoutes(app, pool, leadOnly, selfOnly)
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: '요청한 API가 없습니다.' }),
  )
  app.use(express.static(join(here, '..', 'public')))
  app.use((error, _req, res, _next) => {
    const messages = {
      23505: '이미 등록된 이름 또는 계정입니다.',
      23503: '연결된 데이터가 있거나 참조하는 항목이 없습니다.',
      '22P02': '입력 형식이 올바르지 않습니다.',
      22007: '날짜·시간 형식이 올바르지 않습니다.',
      22008: '유효하지 않은 날짜·시간입니다.',
      23514: '입력 범위를 확인하세요.',
    }
    const status =
      error.status ??
      (messages[error.code]
        ? ['23505', '23503'].includes(error.code)
          ? 409
          : 400
        : 500)
    if (status >= 500)
      console.error('Request failed:', error.code ?? error.name)
    res.status(status).json({
      error:
        messages[error.code] ??
        (status < 500
          ? error.message
          : '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'),
    })
  })
  return app
}

function registerLeaveRoutes(app, pool, leadOnly, selfOnly) {
  const summarySql = `SELECT u.id AS user_id,COALESCE(o.accrued,0) AS accrued,COALESCE(o.pending,0) AS pending,COALESCE(l.used,0) AS used,COALESCE(l.pending,0) AS leave_pending FROM users u LEFT JOIN (SELECT user_id,SUM(hours) FILTER(WHERE status='approved') AS accrued,SUM(hours) FILTER(WHERE status='pending') AS pending FROM overtime_records GROUP BY user_id) o ON o.user_id=u.id LEFT JOIN (SELECT user_id,SUM(hours) FILTER(WHERE status='approved') AS used,SUM(hours) FILTER(WHERE status='pending') AS pending FROM leave_requests GROUP BY user_id) l ON l.user_id=u.id`
  const totals = (row) => ({
    userId: row.user_id,
    accruedHours: Number(row.accrued),
    usedHours: Number(row.used),
    balanceHours:
      Math.round((Number(row.accrued) - Number(row.used)) * 10000) / 10000,
    pendingHours: Number(row.pending),
    pendingLeaveHours: Number(row.leave_pending),
  })
  app.get('/api/overtime/summary', async (_req, res) => {
    const { rows } = await pool.query(
      summarySql + ' WHERE u.active=true ORDER BY u.name',
    )
    res.json({ users: rows.map(totals) })
  })
  app.get('/api/overtime', async (req, res) => {
    const id = v.text(req.query.userId, '사용자')
    const summary = await pool.query(summarySql + ' WHERE u.id=$1', [id])
    if (!summary.rows.length) v.fail(404, '사용자가 없습니다.')
    const overtime = await pool.query(
      'SELECT * FROM overtime_records WHERE user_id=$1 ORDER BY work_date DESC,id DESC',
      [id],
    )
    const leave = await pool.query(
      'SELECT * FROM leave_requests WHERE user_id=$1 ORDER BY leave_date DESC,id DESC',
      [id],
    )
    res.json({
      ...totals(summary.rows[0]),
      records: overtime.rows.map((r) => ({
        id: r.id,
        date: calendarDate(r.work_date),
        type: r.type,
        customer: r.customer,
        startTime: String(r.start_time).slice(0, 5),
        endTime: String(r.end_time).slice(0, 5),
        hours: Number(r.hours),
        detail: r.detail,
        evidence: r.evidence,
        status: r.status,
        cancellationReason: r.cancellation_reason,
        cancelledBy: r.cancelled_by,
        cancelledAt: r.cancelled_at,
      })),
      leaves: leave.rows.map((r) => ({
        id: r.id,
        date: calendarDate(r.leave_date),
        hours: Number(r.hours),
        reason: r.reason,
        status: r.status,
        cancellationReason: r.cancellation_reason,
        cancelledBy: r.cancelled_by,
        cancelledAt: r.cancelled_at,
      })),
    })
  })
  app.post('/api/overtime', selfOnly, async (req, res) => {
    const b = req.body
    const hours = v.duration(b.startTime, b.endTime)
    if (![b.startTime, b.endTime].every((time) => /:(00|30)$/.test(time)))
      v.fail(400, '시작·종료 시간은 30분 단위로 선택하세요.')
    v.date(b.date)
    v.choice(b.type, ['기술지원', '작업', '장애대응', '점검'], '업무 유형')
    const customer = v.text(b.customer, '고객사', { max: 200 }),
      detail = v.text(b.detail, '업무 내용'),
      evidence = v.text(b.evidence ?? '', '근거', {
        required: false,
        max: 2000,
      })
    // Lock the person so accidental repeated submissions cannot create duplicate intervals.
    await transaction(pool, async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        req.session.userId,
      ])
      const duplicate = await db.query(
        `SELECT id FROM overtime_records WHERE user_id=$1 AND status IN ('pending','approved')
         AND tsrange(work_date + start_time,
           work_date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 day' END, '[)')
         && tsrange($2::date + $3::time,
           $2::date + $4::time + CASE WHEN $4::time < $3::time THEN interval '1 day' ELSE interval '0 day' END, '[)')`,
        [req.session.userId, b.date, b.startTime, b.endTime],
      )
      if (duplicate.rowCount)
        v.fail(409, '해당 시간과 겹치는 초과근무가 이미 등록되어 있습니다.')
      await db.query(
        'INSERT INTO overtime_records(user_id,work_date,type,customer,start_time,end_time,hours,detail,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          req.session.userId,
          b.date,
          b.type,
          customer,
          b.startTime,
          b.endTime,
          hours,
          detail,
          evidence,
        ],
      )
    })
    res.status(201).end()
  })
  app.post('/api/leave', selfOnly, async (req, res) => {
    const b = req.body
    const hours = Number(b.hours)
    if (
      ![4, 8].includes(hours)
    )
      v.fail(
        400,
        '대체휴가는 4시간 또는 8시간으로 신청하세요.',
      )
    await transaction(pool, async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        req.session.userId,
      ])
      const duplicate = await db.query(
        "SELECT id FROM leave_requests WHERE user_id=$1 AND leave_date=$2 AND status IN ('pending','approved')",
        [req.session.userId, v.date(b.date)],
      )
      if (duplicate.rowCount)
        v.fail(409, '해당 날짜의 사용 신청이 이미 있습니다.')
      const balance = await db.query(summarySql + ' WHERE u.id=$1', [req.session.userId])
      const account = totals(balance.rows[0])
      if (hours > account.balanceHours - account.pendingLeaveHours)
        v.fail(409, '신청 가능한 잔여 시간이 부족합니다. 승인 대기 중인 사용 신청도 포함하여 확인하세요.')
      await db.query(
        'INSERT INTO leave_requests(user_id,leave_date,hours,reason) VALUES($1,$2,$3,$4)',
        [req.session.userId, b.date, hours, v.text(b.reason, '사용 사유')],
      )
    })
    res.status(201).end()
  })
  for (const [path, table] of [
    ['overtime', 'overtime_records'],
    ['leave', 'leave_requests'],
  ]) {
    app.post(`/api/${path}/:id/cancel`, leadOnly, async (req, res) => {
      const reason = v.text(req.body.reason, '승인 취소 사유', { max: 2000 })
      await transaction(pool, async (db) => {
        const initial = await db.query(`SELECT user_id FROM ${table} WHERE id=$1`, [req.params.id])
        if (!initial.rowCount) v.fail(404, '기록이 없습니다.')
        const userId = initial.rows[0].user_id
        await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
        const { rows } = await db.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [req.params.id])
        const record = rows[0]
        if (!record || record.status !== 'approved') v.fail(409, '승인된 기록만 취소할 수 있습니다.')
        if (path === 'overtime') {
          const balance = await db.query(summarySql + ' WHERE u.id=$1', [userId])
          const account = totals(balance.rows[0])
          if (Number(record.hours) > account.balanceHours - account.pendingLeaveHours)
            v.fail(409, '이미 사용했거나 사용 신청 중인 시간입니다. 해당 휴가부터 취소하세요.')
        }
        await db.query(`UPDATE ${table} SET status='cancelled',cancellation_reason=$1,cancelled_by=$2,cancelled_at=now() WHERE id=$3`, [reason, req.session.userId, req.params.id])
      })
      res.status(204).end()
    })
    for (const action of ['approve', 'reject'])
      app.post(`/api/${path}/:id/${action}`, leadOnly, async (req, res) => {
        await transaction(pool, async (db) => {
          const initial = await db.query(
            `SELECT user_id FROM ${table} WHERE id=$1`,
            [req.params.id],
          )
          if (!initial.rows.length) v.fail(404, '기록이 없습니다.')
          await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
            initial.rows[0].user_id,
          ])
          const result = await db.query(
            `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
            [req.params.id],
          )
          const record = result.rows[0]
          if (!record || record.status !== 'pending')
            v.fail(409, '이미 처리된 기록입니다. 새로 불러오세요.')
          if (path === 'leave' && action === 'approve') {
            const { rows } = await db.query(summarySql + ' WHERE u.id=$1', [
              record.user_id,
            ])
            if (totals(rows[0]).balanceHours < Number(record.hours))
              v.fail(409, '사용 가능한 대체휴가 시간이 부족합니다.')
          }
          await db.query(
            `UPDATE ${table} SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3`,
            [
              action === 'approve' ? 'approved' : 'rejected',
              req.session.userId,
              req.params.id,
            ],
          )
        })
        res.status(204).end()
      })
    app.delete(`/api/${path}/:id`, async (req, res) => {
      const result = await pool.query(
        `DELETE FROM ${table} WHERE id=$1 AND user_id=$2 AND status IN ('pending','rejected')`,
        [req.params.id, req.session.userId],
      )
      if (!result.rowCount)
        v.fail(409, '본인의 미승인 기록만 삭제할 수 있습니다.')
      res.status(204).end()
    })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = await connectDatabase()
  const app = createApp(pool)
  const server = app.listen(Number(process.env.PORT ?? 3000), () =>
    console.log('MSP weekly review started'),
  )
  const stop = () =>
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
