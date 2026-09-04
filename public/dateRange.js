// 원본 prototype(src/dateRange.ts)을 그대로 옮긴 것.
const DAY_MS = 24 * 60 * 60 * 1000

function parseIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const date = parseIsoDate(value)
  return toIsoDate(new Date(date.getTime() + days * DAY_MS))
}

function seoulDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

export function getReviewPeriod(reviewEnd) {
  return { start: addDays(reviewEnd, -6), end: reviewEnd }
}

export function getCurrentReviewEnd(now = new Date()) {
  const today = seoulDate(now)
  const weekday = parseIsoDate(today).getUTCDay()
  const daysUntilMonday = weekday === 1 ? 0 : (8 - weekday) % 7
  return addDays(today, daysUntilMonday)
}

export function moveReviewWeek(reviewEnd, direction) {
  return addDays(reviewEnd, direction * 7)
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

export function formatReviewTitle(reviewEnd) {
  const date = parseIsoDate(reviewEnd)
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 주간회고`
}

export function formatReviewRange(reviewEnd) {
  const { start, end } = getReviewPeriod(reviewEnd)
  const format = (value) => {
    const date = parseIsoDate(value)
    return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일(${weekdays[date.getUTCDay()]})`
  }
  return `${format(start)} ~ ${format(end)}`
}
