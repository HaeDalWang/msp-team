// 원본 prototype(src/CompLeaveView.tsx)의 DOM 구조를 그대로 옮긴 것.
// 실제 PostgreSQL API(GET/POST /api/overtime, POST /api/overtime/:id/approve)에 연결되어 있으며, 실패 시에만 mock으로 fallback한다.
// 승인은 admin·lead만 가능하다(서버도 동일 규칙으로 재검증함).
import { icon } from '../icons.js'
import { isAdminOrLead } from '../session.js'

const mockRecords = [
  { id: 'overtime-1', engineer: '배승도', date: '2026-08-31', type: '기술지원', customer: '한국일보', startTime: '20:00', endTime: '22:00', hours: 2, detail: '야간 CloudFront 긴급 기술지원', evidence: 'SUP-1842', status: '검토 대기' },
]

const state = {
  loggedInUserId: null,
  members: [{ userId: 'bae-seungdo', name: '배승도', part: 'Tiger' }],
  selectedEngineer: null,
  records: mockRecords,
  balanceHours: 0,
  apiError: '',
  date: '', type: '기술지원', customer: '', startTime: '', endTime: '', detail: '', evidence: '',
  overviewByUserId: {},
}

export async function loadCompLeave() {
  try {
    const [meResponse, bootstrapResponse] = await Promise.all([fetch('/api/me'), fetch('/api/bootstrap')])
    if (!bootstrapResponse.ok) throw new Error('load failed')
    if (meResponse.ok) state.loggedInUserId = (await meResponse.json()).userId
    const bootstrap = await bootstrapResponse.json()
    state.members = bootstrap.users
    if (!state.selectedEngineer || !state.members.some((member) => member.id === state.selectedEngineer)) {
      state.selectedEngineer = state.loggedInUserId ?? state.members[0]?.id ?? null
    }
    await loadSelectedEngineer()
    state.apiError = ''
  } catch {
    state.apiError = '대체휴가 데이터를 불러오지 못했습니다.'
  }
}

async function loadSelectedEngineer() {
  const response = await fetch(`/api/overtime?userId=${encodeURIComponent(state.selectedEngineer)}`)
  if (!response.ok) throw new Error('load failed')
  const body = await response.json()
  const name = state.members.find((member) => member.id === state.selectedEngineer)?.name ?? state.selectedEngineer
  state.records = body.records.map((record) => ({ ...record, engineer: name, status: record.status === 'approved' ? '승인' : record.status === 'rejected' ? '반려' : '검토 대기' }))
  state.overviewByUserId[state.selectedEngineer] = body.balanceHours
  if (state.selectedEngineer === state.loggedInUserId) state.balanceHours = body.balanceHours
}

function calculateHours(start, end) {
  if (!start || !end) return 0
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (minutes < 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 10) / 10
}

function statusBadge(status) {
  return `<span class="comp-status status-${status.replace(' ', '-')}">${status}</span>`
}

function pendingHours() {
  return state.records.filter((record) => record.status === '검토 대기').reduce((total, record) => total + record.hours, 0)
}

export function renderCompLeave() {
  const entered = calculateHours(state.startTime, state.endTime)
  const overview = state.members.map((member) => ({
    userId: member.id, name: member.name, part: member.part ?? '무소속',
    balance: state.overviewByUserId[member.id] ?? 0,
    pending: member.id === state.selectedEngineer ? pendingHours() : 0,
  }))

  return `<main class="management-page comp-leave-management">
    <div class="management-heading comp-leave-heading">
      <div><span class="eyebrow">COMPENSATORY LEAVE</span><h1>대체휴가 관리</h1><p>업무시간 외 기술지원·작업을 기록하고 승인된 시간만 대체휴가로 적립합니다.</p></div>
      <div class="comp-role">${icon('ShieldCheck', 15)}<span>내 기록 작성</span><strong>관리자 검토 가능</strong></div>
    </div>
    ${state.apiError ? `<div class="comp-api-error" role="alert">${state.apiError}</div>` : ''}
    <section class="engineer-dropdown-bar" aria-label="엔지니어 조회 기준">
      <div><label for="engineer-select">엔지니어 선택</label><span>상세 현황과 원장 조회 기준</span></div>
      <select id="engineer-select" aria-label="엔지니어 선택">
        ${state.members.map((member) => `<option value="${member.id}" ${state.selectedEngineer === member.id ? 'selected' : ''}>${member.name}${member.id === state.loggedInUserId ? ' (나)' : ''} · ${member.part ?? '무소속'}</option>`).join('')}
      </select>
      <small><strong>${state.members.find((member) => member.id === state.selectedEngineer)?.name ?? ''}</strong>${state.selectedEngineer === state.loggedInUserId ? ' · 로그인 사용자 자동 선택' : ' · 관리자 조회 중'}</small>
    </section>
    <div class="comp-focus-grid">
      <section class="engineer-overview-panel">
        <header><div><span>TEAM OVERVIEW</span><h2>엔지니어별 현황</h2><p>초과근무, 검토 대기와 사용 가능한 대체휴가를 바로 비교합니다.</p></div><strong>CSG MSP 전체</strong></header>
        <div class="engineer-overview-table"><table>
          <thead><tr><th>엔지니어</th><th>사용 가능</th><th>검토 대기</th><th>최근 조회</th></tr></thead>
          <tbody>
            ${overview.map((engineer) => `<tr class="${engineer.userId === state.selectedEngineer ? 'selected-engineer' : ''}" data-select-engineer="${engineer.userId}">
              <td><strong>${engineer.name}</strong><small>${engineer.part}</small></td>
              <td><b>${engineer.balance}시간</b></td>
              <td><span class="${engineer.pending ? 'pending-hours active' : 'pending-hours'}">${engineer.pending}시간</span></td>
              <td>${engineer.userId === state.selectedEngineer ? '조회 중' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <footer>${icon('Info', 14)}<span>행을 선택하면 아래 원장에서 해당 엔지니어의 상세 기록을 확인하는 구조입니다.</span></footer>
      </section>
      <section class="comp-register-panel quick-register-panel">
        <header><div><span>SELF SERVICE</span><h2>빠른 초과근무 추가</h2><p>내 시간외 기술지원·작업을 바로 기록합니다.</p></div>${icon('Plus', 18)}</header>
        <div class="quick-balance"><div><span>사용 가능 대체휴가</span><strong data-testid="comp-leave-balance">${state.balanceHours}시간</strong></div><div><span>승인 대기</span><strong>${pendingHours()}시간</strong></div></div>
        <form id="overtime-form">
          <div class="comp-form-row two">
            <label>업무 일자<input aria-label="업무 일자" type="date" id="overtime-date" value="${state.date}"></label>
            <label>시간외 업무 유형<select aria-label="시간외 업무 유형" id="overtime-type">${['기술지원', '작업', '장애대응', '점검'].map((type) => `<option ${state.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
          </div>
          <label>고객사 또는 업무명<input aria-label="고객사 또는 업무명" id="overtime-customer" value="${state.customer}" placeholder="예: 한국일보"></label>
          <div class="comp-form-row time compact-time">
            <label>시작 시간<input aria-label="시작 시간" type="time" id="overtime-start" value="${state.startTime}"></label>
            <label>종료 시간<input aria-label="종료 시간" type="time" id="overtime-end" value="${state.endTime}"></label>
            <div class="calculated-hours"><span>산정</span><strong>${entered || 0}시간</strong></div>
          </div>
          <label>업무 내용 및 근거<textarea aria-label="업무 내용 및 근거" id="overtime-detail" placeholder="수행 내용과 결과">${state.detail}</textarea></label>
          <label class="quick-evidence">관련 티켓·작업 링크 <em>선택</em><input aria-label="관련 티켓 또는 작업 링크" id="overtime-evidence" value="${state.evidence}" placeholder="SUP-0000 또는 URL"></label>
          <div class="comp-submit-note">${icon('Info', 14)}<span>승인 전에는 잔여 휴가에 반영되지 않습니다.</span></div>
          <button class="primary" aria-label="시간외 업무 등록" type="submit">${icon('Plus', 15)} 바로 등록</button>
        </form>
      </section>
    </div>
    <section class="comp-ledger">
      <header><div>${icon('History', 17)}<h2>${state.members.find((member) => member.id === state.selectedEngineer)?.name ?? ''} 상세 원장</h2></div><span>${state.selectedEngineer === state.loggedInUserId ? '로그인 사용자 · 본인 기록' : '관리자 조회 · 엔지니어 기록'}</span></header>
      <div class="comp-table-wrap"><table>
        <thead><tr><th>업무 일자</th><th>유형</th><th>고객사/업무</th><th>시간</th><th>업무 내용</th><th>근거</th><th>상태</th><th>관리자 검토</th></tr></thead>
        <tbody>
          ${state.records.map((record) => `<tr>
            <td>${record.date}</td><td><span class="comp-type">${record.type}</span></td><td><strong>${record.customer}</strong><small>${record.startTime}–${record.endTime}</small></td><td><b>${record.hours}시간</b></td><td>${record.detail}</td><td>${record.evidence || '—'}</td><td>${statusBadge(record.status)}</td>
            <td>${record.status === '검토 대기' ? (isAdminOrLead() ? `<button data-approve="${record.id}" aria-label="${record.customer} ${record.detail.includes('야간') ? '야간 기술지원 ' : ''}승인">${icon('Check', 14)} 승인</button>` : '<span class="reviewed-by">검토 대기 중</span>') : '<span class="reviewed-by">검토 완료</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </section>
  </main>`
}

export function bindCompLeave(root, rerender) {
  root.querySelector('#engineer-select')?.addEventListener('change', async (event) => { state.selectedEngineer = event.target.value; await loadSelectedEngineer().catch(() => undefined); rerender() })
  root.querySelectorAll('[data-select-engineer]').forEach((row) => row.addEventListener('click', async () => { state.selectedEngineer = row.dataset.selectEngineer; await loadSelectedEngineer().catch(() => undefined); rerender() }))
  root.querySelector('#overtime-date')?.addEventListener('input', (e) => { state.date = e.target.value })
  root.querySelector('#overtime-type')?.addEventListener('change', (e) => { state.type = e.target.value })
  root.querySelector('#overtime-customer')?.addEventListener('input', (e) => { state.customer = e.target.value })
  root.querySelector('#overtime-start')?.addEventListener('input', (e) => { state.startTime = e.target.value; rerender() })
  root.querySelector('#overtime-end')?.addEventListener('input', (e) => { state.endTime = e.target.value; rerender() })
  root.querySelector('#overtime-detail')?.addEventListener('input', (e) => { state.detail = e.target.value })
  root.querySelector('#overtime-evidence')?.addEventListener('input', (e) => { state.evidence = e.target.value })
  root.querySelector('#overtime-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const entered = calculateHours(state.startTime, state.endTime)
    if (!state.date || !state.customer.trim() || !state.startTime || !state.endTime || !state.detail.trim() || entered <= 0) return
    try {
      await fetch('/api/overtime', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: state.loggedInUserId, date: state.date, type: state.type, customer: state.customer.trim(), startTime: state.startTime, endTime: state.endTime, hours: entered, detail: state.detail.trim(), evidence: state.evidence.trim() }),
      })
      if (state.selectedEngineer === state.loggedInUserId) await loadSelectedEngineer()
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    state.date = ''; state.customer = ''; state.startTime = ''; state.endTime = ''; state.detail = ''; state.evidence = ''
    rerender()
  })
  root.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await fetch(`/api/overtime/${btn.dataset.approve}/approve`, { method: 'POST' })
      await loadSelectedEngineer()
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    rerender()
  }))
}
