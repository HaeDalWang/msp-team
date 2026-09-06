import { spawn, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { Pool } from 'pg'
let container
let child
const env = { ...process.env }
try {
  if (!env.TEST_DATABASE_URL) {
    container = `msp-tests-${crypto.randomUUID()}`
    execFileSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        container,
        '--publish',
        '127.0.0.1::5432',
        '--env',
        'POSTGRES_PASSWORD=isolated-test-password',
        '--env',
        'POSTGRES_DB=msp_test',
        'postgres:18.6-alpine',
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
    const address = execFileSync('docker', ['port', container, '5432'], {
      encoding: 'utf8',
    }).trim()
    env.TEST_DATABASE_URL = `postgresql://postgres:isolated-test-password@${address}/msp_test`
    const pool = new Pool({ connectionString: env.TEST_DATABASE_URL })
    try {
      let ready = false
      for (let i = 0; i < 60; i++) {
        try {
          await pool.query('SELECT 1')
          ready = true
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
      if (!ready) throw new Error('Test PostgreSQL did not start')
    } finally {
      await pool.end()
    }
  }
  const args = process.argv.slice(2)
  child = spawn(
    process.execPath,
    args.includes('--e2e')
      ? ['--test', 'e2e/site.test.mjs']
      : ['--test', ...args, 'test/*.test.mjs'],
    { env, stdio: 'inherit' },
  )
  const forward = (signal) => child.kill(signal)
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)
  process.exitCode = await new Promise((resolve) =>
    child.on('exit', (code) => resolve(code ?? 1)),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (container)
    execFileSync('docker', ['stop', container], { stdio: 'ignore' })
}
