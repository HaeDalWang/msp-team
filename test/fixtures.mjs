import crypto from 'node:crypto'
import { Pool } from 'pg'
import { migrate } from '../src/db.mjs'
import { createApp } from '../src/server.mjs'
import { createSessionToken } from '../src/auth.mjs'

export async function fixture(t) {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error(
      'Use npm test to start an isolated PostgreSQL container, or set TEST_DATABASE_URL to a disposable test database.',
    )
  const schema = `test_${crypto.randomUUID().replaceAll('-', '')}`
  const control = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await control.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  })
  let server
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    await pool.end()
    await control.query(`DROP SCHEMA ${schema} CASCADE`)
    await control.end()
  })
  await migrate(pool)
  await pool.query(
    "INSERT INTO parts(id,name) VALUES('p1','첫 파트'),('p2','새 파트')",
  )
  for (const [id, role] of [
    ['admin', 'admin'],
    ['lead', 'lead'],
    ['user', 'engineer'],
    ['other', 'engineer'],
  ])
    await pool.query(
      'INSERT INTO users(id,name,part_id,role,slack_user_id) VALUES($1,$1,$2,$3,$4)',
      [id, 'p1', role, `U${id.toUpperCase()}`],
    )
  const env = {
    SLACK_CLIENT_ID: 'test-client',
    SLACK_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    SLACK_REDIRECT_URI: 'http://localhost/auth/slack/callback',
  }
  server = createApp(pool, env).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  env.SLACK_REDIRECT_URI = `${base}/auth/slack/callback`
  const token = (userId) =>
    createSessionToken(
      { userId, exp: Date.now() + 3600000 },
      env.SESSION_SECRET,
    )
  const request = async (
    path,
    { user = 'user', method = 'GET', body, headers = {} } = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        ...(user ? { cookie: `msp_session=${token(user)}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  return { pool, base, request, token, env }
}
export const review = (overrides = {}) => ({
  weekEnd: '2026-09-07',
  workHighlights: '고객사 지원',
  actionItems: '다음 작업',
  topsProjects: '과제 진행',
  otherNotes: '기타 없음',
  ticketsNew: 3,
  ticketsInProgress: 2,
  ticketsDone: 5,
  status: 'submitted',
  version: 0,
  ...overrides,
})
export const overtime = (overrides = {}) => ({
  date: '2026-09-06',
  type: '작업',
  customer: '고객사',
  startTime: '22:00',
  endTime: '02:00',
  detail: '야간 작업',
  ...overrides,
})
