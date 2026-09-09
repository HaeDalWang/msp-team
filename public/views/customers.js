import { icon } from '../icons.js'
import { session, isAdmin } from '../session.js'
import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'

const tiers = ['Standard', 'Advanced', 'Enterprise']
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const emptyDraft = () => ({
  name: '',
  tier: 'Standard',
  mcr: false,
  keyAccount: false,
  since: today(),
  note: '',
})
const state = {
  owners: [],
  query: '',
  part: '전체',
  status: 'active',
  editor: null,
  draft: emptyDraft(),
  historyDrafts: new Map(),
  expanded: new Set(),
  error: '',
  busy: false,
}
export const customersDirty = () =>
  Boolean(state.editor) ||
  state.busy ||
  [...state.historyDrafts.values()].some((draft) => draft.body.trim())
export const discardCustomers = () => {
  state.editor = null
  state.historyDrafts.clear()
}
export const customersBusy = () => state.busy
export async function loadCustomers() {
  try {
    state.owners = (await api('/api/customers')).owners
    state.error = ''
  } catch (error) {
    state.error = error.message
  }
}

function historyDraft(customerId) {
  if (!state.historyDrafts.has(customerId))
    state.historyDrafts.set(customerId, { eventDate: today(), body: '' })
  return state.historyDrafts.get(customerId)
}

function historyPanel(customer) {
  const id = String(customer.id)
  const history = customer.history ?? []
  const draft = historyDraft(id)
  return `<details class='customer-history' data-history-details='${h(id)}'${state.expanded.has(id) ? ' open' : ''}><summary>히스토리 보기 <span>${history.length}</span></summary><div class='customer-history-content'>
    <form data-history-form='${h(id)}'><input data-history-date='${h(id)}' type='date' required value='${h(draft.eventDate)}'><textarea data-history-body='${h(id)}' required maxlength='1000' placeholder='예: MSP 운영 일시 중단 후 재시작'>${h(draft.body)}</textarea><button class='primary' ${state.busy ? 'disabled' : ''}>기록 추가</button></form>
    <ol class='customer-history-list'>${history.map((item) => `<li><div><time>${h(item.eventDate)}</time><strong>${h(item.body)}</strong><small>${h(item.authorName)}</small></div>${session.user?.userId === item.authorId || isAdmin() ? `<button data-remove-history='${h(item.id)}' data-customer='${h(id)}' aria-label='${h(item.body)} 기록 삭제' ${state.busy ? 'disabled' : ''}>×</button>` : ''}</li>`).join('') || `<li class='customer-history-empty'>아직 등록된 히스토리가 없습니다.</li>`}</ol>
  </div></details>`
}

function customerCard(customer, owner) {
  const active = customer.active !== false
  return `<article class='managed-customer-card${active ? '' : ' archived'}'><div class='service-row'><span class='service-badge service-${tiers.includes(customer.tier) ? customer.tier.toLowerCase() : 'standard'}'>${h(customer.tier ?? 'Standard')}</span>${customer.mcr ? `<span class='service-badge service-mcr'>MCR</span>` : ''}${customer.keyAccount ? `<span class='service-badge service-key'>주요고객</span>` : ''}${active ? '' : `<span class='service-badge service-ended'>운영 종료</span>`}</div><h3>${h(customer.name)}</h3><div class='customer-meta'>${h(customer.since ?? '')} 담당 시작</div><p>${h(customer.note || '현재 메모 없음')}</p>
    ${historyPanel(customer)}
    <footer><span>담당 ${h(owner.name)}</span>${session.user ? `<div class='managed-customer-actions'><button data-edit-customer='${h(customer.id)}' data-owner='${h(owner.userId)}' ${state.busy ? 'disabled' : ''}>수정</button><select aria-label='${h(customer.name)} 담당자 변경' data-reassign='${h(customer.id)}' ${state.busy ? 'disabled' : ''}><option value=''>담당자 이동</option>${state.owners.filter((item) => item.userId !== owner.userId).map((item) => `<option value='${h(item.userId)}'>${h(item.name)}</option>`).join('')}</select><button data-customer-status='${h(customer.id)}' data-active='${active ? 'false' : 'true'}' ${state.busy ? 'disabled' : ''}>${active ? '운영 종료' : '운영 재개'}</button>${isAdmin() ? `<button class='danger-text' data-remove-customer='${h(customer.id)}' ${state.busy ? 'disabled' : ''}>완전 삭제</button>` : ''}</div>` : ''}</footer></article>`
}
export function renderCustomers() {
  const unique = new Map(
    state.owners.flatMap((owner) =>
      owner.customers.map((customer) => [customer.id, customer]),
    ),
  )
  const parts = [
    ...new Set(state.owners.map((owner) => owner.part ?? '무소속')),
  ]
  const query = state.query.trim().toLocaleLowerCase()
  const matchesStatus = (customer) =>
    state.status === 'all' ||
    (state.status === 'active' && customer.active !== false) ||
    (state.status === 'ended' && customer.active === false)
  const owners = state.owners
    .filter(
      (owner) =>
        state.part === '전체' || (owner.part ?? '무소속') === state.part,
    )
    .map((owner) => ({
      ...owner,
      customers: owner.customers.filter((customer) => {
        const searchable = `${owner.name} ${owner.part ?? ''} ${customer.name} ${customer.note ?? ''} ${(customer.history ?? []).map((item) => item.body).join(' ')}`
        return (
          matchesStatus(customer) &&
          (!query || searchable.toLocaleLowerCase().includes(query))
        )
      }),
    }))
    .filter(
      (owner) =>
        (state.status === 'active' && !query) || owner.customers.length,
    )
  const activeCount = [...unique.values()].filter(
    (customer) => customer.active !== false,
  ).length
  const endedCount = unique.size - activeCount
  return `<main class="management-page customer-management"><div class="management-heading"><div><span class="eyebrow">MSP MANAGEMENT</span><h1>담당 고객사 관리</h1><p>현재 요약은 메모에, 변경 과정은 날짜별 히스토리에 남겨주세요.</p></div></div>
    ${state.error ? `<div role="alert" class="comp-api-error">${h(state.error)} <button id="customers-retry">다시 조회</button></div>` : ''}
    <div class="management-summary"><div>${icon('Building2', 18)}<span>운영 중<strong>${activeCount}</strong></span></div><div><span>종료 고객<strong>${endedCount}</strong></span></div><label>${icon('Search', 16)}<input id="customers-query" value="${h(state.query)}" placeholder="고객사·담당자·히스토리 검색"></label></div>
    <div class="customer-filter-row"><div class="status-filter-bar">${[['active', '운영 중'], ['ended', '종료 고객'], ['all', '전체 고객']].map(([value, label]) => `<button data-status-filter="${value}" class="${state.status === value ? 'active' : ''}">${label}</button>`).join('')}</div><div class="part-filter-bar">${['전체', ...parts].map((part) => `<button data-part-filter="${h(part)}" class="${state.part === part ? 'active' : ''}">${h(part)}</button>`).join('')}</div></div>
    <div class="owner-board">${
      owners
        .map(
          (
            owner,
          ) => `<section class="owner-column"><header><div><span class="part-badge">${h(owner.part ?? '무소속')}</span><h2>${h(owner.name)}</h2></div><span>${owner.customers.length}개</span></header>
      ${session.user && state.status === 'active' ? `<button class="add-customer" data-add-customer="${h(owner.userId)}" ${state.busy ? 'disabled' : ''}>${icon('Plus', 15)} 고객사 추가</button>` : ''}
      ${state.editor?.userId === owner.userId ? editor() : ''}
      <div class="owner-cards">${owner.customers.map((customer) => customerCard(customer, owner)).join('')}</div></section>`,
        )
        .join('') || '<p class="customer-empty">표시할 고객사가 없습니다.</p>'
    }</div></main>`
}
function editor() {
  const draft = state.draft
  return `<form class="quick-add-customer" id="customer-form"><label>고객사명<input data-draft="name" required maxlength="200" value="${h(draft.name)}"></label><label>서비스 등급<select data-draft="tier">${tiers.map((tier) => `<option ${draft.tier === tier ? 'selected' : ''}>${tier}</option>`).join('')}</select></label><label>담당 시작<input data-draft="since" type="date" required value="${h(draft.since)}"></label><label class="checkbox-field"><input data-draft="mcr" type="checkbox" ${draft.mcr ? 'checked' : ''}> MCR</label><label class="checkbox-field"><input data-draft="keyAccount" type="checkbox" ${draft.keyAccount ? 'checked' : ''}> 주요고객</label><label>현재 요약 메모<textarea data-draft="note" maxlength="2000">${h(draft.note)}</textarea></label><button class="primary" ${state.busy ? 'disabled' : ''}>${state.editor.id ? '저장' : '추가'}</button><button type="button" id="customer-cancel" ${state.busy ? 'disabled' : ''}>취소</button></form>`
}
export function bindCustomers(root, rerender) {
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
      await loadCustomers()
    } catch (error) {
      state.error = error.message
    } finally {
      state.busy = false
      rerender()
    }
  }
  root
    .querySelector('#customers-retry')
    ?.addEventListener('click', () => run(async () => {}))
  root.querySelector('#customers-query')?.addEventListener('input', (event) => {
    state.query = event.target.value
    const position = event.target.selectionStart
    rerender()
    const input = root.querySelector('#customers-query')
    input?.focus()
    input?.setSelectionRange(position, position)
  })
  root.querySelectorAll('[data-status-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      state.status = button.dataset.statusFilter
      rerender()
    }),
  )
  root.querySelectorAll('[data-part-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      state.part = button.dataset.partFilter
      rerender()
    }),
  )
  root.querySelectorAll('[data-history-details]').forEach((details) =>
    details.addEventListener('toggle', () => {
      const id = details.dataset.historyDetails
      if (details.open) state.expanded.add(id)
      else state.expanded.delete(id)
    }),
  )
  root.querySelectorAll('[data-history-date]').forEach((input) =>
    input.addEventListener('input', (event) => {
      historyDraft(input.dataset.historyDate).eventDate = event.target.value
    }),
  )
  root.querySelectorAll('[data-history-body]').forEach((input) =>
    input.addEventListener('input', (event) => {
      historyDraft(input.dataset.historyBody).body = event.target.value
    }),
  )
  root.querySelectorAll('[data-history-form]').forEach((form) =>
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const customerId = form.dataset.historyForm
      run(async () => {
        await api(`/api/customers/${encodeURIComponent(customerId)}/history`, {
          method: 'POST',
          body: JSON.stringify(historyDraft(customerId)),
        })
        state.historyDrafts.delete(customerId)
        state.expanded.add(customerId)
      })
    }),
  )
  const canReplace = () =>
    !state.busy &&
    (!state.editor || confirm('입력 중인 고객사 변경 내용을 버릴까요?'))
  root.querySelectorAll('[data-add-customer]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!canReplace()) return
      state.editor = { userId: button.dataset.addCustomer }
      state.draft = emptyDraft()
      rerender()
    }),
  )
  root.querySelectorAll('[data-edit-customer]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!canReplace()) return
      const customer = state.owners
        .find((owner) => owner.userId === button.dataset.owner)
        ?.customers.find((item) => item.id === button.dataset.editCustomer)
      if (!customer) return
      state.editor = { userId: button.dataset.owner, id: customer.id }
      state.draft = {
        name: customer.name,
        tier: customer.tier,
        mcr: customer.mcr,
        keyAccount: customer.keyAccount,
        since: customer.since ?? '',
        note: customer.note,
      }
      rerender()
    }),
  )
  root.querySelector('#customer-cancel')?.addEventListener('click', () => {
    state.editor = null
    rerender()
  })
  root.querySelectorAll('[data-draft]').forEach((input) =>
    input.addEventListener('input', (event) => {
      state.draft[input.dataset.draft] =
        input.type === 'checkbox' ? event.target.checked : event.target.value
    }),
  )
  root.querySelector('#customer-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    run(async () => {
      const { id, userId } = state.editor
      const { name, tier, mcr, keyAccount, since, note } = state.draft
      await api(
        id ? `/api/customers/${encodeURIComponent(id)}` : '/api/customers',
        {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: name.trim(),
            tier,
            mcr,
            keyAccount,
            since,
            note,
            userId,
          }),
        },
      )
      state.editor = null
    })
  })
  root.querySelectorAll('[data-customer-status]').forEach((button) =>
    button.addEventListener('click', () => {
      const active = button.dataset.active === 'true'
      if (!active && !confirm('이 고객사를 종료 고객으로 옮길까요?')) return
      run(() =>
        api(
          `/api/customers/${encodeURIComponent(button.dataset.customerStatus)}/status`,
          { method: 'PUT', body: JSON.stringify({ active }) },
        ),
      )
    }),
  )
  root.querySelectorAll('[data-remove-history]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!confirm('이 히스토리 기록을 삭제할까요?')) return
      run(() =>
        api(
          `/api/customers/${encodeURIComponent(button.dataset.customer)}/history/${encodeURIComponent(button.dataset.removeHistory)}`,
          { method: 'DELETE' },
        ),
      )
    }),
  )
  root.querySelectorAll('[data-remove-customer]').forEach((button) =>
    button.addEventListener('click', () => {
      if (confirm('담당자와 히스토리까지 모두 삭제됩니다. 정말 완전 삭제할까요?'))
        run(() =>
          api(
            `/api/customers/${encodeURIComponent(button.dataset.removeCustomer)}`,
            { method: 'DELETE' },
          ),
        )
    }),
  )
  root.querySelectorAll('[data-reassign]').forEach((select) =>
    select.addEventListener('change', (event) => {
      const userId = event.target.value
      if (userId)
        run(() =>
          api(`/api/customers/${encodeURIComponent(select.dataset.reassign)}`, {
            method: 'PUT',
            body: JSON.stringify({ userId }),
          }),
        )
    }),
  )
}
