// 원본 prototype(src/ManagementViews.tsx CustomerManagementView)의 DOM 구조를 그대로 옮긴 것.
// 실제 PostgreSQL API(GET/POST/PUT/DELETE /api/customers)에 연결되어 있으며, 실패 시에만 mock으로 fallback한다.
// 담당 고객사는 엔지니어들이 서로 자주 넘겨받는 관계라, 로그인한 사람 누구나 어떤 담당자 칸에도
// 추가할 수 있다(서버도 로그인 여부만 검증하고 소유자 일치는 요구하지 않음).
import { icon } from '../icons.js'
import { session } from '../session.js'

const customerTiers = ['Standard', 'Advanced', 'Enterprise']
const parts = ['무소속', 'Leaf', 'Tiger', 'Dragon']

const mockOwners = [
  { userId: 'lee-juyeop', name: '이주엽', part: 'Leaf', customers: [
    { id: 'mock-1', name: '이지샵(주)', since: '2022-01-01', tier: 'Enterprise', mcr: true, keyAccount: true },
    { id: 'mock-2', name: '(주)인피니솔루션', since: '2023-04-01', tier: 'Advanced', mcr: false, keyAccount: false },
  ] },
  { userId: 'kim-beomjung', name: '김범중', part: 'Tiger', customers: [
    { id: 'mock-3', name: '케이비자산운용_DI', since: '2022-06-01', tier: 'Advanced', mcr: false, keyAccount: false },
  ] },
  { userId: 'bae-seungdo', name: '배승도', part: 'Tiger', customers: [
    { id: 'mock-4', name: '이동의즐거움', since: '2022-09-01', tier: 'Enterprise', mcr: true, keyAccount: true },
    { id: 'mock-5', name: '리파인', since: '2023-07-01', tier: 'Advanced', mcr: false, keyAccount: false },
  ] },
]

const state = { query: '', partFilter: '전체', owners: mockOwners, loaded: false, addOpen: null, newName: '', newTier: 'Standard', newMcr: false, newKeyAccount: false }

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

function tierBadge(tier) {
  return `<span class="service-badge service-${tier.toLowerCase()}">${tier}</span>`
}

function formatSince(value) {
  if (!value) return ''
  return String(value).slice(0, 7).replace('-', '.')
}

function visibleOwners() {
  const q = state.query.trim().toLowerCase()
  return state.owners
    .filter((owner) => state.partFilter === '전체' || (owner.part ?? '무소속') === state.partFilter)
    .map((owner) => ({ ...owner, customers: owner.customers.filter((customer) => !q || `${owner.name} ${owner.part} ${customer.name}`.toLowerCase().includes(q)) }))
    .filter((owner) => !q || owner.customers.length)
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
    </div>
    <div class="part-filter-bar">
      ${['전체', ...parts].map((part) => `<button data-part-filter="${part}" class="${state.partFilter === part ? 'active' : ''}">${part}</button>`).join('')}
    </div>
    <div class="owner-board">
      ${owners.map((owner) => `<section class="owner-column">
        <header><div><span class="part-badge">${owner.part ?? '무소속'}</span><h2>${owner.name}</h2></div><span>${owner.customers.length}개</span></header>
        ${session.user ? `<button class="add-customer" data-add-customer="${owner.userId}">${icon('Plus', 15)} 담당 고객사 추가</button>` : ''}
        ${state.addOpen === owner.userId ? `<form class="quick-add-customer" data-add-form="${owner.userId}">
          <input aria-label="고객사명" placeholder="고객사명" value="${state.newName}" id="new-customer-name">
          <label class="new-customer-tier">등급
            <select id="new-customer-tier" aria-label="서비스 등급">
              ${customerTiers.map((tier) => `<option value="${tier}" ${state.newTier === tier ? 'selected' : ''}>${tier}</option>`).join('')}
            </select>
          </label>
          <label class="new-customer-checkbox"><input type="checkbox" id="new-customer-mcr" ${state.newMcr ? 'checked' : ''}> MCR(월간리뷰) 진행</label>
          <label class="new-customer-checkbox"><input type="checkbox" id="new-customer-key-account" ${state.newKeyAccount ? 'checked' : ''}> 주요고객</label>
          <button class="primary" type="submit">추가</button>
        </form>` : ''}
        <div class="owner-cards">
          ${owner.customers.map((customer) => `<article class="managed-customer-card">
            <div class="service-row">${tierBadge(customer.tier ?? 'Standard')}${customer.mcr ? '<span class="service-badge service-mcr">MCR</span>' : ''}${customer.keyAccount ? '<span class="service-badge service-key">주요고객</span>' : ''}</div>
            <h3>${customer.name}</h3>
            <div class="customer-meta">${icon('Clock', 14)}<span>${formatSince(customer.since)} 담당 시작</span></div>
            ${customer.note ? `<p>${customer.note}</p>` : ''}
            <footer>
              <span>주담당 ${owner.name}</span>
              ${session.user ? `<div class="managed-customer-actions">
                <select aria-label="${customer.name} 담당자 변경" data-reassign="${customer.id}">
                  <option value="">담당자 이동</option>
                  ${state.owners.filter((candidate) => candidate.userId !== owner.userId).map((candidate) => `<option value="${candidate.userId}">${candidate.name}</option>`).join('')}
                </select>
                <button aria-label="${customer.name} 삭제" data-remove-customer="${customer.id}">${icon('Trash2', 15)}</button>
              </div>` : ''}
            </footer>
          </article>`).join('')}
        </div>
      </section>`).join('')}
    </div>
  </main>`
}

export function bindCustomers(root, rerender) {
  root.querySelector('#customers-query')?.addEventListener('input', (event) => { state.query = event.target.value; rerender() })
  root.querySelectorAll('[data-part-filter]').forEach((btn) => btn.addEventListener('click', () => { state.partFilter = btn.dataset.partFilter; rerender() }))
  root.querySelectorAll('[data-add-customer]').forEach((btn) => btn.addEventListener('click', () => {
    state.addOpen = state.addOpen === btn.dataset.addCustomer ? null : btn.dataset.addCustomer
    state.newName = ''
    state.newTier = 'Standard'
    state.newMcr = false
    state.newKeyAccount = false
    rerender()
  }))
  root.querySelector('#new-customer-name')?.addEventListener('input', (event) => { state.newName = event.target.value })
  root.querySelector('#new-customer-tier')?.addEventListener('change', (event) => { state.newTier = event.target.value })
  root.querySelector('#new-customer-mcr')?.addEventListener('change', (event) => { state.newMcr = event.target.checked })
  root.querySelector('#new-customer-key-account')?.addEventListener('change', (event) => { state.newKeyAccount = event.target.checked })
  root.querySelectorAll('[data-add-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const userId = form.dataset.addForm
    const name = state.newName.trim()
    if (!name) return
    if (!confirm(`"${name}"을 담당 고객사로 추가할까요?`)) return
    try {
      await fetch('/api/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, userId, tier: state.newTier, mcr: state.newMcr, keyAccount: state.newKeyAccount, since: new Date().toISOString().slice(0, 10), note: '' }),
      })
      state.addOpen = null
      await loadCustomers()
    } catch { /* API 실패 시 목록은 이전 상태를 유지한다 */ }
    rerender()
  }))
  root.querySelectorAll('[data-remove-customer]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('이 고객사를 목록에서 삭제할까요?')) return
    try {
      await fetch(`/api/customers/${btn.dataset.removeCustomer}`, { method: 'DELETE' })
      await loadCustomers()
    } catch { /* API 실패 시 목록은 이전 상태를 유지한다 */ }
    rerender()
  }))
  root.querySelectorAll('[data-reassign]').forEach((select) => select.addEventListener('change', async (event) => {
    const newUserId = event.target.value
    if (!newUserId) return
    try {
      await fetch(`/api/customers/${select.dataset.reassign}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: newUserId }),
      })
      await loadCustomers()
    } catch { /* API 실패 시 목록은 이전 상태를 유지한다 */ }
    rerender()
  }))
}
