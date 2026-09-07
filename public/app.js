// 원본 prototype(src/App.tsx)의 DOM 구조·클래스명을 그대로 옮긴 vanilla JS 렌더러.
import { icon } from './icons.js'
import {
  formatReviewRange,
  formatReviewTitle,
  getCurrentReviewEnd,
  moveReviewWeek,
} from './dateRange.js'
import { buildMonthlyTeamOutput, weeksInMonth } from './monthlyOutput.js'
import { session, loadSession, isAdminOrLead } from './session.js'
import { api } from './api.js'
import { escapeHtml, escapeAttr } from './html.js'
import {
  renderCustomers,
  bindCustomers,
  loadCustomers,
  customersDirty,
  discardCustomers,
  customersBusy,
} from './views/customers.js'
import {
  renderSchedule,
  bindSchedule,
  loadSchedule,
  scheduleDirty,
  discardSchedule,
  scheduleBusy,
} from './views/schedule.js'
import {
  renderCompLeave,
  bindCompLeave,
  loadCompLeave,
  compLeaveDirty,
  discardCompLeave,
  compLeaveBusy,
} from './views/compLeave.js'
import {
  renderOrganization,
  bindOrganization,
  loadOrganization,
  organizationDirty,
  discardOrganization,
  organizationBusy,
} from './views/organization.js'

const viewLoaders = {
  customers: loadCustomers,
  schedule: loadSchedule,
  'comp-leave': loadCompLeave,
  organization: loadOrganization,
}
const authState = session
const managementDrafts = {
  customers: [customersDirty, discardCustomers, customersBusy],
  schedule: [scheduleDirty, discardSchedule, scheduleBusy],
  'comp-leave': [compLeaveDirty, discardCompLeave, compLeaveBusy],
  organization: [organizationDirty, discardOrganization, organizationBusy],
}

function authGate() {
  return `<div class="auth-gate">
    <div class="auth-gate-card">
      <span class="eyebrow">CSG MSP</span>
      <h1>MSP 주간회고</h1>
      <p>${escapeHtml(authState.error || '등록된 MSP 팀원만 Slack 계정으로 로그인할 수 있습니다.')}</p>
      ${authState.error ? '<a href="/">다시 시도</a>' : ''}
      <a class="auth-login-button primary" href="/auth/slack">${icon('Share2', 16)} Slack으로 로그인</a>
    </div>
  </div>`
}

const availableWeeks = Array.from({ length: 16 }, (_, index) =>
  moveReviewWeek(getCurrentReviewEnd(), -index),
)
const parts = () => [...new Set(state.entries.map((entry) => entry.part))]
const statusClass = {
  '작성 중': 'draft',
  '제출 완료': 'submitted',
  '검토 완료': 'reviewed',
  '재검토 필요': 'recheck',
  미작성: 'missing',
}
const validViews = [
  'dashboard',
  'review',
  'edit',
  'customers',
  'schedule',
  'comp-leave',
  'organization',
]

function viewFromHash() {
  const view = location.hash.replace('#', '')
  return validViews.includes(view) ? view : 'review'
}

const state = {
  view: viewFromHash(),
  reviewEnd: initialWeek(),
  selectedName: null,
  dateOpen: false,
  settingsOpen: false,
  profile: null,
  profileBusy: false,
  profileMessage: '',
  fontScale: Math.min(130, Math.max(85, Number(localStorage.getItem('msp-font-scale')) || 110)),
  reviewMode: 'single',
  editorMode: localStorage.getItem('msp-editor-mode') === 'list' ? 'list' : 'grid',
  light: localStorage.getItem('msp-theme') === 'light',
  query: '',
  leftOpen: true,
  rightOpen: true,
  outputOpen: false,
  commentDraft: '',
  commentList: [],
  workHighlightsDraft: '',
  actionItemsDraft: '',
  topsProjectsDraft: '',
  otherNotesDraft: '',
  ticketsNewDraft: '',
  ticketsInProgressDraft: '',
  ticketsDoneDraft: '',
  requiredFieldErrors: {
    workHighlights: false,
    actionItems: false,
    topsProjects: false,
    otherNotes: false,
  },
  toast: '',
  entries: [],
  previousEntries: [],
  reviewSnapshots: [],
  entriesLoaded: false,
  error: '',
  dirty: false,
  saving: false,
  version: 0,
  commentBusy: false,
}
function initialWeek() {
  const value = new URL(location.href).searchParams.get('week')
  const date =
    value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : null
  return date &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1
    ? value
    : getCurrentReviewEnd()
}
let toastTimer = null
let loadGeneration = 0
let commentGeneration = 0
const dbStatusToLabel = {
  missing: '미작성',
  draft: '작성 중',
  submitted: '제출 완료',
  reviewed: '검토 완료',
  recheck: '재검토 필요',
}

async function loadReviewEntries(weekEnd, personal = false) {
  const body = await api(`/api/reviews?weekEnd=${encodeURIComponent(weekEnd)}${personal ? '&personal=true' : ''}`)
  const entries = body.entries.map((entry) => ({
    ...entry,
    raw: entry,
    name: entry.name,
    part: entry.part ?? '무소속',
    tickets: entry.tickets,
    status: dbStatusToLabel[entry.status] ?? '미작성',
    blocks: [],
    workHighlights: entry.workHighlights
      ? entry.workHighlights.split('\n').filter(Boolean)
      : undefined,
    actionItems: entry.actionItems
      ? entry.actionItems.split('\n').filter(Boolean)
      : undefined,
    topsProjects: entry.topsProjects
      ? entry.topsProjects.split('\n').filter(Boolean)
      : undefined,
    otherNotes: entry.otherNotes
      ? entry.otherNotes.split('\n').filter(Boolean)
      : undefined,
  }))
  return entries
}

async function ensureReviewEntries() {
  const generation = ++loadGeneration
  const week = state.reviewEnd
  state.entriesLoaded = false
  state.error = ''
  state.entries = []
  state.previousEntries = []
  state.commentList = []
  render()
  try {
    const [entries, personal] = await Promise.all([loadReviewEntries(week), loadReviewEntries(week, true)])
    if (generation !== loadGeneration) return
    state.entries = entries
    state.personalEntry = personal[0]
    state.entriesLoaded = true
    if (
      !state.selectedName ||
      !entries.some((entry) => entry.id === state.selectedName)
    )
      state.selectedName = entries.find((entry) => entry.id === authState.user?.userId)?.id ?? entries[0]?.id ?? null
    if (!state.dirty) hydrateDraft()
    render()
    await loadComments()
    const previous = await loadReviewEntries(moveReviewWeek(week, -1))
    if (generation !== loadGeneration) return
    state.previousEntries = previous
  } catch (error) {
    if (generation !== loadGeneration) return
    state.error = error.message
  }
  render()
}

const reviewFields = [
  'workHighlights',
  'actionItems',
  'topsProjects',
  'otherNotes',
]
const ticketFields = ['ticketsNew', 'ticketsInProgress', 'ticketsDone']
function hydrateDraft(
  entry = state.personalEntry,
) {
  for (const field of reviewFields)
    state[`${field}Draft`] =
      entry?.raw?.[field] ?? (entry?.[field] ?? []).join('\n')
  ticketFields.forEach((field, index) => {
    state[`${field}Draft`] = String(entry?.tickets?.[index] ?? 0)
  })
  state.version = entry?.version ?? 0
  state.requiredFieldErrors = {}
}
function selectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedName)
}
async function loadComments() {
  const generation = ++commentGeneration
  const id = selectedEntry()?.reviewId
  state.commentList = []
  if (!id) return
  try {
    const result = await api(`/api/reviews/${id}/comments`)
    if (generation === commentGeneration && id === selectedEntry()?.reviewId)
      state.commentList = result.comments
  } catch (error) {
    if (generation === commentGeneration && id === selectedEntry()?.reviewId)
      state.error = error.message
  }
  render()
}
function confirmDiscard() {
  return (
    !state.saving &&
    (!state.dirty ||
      window.confirm('저장하지 않은 회고가 있습니다. 변경 내용을 버릴까요?'))
  )
}
async function changeWeek(week) {
  if (!confirmDiscard()) return
  state.dirty = false
  state.commentDraft = ''
  state.reviewEnd = week
  state.dateOpen = false
  state.outputOpen = false
  const url = new URL(location.href)
  url.searchParams.set('week', week)
  history.replaceState(null, '', url)
  await ensureReviewEntries()
}
function delta(current, previous) {
  const difference = current - previous
  return `${difference > 0 ? '+' : ''}${difference}`
}

function statusBadge(status) {
  return `<span class="status-badge ${statusClass[status]}">${status}</span>`
}

function emptyReview(name) {
  return `<div class="empty-review">${icon('Clock3', 24)}<strong>${escapeHtml(name)}님의 회고가 아직 작성되지 않았습니다.</strong><span>저장한 내용이 이곳에 표시됩니다.</span></div>`
}

function render() {
  document.documentElement.style.setProperty(
    '--font-scale',
    state.fontScale / 100,
  )
  document.documentElement.dataset.theme = state.light ? 'light' : 'dark'
  const root = document.querySelector('#root')
  const scrollSelectors = ['.management-page', '.owner-board', '.review-scroll', '.people-rail', '.review-panel', '.structured-editor', '.all-reviews', '.schedule-table-wrap', '.engineer-overview-table', ...reviewFields.map((field) => `textarea[data-field="${field}"]`), '#comment-draft', '#schedule-note']
  scrollSelectors.push('.comp-table-wrap')
  const scrollPositions = scrollSelectors.flatMap((selector) =>
    [...root.querySelectorAll(selector)].map((element, index) => [selector, index, element.scrollLeft, element.scrollTop]),
  )
  const focused = document.activeElement
  const focusKey = focused?.id
    ? `#${CSS.escape(focused.id)}`
    : Object.entries(focused?.dataset ?? {}).length
      ? Object.entries(focused.dataset)
          .map(
            ([key, value]) =>
              `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${CSS.escape(value)}"]`,
          )
          .join('')
      : null
  const selection =
    focused && 'selectionStart' in focused
      ? [focused.selectionStart, focused.selectionEnd]
      : null
  if (!authState.checked) {
    root.innerHTML = ''
    return
  }
  if (!authState.user) {
    root.innerHTML = authGate()
    return
  }
  root.innerHTML = `<div class="app-shell">${topbar()}${weekbar()}${state.error ? `<div role="alert">${escapeHtml(state.error)} <button id="retry-reviews">다시 불러오기</button></div>` : ''}${mainView()}${outputOverlay()}${toastEl()}</div>`
  bindEvents(root)
  for (const [selector, index, left, top] of scrollPositions) {
    const element = root.querySelectorAll(selector)[index]
    if (element) element.scrollTo(left, top)
  }
  if (focusKey) {
    const target = root.querySelector(focusKey)
    if (target && !target.disabled) {
      target.focus({ preventScroll: true })
      if (selection?.[0] != null && target.setSelectionRange)
        target.setSelectionRange(...selection)
    }
  }
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
    <div class="settings-menu">
      <button class="icon-button" id="settings-toggle" aria-label="설정" aria-expanded="${state.settingsOpen}">${icon('Settings', 17)}</button>
      ${
        state.settingsOpen
          ? `<div class="settings-popover">
        <div class="settings-user"><span class="current-user-chip">${icon('User', 15)} ${escapeHtml(authState.user?.name ?? '')}</span></div>
        <button id="profile-open" ${state.profileBusy ? 'disabled' : ''}>내 정보 ${state.profile ? '다시 불러오기' : '수정'}</button>
        ${state.profile ? `<form id="profile-form"><label>이메일<input id="profile-email" type="email" maxlength="254" value="${escapeAttr(state.profile.email)}" ${state.profileBusy ? 'disabled' : ''}></label><label>입사일<input id="profile-joined" type="date" value="${escapeAttr(state.profile.joinedOn ?? '')}" ${state.profileBusy ? 'disabled' : ''}></label><small>입사일은 회고 발표 순서에 반영됩니다.</small><button type="submit" class="primary" ${state.profileBusy ? 'disabled' : ''}>${state.profileBusy ? '저장 중…' : '내 정보 저장'}</button></form>` : ''}
        ${state.profileMessage ? `<p role="status" class="profile-message">${escapeHtml(state.profileMessage)}</p>` : ''}
        <button id="theme-toggle">${icon(state.light ? 'Moon' : 'Sun', 16)} ${state.light ? '다크 모드' : '라이트 모드'}</button>
        <div class="settings-font-scale">
          <span>${icon('CaseSensitive', 16)} 글자 크기 <em>${state.fontScale}%</em></span>
          <input type="range" id="font-scale-input" min="85" max="130" step="5" value="${state.fontScale}" aria-label="글자 크기">
        </div>
        <button id="slack-share">${icon('Share2', 16)} Slack 공유</button>
        <button id="auth-logout" class="settings-logout">${icon('LogOut', 16)} ${escapeHtml(authState.user?.name ?? '')}님 로그아웃</button>
      </div>`
          : ''
      }
    </div>
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
      ${
        state.dateOpen
          ? `<div class="date-popover">
        <div class="date-popover-title">회고 주간 선택</div>
        ${availableWeeks
          .map(
            (
              week,
            ) => `<button data-week="${week}" class="${week === state.reviewEnd ? 'selected' : ''}" aria-label="${formatReviewTitle(week)} ${formatReviewRange(week)}">
          <span><strong>${formatReviewTitle(week).replace(' 주간회고', '')}</strong><small>${formatReviewRange(week)}</small></span>
          ${week === state.reviewEnd ? icon('Check', 17) : ''}
        </button>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </div>
    <button class="week-move" id="week-next" aria-label="다음 주"><span>다음 주</span> ${icon('ChevronRight', 18)}</button>
    <button class="today-button" id="week-today" ${state.reviewEnd === currentEnd ? 'disabled' : ''}>${icon('RotateCcw', 15)} 이번 주</button>
    <div class="week-spacer"></div>
    ${state.view === 'review' ? `<div class="view-switch"><button data-review-mode="single" aria-pressed="${state.reviewMode === 'single'}">한 명씩 보기</button><button data-review-mode="all" aria-pressed="${state.reviewMode === 'all'}">전체 회고 보기</button></div><button class="output-button" id="output-open" aria-label="월간 Output">${icon('FileText', 15)} 월간 Output</button>` : ''}
  </section>`
}

function filteredEntries() {
  const normalized = state.query.trim().toLowerCase()
  if (!normalized) return state.entries
  return state.entries.filter((entry) => {
    const content = reviewFields
      .flatMap((field) => entry[field] ?? [])
      .join(' ')
    return `${entry.name} ${entry.part} ${content}`
      .toLowerCase()
      .includes(normalized)
  })
}

function mainView() {
  if (
    ['review', 'dashboard', 'edit'].includes(state.view) &&
    !state.entriesLoaded
  )
    return `<main class="empty-review">${state.error ? '데이터를 불러오지 못했습니다.' : '회고를 불러오는 중입니다…'}</main>`
  if (state.view === 'review') return reviewView()
  if (state.view === 'dashboard') return dashboardView()
  if (state.view === 'edit') return editView()
  if (state.view === 'customers') return renderCustomers()
  if (state.view === 'schedule') return renderSchedule()
  if (state.view === 'comp-leave') return renderCompLeave()
  if (state.view === 'organization') return renderOrganization()
  return ''
}

function leaveNotice(entry) {
  return entry?.meetingLeave ? `<div class="absence" role="note"><strong>${escapeHtml(entry.name)}님은 회고일(${escapeHtml(state.reviewEnd)})에 ${escapeHtml(entry.meetingLeave)}입니다.</strong></div>` : ''
}

function reviewView() {
  if (state.reviewMode === 'all') return `<main class="all-reviews">${filteredEntries().map((entry) => `<article class="all-review-card"><header><h1>${escapeHtml(entry.name)}</h1><span class="part-badge">${escapeHtml(entry.part)}</span>${statusBadge(entry.status)}<button data-open-review="${escapeAttr(entry.id)}">상세·코멘트</button></header>${leaveNotice(entry)}<p class="all-ticket-summary">신규 ${entry.tickets[0]} · 진행 중 ${entry.tickets[1]} · 종료 ${entry.tickets[2]}</p>${reviewFields.map((field, index) => `<section><h2>${['주요 업무 현황', '주요 계획 / Action Item', '프로젝트/과제 현황(TOPS)', '기타 사항'][index]}</h2><p>${escapeHtml(entry.raw?.[field] || '작성된 내용 없음')}</p></section>`).join('')}</article>`).join('') || '<p>표시할 회고가 없습니다.</p>'}</main>`
  const selected = selectedEntry() ??
    state.entries[0] ?? {
      name: '회고 없음',
      part: '—',
      tickets: [0, 0, 0],
      status: '미작성',
      blocks: [],
    }
  const previous = state.previousEntries.find(
    (entry) => entry.id === selected.id && entry.reviewId,
  )
  const people = filteredEntries()
  const rail = `<aside class="people-rail">
    <div class="rail-heading"><span>${icon('Users', 16)} 엔지니어</span><button id="left-close" aria-label="엔지니어 목록 접기">${icon('PanelLeftClose', 17)}</button></div>
    ${parts()
      .map((part) => {
        const members = people.filter((entry) => entry.part === part)
        if (!members.length) return ''
        return `<section class="part-group"><div class="part-label"><strong>${escapeHtml(part)}</strong><span>${members.length}명</span></div>
        ${members
          .map(
            (
              entry,
            ) => `<button data-person="${escapeAttr(entry.id)}" class="person-row ${entry.id === state.selectedName ? 'selected' : ''}">
          <span class="status-dot ${statusClass[entry.status]}"></span><span class="person-name">${escapeHtml(entry.name)}</span><span class="ticket-mini">${entry.tickets.join(' / ')}</span>
        </button>`,
          )
          .join('')}
      </section>`
      })
      .join('')}
    <div class="rail-legend">
      <span><i class="status-dot reviewed"></i> 검토 완료</span>
      <span><i class="status-dot submitted"></i> 제출 완료</span>
      <span><i class="status-dot recheck"></i> 재검토 필요</span>
    </div>
  </aside>`

  const sections = [
    {
      title: '주요 업무 현황',
      items:
        selected.workHighlights ??
        selected.blocks.flatMap((block) =>
          block.items.map((item) => `${block.customer} — ${item.text}`),
        ),
      className: 'work-highlights-card',
    },
    {
      title: '주요 계획 / Action Item',
      items: selected.actionItems ?? [],
      className: 'action-items-card',
    },
    {
      title: '프로젝트/과제 현황(TOPS)',
      items: selected.topsProjects ?? selected.goals ?? [],
      className: 'tops-card',
    },
    {
      title: '기타 사항',
      items: selected.otherNotes ?? [],
      className: 'other-notes-card',
    },
  ]
  const hasAnyContent =
    selected.blocks.length > 0 ||
    sections.some((section) => section.items.length > 0)

  const content = `<section class="review-content">
    <div class="person-header">
      <div class="person-identity"><h1>${escapeHtml(selected.name)}</h1><span class="part-badge">${escapeHtml(selected.part)}</span>${statusBadge(selected.status)}</div>
      <div class="ticket-chips">${['신규', '진행 중', '종료'].map((label, index) => `<div class="ticket-chip ticket-${index}"><span>${label}</span><strong>${selected.tickets[index]}</strong><small>${previous ? delta(selected.tickets[index], previous.tickets[index]) : '—'}</small></div>`).join('')}</div>
    </div>
    ${leaveNotice(selected)}
    <div class="review-scroll">
      ${!hasAnyContent ? emptyReview(selected.name) : ''}
      ${sections
        .filter((section) => section.items.length > 0)
        .map(
          (
            section,
          ) => `<article class="customer-card structured-review-card ${section.className}"><header><span class="accent-bar"></span><h2>${section.title}</h2><small>필수 항목</small></header>
        <div class="customer-body">${section.items.map((item) => `<div class="work-item"><span class="bullet">■</span><p>${escapeHtml(item)}</p></div>`).join('')}</div>
      </article>`,
        )
        .join('')}
    </div>
  </section>`

  const panel = `<aside class="review-panel">
    <div class="panel-heading"><span>리뷰 요약</span><button id="right-close" aria-label="리뷰 패널 접기">${icon('PanelRightClose', 17)}</button></div>
    <div class="comparison"><h3>지난주 대비</h3>
      ${['신규', '진행 중', '종료'].map((label, index) => `<div><span>${label}</span><small>${previous?.tickets[index] ?? '—'}</small><i>→</i><strong>${selected.tickets[index]}</strong><em>${previous ? delta(selected.tickets[index], previous.tickets[index]) : '—'}</em></div>`).join('')}
    </div>
    <div class="carry-over"><h3>지난주 계획</h3><p>${escapeHtml(previous?.actionItems?.join('\n') || '등록된 계획 없음')}</p></div>
    <div class="comment-area">
      <div class="comment-title"><h3>리뷰 코멘트</h3><span>${state.commentList.length}</span></div>
      <div class="comment-list">${state.commentList.map((comment) => `<div class="comment"><div><strong>${escapeHtml(comment.authorName)}</strong><span>${escapeHtml(new Date(comment.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</span></div><p>${escapeHtml(comment.body)}</p></div>`).join('')}</div>
      <textarea id="comment-draft" placeholder="코멘트를 입력하세요">${escapeHtml(state.commentDraft)}</textarea>
      <div class="comment-actions">
        <button class="primary" id="comment-add" ${!selected.reviewId || state.commentBusy ? 'disabled' : ''}>${icon('Send', 15)} 코멘트 등록</button>
        ${isAdminOrLead() ? `<button id="review-complete" ${selected.status !== '제출 완료' ? 'disabled' : ''}>${icon('Check', 15)} 검토 완료</button>` : ''}
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
  const ticketTotals = entries.reduce(
    (sum, entry) => sum.map((value, index) => value + entry.tickets[index]),
    [0, 0, 0],
  )
  const submitted = entries.filter(
    (entry) => entry.status !== '미작성' && entry.status !== '작성 중',
  ).length
  const reviewed = entries.filter(
    (entry) => entry.status === '검토 완료',
  ).length
  const previousTotals = state.previousEntries.reduce(
    (sum, entry) => sum.map((value, index) => value + entry.tickets[index]),
    [0, 0, 0],
  )
  const kpis = ['신규 티켓', '진행 중', '종료'].map((label, index) => [
    label,
    ticketTotals[index],
    state.previousEntries.length
      ? `지난주 대비 ${delta(ticketTotals[index], previousTotals[index])}`
      : '지난주 자료 없음',
  ])
  kpis.push([
    '회고 제출',
    `${submitted} / ${entries.length}`,
    `${reviewed}명 검토`,
  ])
  return `<main class="dashboard-view">
    <div class="page-heading"><div><span>TEAM OVERVIEW</span><h1>MSP 업무 현황</h1><p>${formatReviewRange(state.reviewEnd)} 기준</p></div></div>
    <div class="kpi-grid">${kpis.map(([label, value, delta], index) => `<article class="kpi-card kpi-${index}"><span>${label}</span><strong>${value}</strong><small>${delta}</small><div><i></i></div></article>`).join('')}</div>
    <div class="dashboard-grid">
      <section class="team-table"><header><h2>파트별 제출 현황</h2><span>총 ${entries.length}명</span></header>
        ${parts()
          .map((part) => {
            const members = entries.filter((entry) => entry.part === part)
            return `<div class="team-row"><strong>${escapeHtml(part)}</strong><span>${escapeHtml(members.map((member) => member.name).join(' · '))}</span><em>${members.filter((member) => ['제출 완료', '검토 완료'].includes(member.status)).length}/${members.length}</em></div>`
          })
          .join('')}
      </section>
      <section class="pending-card"><header><h2>확인이 필요한 회고</h2></header>
        ${entries
          .filter((entry) => entry.status !== '검토 완료')
          .map(
            (entry) =>
              `<button data-goto-person="${escapeAttr(entry.id)}"><span>${escapeHtml(entry.name)}<small>${escapeHtml(entry.part)}</small></span>${statusBadge(entry.status)}</button>`,
          )
          .join('')}
      </section>
    </div>
  </main>`
}

function editView() {
  const fields = [
    [
      'workHighlights',
      '주요 업무 현황',
      '이번 주 고객사 지원, 기술 대응과 완료한 핵심 업무를 작성합니다.',
      state.workHighlightsDraft,
    ],
    [
      'actionItems',
      '주요 계획 / Action Item',
      '다음 주에 실행하거나 계속 진행할 주요 행동을 작성합니다.',
      state.actionItemsDraft,
    ],
    [
      'topsProjects',
      '프로젝트/과제 현황(TOPS)',
      'TOPS에 연결된 프로젝트·과제의 현재 진척도와 다음 단계를 작성합니다.',
      state.topsProjectsDraft,
    ],
    [
      'otherNotes',
      '기타 사항',
      '고객사 변동, 리스크, 인수인계 등 별도 공유가 필요한 내용을 작성합니다.',
      state.otherNotesDraft,
    ],
  ]
  const ticketFields = [
    ['ticketsNew', '신규', state.ticketsNewDraft],
    ['ticketsInProgress', '진행 중', state.ticketsInProgressDraft],
    ['ticketsDone', '종료', state.ticketsDoneDraft],
  ]
  return `<main class="edit-view">
    <div class="edit-toolbar">
      <div><strong>${escapeHtml(authState.user?.name)}</strong><span class="part-badge">${escapeHtml(state.personalEntry?.part)}</span>${statusBadge(state.personalEntry?.status ?? '미작성')}</div>
      <div><span id="save-state">${state.saving ? '저장 중…' : state.dirty ? '저장하지 않은 변경 사항' : '변경 후 저장해 주세요'}</span><button id="load-previous" ${state.saving ? 'disabled' : ''}>지난주 내용 불러오기</button><button id="save-draft" ${state.saving ? 'disabled' : ''}>임시 저장</button><button class="primary" id="submit-review" ${state.saving ? 'disabled' : ''} aria-label="회고 제출하기">제출하기</button></div>
    </div>
    <div class="ticket-count-editor">
      <span class="ticket-count-editor-label">${icon('Ticket', 15)} 이번 주 티켓 현황 <em>Zendesk 연동 전까지 직접 입력합니다</em></span>
      <div class="ticket-count-inputs">
        ${ticketFields.map(([key, label, value]) => `<label>${label}<input ${state.saving ? 'disabled' : ''} type="number" min="0" step="1" inputmode="numeric" data-ticket-field="${key}" aria-label="${label} 티켓 수" value="${escapeAttr(value)}" placeholder="0"></label>`).join('')}
      </div>
    </div>
    <div class="editor-options view-switch"><button data-editor-mode="grid" aria-pressed="${state.editorMode === 'grid'}">나란히 쓰기</button><button data-editor-mode="list" aria-pressed="${state.editorMode === 'list'}">세로로 쓰기</button><span>빈 항목은 제출 시 ‘특이사항 없음’으로 저장됩니다.</span></div>
    <div class="structured-editor edit-space-first editor-${state.editorMode}">
      <div class="required-review-grid four-columns">
        ${fields
          .map(
            ([
              key,
              label,
              desc,
              value,
            ]) => `<label class="${state.requiredFieldErrors[key] ? 'review-field invalid' : 'review-field'}">
          <span><strong>${label}</strong><button type="button" data-clear-field="${key}" ${state.saving ? 'disabled' : ''}>비우기</button></span>
          <small>${desc}</small>
          <textarea ${state.saving ? 'disabled' : ''} data-field="${key}" aria-label="${label}">${escapeHtml(value)}</textarea>
          ${state.requiredFieldErrors[key] ? '<b>필수 항목을 입력해 주세요.</b>' : ''}
        </label>`,
          )
          .join('')}
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
        <div><span>MONTHLY SUMMARY</span><h2 id="monthly-output-title">${output.title}</h2><p>선택한 달에 종료되는 주의 제출·검토 완료 회고를 집계합니다. 티켓 처리 건수는 종료 티켓만 합산합니다.</p></div>
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
  return state.toast
    ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>`
    : ''
}

function showToast(message) {
  state.toast = message
  render()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    state.toast = ''
    render()
  }, 2200)
}

async function switchView(view) {
  if (managementDrafts[state.view]?.[2]()) {
    history.replaceState(
      null,
      '',
      `${location.pathname}${location.search}#${state.view}`,
    )
    return
  }
  if (view !== state.view && managementDrafts[state.view]?.[0]()) {
    if (
      !window.confirm('저장하지 않은 입력이 있습니다. 변경 내용을 버릴까요?')
    ) {
      history.replaceState(
        null,
        '',
        `${location.pathname}${location.search}#${state.view}`,
      )
      return
    }
    managementDrafts[state.view][1]()
  }
  if (view !== state.view && state.view === 'edit') {
    if (!confirmDiscard()) {
      history.replaceState(
        null,
        '',
        `${location.pathname}${location.search}#${state.view}`,
      )
      return
    }
    state.dirty = false
    hydrateDraft()
  }
  state.view = view
  if (location.hash.replace('#', '') !== view) location.hash = view
  const loader = viewLoaders[view]
  await loadSession()
  if (!session.user) {
    render()
    return
  }
  if (loader) await loader()
  else if (['edit', 'review', 'dashboard'].includes(view))
    await ensureReviewEntries()
  render()
}

window.addEventListener('beforeunload', (event) => {
  if (state.dirty || state.saving || managementDrafts[state.view]?.[0]()) {
    event.preventDefault()
    event.returnValue = ''
  }
})

window.addEventListener('hashchange', () => {
  const view = viewFromHash()
  if (view !== state.view) switchView(view)
})

document.addEventListener('click', () => {
  if (state.settingsOpen) {
    state.settingsOpen = false
    render()
  }
})

function bindEvents(root) {
  root.querySelector('#profile-open')?.addEventListener('click', async () => {
    if (state.profileBusy || (state.profile && !confirm('입력한 내용을 서버의 정보로 다시 불러올까요?'))) return
    state.profileBusy = true
    state.profileMessage = ''
    render()
    try { state.profile = await api('/api/profile') }
    catch (error) { state.profileMessage = error.message }
    finally { state.profileBusy = false; render() }
  })
  for (const [id, field] of [['profile-email', 'email'], ['profile-joined', 'joinedOn']])
    root.querySelector(`#${id}`)?.addEventListener('input', (event) => { state.profile[field] = event.target.value })
  root.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (state.profileBusy) return
    state.profileBusy = true
    state.profileMessage = ''
    render()
    try {
      state.profile = await api('/api/profile', { method: 'PUT', body: JSON.stringify(state.profile) })
      state.profileMessage = '내 정보를 저장했습니다.'
      if (['review', 'dashboard', 'edit'].includes(state.view)) await ensureReviewEntries()
      if (state.view === 'organization') await loadOrganization()
    } catch (error) { state.profileMessage = error.message }
    finally { state.profileBusy = false; render() }
  })
  root.querySelectorAll('[data-review-mode]').forEach((button) => button.addEventListener('click', () => {
    state.reviewMode = button.dataset.reviewMode
    render()
  }))
  root.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', () => {
    state.reviewMode = 'single'
    state.selectedName = button.dataset.openReview
    state.commentDraft = ''
    loadComments()
    render()
  }))
  root.querySelectorAll('[data-editor-mode]').forEach((button) => button.addEventListener('click', () => {
    state.editorMode = button.dataset.editorMode
    localStorage.setItem('msp-editor-mode', state.editorMode)
    render()
  }))
  root.querySelectorAll('[data-clear-field]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault()
    if (state.saving) return
    const field = button.dataset.clearField
    if (state[`${field}Draft`] && !confirm('이 항목의 내용을 비울까요? 저장 전까지 서버에는 반영되지 않습니다.')) return
    state[`${field}Draft`] = ''
    state.dirty = true
    render()
  }))
  root.querySelector('#retry-reviews')?.addEventListener('click', () => {
    if (confirmDiscard()) {
      state.dirty = false
      ensureReviewEntries()
    }
  })
  root
    .querySelectorAll('[data-view]')
    .forEach((btn) =>
      btn.addEventListener('click', () => switchView(btn.dataset.view)),
    )
  root.querySelector('#query-input')?.addEventListener('input', (event) => {
    state.query = event.target.value
    render()
    root.querySelector('#query-input')?.focus()
  })
  root.querySelector('#settings-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation()
    state.settingsOpen = !state.settingsOpen
    render()
  })
  root
    .querySelector('.settings-popover')
    ?.addEventListener('click', (event) => event.stopPropagation())
  root.querySelector('#theme-toggle')?.addEventListener('click', () => {
    state.light = !state.light
    localStorage.setItem('msp-theme', state.light ? 'light' : 'dark')
    render()
  })
  root.querySelector('#slack-share')?.addEventListener('click', async () => {
    try {
      const url = new URL(location.href)
      url.searchParams.set('week', state.reviewEnd)
      url.hash = 'review'
      await navigator.clipboard.writeText(url.toString())
      showToast('Slack에 붙여 넣을 회고 링크를 복사했습니다.')
    } catch {
      showToast('복사하지 못했습니다. 브라우저 주소를 직접 복사해 주세요.')
    }
  })
  root
    .querySelector('#week-prev')
    ?.addEventListener('click', () =>
      changeWeek(moveReviewWeek(state.reviewEnd, -1)),
    )
  root
    .querySelector('#week-next')
    ?.addEventListener('click', () =>
      changeWeek(moveReviewWeek(state.reviewEnd, 1)),
    )
  root
    .querySelector('#week-today')
    ?.addEventListener('click', () => changeWeek(getCurrentReviewEnd()))
  root.querySelector('#date-toggle')?.addEventListener('click', () => {
    state.dateOpen = !state.dateOpen
    render()
  })
  root
    .querySelectorAll('[data-week]')
    .forEach((btn) =>
      btn.addEventListener('click', () => changeWeek(btn.dataset.week)),
    )
  root.querySelector('#output-open')?.addEventListener('click', async () => {
    const week = state.reviewEnd
    try {
      root.querySelector('#output-open').disabled = true
      const snapshots = await Promise.all(
        weeksInMonth(week).map(async (reviewEnd) => {
          const entries = (await loadReviewEntries(reviewEnd)).filter((entry) =>
            ['제출 완료', '검토 완료'].includes(entry.status),
          )
          return {
            reviewEnd,
            entries,
            totalTickets: entries.reduce(
              (total, entry) => total + entry.tickets[2],
              0,
            ),
          }
        }),
      )
      if (week !== state.reviewEnd) return
      state.reviewSnapshots = snapshots
      state.outputOpen = true
      render()
    } catch (error) {
      showToast(error.message)
    }
  })
  root.querySelector('#output-close')?.addEventListener('click', () => {
    state.outputOpen = false
    render()
  })
  root
    .querySelector('#output-overlay')
    ?.addEventListener('mousedown', (event) => {
      if (event.target === event.currentTarget) {
        state.outputOpen = false
        render()
      }
    })
  root
    .querySelector('#font-scale-input')
    ?.addEventListener('input', (event) => {
      state.fontScale = Number(event.target.value)
      localStorage.setItem('msp-font-scale', String(state.fontScale))
      document.documentElement.style.setProperty('--font-scale', state.fontScale / 100)
      root.querySelector('.settings-font-scale em').textContent = `${state.fontScale}%`
    })
  root.querySelector('#left-close')?.addEventListener('click', () => {
    state.leftOpen = false
    render()
  })
  root.querySelector('#left-open')?.addEventListener('click', () => {
    state.leftOpen = true
    render()
  })
  root.querySelector('#right-close')?.addEventListener('click', () => {
    state.rightOpen = false
    render()
  })
  root.querySelector('#right-open')?.addEventListener('click', () => {
    state.rightOpen = true
    render()
  })
  root.querySelectorAll('[data-person]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.selectedName = btn.dataset.person
      state.commentDraft = ''
      loadComments()
      render()
    }),
  )
  root.querySelectorAll('[data-goto-person]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.selectedName = btn.dataset.gotoPerson
      state.commentDraft = ''
      switchView('review')
      loadComments()
    }),
  )
  root
    .querySelector('#auth-logout')
    ?.addEventListener('click', async (event) => {
      event.preventDefault()
      if (confirmDiscard()) location.href = '/auth/logout'
    })
  root.querySelector('#comment-draft')?.addEventListener('input', (event) => {
    state.commentDraft = event.target.value
  })
  root
    .querySelector('#comment-add')
    ?.addEventListener('click', async (event) => {
      const text = state.commentDraft.trim()
      const id = selectedEntry()?.reviewId
      if (!text || !id || state.commentBusy) return
      state.commentBusy = true
      event.currentTarget.disabled = true
      try {
        await api(`/api/reviews/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: text }),
        })
        if (id === selectedEntry()?.reviewId) {
          if (state.commentDraft.trim() === text) state.commentDraft = ''
          await loadComments()
        }
        showToast('코멘트를 등록했습니다.')
      } catch (error) {
        showToast(error.message)
      } finally {
        state.commentBusy = false
        render()
      }
    })
  root
    .querySelector('#review-complete')
    ?.addEventListener('click', async (event) => {
      const entry = selectedEntry()
      event.currentTarget.disabled = true
      try {
        await api(`/api/reviews/${entry.reviewId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ version: entry.version }),
        })
        await ensureReviewEntries()
        showToast('검토 완료로 변경했습니다.')
      } catch (error) {
        showToast(error.message)
      }
    })
  root.querySelectorAll('[data-field]').forEach((el) =>
    el.addEventListener('input', (event) => {
      const key = el.dataset.field
      state[`${key}Draft`] = event.target.value
      state.dirty = true
      root.querySelector('#save-state').textContent = '저장하지 않은 변경 사항'
      state.requiredFieldErrors[key] = false
    }),
  )
  root.querySelectorAll('[data-ticket-field]').forEach((el) =>
    el.addEventListener('input', (event) => {
      state[`${el.dataset.ticketField}Draft`] = event.target.value
      state.dirty = true
      root.querySelector('#save-state').textContent = '저장하지 않은 변경 사항'
    }),
  )
  if (state.view === 'customers') bindCustomers(root, render)
  if (state.view === 'schedule') bindSchedule(root, render)
  if (state.view === 'comp-leave') bindCompLeave(root, render)
  if (state.view === 'organization') bindOrganization(root, render)
  root.querySelector('#load-previous')?.addEventListener('click', async () => {
    if (!confirmDiscard()) return
    const week = state.reviewEnd
    const draftBefore = JSON.stringify(
      [...reviewFields, ...ticketFields].map((field) => state[`${field}Draft`]),
    )
    try {
      const entries = await loadReviewEntries(moveReviewWeek(week, -1), true)
      if (week !== state.reviewEnd) return
      if (
        draftBefore !==
        JSON.stringify(
          [...reviewFields, ...ticketFields].map(
            (field) => state[`${field}Draft`],
          ),
        )
      )
        return showToast(
          '불러오는 동안 내용이 변경되어 기존 입력을 유지했습니다.',
        )
      const entry = entries.find((item) => item.id === authState.user.userId)
      if (!entry?.reviewId) return showToast('지난주에 저장한 회고가 없습니다.')
      const version = state.version
      hydrateDraft(entry)
      state.version = version
      state.dirty = true
      render()
    } catch (error) {
      showToast(error.message)
    }
  })
  root
    .querySelector('#save-draft')
    ?.addEventListener('click', () => saveReview('draft'))
  root
    .querySelector('#submit-review')
    ?.addEventListener('click', () => saveReview('submitted'))
}

async function saveReview(status) {
  if (state.saving || !state.entriesLoaded) return
  state.requiredFieldErrors = {}
  const tickets = ticketFields.map((field) =>
    Number(state[`${field}Draft`] || 0),
  )
  if (tickets.some((value) => !Number.isSafeInteger(value) || value < 0))
    return showToast('티켓 수는 0 이상의 정수로 입력해 주세요.')
  state.saving = true
  render()
  try {
    const saved = await api('/api/reviews', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: authState.user.userId,
        weekEnd: state.reviewEnd,
        status,
        version: state.version,
        workHighlights: state.workHighlightsDraft,
        actionItems: state.actionItemsDraft,
        topsProjects: state.topsProjectsDraft,
        otherNotes: state.otherNotesDraft,
        ticketsNew: tickets[0],
        ticketsInProgress: tickets[1],
        ticketsDone: tickets[2],
      }),
    })
    state.version = saved.version
    state.dirty = false
    await ensureReviewEntries()
    showToast(
      status === 'submitted'
        ? '회고를 제출했습니다.'
        : '회고를 임시 저장했습니다.',
    )
  } catch (error) {
    showToast(error.message)
  } finally {
    state.saving = false
    render()
  }
}

async function init() {
  await loadSession()
  render()
  if (authState.user) {
    await ensureReviewEntries()
    const loader = viewLoaders[state.view]
    if (loader) {
      await loader()
      render()
    }
  }
}

init()
