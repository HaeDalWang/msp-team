import { icon } from '../icons.js'
import { session, isAdmin } from '../session.js'
import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'

const roles = {
  engineer: '엔지니어',
  lead: '팀장',
  executive: '상무',
  admin: '관리자',
}
const state = {
  parts: [],
  members: [],
  error: '',
  busy: false,
  manager: false,
  newPart: '',
  partNames: {},
  partOrders: {},
  editing: null,
  draft: {},
}
export const organizationDirty = () =>
  Boolean(
    state.editing ||
    state.newPart ||
    Object.keys(state.partNames).length ||
    Object.keys(state.partOrders).length ||
    state.busy,
  )
export const discardOrganization = () => {
  state.editing = null
  state.newPart = ''
  state.partNames = {}
  state.partOrders = {}
}
export const organizationBusy = () => state.busy
export async function loadOrganization() {
  try {
    const body = await api('/api/organization')
    state.parts = body.parts
    state.members = Object.entries(body.users).map(([userId, user]) => ({
      ...user,
      userId,
    }))
    state.error = ''
  } catch (error) {
    state.error = error.message
  }
}
function memberForm() {
  const draft = state.draft
  return `<section class="part-manager-panel"><h2>${state.editing === 'new' ? '구성원 추가' : '구성원 수정'}</h2><form id="member-form" class="holiday-form">
    <label>이름<input data-member-field="name" required maxlength="100" value="${h(draft.name)}"></label>
    <label>Slack 사용자 ID<input data-member-field="slackUserId" required pattern="[UW][A-Z0-9]+" title="Slack 프로필의 멤버 ID를 입력하세요" value="${h(draft.slackUserId ?? '')}"><small>Slack 프로필 → 더 보기 → 멤버 ID 복사</small></label>
    <label>입사일<input data-member-field="joinedOn" type="date" value="${h(draft.joinedOn ?? '')}"><small>빠른 입사일 순으로 발표합니다. 미등록자는 뒤에 표시됩니다.</small></label>
    <label>이메일<input data-member-field="email" type="email" value="${h(draft.email ?? '')}"></label>
    <label>파트<select data-member-field="partId"><option value="">무소속</option>${state.parts.map((part) => `<option value="${h(part.id)}" ${part.id === draft.partId ? 'selected' : ''}>${h(part.name)}</option>`).join('')}</select></label>
    <label>역할<select data-member-field="role">${Object.entries(roles)
      .map(
        ([value, label]) =>
          `<option value="${value}" ${draft.role === value ? 'selected' : ''}>${label}</option>`,
      )
      .join('')}</select></label>
    <label>출근<input data-member-field="workStart" type="time" required value="${h(draft.workStart ?? '09:00')}"></label><label>퇴근<input data-member-field="workEnd" type="time" required value="${h(draft.workEnd ?? '18:00')}"></label>
    ${state.editing !== 'new' ? `<label><input data-member-field="active" type="checkbox" ${draft.active !== false ? 'checked' : ''}> 활성 구성원 (해제하면 로그인 차단)</label>` : ''}
    <button class="primary" ${state.busy ? 'disabled' : ''}>저장</button><button type="button" id="member-cancel" ${state.busy ? 'disabled' : ''}>취소</button></form></section>`
}
export function renderOrganization() {
  const canEdit = isAdmin()
  return `<main class="management-page organization-management"><div class="management-heading"><div><span class="eyebrow">ORGANIZATION ADMIN</span><h1>조직 및 권한 관리</h1><p>파트 발표 순서, 입사일, 역할과 출퇴근 시간을 관리합니다.</p></div><div class="heading-actions">${canEdit ? `<button id="part-manager-toggle">파트 관리</button><button id="member-add" class="primary" ${state.busy ? 'disabled' : ''}>구성원 추가</button>` : ''}</div></div>
    ${state.error ? `<div class="comp-api-error" role="alert">${h(state.error)} <button id="organization-retry">다시 조회</button></div>` : ''}
    <div class="permission-banner">${icon('ShieldCheck', 20)}<div><strong>팀 구성원 열람</strong><span>수정: 관리자</span></div><em>현재 ${h(roles[session.user?.role] ?? '알 수 없음')}</em></div>
    ${canEdit && state.manager ? `<section class="part-manager-panel"><h2>파트 관리</h2><p>소속 구성원이 없는 파트만 삭제할 수 있습니다.</p><div class="part-manager-list">${state.parts.map((part) => `<form data-part-form="${h(part.id)}"><label>파트 이름<input data-part-name="${h(part.id)}" required maxlength="100" value="${h(state.partNames[part.id] ?? part.name)}"></label><label>발표 순서<input data-part-order="${h(part.id)}" type="number" min="0" step="1" value="${h(state.partOrders[part.id] ?? part.sortOrder ?? 0)}"></label><button ${state.busy ? 'disabled' : ''}>저장</button><button type="button" data-delete-part="${h(part.id)}" ${state.busy || state.members.some((member) => member.partId === part.id) ? 'disabled' : ''}>삭제</button></form>`).join('')}<form id="part-add-form"><label>새 파트<input id="new-part-name" required maxlength="100" value="${h(state.newPart)}"></label><button ${state.busy ? 'disabled' : ''}>추가</button></form></div></section>` : ''}
    ${canEdit && state.editing ? memberForm() : ''}
    <div class="org-summary"><div><span>활성 구성원<strong>${state.members.filter((member) => member.active !== false).length}명</strong></span></div><div><span>파트<strong>${state.parts.length}개</strong></span></div><div><span>관리자<strong>${state.members.filter((member) => member.role === 'admin' && member.active !== false).length}명</strong></span></div></div>
    <div class="org-columns">${[{ id: null, name: '무소속' }, ...state.parts]
      .map((part) => {
        const members = state.members.filter(
          (member) => (member.partId ?? null) === part.id,
        )
        return `<section class="org-column"><header><h2>${h(part.name)}</h2><span>${members.length}명</span></header><div class="member-list">${members.map((member) => `<article class="member-card"><div class="member-avatar">${h(member.name.slice(-1))}</div><div class="member-info"><div><h3>${h(member.name)}</h3><span>${h(roles[member.role] ?? member.role)}${member.active === false ? ' · 비활성' : ''}</span></div><p>${h(member.email || '이메일 미등록')}</p><small>입사일 ${h(member.joinedOn || '미등록')} · ${h(member.workStart ?? '')}–${h(member.workEnd ?? '')}</small></div>${canEdit ? `<button data-edit-member="${h(member.userId)}" ${state.busy ? 'disabled' : ''}>수정</button>` : ''}</article>`).join('') || '<p>구성원이 없습니다.</p>'}</div></section>`
      })
      .join('')}</div></main>`
}
export function bindOrganization(root, rerender) {
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
      await loadOrganization()
    } catch (error) {
      state.error = error.message
    } finally {
      state.busy = false
      rerender()
    }
  }
  root
    .querySelector('#organization-retry')
    ?.addEventListener('click', () => run(async () => {}))
  if (!isAdmin()) return
  root.querySelector('#part-manager-toggle')?.addEventListener('click', () => {
    state.manager = !state.manager
    rerender()
  })
  const canReplace = () =>
    !state.busy &&
    (!state.editing || confirm('입력 중인 구성원 변경 내용을 버릴까요?'))
  root.querySelector('#member-add')?.addEventListener('click', () => {
    if (!canReplace()) return
    state.editing = 'new'
    state.draft = {
      name: '',
      slackUserId: '',
      email: '',
      role: 'engineer',
      partId: null,
      workStart: '09:00',
      workEnd: '18:00',
      active: true,
    }
    rerender()
  })
  root.querySelectorAll('[data-edit-member]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!canReplace()) return
      state.editing = button.dataset.editMember
      state.draft = {
        ...state.members.find((member) => member.userId === state.editing),
      }
      rerender()
    }),
  )
  root.querySelector('#member-cancel')?.addEventListener('click', () => {
    state.editing = null
    rerender()
  })
  root.querySelectorAll('[data-member-field]').forEach((input) =>
    input.addEventListener('input', (event) => {
      state.draft[input.dataset.memberField] =
        input.type === 'checkbox' ? event.target.checked : event.target.value
    }),
  )
  root.querySelector('#member-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    run(async () => {
      const creating = state.editing === 'new'
      await api(
        creating
          ? '/api/organization/users'
          : `/api/organization/users/${encodeURIComponent(state.editing)}`,
        {
          method: creating ? 'POST' : 'PUT',
          body: JSON.stringify({
            ...state.draft,
            partId: state.draft.partId || null,
          }),
        },
      )
      state.editing = null
    })
  })
  root.querySelectorAll('[data-part-order]').forEach((input) => input.addEventListener('input', (event) => {
    state.partOrders[input.dataset.partOrder] = event.target.value
  }))
  root.querySelectorAll('[data-part-name]').forEach((input) =>
    input.addEventListener('input', (event) => {
      state.partNames[input.dataset.partName] = event.target.value
    }),
  )
  root.querySelectorAll('[data-part-form]').forEach((form) =>
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const id = form.dataset.partForm
      const name =
        state.partNames[id] ?? state.parts.find((part) => part.id === id)?.name
      run(async () => {
        await api(`/api/organization/parts/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), sortOrder: Number(state.partOrders[id] ?? state.parts.find((part) => part.id === id)?.sortOrder ?? 0) }),
        })
        delete state.partNames[id]
        delete state.partOrders[id]
      })
    }),
  )
  root.querySelectorAll('[data-delete-part]').forEach((button) =>
    button.addEventListener('click', () => {
      if (confirm('이 빈 파트를 삭제할까요?'))
        run(() =>
          api(
            `/api/organization/parts/${encodeURIComponent(button.dataset.deletePart)}`,
            { method: 'DELETE' },
          ),
        )
    }),
  )
  root.querySelector('#new-part-name')?.addEventListener('input', (event) => {
    state.newPart = event.target.value
  })
  root.querySelector('#part-add-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    run(async () => {
      await api('/api/organization/parts', {
        method: 'POST',
        body: JSON.stringify({ name: state.newPart.trim() }),
      })
      state.newPart = ''
    })
  })
}
