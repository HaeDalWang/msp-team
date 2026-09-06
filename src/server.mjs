import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { connectDatabase } from './db.mjs'
import { registerAuthRoutes, requireRole, requireSelfOrRole, requireSession } from './auth.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export function createApp(pool, env = process.env) {
  const app = express()
  app.use(express.json())
  app.get('/health', (_request, response) => response.json({ ok: true }))
  const authEnabled = Boolean(env.SLACK_CLIENT_ID)
  if (authEnabled) registerAuthRoutes(app, pool, env)
  // 인증이 꺼져 있으면(SLACK_CLIENT_ID 미설정) 통과시키는 no-op 미들웨어. 로컬/테스트 편의용.
  const noop = (_request, _response, next) => next()
  const adminOnly = authEnabled ? requireRole(env, ['admin']) : noop
  const adminOrLead = authEnabled ? requireRole(env, ['admin', 'lead']) : noop
  const selfOrAdminOrLead = (userIdFrom) => authEnabled ? requireSelfOrRole(env, ['admin', 'lead'], userIdFrom) : noop
  // 담당 고객사는 엔지니어들이 서로 자주 넘겨주고 받는 관계라, 본인 소유 여부와 무관하게
  // 로그인한 사람(seed에 등록된 engineer/lead/executive/admin) 누구나 추가·수정할 수 있다.
  const requireAnySession = authEnabled ? requireSession(env) : noop
  app.get('/api/bootstrap', async (_request, response, next) => {
    try {
      const result = await pool.query('SELECT u.id, u.name, p.name AS part, u.role FROM users u LEFT JOIN parts p ON p.id = u.part_id ORDER BY p.name NULLS FIRST, u.name')
      response.json({ users: result.rows })
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/reviews', async (request, response, next) => {
    const weekEnd = request.query.weekEnd
    if (typeof weekEnd !== 'string' || !weekEnd) return response.status(400).json({ error: 'weekEnd 쿼리 파라미터가 필요합니다.' })
    try {
      const result = await pool.query(
        `SELECT u.id, u.name, p.name AS part, u.role,
                r.work_highlights, r.action_items, r.tops_projects, r.other_notes, r.status,
                r.tickets_new, r.tickets_in_progress, r.tickets_done
         FROM users u
         LEFT JOIN parts p ON p.id = u.part_id
         LEFT JOIN reviews r ON r.user_id = u.id AND r.week_end = $1
         ORDER BY p.name NULLS FIRST, u.name`,
        [weekEnd],
      )
      response.json({
        entries: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          part: row.part,
          role: row.role,
          workHighlights: row.work_highlights ?? '',
          actionItems: row.action_items ?? '',
          topsProjects: row.tops_projects ?? '',
          otherNotes: row.other_notes ?? '',
          status: row.status ?? 'missing',
          tickets: [row.tickets_new ?? 0, row.tickets_in_progress ?? 0, row.tickets_done ?? 0],
        })),
      })
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/customers', async (_request, response, next) => {
    try {
      // 담당 고객사가 아직 하나도 없는 팀원도 화면에 자기 칸이 보여야(그래야 "추가" 버튼을 누를 수 있다)
      // 하므로, customer_assignments가 아니라 users를 기준으로 전체를 조회하고 LEFT JOIN한다.
      const usersResult = await pool.query('SELECT u.id, u.name, p.name AS part FROM users u LEFT JOIN parts p ON p.id = u.part_id ORDER BY p.name NULLS FIRST, u.name')
      const assignmentsResult = await pool.query(
        `SELECT ca.user_id, c.id AS customer_id, c.name AS customer_name, c.since, c.tier, c.mcr, c.key_account, c.note
         FROM customer_assignments ca
         JOIN customers c ON c.id = ca.customer_id
         ORDER BY c.name`,
      )
      const owners = usersResult.rows.map((user) => ({ userId: user.id, name: user.name, part: user.part, customers: [] }))
      const ownerIndex = new Map(owners.map((owner, index) => [owner.userId, index]))
      for (const row of assignmentsResult.rows) {
        const index = ownerIndex.get(row.user_id)
        if (index === undefined) continue
        owners[index].customers.push({ id: row.customer_id, name: row.customer_name, since: row.since, tier: row.tier, mcr: row.mcr, keyAccount: row.key_account, note: row.note ?? '' })
      }
      response.json({ owners })
    } catch (error) {
      next(error)
    }
  })
  const customerTiers = ['Standard', 'Advanced', 'Enterprise']
  app.post('/api/customers', requireAnySession, async (request, response, next) => {
    const { name, userId, tier, mcr, keyAccount, since, note } = request.body
    if (typeof name !== 'string' || !name.trim() || typeof userId !== 'string' || !userId.trim()) return response.status(400).json({ error: 'name과 userId는 필수입니다.' })
    if (tier !== undefined && !customerTiers.includes(tier)) return response.status(400).json({ error: `tier는 ${customerTiers.join('/')} 중 하나여야 합니다.` })
    try {
      const created = await pool.query(
        'INSERT INTO customers (name, since, tier, mcr, key_account, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [name.trim(), since ?? null, tier ?? 'Standard', Boolean(mcr), Boolean(keyAccount), note ?? ''],
      )
      const id = created.rows[0].id
      await pool.query('INSERT INTO customer_assignments (customer_id, user_id) VALUES ($1, $2)', [id, userId])
      response.status(201).json({ id })
    } catch (error) {
      next(error)
    }
  })
  // 담당 고객사 수정/삭제도 추가와 동일하게 로그인한 사람 누구나 가능하다(엔지니어끼리 담당을 자주 넘김).
  app.put('/api/customers/:id', requireAnySession, async (request, response, next) => {
    const { userId, tier, mcr, keyAccount, note, since } = request.body
    if (typeof userId !== 'string' || !userId.trim()) return response.status(400).json({ error: 'userId는 필수입니다.' })
    if (tier !== undefined && !customerTiers.includes(tier)) return response.status(400).json({ error: `tier는 ${customerTiers.join('/')} 중 하나여야 합니다.` })
    try {
      await pool.query(
        'UPDATE customers SET tier = COALESCE($1, tier), mcr = COALESCE($2, mcr), key_account = COALESCE($3, key_account), note = COALESCE($4, note), since = COALESCE($5, since) WHERE id = $6',
        [tier ?? null, mcr ?? null, keyAccount ?? null, note ?? null, since ?? null, request.params.id],
      )
      await pool.query('DELETE FROM customer_assignments WHERE customer_id = $1', [request.params.id])
      await pool.query('INSERT INTO customer_assignments (customer_id, user_id) VALUES ($1, $2)', [request.params.id, userId])
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.delete('/api/customers/:id', requireAnySession, async (request, response, next) => {
    try {
      await pool.query('DELETE FROM customers WHERE id = $1', [request.params.id])
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/schedule', async (request, response, next) => {
    const month = request.query.month
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return response.status(400).json({ error: 'month는 YYYY-MM 형식이어야 합니다.' })
    try {
      const result = await pool.query('SELECT user_id, work_date, type, note FROM schedule_entries WHERE to_char(work_date, \'YYYY-MM\') = $1', [month])
      const entries = {}
      for (const row of result.rows) {
        const dateKey = row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : row.work_date
        entries[row.user_id] ??= {}
        entries[row.user_id][dateKey] = { type: row.type, note: row.note ?? '' }
      }
      response.json({ entries })
    } catch (error) {
      next(error)
    }
  })
  app.put('/api/schedule', selfOrAdminOrLead((request) => request.body?.userId), async (request, response, next) => {
    const { userId, date, type, note } = request.body
    if (typeof userId !== 'string' || !userId.trim() || typeof date !== 'string' || !date.trim()) return response.status(400).json({ error: 'userId와 date는 필수입니다.' })
    try {
      await pool.query('INSERT INTO schedule_entries (user_id, work_date, type, note) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, work_date) DO UPDATE SET type = EXCLUDED.type, note = EXCLUDED.note', [userId, date, type ?? '', note ?? ''])
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/holidays', async (_request, response, next) => {
    try {
      const result = await pool.query('SELECT holiday_date, name FROM holidays ORDER BY holiday_date')
      response.json({ holidays: result.rows.map((row) => ({ date: row.holiday_date instanceof Date ? row.holiday_date.toISOString().slice(0, 10) : row.holiday_date, name: row.name })) })
    } catch (error) {
      next(error)
    }
  })
  app.post('/api/holidays', adminOrLead, async (request, response, next) => {
    const { date, name } = request.body
    if (typeof date !== 'string' || !date.trim() || typeof name !== 'string' || !name.trim()) return response.status(400).json({ error: 'date와 name은 필수입니다.' })
    try {
      await pool.query('INSERT INTO holidays (holiday_date, name) VALUES ($1, $2) ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name', [date, name.trim()])
      response.status(201).end()
    } catch (error) {
      next(error)
    }
  })
  app.delete('/api/holidays/:date', adminOrLead, async (request, response, next) => {
    try {
      await pool.query('DELETE FROM holidays WHERE holiday_date = $1', [request.params.date])
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/overtime', async (request, response, next) => {
    const userId = request.query.userId
    if (typeof userId !== 'string' || !userId.trim()) return response.status(400).json({ error: 'userId 쿼리 파라미터가 필요합니다.' })
    try {
      const result = await pool.query(
        'SELECT id, work_date, type, customer, start_time, end_time, hours, detail, evidence, status FROM overtime_records WHERE user_id = $1 ORDER BY work_date DESC',
        [userId],
      )
      const records = result.rows.map((row) => ({
        id: row.id,
        date: row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : row.work_date,
        type: row.type,
        customer: row.customer,
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
        hours: Number(row.hours),
        detail: row.detail,
        evidence: row.evidence ?? '',
        status: row.status,
      }))
      const balanceHours = records.filter((record) => record.status === 'approved').reduce((total, record) => total + record.hours, 0)
      response.json({ balanceHours, records })
    } catch (error) {
      next(error)
    }
  })
  app.post('/api/overtime', async (request, response, next) => {
    const { userId, date, type, customer, startTime, endTime, hours, detail, evidence } = request.body
    if (![userId, date, type, customer, startTime, endTime, detail].every((value) => typeof value === 'string' && value.trim()) || !(Number(hours) > 0)) {
      return response.status(400).json({ error: '시간외 업무 등록에 필요한 항목이 비어 있습니다.' })
    }
    try {
      await pool.query(
        'INSERT INTO overtime_records (user_id, work_date, type, customer, start_time, end_time, hours, detail, evidence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [userId, date, type, customer, startTime, endTime, hours, detail, evidence ?? ''],
      )
      response.status(201).end()
    } catch (error) {
      next(error)
    }
  })
  app.post('/api/overtime/:id/approve', adminOrLead, async (request, response, next) => {
    try {
      await pool.query("UPDATE overtime_records SET status = 'approved' WHERE id = $1 AND status = 'pending'", [request.params.id])
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/organization', async (_request, response, next) => {
    try {
      const partsResult = await pool.query('SELECT id, name, color FROM parts ORDER BY name')
      const usersResult = await pool.query('SELECT id, name, part_id, role, version FROM users ORDER BY name')
      const users = {}
      for (const row of usersResult.rows) users[row.id] = { name: row.name, partId: row.part_id, role: row.role, version: row.version }
      response.json({ parts: partsResult.rows, users })
    } catch (error) {
      next(error)
    }
  })
  app.post('/api/organization/parts', adminOnly, async (request, response, next) => {
    const { name } = request.body
    if (typeof name !== 'string' || !name.trim()) return response.status(400).json({ error: 'name은 필수입니다.' })
    try {
      const id = `part-${name.trim().toLowerCase().replace(/\s+/g, '-')}`
      const created = await pool.query('INSERT INTO parts (id, name) VALUES ($1, $2) RETURNING id', [id, name.trim()])
      response.status(201).json({ id: created.rows[0].id })
    } catch (error) {
      next(error)
    }
  })
  app.put('/api/organization/users/:id', adminOnly, async (request, response, next) => {
    const { partId, role, version } = request.body
    if (!(Number(version) >= 0)) return response.status(400).json({ error: 'version은 필수입니다.' })
    try {
      const result = await pool.query(
        'UPDATE users SET part_id = COALESCE($1, part_id), role = COALESCE($2, role), version = version + 1 WHERE id = $3 AND version = $4',
        [partId ?? null, role ?? null, request.params.id, version],
      )
      if (result.rowCount === 0) return response.status(409).json({ error: '다른 사용자가 먼저 변경했습니다. 최신 상태를 다시 불러오세요.' })
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.put('/api/reviews', async (request, response, next) => {
    const { userId, weekEnd, workHighlights, actionItems, topsProjects, otherNotes, ticketsNew, ticketsInProgress, ticketsDone } = request.body
    if (![userId, weekEnd, workHighlights, actionItems, topsProjects, otherNotes].every((value) => typeof value === 'string' && value.trim())) return response.status(400).json({ error: '네 개의 회고 항목은 모두 필수입니다.' })
    const tickets = [ticketsNew, ticketsInProgress, ticketsDone].map((value) => Number(value) || 0)
    if (tickets.some((value) => value < 0)) return response.status(400).json({ error: '티켓 수는 0 이상이어야 합니다.' })
    try {
      await pool.query(
        'INSERT INTO reviews (user_id, week_end, work_highlights, action_items, tops_projects, other_notes, tickets_new, tickets_in_progress, tickets_done) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id, week_end) DO UPDATE SET work_highlights = EXCLUDED.work_highlights, action_items = EXCLUDED.action_items, tops_projects = EXCLUDED.tops_projects, other_notes = EXCLUDED.other_notes, tickets_new = EXCLUDED.tickets_new, tickets_in_progress = EXCLUDED.tickets_in_progress, tickets_done = EXCLUDED.tickets_done',
        [userId, weekEnd, workHighlights, actionItems, topsProjects, otherNotes, ...tickets],
      )
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  app.use(express.static(join(here, '..', 'public')))
  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = await connectDatabase()
  const app = createApp(pool)
  const port = Number(process.env.PORT ?? 3000)
  app.listen(port, () => console.log(`MSP weekly review listening on ${port}`))
}
