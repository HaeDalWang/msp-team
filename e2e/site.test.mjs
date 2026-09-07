import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { fixture, review, overtime } from '../test/fixtures.mjs'

async function browserFixture(t, user = 'user') {
  const f = await fixture(t)
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  })
  await context.addCookies([
    { name: 'msp_session', value: f.token(user), url: f.base },
  ])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'))
  return { ...f, page, context }
}

test('light theme persists, editor fills width, calendar quick-save informs review absence', async (t) => {
  const { page, base, request } = await browserFixture(t, 'admin')
  await page.goto(base + '/?week=2026-09-07#edit')
  await page.locator('#settings-toggle').click()
  await page.locator('#theme-toggle').click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.required-review-grid')).toBeVisible()
  const layout = await page.locator('.required-review-grid').evaluate((element) => ({ width: element.getBoundingClientRect().width, screen: window.innerWidth }))
  assert.ok(layout.width >= layout.screen - 20)
  const fields = await page.locator('.review-field').evaluateAll((elements) => elements.map((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })))
  assert.ok(fields[1].right > layout.screen - 20)
  await page.screenshot({ path: '/tmp/msp-full-width-editor.png' })
  await page.locator('[data-view="schedule"]').click()
  // Move to the review month without depending on the machine's current month.
  for (let i = 0; i < 36; i++) {
    const month = await page.locator('.month-picker strong').textContent()
    if (month === '2026-09') break
    await page.locator(month < '2026-09' ? '#next-month' : '#previous-month').click()
    await expect(page.locator('.month-picker strong')).not.toHaveText(month)
  }
  const monday = page.locator('[data-user="user"][data-date="2026-09-07"]')
  await expect(monday).toHaveText('출근')
  await expect(page.locator('[data-user="user"][data-date="2026-09-06"]')).toHaveText('—')
  await monday.click()
  await expect(page.getByRole('dialog', { name: '일정 빠른 설정' })).toBeVisible()
  await page.locator('[data-quick-type="휴가"]').click()
  await expect(monday).toHaveText('휴가')
  await page.screenshot({ path: '/tmp/msp-calendar.png' })
  const saved = await (await request('/api/schedule?month=2026-09')).json()
  assert.equal(saved.entries.user['2026-09-07'].type, '휴가')
  await page.locator('[data-view="review"]').click()
  await page.locator('[data-person="user"]').click()
  await expect(page.locator('.absence')).toContainText('휴가입니다')
  await page.locator('[data-view="schedule"]').click()
  await monday.click()
  await page.getByText('메모·상세 수정', { exact: true }).click()
  await page.locator('#schedule-type').selectOption('')
  await page.locator('#schedule-form button.primary').click()
  await expect(monday).toHaveText('출근')
  await page.locator('#schedule-close').click()
  await expect(page.getByRole('dialog', { name: '일정 빠른 설정' })).toHaveCount(0)
  // A saved reset must not prompt about unsaved changes when the dialog closes.
  await page.locator('[data-view="review"]').click()
  await expect(page.locator('.absence')).toHaveCount(0)
  await request('/api/schedule', { user: 'admin', method: 'PUT', body: { userId: 'user', date: '2026-09-07', type: '휴가' } })
  await page.reload()
  await page.getByRole('button', { name: '전체 회고 보기', exact: true }).click()
  await expect(page.locator('.absence')).toContainText('휴가입니다')
})

test('feedback: continuous font drag, all reviews, editor layout and customer scroll', async (t) => {
  const { page, base, request, pool } = await browserFixture(t, 'admin')
  await request('/api/reviews', { method: 'PUT', body: review({ ticketsNew: 12345, ticketsDone: 99999 }) })
  await page.goto(base + '/?week=2026-09-07#review')
  await page.locator('[data-person="user"]').click()
  await page.locator('#settings-toggle').click()
  const slider = page.locator('#font-scale-input')
  await expect(slider).toHaveValue('110')
  const box = await slider.boundingBox()
  await page.mouse.move(box.x + box.width * .55, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .98, box.y + box.height / 2, { steps: 15 })
  await page.mouse.up()
  assert.ok(Number(await slider.inputValue()) >= 125)
  await page.locator('#settings-toggle').click()
  assert.ok(await page.locator('.comparison').evaluate((el) => el.scrollWidth <= el.clientWidth))
  await page.screenshot({ path: '/tmp/msp-feedback-review.png' })
  await page.getByRole('button', { name: '전체 회고 보기', exact: true }).click()
  await expect(page.locator('.all-review-card')).toHaveCount(3)
  await expect(page.locator('.all-reviews')).toContainText('고객사 지원')
  await page.locator('[data-view="edit"]').click()
  await page.locator('[data-field="workHighlights"]').fill('작성 모드 변경 후 보존')
  await page.getByRole('button', { name: '세로로 쓰기', exact: true }).click()
  await expect(page.locator('.editor-list')).toBeVisible()
  assert.ok(await page.locator('.review-field').first().evaluate((element) => element.scrollHeight <= element.clientHeight))
  await expect(page.locator('[data-field="workHighlights"]')).toHaveValue('작성 모드 변경 후 보존')
  await page.getByRole('button', { name: '회고 제출하기' }).click()
  await expect(page.getByRole('status')).toContainText('제출했습니다')
  await expect(page.locator('[data-field="otherNotes"]')).toHaveValue('특이사항 없음')
  await page.screenshot({ path: '/tmp/msp-feedback-editor.png' })
  for (let i = 0; i < 8; i++) await pool.query('INSERT INTO users(id,name,part_id) VALUES($1,$1,\'p1\')', [`extra${i}`])
  await page.locator('[data-view="customers"]').click()
  await page.locator('[data-add-customer="extra6"]').scrollIntoViewIfNeeded()
  const before = await page.locator('.owner-board').evaluate((el) => el.scrollLeft)
  assert.ok(before > 0)
  await page.locator('[data-add-customer="extra6"]').click()
  const after = await page.locator('.owner-board').evaluate((el) => el.scrollLeft)
  assert.ok(Math.abs(after - before) < 3)
})

test('browser review save, reload, week navigation, comment, completion and monthly export', async (t) => {
  const { page, base, context, token } = await browserFixture(t)
  await page.goto(base + '/?week=2026-09-07#edit')
  await expect(page.locator('[data-field="workHighlights"]')).toHaveValue('')
  const originalText =
    '<img src=x onerror="window.exploited=true">고객사 기술지원\n\n다음 문단'
  await page.locator('[data-field="workHighlights"]').fill(originalText)
  await page.getByRole('button', { name: '임시 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('임시 저장')
  await page.reload()
  await expect(page.locator('[data-field="workHighlights"]')).toHaveValue(
    originalText,
  )
  for (const field of ['actionItems', 'topsProjects', 'otherNotes'])
    await page.locator(`[data-field="${field}"]`).fill(field + ' 실제 내용')
  await page.locator('[data-ticket-field="ticketsDone"]').fill('7')
  await page.getByRole('button', { name: '회고 제출하기' }).click()
  await expect(page.getByRole('status')).toContainText('제출했습니다')
  await expect(page.locator('.edit-toolbar .status-badge')).toHaveText(
    '제출 완료',
  )
  await page.getByRole('button', { name: '다음 주', exact: true }).click()
  await expect(page.locator('[data-field="workHighlights"]')).toHaveValue('')
  await page.getByRole('button', { name: '이전 주', exact: true }).click()
  await expect(page.locator('[data-field="workHighlights"]')).toHaveValue(
    originalText,
  )
  await page.locator('[data-view="review"]').click()
  await expect(page.locator('.review-scroll')).toContainText('<img src=x')
  assert.equal(await page.evaluate(() => window.exploited), undefined)
  await page.locator('#comment-draft').fill('실제 저장되는 댓글')
  await page.getByRole('button', { name: '코멘트 등록' }).click()
  await expect(page.locator('.comment-list')).toContainText(
    '실제 저장되는 댓글',
  )
  await page.reload()
  await expect(page.locator('.comment-list')).toContainText(
    '실제 저장되는 댓글',
  )
  await context.addCookies([
    { name: 'msp_session', value: token('lead'), url: base },
  ])
  await page.reload()
  await page.locator('[data-person="user"]').click()
  await page.getByRole('button', { name: '검토 완료', exact: true }).click()
  await expect(page.locator('.person-header .status-badge')).toHaveText(
    '검토 완료',
  )
  await page.getByRole('button', { name: '월간 Output' }).click()
  await expect(page.locator('.output-dialog pre')).toContainText('7건')
  await expect(page.locator('.output-dialog pre')).toContainText(
    '고객사 기술지원',
  )
})

test('browser customer edit, transfer, dynamic part and schedule note persistence', async (t) => {
  const { page, base, request } = await browserFixture(t, 'admin')
  await page.goto(base + '/#customers')
  await page.locator('[data-add-customer="admin"]').click()
  await page.locator('[data-draft="name"]').fill('브라우저 고객사')
  await page.locator('[data-draft="note"]').fill('메모 내용')
  assert.ok(await page.locator('.checkbox-field').first().evaluate((label) => {
    const input = label.querySelector('input').getBoundingClientRect()
    const bounds = label.getBoundingClientRect()
    return input.width <= 20 && Math.abs(input.y + input.height / 2 - bounds.y - bounds.height / 2) < 3
  }))
  await page.screenshot({ path: '/tmp/msp-customer-controls.png' })
  await page.locator('#customer-form button.primary').click()
  await expect(page.locator('.managed-customer-card')).toContainText(
    '브라우저 고객사',
  )
  await page.locator('[data-edit-customer]').click()
  await page.locator('[data-draft="name"]').fill('수정 고객사')
  await page.locator('#customer-form button.primary').click()
  await expect(page.locator('.managed-customer-card')).toContainText(
    '수정 고객사',
  )
  await page.locator('[data-reassign]').selectOption('other')
  await expect(
    page
      .locator('.owner-column')
      .filter({ has: page.locator('h2', { hasText: 'other' }) }),
  ).toContainText('수정 고객사')
  await page.locator('[data-view="organization"]').click()
  await page.getByRole('button', { name: '파트 관리', exact: true }).click()
  await page.locator('#new-part-name').fill('동적 추가 파트')
  await page.locator('#part-add-form button').click()
  await expect(
    page.locator('.org-column h2', { hasText: '동적 추가 파트' }),
  ).toBeVisible()
  await page.locator('[data-edit-member="other"]').click()
  await page.screenshot({ path: '/tmp/msp-member-form-layout.png' })
  await page
    .locator('[data-member-field="partId"]')
    .selectOption({ label: '동적 추가 파트' })
  await page.locator('#member-form button.primary').click()
  await expect(page.locator('#member-form')).toHaveCount(0)
  await page.locator('[data-view="schedule"]').click()
  await expect(page.locator('.schedule-table')).toContainText('동적 추가 파트')
  const cell = page.locator('[data-user="admin"]').first()
  const date = await cell.getAttribute('data-date')
  await cell.click()
  await page.getByText('메모·상세 수정', { exact: true }).click()
  await page.locator('#schedule-type').selectOption('외근·출장')
  await page.locator('#schedule-note').fill('외근 사유 저장')
  await page.locator('#schedule-form button.primary').click()
  await expect(page.locator('#schedule-form button.primary')).toBeEnabled()
  await page.reload()
  await page.locator(`[data-user="admin"][data-date="${date}"]`).click()
  await expect(page.locator('#schedule-note')).toHaveValue('외근 사유 저장')
  const month = await page.locator('.month-picker strong').textContent()
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await expect(page.locator('.month-picker strong')).not.toHaveText(month)
  assert.equal(
    (
      await request('/api/schedule?month=' + date.slice(0, 7), {
        user: 'admin',
      })
    ).status,
    200,
  )
})

test('browser overtime and leave balances reflect approval', async (t) => {
  const { page, base, request, context, token } = await browserFixture(t)
  await page.goto(base + '/#comp-leave')
  assert.ok(await page.locator('.compact-time').evaluate((element) => {
    const parent = element.getBoundingClientRect()
    const estimate = element.querySelector('.calculated-hours').getBoundingClientRect()
    return estimate.right <= parent.right + 1 && estimate.left >= parent.left - 1
  }))
  await page.screenshot({ path: '/tmp/msp-overtime-controls.png' })
  for (const [field, value] of Object.entries(overtime())) {
    const input = page.locator(`[data-overtime="${field}"]`)
    if (['type', 'startTime', 'endTime'].includes(field)) await input.selectOption(value)
    else await input.fill(value)
  }
  await page.locator('#overtime-form button.primary').click()
  await expect(page.locator('.comp-ledger').first()).toContainText('야간 작업')
  let data = await (await request('/api/overtime?userId=user')).json()
  await request(`/api/overtime/${data.records[0].id}/approve`, {
    user: 'lead',
    method: 'POST',
  })
  await page.reload()
  await expect(page.getByTestId('comp-leave-balance')).toHaveText('4시간')
  await page.locator('[data-leave="date"]').fill('2026-09-08')
  await page.locator('[data-leave="hours"]').selectOption('4')
  await page.locator('[data-leave="reason"]').fill('브라우저 휴가')
  await page.locator('#leave-form button').click()
  await expect(page.locator('.comp-ledger').last()).toContainText(
    '브라우저 휴가',
  )
  await context.addCookies([
    { name: 'msp_session', value: token('lead'), url: base },
  ])
  await page.reload()
  await page.locator('#engineer-select').selectOption('user')
  await page.locator('[data-kind="leave"][data-action="approve"]').click()
  await expect(
    page.locator('.comp-ledger').last().locator('tbody tr td').nth(3),
  ).toHaveText('승인')
  data = await (await request('/api/overtime?userId=user')).json()
  assert.equal(data.balanceHours, 0)
})

test('browser failed saves keep input, pending saves lock fields and changing day protects notes', async (t) => {
  const { page, base } = await browserFixture(t)
  await page.goto(base + '/#comp-leave')
  await page.locator('[data-leave="date"]').fill('2026-09-10')
  await page.locator('[data-leave="hours"]').selectOption('4')
  await page.locator('[data-leave="reason"]').fill('실패해도 남을 사유')
  let release
  await page.route('**/api/leave', async (route) => {
    await new Promise((resolve) => {
      release = resolve
    })
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '테스트 저장 실패' }),
    })
  })
  await page.locator('#leave-form button').click()
  await expect(page.locator('[data-leave="reason"]')).toBeDisabled()
  release()
  await expect(page.getByRole('alert')).toContainText('테스트 저장 실패')
  await expect(page.locator('[data-leave="reason"]')).toHaveValue(
    '실패해도 남을 사유',
  )
  await expect(page.locator('[data-leave="hours"]')).toHaveValue('4')
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('[data-view="schedule"]').click()
  await page.locator('[data-user="user"]').first().click()
  await page.getByText('메모·상세 수정', { exact: true }).click()
  await page.locator('#schedule-note').fill('날짜를 바꿔도 보호할 사유')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.locator('[data-user="user"]').nth(1).click()
  await expect(page.locator('#schedule-note')).toHaveValue(
    '날짜를 바꿔도 보호할 사유',
  )
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await expect(page.locator('#schedule-note')).toHaveValue(
    '날짜를 바꿔도 보호할 사유',
  )
})
