import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { fixture, review } from '../test/fixtures.mjs'

async function browserFixture(t, user = 'user', options = {}) {
  const f = await fixture(t, options)
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  await context.addCookies([{ name: 'msp_session', value: f.token(user), url: f.base }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  t.after(() => assert.deepEqual(errors, []))
  return { ...f, page }
}

test('B reads the same review and customer records and switches to A', async t => {
  const { page, base, request } = await browserFixture(t)
  await request('/api/reviews', { method: 'PUT', body: review({ workHighlights: '긴급 장애 대응과 고객사 복구' }) })
  await page.goto(base + '/b/?week=2026-09-07#review')
  await expect(page.getByRole('heading', { name: '리뷰' })).toBeVisible()
  await page.getByRole('combobox', { name: '발표자 선택' }).selectOption('user')
  await expect(page.getByText('긴급 장애 대응과 고객사 복구')).toBeVisible()
  await page.getByRole('button', { name: '월간 Output' }).click()
  await expect(page.getByRole('heading', { name: '2026년 9월 MSP 팀 Output' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('pre')).toContainText('총 티켓 처리 건수: **5건**')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.screenshot({ path: '/tmp/msp-design-b-review-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '코멘트 보기' }).first().click()
  await page.getByLabel('코멘트 작성').fill('B에서 확인했습니다')
  await page.getByRole('button', { name: '코멘트 등록' }).click()
  await expect(page.getByText('B에서 확인했습니다')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: '팀 현황' }).click()
  await page.getByRole('row').filter({ hasText: 'user' }).getByRole('button', { name: '회고 보기' }).click()
  await expect(page.getByRole('combobox', { name: '발표자 선택' })).toHaveValue('user')
  await page.getByRole('button', { name: '담당 고객사' }).click()
  await page.getByRole('button', { name: '고객사 추가' }).click()
  await page.getByLabel('고객사 이름').fill('B 화면 고객사')
  await page.getByRole('button', { name: '고객사 저장' }).click()
  await expect(page.getByRole('dialog', { name: 'B 화면 고객사' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('button', { name: 'B 화면 고객사' })).toBeVisible()
  await page.screenshot({ path: '/tmp/msp-design-b-customers-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.screenshot({ path: '/tmp/msp-design-b-customers-mobile.png', fullPage: true })
  const data = await (await request('/api/customers')).json()
  assert.ok(data.owners.some(owner => owner.customers.some(customer => customer.name === 'B 화면 고객사')))
  await page.getByRole('button', { name: '기존 디자인 A' }).click()
  await expect(page).toHaveURL(/\/?\?week=2026-09-07#customers$/)
  await expect(page.getByText('B 화면 고객사').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/msp-design-b-customers.png', fullPage: true })
})

test('A offers B on built pages and restores a B login destination', async t => {
  const { page, base } = await browserFixture(t)
  await page.goto(base + '/?week=2026-09-07#review')
  await page.getByRole('button', { name: '새 디자인 B' }).click()
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#review$/)
  await page.evaluate(() => { sessionStorage.setItem('msp-return-to', '/b/?week=2026-09-07#customers'); localStorage.setItem('msp-design', 'a') })
  await page.goto(base + '/')
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#customers$/)
})

test('B editor saves to the shared API and guards an unsaved design switch', async t => {
  const { page, base, request } = await browserFixture(t)
  await page.goto(base + '/b/?week=2026-09-07#edit')
  await page.getByLabel('주요 업무 현황').fill('B 회고 초안')
  await page.getByRole('button', { name: '임시 저장' }).click()
  await expect(page.getByText('서버에 저장된 내용')).toBeVisible()
  const personal = await (await request('/api/reviews?weekEnd=2026-09-07&personal=true')).json()
  assert.equal(personal.entries.find(entry => entry.id === 'user').workHighlights, 'B 회고 초안')
  await page.getByLabel('주요 업무 현황').fill('저장 전 변경')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '기존 디자인 A' }).click()
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#edit$/)
  await expect(page.getByLabel('주요 업무 현황')).toHaveValue('저장 전 변경')
})

test('B schedule saves the team calendar and keeps approved leave visible', async t => {
  const { page, base, request } = await browserFixture(t)
  await request('/api/schedule', {
    method: 'PUT',
    body: { userId: 'user', date: '2026-09-17', type: '외근·출장', note: 'B 일정 메모' },
  })
  await page.goto(base + '/b/#schedule')
  await expect(page.getByRole('heading', { name: '일정 관리' })).toBeVisible()
  await expect(page.getByText('B 일정 메모')).toHaveCount(0)
  const row = page.getByRole('row').filter({ hasText: 'user' })
  await row.getByRole('button').nth(16).click()
  await page.getByLabel('일정 유형').selectOption('외근·출장')
  await page.getByLabel('사유').fill('B에서 수정한 일정')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('일정을 저장했습니다.')).toBeVisible()
  const data = await (await request('/api/schedule?month=2026-09')).json()
  assert.equal(Object.values(data.entries.user).some(entry => entry.note === 'B에서 수정한 일정'), true)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.screenshot({ path: '/tmp/msp-design-b-schedule-mobile.png', fullPage: true })
})

test('B comp leave uses server balances, submits requests and exposes approval actions', async t => {
  const { page, base, request } = await browserFixture(t)
  await request('/api/overtime', { method: 'POST', body: { date: '2026-09-15', type: '작업', customer: 'B 고객사', startTime: '18:00', endTime: '22:00', detail: 'B 초과근무', evidence: '' } })
  const overtime = await (await request('/api/overtime?userId=user')).json()
  await request(`/api/overtime/${overtime.records[0].id}/approve`, { user: 'lead', method: 'POST' })
  await page.goto(base + '/b/#comp-leave')
  await expect(page.getByText('내 신청 가능 시간')).toBeVisible()
  await expect(page.getByText('4시간', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '대체휴가 신청' }).click()
  await page.getByLabel('사용 날짜').fill('2026-09-18')
  await page.getByLabel('사용 시간').selectOption('4')
  await page.getByLabel('사유').fill('B 대체휴가 신청')
  await page.getByRole('button', { name: '사용 신청' }).click()
  await expect(page.getByText('대체휴가 사용을 신청했습니다.')).toBeVisible()
  const ledger = await (await request('/api/overtime?userId=user')).json()
  assert.equal(ledger.leaves.some(leave => leave.reason === 'B 대체휴가 신청' && leave.status === 'pending'), true)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
})

test('B organization preserves read access and lets admins edit members and parts', async t => {
  const { page, base, request } = await browserFixture(t, 'admin')
  await page.goto(base + '/b/#organization')
  await expect(page.getByRole('heading', { name: '조직 관리' })).toBeVisible()
  await expect(page.getByText('user', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '구성원 추가' }).click()
  await page.getByLabel('이름').fill('B 신규 구성원')
  await page.getByLabel('Slack 사용자 ID').fill('UNEWUSER')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('B 신규 구성원', { exact: true })).toBeVisible()
  const organization = await (await request('/api/organization', { user: 'admin' })).json()
  assert.ok(Object.values(organization.users).some(member => member.name === 'B 신규 구성원'))
  await page.getByRole('button', { name: '파트 관리' }).click()
  await page.getByLabel('새 파트', { exact: true }).fill('B 새 파트')
  await page.getByRole('button', { name: '파트 추가' }).click()
  await expect(page.getByLabel('B 새 파트 파트 이름')).toHaveValue('B 새 파트')
  await page.setViewportSize({ width: 390, height: 844 })
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    widest: [...document.querySelectorAll('*')]
      .map(element => ({ tag: element.tagName, id: element.id, className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right }))
      .filter(element => element.right > innerWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5),
  }))
  assert.ok(width.scrollWidth <= width.viewport + 1, JSON.stringify(width))
})

test('B monthly digest preserves the upload, analysis and sandbox preview flow', async t => {
  const sample = { meta: { title: "AWS 월간 What's New", written: '2026.09' }, customer: { eol_eos: [{ service: 'RDS', action: '업그레이드 확인', source_quote: 'AWS original source' }], whats_new: [] }, sales: [], script: {} }
  const uploadOrigin = 'https://digest-test.s3.ap-northeast-2.amazonaws.com'
  const invoke = async function* (event) {
    const op = event.rawPath.split('/').at(-1)
    const type = op === 'analyze' ? 'application/x-ndjson' : op === 'preview' ? 'text/html' : 'application/json'
    yield { metadata: { statusCode: 200, headers: { 'content-type': type } } }
    if (op === 'config') yield { chunk: Buffer.from(JSON.stringify({ enabled: true, slackEnabled: false })) }
    else if (op === 'upload-url') yield { chunk: Buffer.from(JSON.stringify({ session_id: 'a'.repeat(32), uploads: [{ key: 'test-key', fields: { key: 'test-key' }, url: uploadOrigin }] })) }
    else if (op === 'analyze') yield { chunk: Buffer.from(JSON.stringify({ success: true, data: sample }) + '\n') }
    else if (op === 'preview') yield { chunk: Buffer.from('<h1>리포트 미리보기</h1><script>parent.digestInjected=true</script>') }
  }
  const { page, base } = await browserFixture(t, 'user', { env: { MONTHLY_DIGEST_FUNCTION_NAME: 'test', MONTHLY_DIGEST_UPLOAD_ORIGIN: uploadOrigin }, monthlyDigestInvoke: invoke })
  let uploads = 0
  await page.route(uploadOrigin + '/**', async route => { uploads++; await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': base } }) })
  await page.goto(base + '/b/#monthly-digest')
  await expect(page.getByRole('region', { name: '리포트 편집기' }).getByRole('heading', { name: "AWS 월간 What's New" })).toBeVisible()
  await page.locator('#digest-files').setInputFiles({ name: 'source.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') })
  await page.locator('#digest-analyze').click()
  await expect(page.getByRole('status')).toContainText('분석을 완료했습니다')
  assert.equal(uploads, 1)
  await expect(page.locator('[data-key="source_quote"]')).toHaveValue('AWS original source')
  await page.locator('[data-key="action"]').fill('고객과 점검 일정 협의')
  await page.locator('#digest-preview').click()
  await expect(page.frameLocator('#digest-frame').getByRole('heading')).toHaveText('리포트 미리보기')
  assert.equal(await page.evaluate(() => window.digestInjected), undefined)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 저장' }).click()
  const download = await downloaded
  assert.equal(download.suggestedFilename(), 'aws-monthly-report.json')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
})

test('B is unavailable when disabled', async t => {
  const { request } = await fixture(t, { env: { DESIGN_B_ENABLED: 'false' } })
  const status = await request('/api/design', { user: null })
  assert.deepEqual(await status.json(), { bAvailable: false })
  const response = await request('/b/?week=2026-09-07', { user: null })
  assert.equal(response.url.endsWith('/?week=2026-09-07&design=a'), true)
})
