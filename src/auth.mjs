import crypto from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const SESSION_COOKIE = 'msp_session'
const STATE_COOKIE = 'slack_oauth_state'
const SESSION_AGE = 12 * 60 * 60
const slackKeys = createRemoteJWKSet(
  new URL('https://slack.com/openid/connect/keys'),
)
const sign = (value, secret) =>
  crypto.createHmac('sha256', secret).update(value).digest('base64url')

export function createSessionToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || !secret) return null
  const pieces = token.split('.')
  if (pieces.length !== 2) return null
  const [body, signature] = pieces
  const expected = Buffer.from(sign(body, secret))
  const actual = Buffer.from(signature)
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  )
    return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return payload &&
      typeof payload.userId === 'string' &&
      Number.isFinite(payload.exp) &&
      payload.exp > Date.now()
      ? payload
      : null
  } catch {
    return null
  }
}

function cookies(header = '') {
  const result = Object.create(null)
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    try {
      result[key] = decodeURIComponent(value.join('='))
    } catch {
      /* Ignore malformed cookie. */
    }
  }
  return result
}

function cookie(name, value, age, env) {
  const secure =
    env.NODE_ENV === 'production' ||
    env.SLACK_REDIRECT_URI?.startsWith('https:')
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`
}

const validEmail = (value) =>
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const validDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

export async function syncSlackProfileDefaults(pool, env, identity) {
  let profile = {}
  if (env.SLACK_PROFILE_TOKEN) {
    try {
      const url = new URL('https://slack.com/api/users.profile.get')
      url.searchParams.set('user', identity.slackUserId)
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${env.SLACK_PROFILE_TOKEN}` },
      })
      const result = await response.json()
      if (response.ok && result.ok && result.profile) profile = result.profile
    } catch {
      // Optional defaults must never prevent an otherwise valid Slack login.
    }
  }
  const email = identity.emailVerified && validEmail(identity.email)
    ? identity.email.trim()
    : validEmail(profile.email) ? profile.email.trim() : ''
  const phone = typeof profile.phone === 'string' && profile.phone.length <= 100
    ? profile.phone.trim()
    : ''
  const joinedOn = validDate(profile.start_date) ? profile.start_date : ''
  await pool.query(
    `UPDATE users SET
       email=CASE WHEN email='' AND $2<>'' THEN $2 ELSE email END,
       phone=CASE WHEN phone='' AND $3<>'' THEN $3 ELSE phone END,
       joined_on=CASE WHEN joined_on IS NULL AND $4<>'' THEN $4::date ELSE joined_on END,
       version=version+CASE WHEN (email='' AND $2<>'') OR (phone='' AND $3<>'') OR (joined_on IS NULL AND $4<>'') THEN 1 ELSE 0 END
     WHERE id=$1`,
    [identity.userId, email, phone, joinedOn],
  )
}

// Refresh identity and permissions from the DB on every request, including revoked accounts.
export function requireSession(env, pool) {
  return async (request, response, next) => {
    if (request.session) return next()
    try {
      const token = verifySessionToken(
        cookies(request.headers.cookie)[SESSION_COOKIE],
        env.SESSION_SECRET,
      )
      const localId =
        env.NODE_ENV !== 'production' && !env.SLACK_CLIENT_ID
          ? env.LOCAL_DEV_USER_ID
          : null
      const userId = token?.userId ?? localId
      if (!userId)
        return response.status(401).json({ error: '로그인이 필요합니다.' })
      const { rows } = await pool.query(
        'SELECT id, name, role FROM users WHERE id = $1 AND active = true',
        [userId],
      )
      if (!rows[0])
        return response
          .status(401)
          .json({ error: '사용할 수 없는 계정입니다. 관리자에게 문의하세요.' })
      request.session = {
        userId: rows[0].id,
        name: rows[0].name,
        role: rows[0].role,
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireRole(_env, roles) {
  return (req, res, next) =>
    roles.includes(req.session?.role)
      ? next()
      : res.status(403).json({ error: '이 작업을 수행할 권한이 없습니다.' })
}

export function requireSelfOrRole(_env, roles, target) {
  return (req, res, next) =>
    req.session?.userId === target(req) || roles.includes(req.session?.role)
      ? next()
      : res.status(403).json({ error: '본인 기록만 수정할 수 있습니다.' })
}

export function registerAuthRoutes(app, pool, env) {
  if (env.SLACK_CLIENT_ID) {
    app.get('/auth/slack', (_req, res) => {
      const nonce = crypto.randomBytes(24).toString('hex')
      const state = createSessionToken(
        { userId: nonce, exp: Date.now() + 600000 },
        env.SESSION_SECRET,
      )
      const url = new URL('https://slack.com/openid/connect/authorize')
      for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: env.SLACK_CLIENT_ID,
        scope: 'openid profile email',
        redirect_uri: env.SLACK_REDIRECT_URI,
        state,
        nonce,
      }))
        url.searchParams.set(key, value)
      res.setHeader('Set-Cookie', cookie(STATE_COOKIE, state, 600, env))
      res.redirect(url.toString())
    })
    app.get('/auth/slack/callback', async (req, res, next) => {
      const stored = cookies(req.headers.cookie)[STATE_COOKIE]
      const state = verifySessionToken(stored, env.SESSION_SECRET)
      res.setHeader('Set-Cookie', cookie(STATE_COOKIE, '', 0, env))
      if (!state || req.query.state !== stored)
        return res
          .status(403)
          .send(
            '로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인하세요.',
          )
      if (typeof req.query.code !== 'string' || !req.query.code)
        return res.status(400).send('Slack 인증 코드가 없습니다.')
      try {
        const response = await fetch(
          'https://slack.com/api/openid.connect.token',
          {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code: req.query.code,
              client_id: env.SLACK_CLIENT_ID,
              client_secret: env.SLACK_CLIENT_SECRET,
              redirect_uri: env.SLACK_REDIRECT_URI,
            }),
          },
        )
        const result = await response.json()
        if (!response.ok || !result.ok)
          return res
            .status(502)
            .send('Slack 인증에 실패했습니다. 다시 로그인하세요.')
        const { payload } = await jwtVerify(result.id_token, slackKeys, {
          issuer: 'https://slack.com',
          audience: env.SLACK_CLIENT_ID,
          algorithms: ['RS256'],
          requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
        })
        if (
          payload.nonce !== state.userId ||
          (env.ALLOWED_SLACK_TEAM_ID &&
            payload['https://slack.com/team_id'] !== env.ALLOWED_SLACK_TEAM_ID)
        )
          return res.status(403).send('허용되지 않은 Slack 로그인입니다.')
        const { rows } = await pool.query(
          'SELECT id, name, role FROM users WHERE slack_user_id = $1 AND active = true',
          [payload.sub],
        )
        if (!rows[0])
          return res
            .status(403)
            .send(
              '사전 등록된 활성 MSP 사용자가 아닙니다. 관리자에게 등록을 요청하세요.',
            )
        await syncSlackProfileDefaults(pool, env, {
          userId: rows[0].id,
          slackUserId: payload.sub,
          email: payload.email,
          emailVerified: payload.email_verified === true,
        })
        const token = createSessionToken(
          { userId: rows[0].id, exp: Date.now() + SESSION_AGE * 1000 },
          env.SESSION_SECRET,
        )
        res.append(
          'Set-Cookie',
          cookie(SESSION_COOKIE, token, SESSION_AGE, env),
        )
        res.redirect('/')
      } catch (error) {
        if (
          error.code?.startsWith('ERR_JWT') ||
          error.code?.startsWith('ERR_JWS') ||
          error.code?.startsWith('ERR_JOSE')
        )
          return res
            .status(403)
            .send('Slack 인증 정보를 확인할 수 없습니다. 다시 로그인하세요.')
        next(error)
      }
    })
  }
  app.get('/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0, env))
    res.redirect('/')
  })
  app.get('/api/me', requireSession(env, pool), (req, res) =>
    res.json(req.session),
  )
}
