import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { importInitialData } from './initialData.mjs'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const fileIndex = args.indexOf('--file')
const file = fileIndex >= 0 ? args[fileIndex + 1] : null
const known = new Set(['--apply', '--file', file])
const unknown = args.filter((arg) => !known.has(arg))
if (unknown.length) throw new Error(`알 수 없는 옵션: ${unknown.join(', ')}`)
if (!file) throw new Error('--file <JSON 경로> 또는 --file -가 필요합니다.')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL이 필요합니다.')

let source
if (file === '-') {
  process.stdin.setEncoding('utf8')
  source = ''
  for await (const chunk of process.stdin) source += chunk
} else source = await readFile(file, 'utf8')
const input = JSON.parse(source)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  const result = await importInitialData(pool, input, { apply })
  console.log(result.mode === 'apply' ? '적용 완료' : '미리보기(변경 없음)')
  console.table({
    '고객사': result.customers,
    '담당 배정': result.assignments,
    '초과근무': result.overtime,
    '대체휴가': result.leave,
  })
  if (!apply)
    console.log('\n적용하려면 같은 명령에 --apply를 추가하세요.')
} finally {
  await pool.end()
}
