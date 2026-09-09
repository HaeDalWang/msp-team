import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { fixture } from './fixtures.mjs'
import { syncSlackProfileDefaults } from '../src/auth.mjs'

test('Slack profile fills only blank contact and start-date defaults', async (t) => {
  const { pool, env } = await fixture(t)
  env.SLACK_PROFILE_TOKEN = 'xoxb-test-profile-token'
  let response = {
    ok: true,
    profile: { phone: '010-1234-5678', start_date: '2022-01-10' },
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://slack.com/api/users.profile.get?user=UUSER')
    assert.equal(options.headers.authorization, 'Bearer xoxb-test-profile-token')
    return new Response(JSON.stringify(response))
  })
  await syncSlackProfileDefaults(pool, env, {
    userId: 'user',
    slackUserId: 'UUSER',
    email: 'slack@example.com',
    emailVerified: true,
  })
  let saved = (await pool.query("SELECT email,phone,joined_on FROM users WHERE id='user'")).rows[0]
  assert.deepEqual(saved, { email: 'slack@example.com', phone: '010-1234-5678', joined_on: '2022-01-10' })

  await pool.query("UPDATE users SET email='mine@example.com',phone='내 번호',joined_on='2020-03-02' WHERE id='user'")
  response = { ok: true, profile: { phone: '바뀐 번호', start_date: '2024-04-01' } }
  await syncSlackProfileDefaults(pool, env, {
    userId: 'user', slackUserId: 'UUSER', email: 'changed@example.com', emailVerified: true,
  })
  saved = (await pool.query("SELECT email,phone,joined_on FROM users WHERE id='user'")).rows[0]
  assert.deepEqual(saved, { email: 'mine@example.com', phone: '내 번호', joined_on: '2020-03-02' })
})

test('Slack profile failure does not block verified email default', async (t) => {
  const { pool, env } = await fixture(t)
  env.SLACK_PROFILE_TOKEN = 'xoxb-test-profile-token'
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ok: false, error: 'temporary_failure' })))
  await syncSlackProfileDefaults(pool, env, {
    userId: 'user', slackUserId: 'UUSER', email: 'verified@example.com', emailVerified: true,
  })
  const saved = (await pool.query("SELECT email,phone,joined_on FROM users WHERE id='user'")).rows[0]
  assert.deepEqual(saved, { email: 'verified@example.com', phone: '', joined_on: null })
})

test('Slack callback verifies signature, audience, expiry and nonce before creating session', async (t) => {
  const { base, env, request } = await fixture(t)
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: 'integration-test',
    alg: 'RS256',
    use: 'sig',
  }
  const originalFetch = globalThis.fetch
  let claims = {}
  let token
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url) === 'https://slack.com/openid/connect/keys')
      return new Response(JSON.stringify({ keys: [jwk] }))
    if (String(url) === 'https://slack.com/api/openid.connect.token')
      return new Response(JSON.stringify({ ok: true, id_token: token }))
    return originalFetch(url, options)
  })
  async function callback(overrides = {}, options = {}) {
    const begin = await originalFetch(base + '/auth/slack', {
      redirect: 'manual',
    })
    const authorize = new URL(begin.headers.get('location'))
    claims = {
      nonce: authorize.searchParams.get('nonce'),
      'https://slack.com/team_id': 'TTEST',
      ...overrides,
    }
    token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-test' })
      .setIssuer('https://slack.com')
      .setAudience(options.audience ?? env.SLACK_CLIENT_ID)
      .setSubject('UUSER')
      .setIssuedAt()
      .setExpirationTime(options.expiry ?? '5m')
      .sign(options.key ?? privateKey)
    return originalFetch(
      base +
        '/auth/slack/callback?code=test&state=' +
        encodeURIComponent(authorize.searchParams.get('state')),
      {
        redirect: 'manual',
        headers: { cookie: begin.headers.get('set-cookie').split(';')[0] },
      },
    )
  }
  let response = await callback()
  assert.equal(response.status, 302)
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('msp_session='))
  assert.match(sessionCookie, /HttpOnly/)
  const me = await originalFetch(base + '/api/me', {
    headers: { cookie: sessionCookie.split(';')[0] },
  })
  assert.equal((await me.json()).userId, 'user')
  assert.equal((await callback({ nonce: 'wrong' })).status, 403)
  assert.equal((await callback({}, { audience: 'another-client' })).status, 403)
  assert.equal((await callback({}, { expiry: '-1m' })).status, 403)
  const wrong = await generateKeyPair('RS256')
  assert.equal((await callback({}, { key: wrong.privateKey })).status, 403)
  env.ALLOWED_SLACK_TEAM_ID = 'TALLOWED'
  assert.equal((await callback()).status, 403)
  const logout = await originalFetch(base + '/auth/logout', {
    redirect: 'manual',
  })
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await request('/api/me', { user: null })).status, 401)
})
