// 원본 prototype(src/App.tsx)의 DOM 구조·클래스명을 그대로 옮긴 vanilla JS 렌더러.
import { icon } from './icons.js'
import { formatReviewRange, formatReviewTitle, getCurrentReviewEnd, moveReviewWeek } from './dateRange.js'
import { comments as initialComments, entries as mockEntries, monthlyReviewSnapshots } from './data.js'
import { buildMonthlyTeamOutput } from './monthlyOutput.js'
import { session, loadSession } from './session.js'
import { renderCustomers, bindCustomers, loadCustomers } from './views/customers.js'
import { renderSchedule, bindSchedule, loadSchedule } from './views/schedule.js'
import { renderCompLeave, bindCompLeave, loadCompLeave } from './views/compLeave.js'
import { renderOrganization, bindOrganization, loadOrganization } from './views/organization.js'

const viewLoaders = { customers: loadCustomers, schedule: loadSchedule, 'comp-leave': loadCompLeave, organization: loadOrganization }
const authState = session

function authGate() {
  return `<div class="auth-gate">
    <div class="auth-gate-card">
      <span class="eyebrow">CSG MSP</span>
      <h1>MSP 주간회고</h1>
      <p>등록된 MSP 팀원만 Slack 계정으로 로그인할 수 있습니다.</p>
      <a class="auth-login-button primary" href="/auth/slack">${icon('Share2', 16)} Slack으로 로그인</a>
    </div>
  </div>`
}

const parts = ['무소속', 'Leaf', 'Tiger', 'Dragon']
const availableWeeks = ['2026-08-31', '2026-08-24', '2026-08-17', '2026-08-10']
const statusClass = { '작성 중': 'draft', '제출 완료': 'submitted', '검토 완료': 'reviewed', '재검토 필요': 'recheck', 미작성: 'missing' }
const validViews = ['dashboard', 'review', 'edit', 'customers', 'schedule', 'comp-leave', 'organization']

function viewFromHash() {
  const view = location.hash.replace('#', '')
  return validViews.includes(view) ? view : 'review'
}

const state = {
  view: viewFromHash(),
  reviewEnd: '2026-08-31',
  selectedName: null,
  dateOpen: false,
  compact: false,
  light: false,
  query: '',
  leftOpen: true,
  rightOpen: true,
  outputOpen: false,
  commentDraft: '',
  commentList: [...initialComments],
  workHighlightsDraft: '- 이동의즐거움 기존 피어링 삭제 작업 완료 후 결과 회신',
  actionItemsDraft: '- Ticket Assistant Framework 자체 테스트 진행',
  topsProjectsDraft: '- 근거 기반 티켓 응대 에이전트 체계 구축',
  otherNotesDraft: '- 이동의즐거움 코드레포지토리 이관 일정 협의',
  requiredFieldErrors: { workHighlights: false, actionItems: false, topsProjects: false, otherNotes: false },
  toast: '',
  entries: mockEntries,
  reviewSnapshots: monthlyReviewSnapshots,
  entriesLoaded: false,
}
let toastTimer = null
const reviewCache = new Map()
const dbStatusToLabel = { missing: '미작성', draft: '작성 중', submitted: '제출 완료', reviewed: '검토 완료', recheck: '재검토 필요' }

async function loadReviewEntries(weekEnd) {
  if (reviewCache.has(weekEnd)) return reviewCache.get(weekEnd)
  const response = await fetch(`/api/reviews?weekEnd=${encodeURIComponent(weekEnd)}`)
  if (!response.ok) throw new Error('load failed')
  const body = await response.json()
  const entries = body.entries.map((entry) => ({
    name: entry.name,
    part: entry.part ?? '무소속',
    tickets: entry.tickets,
    status: dbStatusToLabel[entry.status] ?? '미작성',
    blocks: [],
    workHighlights: entry.workHighlights ? entry.workHighlights.split('\n').filter(Boolean) : undefined,
    actionItems: entry.actionItems ? entry.actionItems.split('\n').filter(Boolean) : undefined,
    topsProjects: entry.topsProjects ? entry.topsProjects.split('\n').filter(Boolean) : undefined,
    otherNotes: entry.otherNotes ? entry.otherNotes.split('\n').filter(Boolean) : undefined,
  }))
  reviewCache.set(weekEnd, entries)
  return entries
}

async function ensureReviewEntries() {
  try {
    state.entries = await loadReviewEntries(state.reviewEnd)
    state.entriesLoaded = true
  } catch {
    state.entries = mockEntries
    state.entriesLoaded = false
  }
  if (!state.selectedName || !state.entries.some((entry) => entry.name === state.selectedName)) {
    state.selectedName = authState.user?.name ?? state.entries[0]?.name ?? null
  }
  render()
}

function statusBadge(status) {
  return `<span class="status-badge ${statusClass[status]}">${status}</span>`
}

function emptyReview(name) {
  return `<div class="empty-review">${icon('Clock3', 24)}<strong>${name}님의 회고가 아직 작성되지 않았습니다.</strong><span>제출되면 고객사별 업무 내용이 이곳에 표시됩니다.</span></div>`
}

function render() {
  document.documentElement.dataset.density = state.compact ? 'compact' : 'comfortable'
  document.documentElement.dataset.theme = state.light ? 'light' : 'dark'
  const root = document.querySelector('#root')
  if (!authState.checked) {
    root.innerHTML = ''
    return
  }
  if (!authState.user) {
    root.innerHTML = authGate()
    return
  }
  root.innerHTML = `<div class="app-shell">${topbar()}${weekbar()}${mainView()}${outputOverlay()}${toastEl()}</div>`
  bindEvents(root)
}

function topbar() {
  const tabs = [
    ['dashboard', 'LayoutDashboard', '대시보드'],
    ['review', 'MessageSquareText', '리뷰'],
    ['edit', 'PencilLine', '내 회고 작성'],
    ['customers', 'Building2', '담당 고객사'],
    ['schedule', 'CalendarRange', '일정 관리'],
    ['comp-leave', 'TimerReset', '대체휴가'],
    ['organization', 'ShieldCheck', '조직 관리'],
  ]
  return `<header class="topbar">
    <div class="brand"><span class="brand-mark"></span><strong>MSP 주간회고</strong><span class="brand-scope">CSG MSP</span></div>
    <nav class="view-tabs" aria-label="주요 화면">
      ${tabs.map(([id, iconName, label]) => `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${icon(iconName, 16)} ${label}</button>`).join('')}
    </nav>
    <label class="searchbox">${icon('Search', 16)}<input id="query-input" value="${escapeAttr(state.query)}" placeholder="고객사 · 엔지니어 · 키워드"><kbd>/</kbd></label>
    <span class="current-user-chip">${icon('User', 15)} ${escapeHtml(authState.user?.name ?? '')}</span>
    <button class="icon-button" id="theme-toggle" aria-label="라이트/다크 테마">${icon(state.light ? 'Moon' : 'Sun', 17)}</button>
    <button class="slack-button" id="slack-share">${icon('Share2', 16)} Slack 공유</button>
    <button class="icon-button" id="auth-logout" aria-label="로그아웃" title="${escapeAttr(authState.user?.name ?? '')}님 로그아웃">${icon('LogOut', 16)}</button>
  </header>`
}

function weekbar() {
  if (!['dashboard', 'review', 'edit'].includes(state.view)) return ''
  const currentEnd = getCurrentReviewEnd()
  return `<section class="weekbar">
    <button class="week-move" id="week-prev" aria-label="이전 주">${icon('ChevronLeft', 18)} <span>이전 주</span></button>
    <div class="date-control">
      <button class="date-button" id="date-toggle" aria-label="주간회고 날짜 선택">
        ${icon('CalendarDays', 19)}
        <span><strong>${formatReviewTitle(state.reviewEnd)}</strong><small>${formatReviewRange(state.reviewEnd)}</small></span>
        ${state.reviewEnd === currentEnd ? '<em>이번 주</em>' : ''}
        ${icon('ChevronDown', 17)}
      </button>
      ${state.dateOpen ? `<div class="date-popover">
        <div class="date-popover-title">회고 주간 선택</div>
        ${availableWeeks.map((week) => `<button data-week="${week}" class="${week === state.reviewEnd ? 'selected' : ''}" aria-label="${formatReviewTitle(week)} ${formatReviewRange(week)}">
          <span><strong>${formatReviewTitle(week).replace(' 주간회고', '')}</strong><small>${formatReviewRange(week)}</small></span>
          ${week === state.reviewEnd ? icon('Check', 17) : ''}
        </button>`).join('')}
      </div>` : ''}
    </div>
    <button class="week-move" id="week-next" aria-label="다음 주"><span>다음 주</span> ${icon('ChevronRight', 18)}</button>
    <button class="today-button" id="week-today" ${state.reviewEnd === currentEnd ? 'disabled' : ''}>${icon('RotateCcw', 15)} 이번 주</button>
    <div class="week-spacer"></div>
    ${state.view === 'review' ? `<button class="output-button" id="output-open" aria-label="월간 Output">${icon('FileText', 15)} 월간 Output</button>` : ''}
    <button class="${state.compact ? 'density-button active' : 'density-button'}" id="density-toggle" aria-label="컴팩트 모드">${icon('Maximize2', 15)} ${state.compact ? '보통 보기' : '컴팩트'}</button>
  </section>`
}

function filteredEntries() {
  const normalized = state.query.trim().toLowerCase()
  if (!normalized) return state.entries
  return state.entries.filter((entry) => {
    const content = entry.blocks.flatMap((block) => [block.customer, ...block.items.map((item) => item.text)]).join(' ')
    return `${entry.name} ${entry.part} ${content}`.toLowerCase().includes(normalized)
  })
}

function mainView() {
  if (state.view === 'review') return reviewView()
  if (state.view === 'dashboard') return dashboardView()
  if (state.view === 'edit') return editView()
  if (state.view === 'customers') return renderCustomers()
  if (state.view === 'schedule') return renderSchedule()
  if (state.view === 'comp-leave') return renderCompLeave()
  if (state.view === 'organization') return renderOrganization()
  return ''
}

function reviewView() {
  const selected = state.entries.find((entry) => entry.name === state.selectedName) ?? state.entries[0] ?? { name: '회고 없음', part: '—', tickets: [0, 0, 0], status: '미작성', blocks: [] }
  const people = filteredEntries()
  const rail = `<aside class="people-rail">
    <div class="rail-heading"><span>${icon('Users', 16)} 엔지니어</span><button id="left-close" aria-label="엔지니어 목록 접기">${icon('PanelLeftClose', 17)}</button></div>
    ${parts.map((part) => {
      const members = people.filter((entry) => entry.part === part)
      if (!members.length) return ''
      return `<section class="part-group"><div class="part-label"><strong>${part}</strong><span>${members.length}명</span></div>
        ${members.map((entry) => `<button data-person="${escapeAttr(entry.name)}" class="person-row ${entry.name === state.selectedName ? 'selected' : ''}">
          <span class="status-dot ${statusClass[entry.status]}"></span><span class="person-name">${entry.name}</span><span class="ticket-mini">${entry.tickets.join(' / ')}</span>
        </button>`).join('')}
      </section>`
    }).join('')}
    <div class="rail-legend">
      <span><i class="status-dot reviewed"></i> 검토 완료</span>
      <span><i class="status-dot submitted"></i> 제출 완료</span>
      <span><i class="status-dot recheck"></i> 재검토 필요</span>
    </div>
  </aside>`

  const sections = [
    { title: '주요 업무 현황', items: selected.workHighlights ?? selected.blocks.flatMap((block) => block.items.map((item) => `${block.customer} — ${item.text}`)), className: 'work-highlights-card' },
    { title: '주요 계획 / Action Item', items: selected.actionItems ?? [], className: 'action-items-card' },
    { title: '프로젝트/과제 현황(TOPS)', items: selected.topsProjects ?? selected.goals ?? [], className: 'tops-card' },
    { title: '기타 사항', items: selected.otherNotes ?? [], className: 'other-notes-card' },
  ]
  const hasAnyContent = selected.blocks.length > 0 || sections.some((section) => section.items.length > 0)

  const content = `<section class="review-content">
    <div class="person-header">
      <div class="person-identity"><h1>${selected.name}</h1><span class="part-badge">${selected.part}</span>${statusBadge(selected.status)}</div>
      <div class="ticket-chips">${['신규', '진행 중', '종료'].map((label, index) => `<div class="ticket-chip ticket-${index}"><span>${label}</span><strong>${selected.tickets[index]}</strong><small>${index === 0 ? '+11' : index === 1 ? '+3' : '+7'}</small></div>`).join('')}</div>
    </div>
    ${selected.absence ? `<div class="absence"><strong>부재</strong><span>${selected.absence}</span></div>` : ''}
    <div class="review-scroll">
      ${!hasAnyContent ? emptyReview(selected.name) : selected.blocks.map((block) => `<article class="customer-card"><header><span class="accent-bar"></span><h2>${block.customer}</h2><small>항목 ${block.items.length}개</small></header>
        <div class="customer-body">${block.items.map((item) => `<div class="${item.sub ? 'work-item sub' : 'work-item'}"><span class="bullet">${item.sub ? '–' : '■'}</span><p>${item.text}</p></div>`).join('')}</div>
      </article>`).join('')}
      ${sections.filter((section) => section.items.length > 0).map((section) => `<article class="customer-card structured-review-card ${section.className}"><header><span class="accent-bar"></span><h2>${section.title}</h2><small>필수 항목</small></header>
        <div class="customer-body">${section.items.map((item) => `<div class="work-item"><span class="bullet">■</span><p>${item}</p></div>`).join('')}</div>
      </article>`).join('')}
    </div>
  </section>`

  const panel = `<aside class="review-panel">
    <div class="panel-heading"><span>리뷰 요약</span><button id="right-close" aria-label="리뷰 패널 접기">${icon('PanelRightClose', 17)}</button></div>
    <div class="comparison"><h3>지난주 대비</h3>
      ${['신규', '진행 중', '종료'].map((label, index) => `<div><span>${label}</span><small>${Math.max(0, selected.tickets[index] - (index + 1) * 3)}</small><i>→</i><strong>${selected.tickets[index]}</strong><em>+${(index + 1) * 2}</em></div>`).join('')}
    </div>
    <div class="carry-over"><h3>지난주에서 이어짐</h3><p>↳ 케이비자산운용_DI — 지난주에도 진행 중</p></div>
    <div class="comment-area">
      <div class="comment-title"><h3>리뷰 코멘트</h3><span>${state.commentList.length}</span></div>
      <div class="comment-list">${state.commentList.map((comment) => `<div class="comment"><div><strong>${comment.author}</strong><span>${comment.at}</span></div><p>${comment.text}</p></div>`).join('')}</div>
      <textarea id="comment-draft" placeholder="코멘트를 입력하세요">${escapeHtml(state.commentDraft)}</textarea>
      <div class="comment-actions">
        <button class="primary" id="comment-add">${icon('Send', 15)} 코멘트 등록</button>
        <button id="review-complete">${icon('Check', 15)} 검토 완료</button>
      </div>
    </div>
  </aside>`

  return `<main class="review-layout ${state.leftOpen ? '' : 'left-closed'} ${state.rightOpen ? '' : 'right-closed'}">
    ${state.leftOpen ? rail : ''}
    ${!state.leftOpen ? `<button class="panel-reopen left" id="left-open">${icon('Users', 17)} 엔지니어</button>` : ''}
    ${content}
    ${state.rightOpen ? panel : ''}
    ${!state.rightOpen ? `<button class="panel-reopen right" id="right-open">${icon('MessageSquareText', 17)} 코멘트</button>` : ''}
  </main>`
}

function dashboardView() {
  const entries = state.entries
  const ticketTotals = entries.reduce((sum, entry) => sum.map((value, index) => value + entry.tickets[index]), [0, 0, 0])
  const submitted = entries.filter((entry) => entry.status !== '미작성' && entry.status !== '작성 중').length
  const reviewed = entries.filter((entry) => entry.status === '검토 완료').length
  const kpis = [['신규 티켓', ticketTotals[0], '+11'], ['진행 중', ticketTotals[1], '+3'], ['종료', ticketTotals[2], '+7'], ['회고 제출', `${submitted} / ${entries.length}`, `${reviewed}명 검토`]]
  return `<main class="dashboard-view">
    <div class="page-heading"><div><span>TEAM OVERVIEW</span><h1>이번 주 MSP 업무 현황</h1><p>${formatReviewRange(state.reviewEnd)} 기준</p></div>${statusBadge('재검토 필요')}</div>
    <div class="kpi-grid">${kpis.map(([label, value, delta], index) => `<article class="kpi-card kpi-${index}"><span>${label}</span><strong>${value}</strong><small>${delta}</small><div><i></i></div></article>`).join('')}</div>
    <div class="dashboard-grid">
      <section class="team-table"><header><h2>파트별 제출 현황</h2><span>총 ${entries.length}명</span></header>
        ${parts.map((part) => {
          const members = entries.filter((entry) => entry.part === part)
          return `<div class="team-row"><strong>${part}</strong><span>${members.map((member) => member.name).join(' · ')}</span><em>${members.filter((member) => member.status !== '미작성').length}/${members.length}</em></div>`
        }).join('')}
      </section>
      <section class="pending-card"><header><h2>확인이 필요한 회고</h2></header>
        ${entries.filter((entry) => ['미작성', '재검토 필요'].includes(entry.status)).map((entry) => `<button data-goto-person="${escapeAttr(entry.name)}"><span>${entry.name}<small>${entry.part}</small></span>${statusBadge(entry.status)}</button>`).join('')}
      </section>
    </div>
  </main>`
}

function editView() {
  const fields = [
    ['workHighlights', '주요 업무 현황', '이번 주 고객사 지원, 기술 대응과 완료한 핵심 업무를 작성합니다.', state.workHighlightsDraft],
    ['actionItems', '주요 계획 / Action Item', '다음 주에 실행하거나 계속 진행할 주요 행동을 작성합니다.', state.actionItemsDraft],
    ['topsProjects', '프로젝트/과제 현황(TOPS)', 'TOPS에 연결된 프로젝트·과제의 현재 진척도와 다음 단계를 작성합니다.', state.topsProjectsDraft],
    ['otherNotes', '기타 사항', '고객사 변동, 리스크, 인수인계 등 별도 공유가 필요한 내용을 작성합니다.', state.otherNotesDraft],
  ]
  return `<main class="edit-view">
    <div class="edit-toolbar">
      <div><strong>${authState.user?.name ?? ''}</strong><span class="part-badge">${state.entries.find((entry) => entry.name === authState.user?.name)?.part ?? ''}</span>${statusBadge('작성 중')}</div>
      <div><span>자동 저장됨</span><button>지난주 내용 불러오기</button><button class="primary" id="submit-review" aria-label="회고 제출하기">제출하기</button></div>
    </div>
    <div class="structured-editor edit-space-first">
      <div class="required-review-grid four-columns">
        ${fields.map(([key, label, desc, value]) => `<label class="${state.requiredFieldErrors[key] ? 'review-field invalid' : 'review-field'}">
          <span><strong>${label}</strong><em>필수</em></span>
          <small>${desc}</small>
          <textarea data-field="${key}" aria-label="${label}">${escapeHtml(value)}</textarea>
          ${state.requiredFieldErrors[key] ? '<b>필수 항목을 입력해 주세요.</b>' : ''}
        </label>`).join('')}
      </div>
    </div>
  </main>`
}

function outputOverlay() {
  if (!state.outputOpen) return ''
  const output = buildMonthlyTeamOutput(state.reviewEnd, state.reviewSnapshots)
  return `<div class="output-overlay" id="output-overlay">
    <section class="output-dialog" role="dialog" aria-modal="true" aria-labelledby="monthly-output-title">
      <header>
        <div><span>MONTHLY SUMMARY</span><h2 id="monthly-output-title">${output.title}</h2><p>선택한 달의 주간회고를 팀장님 공유 형식으로 자동 합산합니다.</p></div>
        <button id="output-close" aria-label="Output 닫기">${icon('X', 18)}</button>
      </header>
      <div class="output-meta"><span>Markdown 미리보기</span><em>주요 업무 · 프로젝트/과제 · 기타 사항 자동 분류</em></div>
      <pre>${escapeHtml(output.markdown)}</pre>
      <footer>
        <span>다운로드한 파일은 바로 수정하거나 월간 보고에 붙여 넣을 수 있습니다.</span>
        <div>
          <a download="${output.filenameBase}.md" href="data:text/markdown;charset=utf-8,${encodeURIComponent(output.markdown)}">${icon('Download', 15)} Markdown 다운로드</a>
          <a download="${output.filenameBase}.txt" href="data:text/plain;charset=utf-8,${encodeURIComponent(output.text)}">${icon('Download', 15)} TXT 다운로드</a>
        </div>
      </footer>
    </section>
  </div>`
}

function toastEl() {
  return state.toast ? `<div class="toast">${state.toast}</div>` : ''
}

function showToast(message) {
  state.toast = message
  render()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = ''; render() }, 2200)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

async function switchView(view) {
  state.view = view
  if (location.hash.replace('#', '') !== view) location.hash = view
  const loader = viewLoaders[view]
  if (loader) await loader()
  render()
}

window.addEventListener('hashchange', () => {
  const view = viewFromHash()
  if (view !== state.view) switchView(view)
})

function bindEvents(root) {
  root.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)))
  root.querySelector('#query-input')?.addEventListener('input', (event) => { state.query = event.target.value; render(); root.querySelector('#query-input')?.focus() })
  root.querySelector('#theme-toggle')?.addEventListener('click', () => { state.light = !state.light; render() })
  root.querySelector('#slack-share')?.addEventListener('click', () => showToast('Slack 공유 링크를 복사했습니다.'))
  root.querySelector('#week-prev')?.addEventListener('click', () => { state.reviewEnd = moveReviewWeek(state.reviewEnd, -1); state.dateOpen = false; ensureReviewEntries() })
  root.querySelector('#week-next')?.addEventListener('click', () => { state.reviewEnd = moveReviewWeek(state.reviewEnd, 1); state.dateOpen = false; ensureReviewEntries() })
  root.querySelector('#week-today')?.addEventListener('click', () => { state.reviewEnd = getCurrentReviewEnd(); ensureReviewEntries() })
  root.querySelector('#date-toggle')?.addEventListener('click', () => { state.dateOpen = !state.dateOpen; render() })
  root.querySelectorAll('[data-week]').forEach((btn) => btn.addEventListener('click', () => { state.reviewEnd = btn.dataset.week; state.dateOpen = false; ensureReviewEntries() }))
  root.querySelector('#output-open')?.addEventListener('click', () => { state.outputOpen = true; render() })
  root.querySelector('#output-close')?.addEventListener('click', () => { state.outputOpen = false; render() })
  root.querySelector('#output-overlay')?.addEventListener('mousedown', (event) => { if (event.target === event.currentTarget) { state.outputOpen = false; render() } })
  root.querySelector('#density-toggle')?.addEventListener('click', () => { state.compact = !state.compact; render() })
  root.querySelector('#left-close')?.addEventListener('click', () => { state.leftOpen = false; render() })
  root.querySelector('#left-open')?.addEventListener('click', () => { state.leftOpen = true; render() })
  root.querySelector('#right-close')?.addEventListener('click', () => { state.rightOpen = false; render() })
  root.querySelector('#right-open')?.addEventListener('click', () => { state.rightOpen = true; render() })
  root.querySelectorAll('[data-person]').forEach((btn) => btn.addEventListener('click', () => { state.selectedName = btn.dataset.person; render() }))
  root.querySelectorAll('[data-goto-person]').forEach((btn) => btn.addEventListener('click', () => { state.selectedName = btn.dataset.gotoPerson; state.view = 'review'; render() }))
  root.querySelector('#auth-logout')?.addEventListener('click', async (event) => {
    event.preventDefault()
    await fetch('/auth/logout')
    authState.user = null
    render()
  })
  root.querySelector('#comment-draft')?.addEventListener('input', (event) => { state.commentDraft = event.target.value })
  root.querySelector('#comment-add')?.addEventListener('click', () => {
    const text = state.commentDraft.trim()
    if (!text) return
    state.commentList.push({ author: authState.user?.name ?? '', at: '방금', text })
    state.commentDraft = ''
    showToast('코멘트를 등록했습니다.')
  })
  root.querySelector('#review-complete')?.addEventListener('click', () => showToast('검토 완료로 변경했습니다.'))
  root.querySelectorAll('[data-field]').forEach((el) => el.addEventListener('input', (event) => {
    const key = el.dataset.field
    state[`${key}Draft`] = event.target.value
    state.requiredFieldErrors[key] = false
  }))
  if (state.view === 'customers') bindCustomers(root, render)
  if (state.view === 'schedule') bindSchedule(root, render)
  if (state.view === 'comp-leave') bindCompLeave(root, render)
  if (state.view === 'organization') bindOrganization(root, render)
  root.querySelector('#submit-review')?.addEventListener('click', async () => {
    const nextErrors = {
      workHighlights: !state.workHighlightsDraft.trim(),
      actionItems: !state.actionItemsDraft.trim(),
      topsProjects: !state.topsProjectsDraft.trim(),
      otherNotes: !state.otherNotesDraft.trim(),
    }
    state.requiredFieldErrors = nextErrors
    if (Object.values(nextErrors).some(Boolean)) { render(); return }
    try {
      const response = await fetch('/api/reviews', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: authState.user.userId, weekEnd: state.reviewEnd, workHighlights: state.workHighlightsDraft, actionItems: state.actionItemsDraft, topsProjects: state.topsProjectsDraft, otherNotes: state.otherNotesDraft }),
      })
      if (!response.ok) throw new Error('save failed')
      reviewCache.delete(state.reviewEnd)
      showToast('회고를 제출했습니다.')
    } catch {
      showToast('회고를 제출하지 못했습니다.')
    }
  })
}

async function init() {
  await loadSession()
  render()
  if (authState.user) {
    await ensureReviewEntries()
    const loader = viewLoaders[state.view]
    if (loader) { await loader(); render() }
  }
}

init()
