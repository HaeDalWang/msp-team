export function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}
export function text(value, name, { required = true, max = 10000 } = {}) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(400, `${name} 입력을 확인하세요.`)
  return value.trim()
}
export function date(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail(400, '올바른 날짜를 입력하세요.')
  return value
}
export function month(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    fail(400, 'month는 YYYY-MM 형식이어야 합니다.')
  return value
}
export function time(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    fail(400, '시간은 HH:mm 형식이어야 합니다.')
  return value
}
export function integer(value, name = '숫자') {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    value === '' ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 0 ||
    Number(value) > 2147483647
  )
    fail(400, `${name}는 0 이상의 정수여야 합니다.`)
  return Number(value)
}
export function choice(value, allowed, name) {
  if (!allowed.includes(value)) fail(400, `${name} 값이 올바르지 않습니다.`)
  return value
}
export function bool(value) {
  if (typeof value !== 'boolean') fail(400, '참/거짓 값을 확인하세요.')
  return value
}
export function duration(start, end) {
  const minutes = (value) => {
    const [h, m] = time(value).split(':').map(Number)
    return h * 60 + m
  }
  const elapsed = (minutes(end) - minutes(start) + 1440) % 1440
  if (!elapsed) fail(400, '시작 시간과 종료 시간은 달라야 합니다.')
  return Math.round((elapsed / 60) * 10000) / 10000
}
