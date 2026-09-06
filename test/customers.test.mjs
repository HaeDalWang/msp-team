import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.mjs'
test('customer creation, full editing, reassignment and deletion persist', async (t) => {
  const { request } = await fixture(t)
  let res = await request('/api/customers', {
    method: 'POST',
    body: {
      name: 'Customer',
      userId: 'user',
      tier: 'Enterprise',
      mcr: true,
      keyAccount: true,
      since: '2026-09-01',
      note: 'memo',
    },
  })
  assert.equal(res.status, 201)
  const { id } = await res.json()
  let owners = (await (await request('/api/customers')).json()).owners
  assert.equal(owners.length, 4)
  assert.equal(
    owners.find((o) => o.userId === 'user').customers[0].since,
    '2026-09-01',
  )
  res = await request('/api/customers/' + id, {
    method: 'PUT',
    body: {
      userId: 'other',
      name: 'Renamed',
      since: null,
      note: 'new',
      mcr: false,
    },
  })
  assert.equal(res.status, 204)
  owners = (await (await request('/api/customers')).json()).owners
  assert.equal(owners.find((o) => o.userId === 'user').customers.length, 0)
  const c = owners.find((o) => o.userId === 'other').customers[0]
  assert.equal(c.name, 'Renamed')
  assert.equal(c.since, null)
  assert.equal(c.mcr, false)
  assert.equal(
    (await request('/api/customers/' + id, { method: 'DELETE' })).status,
    204,
  )
  assert.equal(
    (await request('/api/customers/' + id, { method: 'DELETE' })).status,
    404,
  )
})
test('invalid assignments and failed transfer preserve customer state atomically', async (t) => {
  const { request, pool } = await fixture(t)
  assert.equal(
    (
      await request('/api/customers', {
        method: 'POST',
        body: { name: 'orphan', userId: 'missing' },
      })
    ).status,
    400,
  )
  assert.equal(
    (await pool.query('SELECT count(*)::int AS n FROM customers')).rows[0].n,
    0,
  )
  const { id } = await (
    await request('/api/customers', {
      method: 'POST',
      body: { name: 'safe', userId: 'user' },
    })
  ).json()
  await pool.query(
    "CREATE FUNCTION reject_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='other' THEN RAISE EXCEPTION 'forced test failure'; END IF; RETURN NEW; END $$",
  )
  await pool.query(
    'CREATE TRIGGER reject_assignment BEFORE INSERT ON customer_assignments FOR EACH ROW EXECUTE FUNCTION reject_assignment()',
  )
  assert.equal(
    (
      await request('/api/customers/' + id, {
        method: 'PUT',
        body: { userId: 'other', name: 'changed' },
      })
    ).status,
    500,
  )
  assert.equal(
    (await pool.query('SELECT name FROM customers WHERE id=$1', [id])).rows[0]
      .name,
    'safe',
  )
  assert.equal(
    (
      await pool.query(
        'SELECT user_id FROM customer_assignments WHERE customer_id=$1',
        [id],
      )
    ).rows[0].user_id,
    'user',
  )
})
test('customer duplicate and invalid field errors are explicit', async (t) => {
  const { request } = await fixture(t)
  for (const fields of [
    { tier: 'bad' },
    { mcr: 'false' },
    { since: '2026-02-30' },
  ])
    assert.equal(
      (
        await request('/api/customers', {
          method: 'POST',
          body: { name: 'x', userId: 'user', ...fields },
        })
      ).status,
      400,
    )
  await request('/api/customers', {
    method: 'POST',
    body: { name: 'same', userId: 'user' },
  })
  assert.equal(
    (
      await request('/api/customers', {
        method: 'POST',
        body: { name: 'same', userId: 'other' },
      })
    ).status,
    409,
  )
})
