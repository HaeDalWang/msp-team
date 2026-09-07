import { icon } from '../icons.js'
import { session } from '../session.js'
import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'

const tiers = ['Standard', 'Advanced', 'Enterprise']
const emptyDraft = () => ({
  name: '',
  tier: 'Standard',
  mcr: false,
  keyAccount: false,
  since: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  note: '',
})
const state = {
  owners: [],
  query: '',
  part: '전체',
  editor: null,
  draft: emptyDraft(),
  error: '',
  busy: false,
}
export const customersDirty = () => Boolean(state.editor) || state.busy
export const discardCustomers = () => {
  state.editor = null
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
  const owners = state.owners
    .filter(
      (owner) =>
        state.part === '전체' || (owner.part ?? '무소속') === state.part,
    )
    .map((owner) => ({
      ...owner,
      customers: owner.customers.filter(
        (customer) =>
          !query ||
          `${owner.name} ${owner.part ?? ''} ${customer.name} ${customer.note ?? ''}`
            .toLocaleLowerCase()
            .includes(query),
      ),
    }))
    .filter((owner) => !query || owner.customers.length)
  return `<main class="management-page customer-management"><div class="management-heading"><div><span class="eyebrow">MSP MANAGEMENT</span><h1>담당 고객사 관리</h1><p>고객사 정보와 담당자를 변경하면 바로 저장됩니다.</p></div></div>
    ${state.error ? `<div role="alert" class="comp-api-error">${h(state.error)} <button id="customers-retry">다시 조회</button></div>` : ''}
    <div class="management-summary"><div>${icon('Building2', 18)}<span>고객사<strong>${unique.size}</strong></span></div><div><span>고객사 담당 엔지니어<strong>${state.owners.filter((owner) => owner.customers.length).length}</strong></span></div><label>${icon('Search', 16)}<input id="customers-query" value="${h(state.query)}" placeholder="고객사·담당자 검색"></label></div>
    <div class="part-filter-bar">${['전체', ...parts].map((part) => `<button data-part-filter="${h(part)}" class="${state.part === part ? 'active' : ''}">${h(part)}</button>`).join('')}</div>
    <div class="owner-board">${
      owners
        .map(
          (
            owner,
          ) => `<section class="owner-column"><header><div><span class="part-badge">${h(owner.part ?? '무소속')}</span><h2>${h(owner.name)}</h2></div><span>${owner.customers.length}개</span></header>
      ${session.user ? `<button class="add-customer" data-add-customer="${h(owner.userId)}" ${state.busy ? 'disabled' : ''}>${icon('Plus', 15)} 고객사 추가</button>` : ''}
      ${state.editor?.userId === owner.userId ? editor() : ''}
      <div class="owner-cards">${owner.customers
        .map(
          (customer) =>
            `<article class="managed-customer-card"><div class="service-row"><span class="service-badge service-${tiers.includes(customer.tier) ? customer.tier.toLowerCase() : 'standard'}">${h(customer.tier ?? 'Standard')}</span>${customer.mcr ? '<span class="service-badge service-mcr">MCR</span>' : ''}${customer.keyAccount ? '<span class="service-badge service-key">주요고객</span>' : ''}</div><h3>${h(customer.name)}</h3><div class="customer-meta">${h(customer.since ?? '')} 담당 시작</div><p>${h(customer.note ?? '')}</p><footer><span>담당 ${h(owner.name)}</span>${
              session.user
                ? `<div class="managed-customer-actions"><button data-edit-customer="${h(customer.id)}" data-owner="${h(owner.userId)}" ${state.busy ? 'disabled' : ''}>수정</button><select aria-label="${h(customer.name)} 담당자 변경" data-reassign="${h(customer.id)}" ${state.busy ? 'disabled' : ''}><option value="">담당자 이동</option>${state.owners
                    .filter((item) => item.userId !== owner.userId)
                    .map(
                      (item) =>
                        `<option value="${h(item.userId)}">${h(item.name)}</option>`,
                    )
                    .join(
                      '',
                    )}</select><button data-remove-customer="${h(customer.id)}" ${state.busy ? 'disabled' : ''} aria-label="${h(customer.name)} 삭제">${icon('Trash2', 15)}</button></div>`
                : ''
            }</footer></article>`,
        )
        .join('')}</div></section>`,
        )
        .join('') || '<p>표시할 고객사가 없습니다.</p>'
    }</div></main>`
}
function editor() {
  const draft = state.draft
  return `<form class="quick-add-customer" id="customer-form"><label>고객사명<input data-draft="name" required maxlength="200" value="${h(draft.name)}"></label><label>서비스 등급<select data-draft="tier">${tiers.map((tier) => `<option ${draft.tier === tier ? 'selected' : ''}>${tier}</option>`).join('')}</select></label><label>담당 시작<input data-draft="since" type="date" required value="${h(draft.since)}"></label><label class="checkbox-field"><input data-draft="mcr" type="checkbox" ${draft.mcr ? 'checked' : ''}> MCR</label><label class="checkbox-field"><input data-draft="keyAccount" type="checkbox" ${draft.keyAccount ? 'checked' : ''}> 주요고객</label><label>메모<textarea data-draft="note" maxlength="2000">${h(draft.note)}</textarea></label><button class="primary" ${state.busy ? 'disabled' : ''}>${state.editor.id ? '저장' : '추가'}</button><button type="button" id="customer-cancel" ${state.busy ? 'disabled' : ''}>취소</button></form>`
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
  root.querySelectorAll('[data-part-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      state.part = button.dataset.partFilter
      rerender()
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
      state.draft = { ...emptyDraft(), ...customer }
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
      await api(
        id ? `/api/customers/${encodeURIComponent(id)}` : '/api/customers',
        {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...state.draft,
            name: state.draft.name.trim(),
            userId,
          }),
        },
      )
      state.editor = null
    })
  })
  root.querySelectorAll('[data-remove-customer]').forEach((button) =>
    button.addEventListener('click', () => {
      if (confirm('이 고객사를 삭제할까요?'))
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
