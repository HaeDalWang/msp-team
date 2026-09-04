// 원본 prototype(src/ManagementViews.tsx CustomerManagementView)의 DOM 구조를 그대로 옮긴 것.
// 실제 PostgreSQL API(GET/POST /api/customers)에 연결되어 있으며, 실패 시에만 mock으로 fallback한다.
// 고객사 추가는 본인 카럼 또는 admin·lead만 가능하다(서버도 동일 규칙으로 재검증함).
import { icon } from '../icons.js'
import { isSelfOrAdminOrLead } from '../session.js'

const mockOwners = [
  { userId: 'lee-juyeop', name: '이주엽', part: 'Leaf', customers: [
    { id: 'mock-1', name: '이지샵(주)', since: '2022-01-01', services: ['Enterprise Care'] },
    { id: 'mock-2', name: '(주)인피니솔루션', since: '2023-04-01', services: ['Advanced Care'] },
  ] },
  { userId: 'kim-beomjung', name: '김범중', part: 'Tiger', customers: [
    { id: 'mock-3', name: '케이비자산운용_DI', since: '2022-06-01', services: ['Advanced Care'] },
  ] },
  { userId: 'bae-seungdo', name: '배승도', part: 'Tiger', customers: [
    { id: 'mock-4', name: '이동의즐거움', since: '2022-09-01', services: ['MCR', 'Enterprise Care'] },
    { id: 'mock-5', name: '리파인', since: '2023-07-01', services: ['Advanced Care'] },
  ] },
]

const state = { query: '', owners: mockOwners, loaded: false, addOpen: null, newName: '', newServices: '' }

export async function loadCustomers() {
  try {
    const response = await fetch('/api/customers')
    if (!response.ok) throw new Error('load failed')
    const body = await response.json()
    state.owners = body.owners
    state.loaded = true
  } catch {
    state.owners = mockOwners
    state.loaded = false
  }
}

function serviceBadge(service) {
  return `<span class="service-badge service-${service.toLowerCase().replaceAll(' ', '-')}">${service}</span>`
}

function formatSince(value) {
  if (!value) return ''
  return String(value).slice(0, 7).replace('-', '.')
}

function visibleOwners() {
  const q = state.query.trim().toLowerCase()
  if (!q) return state.owners
  return state.owners
    .map((owner) => ({ ...owner, customers: owner.customers.filter((customer) => `${owner.name} ${owner.part} ${customer.name} ${customer.services.join(' ')}`.toLowerCase().includes(q)) }))
    .filter((owner) => owner.customers.length)
}

export function renderCustomers() {
  const owners = visibleOwners()
  const totalCustomers = state.owners.reduce((sum, owner) => sum + owner.customers.length, 0)
  const multiOwner = state.owners.filter((owner) => owner.customers.length > 1).length
  return `<main class="management-page customer-management">
    <div class="management-heading">
      <div><span class="eyebrow">MSP MANAGEMENT</span><h1>담당 고객사 관리</h1><p>엔지니어별 담당 고객사와 서비스 등급을 한눈에 확인합니다.</p></div>
      <div class="heading-actions"><button class="primary">${icon('Save', 16)} 변경사항 저장</button></div>
    </div>
    <div class="management-summary">
      <div>${icon('Building2', 18)}<span>담당 고객사<strong>${totalCustomers}</strong></span></div>
      <div>${icon('UsersRound', 18)}<span>담당 엔지니어<strong>${state.owners.length}</strong></span></div>
      <div>${icon('BriefcaseBusiness', 18)}<span>다중 담당 고객사<strong>${multiOwner}</strong></span></div>
      <label>${icon('Search', 16)}<input id="customers-query" value="${state.query}" placeholder="고객사·담당자 검색"></label>
      <button class="filter-button">${icon('SlidersHorizontal', 16)} 필터</button>
    </div>
    <div class="owner-board">
      ${owners.map((owner) => `<section class="owner-column">
        <header><div><span class="part-badge">${owner.part ?? '무소속'}</span><h2>${owner.name}</h2></div><span>${owner.customers.length}개</span></header>
        ${isSelfOrAdminOrLead(owner.userId) ? `<button class="add-customer" data-add-customer="${owner.userId}">${icon('Plus', 15)} 담당 고객사 추가</button>` : ''}
        ${state.addOpen === owner.userId ? `<form class="quick-add-customer" data-add-form="${owner.userId}">
          <input aria-label="고객사명" placeholder="고객사명" value="${state.newName}" id="new-customer-name">
          <input aria-label="서비스 등급" placeholder="서비스 등급 (쉼표로 구분)" value="${state.newServices}" id="new-customer-services">
          <button class="primary" type="submit">추가</button>
        </form>` : ''}
        <div class="owner-cards">
          ${owner.customers.map((customer) => `<article class="managed-customer-card">
            <div class="service-row">${customer.services.map(serviceBadge).join('')}</div>
            <h3>${customer.name}</h3>
            <div class="customer-meta">${icon('Clock', 14)}<span>${formatSince(customer.since)} 담당 시작</span></div>
            ${customer.note ? `<p>${customer.note}</p>` : ''}
            <footer><span>주담당 ${owner.name}</span><button aria-label="${customer.name} 수정">${icon('Pencil', 15)}</button></footer>
          </article>`).join('')}
        </div>
      </section>`).join('')}
    </div>
  </main>`
}

export function bindCustomers(root, rerender) {
  root.querySelector('#customers-query')?.addEventListener('input', (event) => { state.query = event.target.value; rerender() })
  root.querySelectorAll('[data-add-customer]').forEach((btn) => btn.addEventListener('click', () => {
    state.addOpen = state.addOpen === btn.dataset.addCustomer ? null : btn.dataset.addCustomer
    state.newName = ''
    state.newServices = ''
    rerender()
  }))
  root.querySelector('#new-customer-name')?.addEventListener('input', (event) => { state.newName = event.target.value })
  root.querySelector('#new-customer-services')?.addEventListener('input', (event) => { state.newServices = event.target.value })
  root.querySelectorAll('[data-add-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const userId = form.dataset.addForm
    const name = state.newName.trim()
    if (!name) return
    const services = state.newServices.split(',').map((value) => value.trim()).filter(Boolean)
    try {
      await fetch('/api/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, userId, services, since: new Date().toISOString().slice(0, 10), note: '' }),
      })
      state.addOpen = null
      await loadCustomers()
    } catch { /* API 실패 시 목록은 이전 상태를 유지한다 */ }
    rerender()
  }))
}
