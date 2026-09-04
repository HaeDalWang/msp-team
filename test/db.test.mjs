import test from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../src/db.mjs'

test('migrate creates the single relational model for all seven screens', async () => {
  const statements = []
  await migrate({ query: async (sql) => { statements.push(sql); return { rows: [] } } })
  const sql = statements.join('\n')
  for (const table of ['parts', 'users', 'customers', 'customer_assignments', 'reviews', 'schedule_entries', 'overtime_records']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }
})
