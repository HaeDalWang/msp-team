import crypto from 'node:crypto'

const STATE_COOKIE = 'slack_oauth_state'
const SESSION_COOKIE = 'msp_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

export function createSessionToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function verifySessionToken(token, secret) {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature || sign(body, secret) !== signature) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function parseCookies(header) {
  const cookies = {}
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key) cookies[key] = decodeURIComponent(rest.join('='))
  }
  return cookies
}

export function registerAuthRoutes(app, pool, env) {
  const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI, SESSION_SECRET, ALLOWED_SLACK_TEAM_ID } = env

  app.get('/auth/slack', (_request, response) => {
    const state = crypto.randomBytes(16).toString('hex')
    const url = new URL('https://slack.com/openid/connect/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', SLACK_CLIENT_ID)
    url.searchParams.set('scope', 'openid profile email')
    url.searchParams.set('redirect_uri', SLACK_REDIRECT_URI)
    url.searchParams.set('state', state)
    response.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600`)
    response.redirect(url.toString())
  })

  app.get('/auth/slack/callback', async (request, response, next) => {
    const cookies = parseCookies(request.headers.cookie)
    const { code, state } = request.query
    if (!state || !cookies[STATE_COOKIE] || state !== cookies[STATE_COOKIE]) {
      return response.status(403).send('Slack 로그인 요청이 유효하지 않습니다. 다시 로그인해 주세요.')
    }
    if (typeof code !== 'string' || !code) return response.status(400).send('Slack 인증 코드가 없습니다.')
    try {
      const tokenResponse = await fetch('https://slack.com/api/openid.connect.token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: SLACK_CLIENT_ID, client_secret: SLACK_CLIENT_SECRET, redirect_uri: SLACK_REDIRECT_URI }),
      })
      const tokenBody = await tokenResponse.json()
      if (!tokenBody.ok) return response.status(502).send('Slack 인증에 실패했습니다.')
      const claims = decodeIdToken(tokenBody.id_token)
      if (ALLOWED_SLACK_TEAM_ID && claims['https://slack.com/team_id'] !== ALLOWED_SLACK_TEAM_ID) {
        return response.status(403).send('허용되지 않은 Slack workspace입니다.')
      }
      const slackUserId = claims.sub
      const result = await pool.query('SELECT id, name, part_id, role FROM users WHERE slack_user_id = $1', [slackUserId])
      const user = result.rows[0]
      if (!user) return response.status(403).send('사전 등록된 MSP 사용자가 아닙니다. 관리자에게 등록을 요청하세요.')
      const token = createSessionToken({ userId: user.id, name: user.name, role: user.role, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }, SESSION_SECRET)
      response.setHeader('Set-Cookie', [
        `${STATE_COOKIE}=; Path=/; Max-Age=0`,
        `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      ])
      response.redirect('/')
    } catch (error) {
      next(error)
    }
  })

  app.get('/auth/logout', (_request, response) => {
    response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`)
    response.redirect('/')
  })

  app.get('/api/me', (request, response) => {
    const cookies = parseCookies(request.headers.cookie)
    const session = verifySessionToken(cookies[SESSION_COOKIE], SESSION_SECRET)
    if (!session || session.exp < Date.now()) return response.status(401).json({ error: '로그인이 필요합니다.' })
    response.json({ userId: session.userId, name: session.name, role: session.role })
  })
}

function decodeIdToken(idToken) {
  const [, payload] = idToken.split('.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

export function requireSession(env) {
  return (request, response, next) => {
    const cookies = parseCookies(request.headers.cookie)
    const session = verifySessionToken(cookies[SESSION_COOKIE], env.SESSION_SECRET)
    if (!session || session.exp < Date.now()) return response.status(401).json({ error: '로그인이 필요합니다.' })
    request.session = session
    next()
  }
}

// role은 seed 기준 'engineer' | 'lead' | 'executive' | 'admin' 중 하나.
export function requireRole(env, allowedRoles) {
  const requireAuth = requireSession(env)
  return (request, response, next) => {
    requireAuth(request, response, (error) => {
      if (error) return next(error)
      if (!allowedRoles.includes(request.session.role)) return response.status(403).json({ error: '이 작업을 수행할 권한이 없습니다.' })
      next()
    })
  }
}

// 본인(userId 일치) 또는 allowedRoles에 속한 사용자만 허용. userIdFrom(request)로 대상 userId를 얻는다.
export function requireSelfOrRole(env, allowedRoles, userIdFrom) {
  const requireAuth = requireSession(env)
  return (request, response, next) => {
    requireAuth(request, response, (error) => {
      if (error) return next(error)
      const targetUserId = userIdFrom(request)
      if (request.session.userId === targetUserId || allowedRoles.includes(request.session.role)) return next()
      return response.status(403).json({ error: '이 작업을 수행할 권한이 없습니다.' })
    })
  }
}
