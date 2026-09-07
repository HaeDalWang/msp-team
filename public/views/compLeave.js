import { session, isAdminOrLead } from '../session.js'
import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'

const statusLabels = {
  pending: '검토 대기',
  approved: '승인',
  rejected: '반려',
}
const types = ['기술지원', '작업', '장애대응', '점검']
function timeSelect(field, value) {
  const options = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
  return `<select data-overtime="${field}" required><option value="">선택</option>${options.map((time) => `<option value="${time}" ${time === value ? 'selected' : ''}>${time}</option>`).join('')}</select>`
}
const emptyOvertime = () => ({
  date: '',
  type: '기술지원',
  customer: '',
  startTime: '',
  endTime: '',
  detail: '',
  evidence: '',
})
const state = {
  members: [],
  selected: null,
  records: [],
  leaves: [],
  summary: {},
  error: '',
  busy: false,
  overtime: emptyOvertime(),
  leave: { date: '', hours: '', reason: '' },
  sequence: 0,
}
export const compLeaveDirty = () =>
  state.busy ||
  Object.entries(state.overtime).some(
    ([key, value]) => key !== 'type' && Boolean(value),
  ) ||
  Object.values(state.leave).some(Boolean)
export const discardCompLeave = () => {
  state.overtime = emptyOvertime()
  state.leave = { date: '', hours: '', reason: '' }
}
export const compLeaveBusy = () => state.busy
export function calculateHours(start, end) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return 0
  const minutes = (eh * 60 + em - sh * 60 - sm + 1440) % 1440
  return Math.round((minutes / 60) * 100) / 100
}
export async function loadCompLeave() {
  try {
    const [bootstrap, summary] = await Promise.all([
      api('/api/bootstrap'),
      api('/api/overtime/summary'),
    ])
    state.members = bootstrap.users
    state.summary = Object.fromEntries(
      summary.users.map((user) => [user.userId, user]),
    )
    if (!state.members.some((member) => member.id === state.selected))
      state.selected = session.user?.userId ?? state.members[0]?.id ?? null
    await loadSelected()
  } catch (error) {
    state.error = error.message
  }
}
async function loadSelected() {
  const sequence = ++state.sequence
  const selected = state.selected
  state.records = []
  state.leaves = []
  if (!selected) return
  try {
    const data = await api(
      `/api/overtime?userId=${encodeURIComponent(selected)}`,
    )
    if (sequence !== state.sequence) return
    state.records = data.records
    state.leaves = data.leaves ?? []
    state.error = ''
  } catch (error) {
    if (sequence === state.sequence) state.error = error.message
  }
}
function hours(value) {
  return value == null ? '미조회' : `${h(value)}시간`
}
function actions(record, kind) {
  const own = state.selected === session.user?.userId
  return `${record.status === 'pending' && isAdminOrLead() ? `<button data-record="${h(record.id)}" data-kind="${kind}" data-action="approve" ${state.busy ? 'disabled' : ''}>승인</button><button data-record="${h(record.id)}" data-kind="${kind}" data-action="reject" ${state.busy ? 'disabled' : ''}>반려</button>` : ''}${own && ['pending', 'rejected'].includes(record.status) ? `<button data-record="${h(record.id)}" data-kind="${kind}" data-action="delete" ${state.busy ? 'disabled' : ''}>삭제</button>` : ''}`
}
export function renderCompLeave() {
  const mine = state.summary[session.user?.userId]
  const name =
    state.members.find((member) => member.id === state.selected)?.name ?? ''
  const draft = state.overtime
  return `<main class="management-page comp-leave-management"><div class="management-heading"><div><span class="eyebrow">COMPENSATORY LEAVE</span><h1>대체휴가 관리</h1><p>승인된 초과근무를 시간 단위로 적립하고, 휴가 사용 신청을 승인하면 차감합니다.</p></div><span>${isAdminOrLead() ? '관리자·팀장 검토 가능' : '본인 기록 작성'}</span></div>
    ${state.error ? `<div class="comp-api-error" role="alert">${h(state.error)} <button id="comp-retry">다시 조회</button></div>` : ''}
    <section class="engineer-dropdown-bar"><label>엔지니어 선택<select id="engineer-select" ${state.busy ? 'disabled' : ''}>${state.members.map((member) => `<option value="${h(member.id)}" ${member.id === state.selected ? 'selected' : ''}>${h(member.name)} · ${h(member.part ?? '무소속')}</option>`).join('')}</select></label><small>${h(name)} 상세 현황</small></section>
    <div class="comp-focus-grid"><section class="engineer-overview-panel"><header><h2>엔지니어별 현황</h2></header><div class="engineer-overview-table"><table><thead><tr><th>엔지니어</th><th>잔여 시간</th><th>적립 승인 대기</th><th>사용 승인 대기</th><th>사용 누계</th></tr></thead><tbody>${state.members
      .map((member) => {
        const summary = state.summary[member.id]
        return `<tr class="${state.selected === member.id ? 'selected-engineer' : ''}"><td><button data-select-engineer="${h(member.id)}" ${state.busy ? 'disabled' : ''}>${h(member.name)}</button><small>${h(member.part ?? '무소속')}</small></td><td>${hours(summary?.balanceHours)}</td><td>${hours(summary?.pendingHours)}</td><td>${hours(summary?.pendingLeaveHours)}</td><td>${hours(summary?.usedHours)}</td></tr>`
      })
      .join('')}</tbody></table></div></section>
    <section class="comp-register-panel quick-register-panel"><header><h2>내 초과근무 등록</h2></header><div class="quick-balance"><div><span>내 잔여 대체휴가</span><strong data-testid="comp-leave-balance">${hours(mine?.balanceHours)}</strong></div><div><span>내 적립 승인 대기</span><strong>${hours(mine?.pendingHours)}</strong></div></div>
    <form id="overtime-form"><div class="comp-form-row two"><label>업무 일자<input data-overtime="date" type="date" required value="${h(draft.date)}"></label><label>업무 유형<select data-overtime="type">${types.map((type) => `<option ${type === draft.type ? 'selected' : ''}>${type}</option>`).join('')}</select></label></div>
    <label>고객사 또는 업무명<input data-overtime="customer" required maxlength="200" value="${h(draft.customer)}"></label><div class="comp-form-row time compact-time"><label>시작 시간${timeSelect('startTime', draft.startTime)}</label><label>종료 시간${timeSelect('endTime', draft.endTime)}</label><div class="calculated-hours"><span>산정 예상</span><strong id="calculated-hours">${calculateHours(draft.startTime, draft.endTime)}시간</strong></div></div><small>종료 시간이 시작보다 이르면 다음 날 종료로 계산합니다. 최종 시간은 서버에서 산정됩니다.</small>
    <label>업무 내용<textarea data-overtime="detail" required maxlength="4000">${h(draft.detail)}</textarea></label><label>관련 티켓·링크 (선택)<input data-overtime="evidence" maxlength="2000" value="${h(draft.evidence)}"></label><button class="primary" ${state.busy ? 'disabled' : ''}>초과근무 등록</button></form></section></div>
    <section class="comp-register-panel"><header><h2>내 대체휴가 사용 신청</h2></header><p>승인 전에는 잔여 시간이 차감되지 않습니다. 최종 승인 시 잔여 시간을 확인합니다.</p><form id="leave-form" class="holiday-form"><label>사용 날짜<input data-leave="date" type="date" required value="${h(state.leave.date)}"></label><label>사용 시간<input data-leave="hours" type="number" min="0.5" max="24" step="0.5" required value="${h(state.leave.hours)}"></label><label>사유<input data-leave="reason" required maxlength="2000" value="${h(state.leave.reason)}"></label><button class="primary" ${state.busy ? 'disabled' : ''}>사용 신청</button></form></section>
    <section class="comp-ledger"><header><h2>${h(name)} 초과근무 원장</h2></header><div class="comp-table-wrap"><table><thead><tr><th>업무 일자</th><th>유형</th><th>고객사/업무</th><th>시간</th><th>업무 내용</th><th>근거</th><th>상태</th><th>처리</th></tr></thead><tbody>${state.records.map((record) => `<tr><td>${h(record.date)}</td><td>${h(record.type)}</td><td>${h(record.customer)}<small>${h(record.startTime)}–${h(record.endTime)}</small></td><td>${hours(record.hours)}</td><td>${h(record.detail)}</td><td>${h(record.evidence || '—')}</td><td><span class="comp-status">${h(statusLabels[record.status] ?? record.status)}</span></td><td>${actions(record, 'overtime')}</td></tr>`).join('') || '<tr><td colspan="8">등록된 초과근무가 없습니다.</td></tr>'}</tbody></table></div></section>
    <section class="comp-ledger"><header><h2>${h(name)} 대체휴가 사용 원장</h2></header><div class="comp-table-wrap"><table><thead><tr><th>사용 날짜</th><th>시간</th><th>사유</th><th>상태</th><th>처리</th></tr></thead><tbody>${state.leaves.map((record) => `<tr><td>${h(record.date)}</td><td>${hours(record.hours)}</td><td>${h(record.reason)}</td><td>${h(statusLabels[record.status] ?? record.status)}</td><td>${actions(record, 'leave')}</td></tr>`).join('') || '<tr><td colspan="5">등록된 사용 신청이 없습니다.</td></tr>'}</tbody></table></div></section></main>`
}
export function bindCompLeave(root, rerender) {
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
      await loadCompLeave()
    } catch (error) {
      state.error = error.message
    } finally {
      state.busy = false
      rerender()
    }
  }
  async function select(id) {
    if (state.busy) return
    state.selected = id
    const promise = loadSelected()
    rerender()
    await promise
    rerender()
  }
  root
    .querySelector('#comp-retry')
    ?.addEventListener('click', () => run(async () => {}))
  root
    .querySelector('#engineer-select')
    ?.addEventListener('change', (event) => select(event.target.value))
  root
    .querySelectorAll('[data-select-engineer]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        select(button.dataset.selectEngineer),
      ),
    )
  root.querySelectorAll('[data-overtime]').forEach((input) =>
    input.addEventListener('input', (event) => {
      state.overtime[input.dataset.overtime] = event.target.value
      const label = root.querySelector('#calculated-hours')
      if (label)
        label.textContent = `${calculateHours(state.overtime.startTime, state.overtime.endTime)}시간`
    }),
  )
  root.querySelectorAll('[data-leave]').forEach((input) =>
    input.addEventListener('input', (event) => {
      state.leave[input.dataset.leave] = event.target.value
    }),
  )
  root.querySelector('#overtime-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (calculateHours(state.overtime.startTime, state.overtime.endTime) <= 0) {
      state.error = '시작과 종료 시간을 다르게 입력하세요.'
      rerender()
      return
    }
    run(async () => {
      await api('/api/overtime', {
        method: 'POST',
        body: JSON.stringify(state.overtime),
      })
      state.overtime = emptyOvertime()
    })
  })
  root.querySelector('#leave-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    run(async () => {
      await api('/api/leave', {
        method: 'POST',
        body: JSON.stringify({
          ...state.leave,
          hours: Number(state.leave.hours),
        }),
      })
      state.leave = { date: '', hours: '', reason: '' }
    })
  })
  root.querySelectorAll('[data-record]').forEach((button) =>
    button.addEventListener('click', () => {
      const { record, kind, action } = button.dataset
      if (action === 'delete' && !confirm('이 신청을 삭제할까요?')) return
      run(() =>
        api(
          `/api/${kind}/${encodeURIComponent(record)}${action === 'delete' ? '' : `/${action}`}`,
          { method: action === 'delete' ? 'DELETE' : 'POST' },
        ),
      )
    }),
  )
}
