import { icon } from '../icons.js'
import { isAdminOrLead, isSelfOrAdminOrLead } from '../session.js'
import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'
import { koreanPublicHolidays, holidayDataYears, hasHolidayData } from '../koreanHolidays.js'

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const types = [
  '출근',
  '휴가',
  '오전반차',
  '오후반차',
  '외근·출장',
]
const state = {
  month: today().slice(0, 7),
  members: [],
  entries: {},
  holidays: [],
  selected: null,
  anchor: { x: 16, y: 100 },
  detailsOpen: false,
  manager: false,
  holidayDate: '',
  holidayName: '',
  error: '',
  busy: false,
}
export const scheduleDirty = () => {
  const saved =
    state.selected &&
    state.entries[state.selected.userId]?.[state.selected.date]
  return (
    state.busy ||
    Boolean(state.holidayDate || state.holidayName) ||
    Boolean(
      state.selected &&
      (Boolean(state.selected.endDate && state.selected.endDate !== state.selected.date) || (state.selected.type ?? '') !== (saved?.type ?? getDefaultType(state.selected.date)) ||
        (state.selected.note ?? '') !== (saved?.note ?? '')),
    )
  )
}
export const discardSchedule = () => {
  state.selected = null
  state.holidayDate = ''
  state.holidayName = ''
}
export const scheduleBusy = () => state.busy
export function daysInMonth(month) {
  const [year, index] = month.split('-').map(Number)
  return Array.from(
    { length: new Date(Date.UTC(year, index, 0)).getUTCDate() },
    (_, i) => ({
      date: `${month}-${String(i + 1).padStart(2, '0')}`,
      number: i + 1,
      weekday: ['일', '월', '화', '수', '목', '금', '토'][
        new Date(Date.UTC(year, index - 1, i + 1)).getUTCDay()
      ],
    }),
  )
}
export const isWeekend = (day) => ['토', '일'].includes(day.weekday)
function defaultType(day, officialHolidays, manualHolidays) {
  return isWeekend(day) || officialHolidays.has(day.date) || manualHolidays.has(day.date) ? '' : '출근'
}
function getDefaultType(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6 || koreanPublicHolidays(Number(date.slice(0, 4))).has(date) || state.holidays.some((holiday) => holiday.date === date) ? '' : '출근'
}
export async function loadSchedule() {
  try {
    const month = state.month
    const [bootstrap, schedule, holidays] = await Promise.all([
      api('/api/bootstrap'),
      api(`/api/schedule?month=${month}`),
      api('/api/holidays'),
    ])
    if (month !== state.month) return
    state.members = bootstrap.users
    state.entries = schedule.entries
    // Preserve existing records on the server; present legacy labels as one option.
    for (const entries of Object.values(state.entries))
      for (const entry of Object.values(entries))
        if (['외근', '오전출장', '오후출장', '종일출장'].includes(entry.type)) entry.type = '외근·출장'
    state.holidays = holidays.holidays.filter((item) =>
      item.date.startsWith(month),
    )
    state.error = ''
  } catch (error) {
    state.error = error.message
  }
}
export function renderSchedule() {
  const days = daysInMonth(state.month)
  const officialHolidays = koreanPublicHolidays(Number(state.month.slice(0, 4)))
  const manualHolidays = new Map(state.holidays.map((item) => [item.date, item.name]))
  const dayClasses = (day, element) => [
    isWeekend(day) ? (element === 'header' ? 'weekend' : 'weekend-column') : '',
    officialHolidays.has(day.date)
      ? (element === 'header' ? 'official-holiday' : 'official-holiday-column')
      : '',
    manualHolidays.has(day.date)
      ? (element === 'header' ? 'manual-holiday' : 'manual-holiday-column')
      : '',
  ].filter(Boolean).join(' ')
  const selected = state.selected
  const editable = selected && isSelfOrAdminOrLead(selected.userId)
  return `<main class="management-page schedule-management"><div class="management-heading"><div><span class="eyebrow">TEAM SCHEDULE</span><h1>팀 일정 관리</h1><p>평일은 기본 출근입니다. 날짜 칸을 눌러 휴가·외근을 바로 선택하세요.</p></div>${isAdminOrLead() ? '<button id="holiday-manager-toggle">휴일 관리</button>' : ''}</div>
    ${state.error ? `<div role="alert" class="comp-api-error">${h(state.error)} <button id="schedule-retry">다시 조회</button></div>` : ''}
    <p class="calendar-notice">기본 공휴일 자료: ${holidayDataYears[0]}–${holidayDataYears.at(-1)}년. 임시공휴일·변경 사항은 관리자에게 확인해 주세요.${!hasHolidayData(state.month.slice(0, 4)) ? '<strong role="alert"> 이 연도는 설·추석·대체공휴일 자료가 없습니다. 휴일 관리에서 등록해 주세요.</strong>' : ''}</p>\n    <div class="schedule-toolbar"><div class="month-picker"><button id="previous-month" ${state.busy ? 'disabled' : ''} aria-label="이전 달">${icon('ChevronLeft', 17)}</button><strong>${h(state.month)}</strong><button id="next-month" ${state.busy ? 'disabled' : ''} aria-label="다음 달">${icon('ChevronRight', 17)}</button><button id="current-month" ${state.busy ? 'disabled' : ''}>오늘</button></div></div>
    ${state.manager && isAdminOrLead() ? `<section class="holiday-manager-panel"><h2>휴일 관리</h2><form id="holiday-form" class="holiday-form"><label>날짜<input id="holiday-date" type="date" required value="${h(state.holidayDate)}"></label><label>이름<input id="holiday-name" required maxlength="100" value="${h(state.holidayName)}"></label><button class="primary" ${state.busy ? 'disabled' : ''}>휴일 추가</button></form><div class="holiday-list">${state.holidays.map((item) => `<span>${h(item.date)} · ${h(item.name)} <button data-remove-holiday="${h(item.date)}" ${state.busy ? 'disabled' : ''} aria-label="${h(item.name)} 삭제">×</button></span>`).join('') || '<p>등록된 휴일이 없습니다.</p>'}</div></section>` : ''}
    <div class="schedule-layout"><div class="schedule-table-wrap"><table class="schedule-table"><thead><tr><th class="part-col">파트</th><th class="name-col">이름</th><th class="hours-col">근무 시간</th>${days.map((day) => `<th class="${dayClasses(day, 'header')}"><strong>${day.number}</strong><span>${day.weekday}</span><em>${h(officialHolidays.get(day.date) ?? manualHolidays.get(day.date) ?? '')}</em></th>`).join('')}</tr></thead><tbody>${state.members
      .map(
        (member) =>
          `<tr><th class="part-cell">${h(member.part ?? '무소속')}</th><th class="name-cell">${h(member.name)}</th><td class="hours-cell">${h(member.workStart ?? '')}–${h(member.workEnd ?? '')}</td>${days
            .map((day) => {
              const entry = state.entries[member.id]?.[day.date]
              const type = types.includes(entry?.type) ? entry.type : defaultType(day, officialHolidays, manualHolidays)
              const label = entry?.leaveHours ? `대체휴가 ${entry.leaveHours}h` : type || '—'
              const conflict = entry?.leaveHours && entry.type ? `기존 일정: ${entry.type}` : ''
              return `<td class="${dayClasses(day, 'cell')}"><button class="schedule-cell schedule-${type || 'empty'}" data-user="${h(member.id)}" data-date="${day.date}" ${state.busy ? 'disabled' : ''}>${h(label)}${conflict ? `<small>${h(conflict)}</small>` : ''}</button></td>`
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody></table></div>
    ${selected ? `<aside class="schedule-editor schedule-popover" role="dialog" aria-label="일정 빠른 설정" style="left:${state.anchor.x}px;top:${state.anchor.y}px;max-height:calc(100dvh - ${state.anchor.y + 8}px)"><header><strong>일정 설정</strong><button id="schedule-close" type="button" aria-label="일정 설정 닫기" ${state.busy ? 'disabled' : ''}>×</button></header>` : ''}${selected ? `<form id="schedule-form"><div class="selected-schedule"><span>${h(selected.name)}</span><strong>${h(selected.date)}</strong></div>${selected.leaveHours ? `<p class="calendar-notice">승인된 대체휴가 ${h(selected.leaveHours)}시간입니다. 휴가 취소는 대체휴가 원장에서 처리하세요.${selected.type ? ` 기존 일정: ${h(selected.type)}` : ''}</p>` : ''}${editable ? `<div class="schedule-quick-types">${types.map((type) => `<button type="button" data-quick-type="${h(type)}" aria-pressed="${selected.type === type}" ${state.busy ? 'disabled' : ''}>${h(type)}</button>`).join('')}</div>` : ''}<details ${state.detailsOpen ? 'open' : ''}><summary>메모·상세 수정</summary>${editable ? `<label>적용 종료일 (최대 31일·주말 포함)<input id="schedule-end-date" type="date" min="${h(selected.date)}" value="${h(selected.endDate ?? selected.date)}"></label><small>여러 날짜 선택 시 해당 기간의 기존 일정·메모를 덮어씁니다. 승인된 대체휴가는 유지됩니다.</small>` : ''}<label>일정 유형<select id="schedule-type" ${editable ? '' : 'disabled'}><option value="">기본 일정으로 되돌리기</option>${types.map((type) => `<option ${type === selected.type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label>사유<textarea id="schedule-note" maxlength="2000" ${editable ? '' : 'readonly'}>${h(selected.note)}</textarea></label>${editable ? `<button class="primary" ${state.busy ? 'disabled' : ''}>저장</button>` : '<p>본인 또는 관리자·팀장만 수정할 수 있습니다.</p>'}</details></form></aside>` : ''}</div></main>`
}
export function bindSchedule(root, rerender) {
  root.querySelector('.schedule-popover details')?.addEventListener('toggle', (event) => {
    state.detailsOpen = event.currentTarget.open
  })
  const close = () => {
    if (state.busy || (scheduleDirty() && !confirm('저장하지 않은 변경 내용을 버릴까요?'))) return
    state.selected = null
    rerender()
  }
  root.querySelector('#schedule-close')?.addEventListener('click', close)
  root.querySelector('.schedule-popover')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close() }
  })
  root.querySelectorAll('[data-quick-type]').forEach((button) => button.addEventListener('click', () => {
    if (!state.selected || !isSelfOrAdminOrLead(state.selected.userId)) return
    const selected = { ...state.selected, type: button.dataset.quickType }
    if (selected.endDate && selected.endDate !== selected.date && !confirm(`${selected.date}부터 ${selected.endDate}까지 기존 일정과 메모를 덮어쓸까요?`)) return
    run(async () => {
      await api('/api/schedule', { method: 'PUT', body: JSON.stringify(selected) })
      state.selected = null
    })
  }))
  if (state.busy)
    root
      .querySelectorAll('form input, form select, form textarea')
      .forEach((input) => {
        input.disabled = true
      })
  async function run(action) {
    if (state.busy) return
    state.busy = true
    state.error = ''
    rerender()
    try {
      await action()
      await loadSchedule()
    } catch (error) {
      state.error = error.message
    } finally {
      state.busy = false
      rerender()
    }
  }
  root
    .querySelector('#schedule-retry')
    ?.addEventListener('click', () => run(async () => {}))
  for (const [id, delta] of [
    ['previous-month', -1],
    ['next-month', 1],
    ['current-month', 0],
  ])
    root.querySelector(`#${id}`)?.addEventListener('click', () => {
      if (
        state.busy ||
        (scheduleDirty() &&
          !confirm('저장하지 않은 일정 변경 내용을 버릴까요?'))
      )
        return
      run(async () => {
        const [year, month] = state.month.split('-').map(Number)
        state.month = delta
          ? new Date(Date.UTC(year, month - 1 + delta, 1))
              .toISOString()
              .slice(0, 7)
          : today().slice(0, 7)
        state.selected = null
        state.entries = {}
        state.holidays = []
      })
    })
  root
    .querySelector('#holiday-manager-toggle')
    ?.addEventListener('click', () => {
      state.manager = !state.manager
      rerender()
    })
  for (const [id, field] of [
    ['holiday-date', 'holidayDate'],
    ['holiday-name', 'holidayName'],
  ])
    root.querySelector(`#${id}`)?.addEventListener('input', (event) => {
      state[field] = event.target.value
    })
  root.querySelector('#holiday-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    run(async () => {
      await api('/api/holidays', {
        method: 'POST',
        body: JSON.stringify({
          date: state.holidayDate,
          name: state.holidayName.trim(),
        }),
      })
      state.holidayDate = ''
      state.holidayName = ''
    })
  })
  root.querySelectorAll('[data-remove-holiday]').forEach((button) =>
    button.addEventListener('click', () => {
      if (confirm('이 휴일을 삭제할까요?'))
        run(() =>
          api(
            `/api/holidays/${encodeURIComponent(button.dataset.removeHoliday)}`,
            { method: 'DELETE' },
          ),
        )
    }),
  )
  root.querySelectorAll('[data-user]').forEach((button) =>
    button.addEventListener('click', () => {
      if (
        state.busy ||
        (scheduleDirty() &&
          !confirm('저장하지 않은 일정 변경 내용을 버릴까요?'))
      )
        return
      const userId = button.dataset.user
      const date = button.dataset.date
      state.detailsOpen = false
      const rect = button.getBoundingClientRect?.()
      if (rect) state.anchor = {
        x: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
        y: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 500)),
      }
      state.selected = {
        userId,
        date,
        name: state.members.find((member) => member.id === userId)?.name ?? '',
        type: getDefaultType(date),
        note: '',
        ...state.entries[userId]?.[date],
      }
      rerender()
      root.querySelector('#schedule-close')?.focus({ preventScroll: true })
    }),
  )
  root.querySelector('#schedule-end-date')?.addEventListener('input', (event) => { state.selected.endDate = event.target.value })
  root.querySelector('#schedule-type')?.addEventListener('change', (event) => {
    state.selected.type = event.target.value
  })
  root.querySelector('#schedule-note')?.addEventListener('input', (event) => {
    state.selected.note = event.target.value
  })
  root.querySelector('#schedule-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (state.selected?.endDate && state.selected.endDate !== state.selected.date && !confirm(`${state.selected.date}부터 ${state.selected.endDate}까지 기존 일정과 메모를 덮어쓸까요?`)) return
    if (state.selected && isSelfOrAdminOrLead(state.selected.userId))
      run(async () => {
        const selected = { ...state.selected }
        await api('/api/schedule', {
          method: 'PUT',
          body: JSON.stringify(selected),
        })
        state.selected = { ...selected, endDate: selected.date, type: selected.type || (selected.note ? '' : getDefaultType(selected.date)) }
      })
  })
}
