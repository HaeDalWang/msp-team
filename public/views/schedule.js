// 원본 prototype(src/ManagementViews.tsx ScheduleManagementView)의 DOM 구조를 그대로 옮긴 것.
// 실제 PostgreSQL API(GET/PUT /api/schedule, GET/POST/DELETE /api/holidays)에 연결되어 있으며, 실패 시에만 mock으로 fallback한다.
// 휴일 등록/삭제는 admin·lead만 가능하다(서버도 동일 규칙으로 재검증함). 본인 일정 수정은 누구나 가능하다.
import { icon } from '../icons.js'
import { entries as mockEntries } from '../data.js'
import { isAdminOrLead } from '../session.js'

const workHours = {
  이주엽: '09:00 - 18:00', 정장훈: '10:00 - 19:00', 김이현: '09:00 - 18:00', 임종현: '08:30 - 17:30',
  김범중: '10:00 - 19:00', 김성호: '08:00 - 17:00', 배승도: '09:00 - 18:00', 서채운: '09:00 - 18:00',
  이용태: '08:00 - 17:00', 송민석: '09:00 - 18:00', 권하빈: '08:00 - 17:00', 조수현: '08:30 - 17:30', 정지우: '09:00 - 18:00',
}
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토']
const scheduleDays = Array.from({ length: 30 }, (_, index) => {
  const date = index + 1
  return { date, day: weekdayNames[new Date(Date.UTC(2026, 8, date)).getUTCDay()] }
})
const officialHolidays = { 24: '추석 연휴', 25: '추석', 26: '추석 연휴' }
const scheduleTypes = ['출근', '휴가', '오전반차', '오후반차', '외근', '오전출장', '오후출장', '종일출장']
const month = '2026-09'

const state = {
  members: mockEntries.map((entry) => ({ userId: entry.name, name: entry.name, part: entry.part })),
  selected: null,
  scheduleByUserId: {},
  holidayManagerOpen: false,
  holidayDate: '',
  holidayName: '',
  manualHolidays: {},
}

export async function loadSchedule() {
  try {
    const [bootstrapResponse, scheduleResponse, holidaysResponse] = await Promise.all([
      fetch('/api/bootstrap'),
      fetch(`/api/schedule?month=${month}`),
      fetch('/api/holidays'),
    ])
    if (!bootstrapResponse.ok || !scheduleResponse.ok || !holidaysResponse.ok) throw new Error('load failed')
    const bootstrap = await bootstrapResponse.json()
    const schedule = await scheduleResponse.json()
    const holidays = await holidaysResponse.json()
    state.members = bootstrap.users.map((user) => ({ userId: user.id, name: user.name, part: user.part }))
    state.scheduleByUserId = schedule.entries
    state.manualHolidays = {}
    for (const holiday of holidays.holidays) {
      if (holiday.date.startsWith(month)) state.manualHolidays[Number(holiday.date.slice(8, 10))] = { name: holiday.name, date: holiday.date }
    }
  } catch { /* API 실패 시 mock 목록을 유지한다 */ }
}

function holidayLabel(day) {
  return [officialHolidays[day], state.manualHolidays[day]?.name].filter(Boolean).join(' · ')
}

function typeFor(userId, dayIndex) {
  const date = `${month}-${String(dayIndex + 1).padStart(2, '0')}`
  return state.scheduleByUserId[userId]?.[date]?.type ?? ''
}

export function renderSchedule() {
  return `<main class="management-page schedule-management">
    <div class="management-heading">
      <div><span class="eyebrow">TEAM SCHEDULE</span><h1>팀 일정 관리</h1><p>시차 출근시간과 휴가·반차·외근·출장 일정을 월 단위로 확인합니다.</p></div>
      <div class="heading-actions">${isAdminOrLead() ? `<button id="holiday-manager-toggle">${icon('CalendarRange', 16)} 휴일 관리</button>` : ''}<button>${icon('Plus', 16)} 일정 등록</button><button class="primary">${icon('Save', 16)} 일정 저장</button></div>
    </div>
    ${isAdminOrLead() && state.holidayManagerOpen ? `<section class="holiday-manager-panel">
      <header><div>${icon('CalendarRange', 17)}<strong>조직 휴일 관리</strong></div><span>한국 공휴일은 자동 동기화하고, 회사 휴일은 관리자·팀장이 직접 추가합니다.</span></header>
      <div class="holiday-form">
        <label>휴일 날짜<input id="holiday-date" aria-label="휴일 날짜" type="date" min="2026-09-01" max="2026-09-30" value="${state.holidayDate}"></label>
        <label>휴일 이름<input id="holiday-name" aria-label="휴일 이름" placeholder="예: 창립기념일" value="${state.holidayName}"></label>
        <button class="primary" id="holiday-add">${icon('Plus', 14)} 관리자 휴일 추가</button>
      </div>
      <div class="holiday-list"><strong>이번 달 휴일</strong>
        ${Object.entries(officialHolidays).map(([day, name]) => `<span><em>자동</em>9월 ${day}일 · ${name}</span>`).join('')}
        ${Object.entries(state.manualHolidays).map(([day, holiday]) => `<span><em class="manual">관리자</em>9월 ${day}일 · ${holiday.name}<button data-remove-holiday="${holiday.date}" aria-label="${holiday.name} 삭제">×</button></span>`).join('')}
      </div>
    </section>` : ''}
    <div class="schedule-toolbar">
      <div class="month-picker"><button aria-label="이전 달">${icon('ChevronLeft', 17)}</button><strong>2026년 9월</strong><button aria-label="다음 달">${icon('ChevronRight', 17)}</button><button>오늘</button></div>
      <div class="schedule-kpis"><span>오늘 사무실 <strong>8명</strong></span><span>부재·외근 <strong>3명</strong></span><span>가장 빠른 출근 <strong>08:00</strong></span></div>
    </div>
    <div class="schedule-legend">
      ${scheduleTypes.filter((type) => type !== '출근').map((type) => `<span class="schedule-tag schedule-${type}">${icon(type === '휴가' ? 'BriefcaseBusiness' : (type.includes('출장') || type === '외근') ? 'Plane' : 'Clock', 13)}${type}</span>`).join('')}
      <span class="schedule-tag official-source">${icon('CalendarRange', 13)} 공공데이터 자동</span>
      <span class="schedule-tag manual-source">${icon('CalendarRange', 13)} 관리자 지정</span>
    </div>
    <div class="schedule-layout">
      <div class="schedule-table-wrap">
        <table class="schedule-table">
          <thead><tr><th class="part-col">파트</th><th class="name-col">이름</th><th class="hours-col">시차 출근</th>
            ${scheduleDays.map((day) => {
              const holiday = holidayLabel(day.date)
              const manual = state.manualHolidays[day.date]
              const weekend = ['토', '일'].includes(day.day) ? 'weekend' : ''
              const official = officialHolidays[day.date] ? 'official-holiday' : ''
              const manualClass = manual ? 'manual-holiday' : ''
              return `<th class="${weekend} ${official} ${manualClass}"><strong>${day.date}</strong><span>${day.day}</span>${holiday ? `<em>${holiday}</em>` : ''}</th>`
            }).join('')}
          </tr></thead>
          <tbody>
            ${['무소속', 'Leaf', 'Tiger', 'Dragon'].flatMap((part) => state.members.filter((entry) => (entry.part ?? '무소속') === part).map((entry, memberIndex) => `<tr>
              <th aria-label="${part}" class="part-cell part-${part.toLowerCase()}" scope="row">${memberIndex === 0 ? part : ''}</th>
              <th class="name-cell">${entry.name}</th><td class="hours-cell">${workHours[entry.name] ?? ''}</td>
              ${scheduleDays.map((day, dayIndex) => {
                const type = typeFor(entry.userId, dayIndex)
                const weekend = ['토', '일'].includes(day.day) ? 'weekend' : ''
                const official = officialHolidays[day.date] ? 'official-holiday-column' : ''
                const manualClass = state.manualHolidays[day.date] ? 'manual-holiday-column' : ''
                return `<td class="${weekend} ${official} ${manualClass}"><button class="schedule-cell schedule-${type || 'empty'}" data-user-id="${entry.userId}" data-name="${entry.name}" data-day="${dayIndex}" data-type="${type}">${type || '—'}</button></td>`
              }).join('')}
            </tr>`)).join('')}
          </tbody>
        </table>
      </div>
      <aside class="schedule-editor">
        <header>${icon('CalendarRange', 17)}<strong>일정 상세</strong></header>
        ${state.selected ? `<div class="selected-schedule"><span>${state.selected.name}</span><strong>9월 ${scheduleDays[state.selected.day].date}일 (${scheduleDays[state.selected.day].day})</strong><small>${workHours[state.selected.name] ?? ''}</small></div>
          <label>일정 유형<select id="schedule-type-select"><option value="" ${state.selected.type === '' ? 'selected' : ''}>일정 없음</option>${scheduleTypes.map((type) => `<option value="${type}" ${state.selected.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
          <label>사유<textarea placeholder="팀장님이 알아야 할 내용을 입력하세요"></textarea></label>
          <button class="primary" id="schedule-save">${icon('Save', 15)} 저장</button>` : `<div class="editor-empty">${icon('CalendarRange', 28)}<p>표에서 사람과 날짜를 선택하면<br>일정을 확인하거나 수정할 수 있습니다.</p></div>`}
      </aside>
    </div>
  </main>`
}

export function bindSchedule(root, rerender) {
  root.querySelector('#holiday-manager-toggle')?.addEventListener('click', () => { state.holidayManagerOpen = !state.holidayManagerOpen; rerender() })
  root.querySelector('#holiday-date')?.addEventListener('input', (event) => { state.holidayDate = event.target.value })
  root.querySelector('#holiday-name')?.addEventListener('input', (event) => { state.holidayName = event.target.value })
  root.querySelector('#holiday-add')?.addEventListener('click', async () => {
    const date = state.holidayDate
    const name = state.holidayName.trim()
    if (!date || !name) return
    try {
      await fetch('/api/holidays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date, name }) })
      await loadSchedule()
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    state.holidayDate = ''
    state.holidayName = ''
    rerender()
  })
  root.querySelectorAll('[data-remove-holiday]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await fetch(`/api/holidays/${btn.dataset.removeHoliday}`, { method: 'DELETE' })
      await loadSchedule()
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    rerender()
  }))
  root.querySelectorAll('.schedule-cell').forEach((btn) => btn.addEventListener('click', () => {
    state.selected = { userId: btn.dataset.userId, name: btn.dataset.name, day: Number(btn.dataset.day), type: btn.dataset.type }
    rerender()
  }))
  root.querySelector('#schedule-type-select')?.addEventListener('change', (event) => {
    if (!state.selected) return
    state.selected = { ...state.selected, type: event.target.value }
    rerender()
  })
  root.querySelector('#schedule-save')?.addEventListener('click', async () => {
    if (!state.selected) return
    const date = `${month}-${String(scheduleDays[state.selected.day].date).padStart(2, '0')}`
    try {
      await fetch('/api/schedule', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: state.selected.userId, date, type: state.selected.type, note: '' }) })
      await loadSchedule()
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    rerender()
  })
}
