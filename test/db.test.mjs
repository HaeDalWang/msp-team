import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
import { migrate, seed } from '../src/db.mjs'
test('migrations are repeatable and seed never overwrites managed organization data', async (t) => {
  const { pool } = await fixture(t)
  await migrate(pool)
  await pool.query('DELETE FROM users')
  await seed(pool, new URL('../seed.example.json', import.meta.url))
  const before = (
    await pool.query('SELECT id FROM users ORDER BY id')
  ).rows.map((r) => r.id)
  const id = before.find(
    (id) => !['admin', 'lead', 'user', 'other'].includes(id),
  )
  assert.ok(id)
  await pool.query(
    "UPDATE users SET name='changed',part_id=NULL,role='lead',active=false WHERE id=$1",
    [id],
  )
  await seed(pool, new URL('../seed.example.json', import.meta.url))
  const user = (
    await pool.query('SELECT name,part_id,role,active FROM users WHERE id=$1', [
      id,
    ])
  ).rows[0]
  assert.deepEqual(user, {
    name: 'changed',
    part_id: null,
    role: 'lead',
    active: false,
  })
})
