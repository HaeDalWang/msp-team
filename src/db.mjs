import { readFile } from 'node:fs/promises'
import { Pool, types } from 'pg'
import { normalizeSeed } from './seed.mjs'

// SQL DATE is a calendar date, not a UTC instant. Preserve it across host time zones.
types.setTypeParser(1082, (value) => value)

const schema = `
CREATE TABLE IF NOT EXISTS parts (id text PRIMARY KEY, name text NOT NULL UNIQUE);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#5fa8ff';
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, name text NOT NULL, part_id text REFERENCES parts(id), role text NOT NULL DEFAULT 'engineer', slack_user_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ALTER COLUMN part_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_start time NOT NULL DEFAULT '09:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_end time NOT NULL DEFAULT '18:00';
CREATE TABLE IF NOT EXISTS customers (id bigserial PRIMARY KEY, name text NOT NULL UNIQUE, note text NOT NULL DEFAULT '');
ALTER TABLE customers ADD COLUMN IF NOT EXISTS since date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'Standard';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mcr boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS key_account boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS customer_assignments (customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(customer_id, user_id));
CREATE TABLE IF NOT EXISTS reviews (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), week_end date NOT NULL, work_highlights text NOT NULL DEFAULT '', action_items text NOT NULL DEFAULT '', tops_projects text NOT NULL DEFAULT '', other_notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', UNIQUE(user_id, week_end));
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_new integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_in_progress integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_done integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewed_by text REFERENCES users(id);
CREATE TABLE IF NOT EXISTS review_comments (id bigserial PRIMARY KEY, review_id bigint NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, author_id text NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS schedule_entries (user_id text NOT NULL REFERENCES users(id), work_date date NOT NULL, type text NOT NULL, note text NOT NULL DEFAULT '', PRIMARY KEY(user_id, work_date));
CREATE TABLE IF NOT EXISTS overtime_records (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), work_date date NOT NULL, type text NOT NULL, customer text NOT NULL, start_time time NOT NULL, end_time time NOT NULL, hours numeric NOT NULL, detail text NOT NULL, evidence text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS holidays (holiday_date date PRIMARY KEY, name text NOT NULL);
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS decided_by text REFERENCES users(id);
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS decided_at timestamptz;
CREATE TABLE IF NOT EXISTS leave_requests (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), leave_date date NOT NULL, hours numeric NOT NULL CHECK(hours > 0), reason text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), decided_by text REFERENCES users(id), decided_at timestamptz);
`

export async function migrate(pool) {
  await pool.query(schema)
}

export async function seed(pool, file) {
  const data = normalizeSeed(JSON.parse(await readFile(file, 'utf8')))
  await transaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('msp-initial-seed'))",
    )
    if ((await client.query('SELECT 1 FROM users LIMIT 1')).rowCount) return
    for (const part of data.parts)
      await client.query(
        'INSERT INTO parts (id, name, color) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [part.id, part.name, part.color],
      )
    for (const user of data.users)
      await client.query(
        'INSERT INTO users (id, name, part_id, role, slack_user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [user.id, user.name, user.partId, user.role, user.slackUserId],
      )
  })
}

export async function transaction(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function connectDatabase() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(pool)
  if (process.env.SEED_FILE) await seed(pool, process.env.SEED_FILE)
  return pool
}
