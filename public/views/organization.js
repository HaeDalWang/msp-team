// 원본 prototype(src/ManagementViews.tsx OrganizationManagementView)의 DOM 구조를 그대로 옮긴 것.
// 실제 PostgreSQL API(GET /api/organization, POST /api/organization/parts, PUT /api/organization/users/:id)에 연결되어 있으며, 실패 시에만 mock으로 fallback한다.
// 파트/역할 수정 및 파트 추가는 admin만 가능하다(서버도 동일 규칙으로 재검증함).
import { icon } from '../icons.js'
import { entries as mockEntries } from '../data.js'
import { session, isAdmin } from '../session.js'

const workHours = {
  이주엽: '09:00 - 18:00', 정장훈: '10:00 - 19:00', 김이현: '09:00 - 18:00', 임종현: '08:30 - 17:30',
  김범중: '10:00 - 19:00', 김성호: '08:00 - 17:00', 배승도: '09:00 - 18:00', 서채운: '09:00 - 18:00',
  이용태: '08:00 - 17:00', 송민석: '09:00 - 18:00', 권하빈: '08:00 - 17:00', 조수현: '08:30 - 17:30', 정지우: '09:00 - 18:00',
}
const roleDbToLabel = { engineer: '엔지니어', lead: '팀장', executive: '상무', admin: '관리자' }
const roleLabelToDb = { 엔지니어: 'engineer', 팀장: 'lead', 상무: 'executive', 관리자: 'admin' }
const roles = ['엔지니어', '팀장', '상무', '관리자']

const mockParts = [
  { id: 'leaf', name: 'Leaf', color: '#f6a612' },
  { id: 'tiger', name: 'Tiger', color: '#d76a20' },
  { id: 'dragon', name: 'Dragon', color: '#986ce3' },
]

const state = {
  editMode: false,
  partManagerOpen: false,
  newPartName: '',
  parts: mockParts,
  members: mockEntries.map((entry) => ({
    userId: `mock-${entry.name}`, version: 1, name: entry.name,
    partId: mockParts.find((part) => part.name === entry.part)?.id ?? mockParts[0].id,
    role: entry.name === '이주엽' ? '팀장' : entry.name === '배승도' ? '관리자' : '엔지니어',
    hours: workHours[entry.name],
    email: `${entry.name === '배승도' ? 'seungdo.bae' : entry.name.toLowerCase()}@csg.example`,
  })),
  apiError: '',
}

export async function loadOrganization() {
  try {
    const response = await fetch('/api/organization')
    if (!response.ok) throw new Error('load failed')
    const body = await response.json()
    state.parts = body.parts.length ? body.parts : mockParts
    state.members = Object.entries(body.users).map(([userId, user]) => ({
      userId, version: user.version, name: user.name, partId: user.partId,
      role: roleDbToLabel[user.role] ?? '엔지니어', hours: workHours[user.name] ?? '09:00 - 18:00', email: `${userId}@csg.example`,
    }))
    state.apiError = ''
  } catch {
    state.apiError = '조직 데이터를 불러오지 못했습니다.'
  }
}

export function renderOrganization() {
  const canEdit = isAdmin()
  const editMode = canEdit && state.editMode
  return `<main class="management-page organization-management">
    <div class="management-heading">
      <div><span class="eyebrow">ORGANIZATION ADMIN</span><h1>조직 및 권한 관리</h1><p>파트 이동, 역할, 시차 출근 정보를 한 곳에서 관리합니다.</p></div>
      <div class="heading-actions">
        ${canEdit ? `<button id="part-manager-toggle">${icon('Building2', 16)} 파트 관리</button>
        <button id="edit-mode-toggle">${icon(editMode ? 'Eye' : 'Pencil', 16)}${editMode ? '열람 모드' : '수정 모드'}</button>
        <button class="primary">${icon('Save', 16)} 변경사항 저장</button>` : ''}
      </div>
    </div>
    ${state.apiError ? `<div class="comp-api-error" role="alert">${state.apiError}</div>` : ''}
    ${editMode && state.partManagerOpen ? `<section class="part-manager-panel">
      <header><div>${icon('Building2', 17)}<strong>파트 관리</strong></div><span>파트 이름을 바꾸면 소속 구성원 정보에도 즉시 반영됩니다.</span></header>
      <div class="part-manager-list">
        ${state.parts.map((part) => `<label>
          <i style="background:${part.color ?? '#5fa8ff'}"></i><span>파트 이름</span>
          <input data-rename-part="${part.id}" aria-label="${part.name} 파트 이름 변경" value="${part.name}">
          <button ${state.members.some((member) => member.partId === part.id) ? 'disabled' : ''}>비활성화</button>
        </label>`).join('')}
        <label class="new-part-row"><i></i><span>새 파트</span><input id="new-part-name" aria-label="새 파트 이름" value="${state.newPartName}" placeholder="예: Platform"><button id="add-part">${icon('Plus', 14)} 파트 추가</button></label>
      </div>
    </section>` : ''}
    <div class="permission-banner">${icon('ShieldCheck', 20)}<div><strong>열람: CSG MSP 전체</strong><span>수정: 관리자만</span></div><em>${icon('LockKeyhole', 14)} 현재 ${roleDbToLabel[session.user?.role] ?? '알 수 없음'}(${canEdit ? '수정 가능' : '열람만 가능'}) 권한으로 접속 중</em></div>
    <div class="org-summary">
      <div>${icon('UsersRound', 19)}<span>전체 인원<strong>${state.members.length}명</strong></span></div>
      <div>${icon('ArrowRightLeft', 19)}<span>이번 달 파트 이동<strong>2건</strong></span></div>
      <div>${icon('Crown', 19)}<span>관리 권한자<strong>${state.members.filter((member) => member.role !== '엔지니어').length}명</strong></span></div>
      ${canEdit ? `<button>${icon('Plus', 16)} 구성원 추가</button>` : ''}
    </div>
    <div class="org-columns">
      ${['무소속', ...state.parts.map((part) => part.name)].filter((name, index, list) => list.indexOf(name) === index).map((partName) => {
        const part = state.parts.find((item) => item.name === partName)
        const members = state.members.filter((member) => (part ? member.partId === part.id : !member.partId))
        if (!part && !members.length) return ''
        return `<section class="org-column">
        <header><div><span class="part-color" style="background:${part?.color ?? '#5f6672'}"></span><h2>${partName}</h2></div><span>${members.length}명</span></header>
        <div class="member-list">
          ${members.map((member) => `<article class="member-card">
            <div class="member-avatar">${member.name.slice(-1)}</div>
            <div class="member-info"><div><h3>${member.name}</h3>${member.role !== '엔지니어' ? `<span>${member.role}</span>` : ''}</div><p>${member.email}</p><small>${icon('Clock', 13)} ${member.hours}</small></div>
            <div class="member-controls">
              <label>파트<select data-member="${member.userId}" data-field="partId" aria-label="소속 파트 변경" ${editMode ? '' : 'disabled'}>${state.parts.map((option) => `<option value="${option.id}" ${member.partId === option.id ? 'selected' : ''}>${option.name}</option>`).join('')}</select></label>
              <label>역할<select data-member="${member.userId}" data-field="role" aria-label="역할 변경" ${editMode ? '' : 'disabled'}>${roles.map((option) => `<option ${member.role === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>
            </div>
          </article>`).join('')}
        </div>
      </section>`
      }).join('')}
    </div>
    <section class="change-history">
      <header><h2>최근 조직 변경</h2><button>전체 이력</button></header>
      <div><span class="history-icon">${icon('ArrowRightLeft', 15)}</span><p><strong>김이현</strong>님이 Dragon에서 Leaf로 이동했습니다.</p><time>2026.08.17 · 배승도</time></div>
      <div><span class="history-icon">${icon('UserCog', 15)}</span><p><strong>배승도</strong>님에게 관리자 권한이 부여되었습니다.</p><time>2026.08.12 · 이주엽</time></div>
    </section>
  </main>`
}

export function bindOrganization(root, rerender) {
  const canEdit = isAdmin()
  root.querySelector('#part-manager-toggle')?.addEventListener('click', () => { state.partManagerOpen = !state.partManagerOpen; rerender() })
  root.querySelector('#edit-mode-toggle')?.addEventListener('click', () => { state.editMode = !state.editMode; rerender() })
  root.querySelectorAll('[data-rename-part]').forEach((input) => input.addEventListener('input', (event) => {
    if (!canEdit) return
    const id = input.dataset.renamePart
    state.parts = state.parts.map((part) => part.id === id ? { ...part, name: event.target.value } : part)
    rerender()
  }))
  root.querySelector('#new-part-name')?.addEventListener('input', (event) => { state.newPartName = event.target.value })
  root.querySelector('#add-part')?.addEventListener('click', async () => {
    if (!canEdit) return
    const name = state.newPartName.trim()
    if (!name || state.parts.some((part) => part.name.toLowerCase() === name.toLowerCase())) return
    try {
      const response = await fetch('/api/organization/parts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
      const created = await response.json()
      state.parts = [...state.parts, { id: created.id, name, color: '#5fa8ff' }]
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    state.newPartName = ''
    rerender()
  })
  root.querySelectorAll('[data-member]').forEach((select) => select.addEventListener('change', async (event) => {
    if (!canEdit) return
    const userId = select.dataset.member
    const field = select.dataset.field
    const member = state.members.find((item) => item.userId === userId)
    if (!member) return
    const value = event.target.value
    try {
      const body = field === 'role' ? { role: roleLabelToDb[value], version: member.version } : { partId: value, version: member.version }
      const response = await fetch(`/api/organization/users/${encodeURIComponent(userId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (response.status === 409) { await loadOrganization(); rerender(); return }
      state.members = state.members.map((item) => item.userId === userId ? { ...item, [field]: value, version: item.version + 1 } : item)
    } catch { /* API 실패 시 화면은 이전 상태를 유지한다 */ }
    rerender()
  }))
}
