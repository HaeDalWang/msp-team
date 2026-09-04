import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'

async function withServer(run) {
  const server = createApp({ query: async () => ({ rows: [] }) }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('health endpoint reports the app is ready', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })
})

test('bootstrap endpoint returns people grouped with their part', async () => {
  const database = {
    query: async (sql) => ({ rows: sql.includes('FROM users') ? [{ id: 'usr-hong', name: '홍길동', part: 'Tiger', role: 'engineer' }] : [] }),
  }
  const server = createApp(database).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/bootstrap`)
    assert.deepEqual(await response.json(), { users: [{ id: 'usr-hong', name: '홍길동', part: 'Tiger', role: 'engineer' }] })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
