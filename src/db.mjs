import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { normalizeSeed } from './seed.mjs'

const schema = `
CREATE TABLE IF NOT EXISTS parts (id text PRIMARY KEY, name text NOT NULL UNIQUE);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#5fa8ff';
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, name text NOT NULL, part_id text REFERENCES parts(id), role text NOT NULL DEFAULT 'engineer', slack_user_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ALTER COLUMN part_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS customers (id bigserial PRIMARY KEY, name text NOT NULL UNIQUE, note text NOT NULL DEFAULT '');
ALTER TABLE customers ADD COLUMN IF NOT EXISTS since date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS customer_assignments (customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(customer_id, user_id));
CREATE TABLE IF NOT EXISTS reviews (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), week_end date NOT NULL, work_highlights text NOT NULL DEFAULT '', action_items text NOT NULL DEFAULT '', tops_projects text NOT NULL DEFAULT '', other_notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', UNIQUE(user_id, week_end));
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_new integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_in_progress integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tickets_done integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS schedule_entries (user_id text NOT NULL REFERENCES users(id), work_date date NOT NULL, type text NOT NULL, note text NOT NULL DEFAULT '', PRIMARY KEY(user_id, work_date));
CREATE TABLE IF NOT EXISTS overtime_records (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), work_date date NOT NULL, type text NOT NULL, customer text NOT NULL, start_time time NOT NULL, end_time time NOT NULL, hours numeric NOT NULL, detail text NOT NULL, evidence text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS holidays (holiday_date date PRIMARY KEY, name text NOT NULL);
`

export async function migrate(pool) {
  await pool.query(schema)
}

export async function seed(pool, file) {
  const data = normalizeSeed(JSON.parse(await readFile(file, 'utf8')))
  for (const part of data.parts) await pool.query('INSERT INTO parts (id, name, color) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color', [part.id, part.name, part.color])
  for (const user of data.users) await pool.query('INSERT INTO users (id, name, part_id, role, slack_user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, part_id = EXCLUDED.part_id, role = EXCLUDED.role, slack_user_id = EXCLUDED.slack_user_id', [user.id, user.name, user.partId, user.role, user.slackUserId])
}

export async function connectDatabase() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(pool)
  if (process.env.SEED_FILE) await seed(pool, process.env.SEED_FILE)
  return pool
}
