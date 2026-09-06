import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { fixture } from './fixtures.mjs'

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
