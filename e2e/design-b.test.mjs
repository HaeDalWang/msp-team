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

test('B reads the same review and customer records as legacy A', async t => {
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
  await page.goto(base + '/?design=a&week=2026-09-07#customers')
  await expect(page).toHaveURL(/\/?\?design=a&week=2026-09-07#customers$/)
  await expect(page.getByText('B 화면 고객사').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/msp-design-b-customers.png', fullPage: true })
})

test('B is the default and restores a login destination despite old A preference', async t => {
  const { page, base } = await browserFixture(t)
  await page.goto(base + '/?week=2026-09-07#review')
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#review$/)
  await expect(page.getByRole('button', { name: '기존 디자인 A' })).toHaveCount(0)
  await page.evaluate(() => { sessionStorage.setItem('msp-return-to', '/b/?week=2026-09-07#customers'); localStorage.setItem('msp-design', 'a') })
  await page.goto(base + '/')
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#customers$/)
})

test('B buttons, selected views, and keyboard focus have distinct states', async t => {
  const { page, base } = await browserFixture(t)
  await page.goto(base + '/#edit')
  await expect(page).toHaveURL(/\/b\/#edit$/)
  const submit = page.getByRole('button', { name: '제출', exact: true })
  const normal = await submit.evaluate(element => getComputedStyle(element).backgroundColor)
  await submit.hover()
  await expect.poll(() => submit.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(normal)
  await page.getByRole('button', { name: '세로로 쓰기' }).click()
  await expect(page.getByRole('button', { name: '세로로 쓰기' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '나란히 쓰기' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '이번 주' }).focus()
  assert.ok(Number.parseFloat(await page.getByRole('button', { name: '이번 주' }).evaluate(element => getComputedStyle(element).outlineWidth)) >= 2)
  await page.getByLabel('주요 업무 현황').focus()
  assert.ok(Number.parseFloat(await page.getByLabel('주요 업무 현황').evaluate(element => getComputedStyle(element).outlineWidth)) >= 2)
  await page.screenshot({ path: '/tmp/msp-b-controls-dark.png', fullPage: true })
  await page.getByRole('button', { name: '화면 설정' }).click()
  await page.getByRole('button', { name: '라이트' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/msp-b-controls-light.png', fullPage: true })
})

test('B editor saves to the shared API and guards unsaved navigation', async t => {
  const { page, base, request } = await browserFixture(t)
  await page.goto(base + '/b/?week=2026-09-07#edit')
  await page.getByLabel('주요 업무 현황').fill('B 회고 초안')
  await page.getByRole('button', { name: '임시 저장' }).click()
  await expect(page.getByText('서버에 저장된 내용')).toBeVisible()
  const personal = await (await request('/api/reviews?weekEnd=2026-09-07&personal=true')).json()
  assert.equal(personal.entries.find(entry => entry.id === 'user').workHighlights, 'B 회고 초안')
  await page.getByLabel('주요 업무 현황').fill('저장 전 변경')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '담당 고객사' }).click()
  await expect(page).toHaveURL(/\/b\/\?week=2026-09-07#edit$/)
  await expect(page.getByLabel('주요 업무 현황')).toHaveValue('저장 전 변경')
})

test('B review ticket inputs support direct typing and cap weekly counts', async t => {
  const { page, base, request } = await browserFixture(t)
  await page.goto(base + '/b/?week=2026-09-07#edit')
  const ticketsNew = page.getByLabel('신규 티켓')
  await ticketsNew.fill('17')
  await expect(ticketsNew).toHaveValue('17')
  await ticketsNew.fill('1024')
  await ticketsNew.pressSequentially('9')
  await expect(ticketsNew).toHaveValue('1024')
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByText('회고를 제출했습니다.')).toBeVisible()
  const data = await (await request('/api/reviews?weekEnd=2026-09-07&personal=true')).json()
  assert.equal(data.entries.find(entry => entry.id === 'user').tickets[0], 1024)
})

test('B sidebar opens the signed-in user profile in a centered modal', async t => {
  const { page, base, request } = await browserFixture(t)
  await page.goto(base + '/b/#review')
  await page.getByRole('button', { name: 'user 내 정보 수정' }).click()
  await expect(page.getByRole('heading', { name: '화면 설정과 내 정보' })).toBeVisible()
  const dialog = page.getByRole('dialog')
  const bounds = await dialog.boundingBox()
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 683) < 3)
  await page.getByLabel('이메일').fill('myself@example.com')
  await page.getByRole('button', { name: '내 정보 저장', exact: true }).click()
  await expect(page.getByText('내 정보를 저장했습니다.')).toBeVisible()
  assert.equal((await (await request('/api/profile')).json()).email, 'myself@example.com')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: '화면 설정' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
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
  const firstDayVisible = async () => page.evaluate(() => {
    const scroller = document.querySelector('.b-schedule-table [data-slot="table-container"]')
    const hours = scroller.querySelector('thead .b-schedule-hours').getBoundingClientRect()
    const day = scroller.querySelector('thead [data-date$="-01"]').getBoundingClientRect()
    const topElement = document.elementFromPoint(day.left + day.width / 2, day.top + day.height / 2)
    return {
      startsAfterHours: day.left >= hours.right - 1,
      insideScroller: day.right <= scroller.getBoundingClientRect().right + 1,
      uncovered: Boolean(topElement?.closest('thead [data-date$="-01"]')),
    }
  })
  assert.deepEqual(await firstDayVisible(), { startsAfterHours: true, insideScroller: true, uncovered: true })
  await page.locator('.b-schedule-table [data-slot="table-container"]').evaluate(element => { element.scrollLeft = 500; element.scrollLeft = 0 })
  assert.deepEqual(await firstDayVisible(), { startsAfterHours: true, insideScroller: true, uncovered: true })
  const row = page.getByRole('row').filter({ hasText: 'user' })
  await row.getByRole('button').first().click()
  await expect(page.getByRole('dialog')).toContainText('2026-09-01')
  await page.keyboard.press('Escape')
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
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('B 신규 구성원')
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

test('B organization does not warn before an edit begins', async t => {
  const { page, base } = await browserFixture(t, 'admin')
  await page.goto(base + '/b/#organization')
  await expect(page.getByRole('heading', { name: '조직 관리' })).toBeVisible()
  let prompted = false
  page.on('dialog', dialog => { prompted = true; dialog.dismiss() })
  await page.getByRole('button', { name: '리뷰' }).click()
  await expect(page).toHaveURL(/\/b\/\?week=\d{4}-\d{2}-\d{2}#review$/)
  assert.equal(prompted, false)
})

test('B organization, customer, and team tables resize by drag and remember widths', async t => {
  const { page, base } = await browserFixture(t, 'admin')
  const dragFirstColumn = async label => {
    const handle = page.getByRole('separator', { name: `${label} 열 너비 조절` }).first()
    const head = handle.locator('xpath=..')
    const before = (await head.boundingBox()).width
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    const after = (await head.boundingBox()).width
    assert.ok(after > before + 50, `${label}: ${before} -> ${after}`)
    return after
  }
  await page.goto(base + '/b/#organization')
  await expect(page.getByRole('heading', { name: '조직 관리' })).toBeVisible()
  const saved = await dragFirstColumn('이름')
  await page.reload()
  await expect(page.getByRole('heading', { name: '조직 관리' })).toBeVisible()
  assert.ok(Math.abs((await page.getByRole('separator', { name: '이름 열 너비 조절' }).locator('xpath=..').boundingBox()).width - saved) < 2)
  await page.getByRole('button', { name: '팀 현황' }).click()
  await dragFirstColumn('파트')
  await page.getByRole('button', { name: '담당 고객사' }).click()
  await page.getByRole('button', { name: '고객사 추가' }).click()
  await page.getByLabel('고객사 이름').fill('열 조절 고객사')
  await page.getByRole('button', { name: '고객사 저장' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await dragFirstColumn('고객사')
})

test('B monthly digest preserves the upload, analysis and sandbox preview flow', async t => {
  const sample = { meta: { title: "AWS 월간 What's New", written: '2026.09' }, customer: { eol_eos: [{ service: 'RDS', action: '업그레이드 확인', source_quote: 'AWS original source' }], whats_new: [] }, sales: [], script: {}, diagnostics: { unverified: { sales: [{ name: 'S3 업데이트', quote: '확인할 원문' }], eol_eos: [], whats_new: [] }, skipped: { sales: [{ title: '요금 안내', reason: 'billing_and_cost' }], customer: [] } } }
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
  await page.getByRole('button', { name: '분석 진단' }).click()
  await expect(page.getByRole('region', { name: '원문 근거 확인 필요' }).getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('region', { name: '원문 근거 확인 필요' })).toContainText('S3 업데이트')
  await expect(page.getByRole('region', { name: '분석에서 제외된 항목' })).toContainText('과금·비용 주제')
  await expect(page.getByRole('region', { name: '리포트 편집기' }).locator('pre')).toHaveCount(0)
  await page.getByRole('button', { name: '고객용 종료 안내' }).click()
  await page.locator('[data-key="action"]').fill('고객과 점검 일정 협의')
  await page.locator('#digest-preview').click()
  await expect(page.frameLocator('#digest-frame').getByRole('heading')).toHaveText('리포트 미리보기')
  assert.equal(await page.evaluate(() => window.digestInjected), undefined)
  const editor = page.getByRole('region', { name: '리포트 편집기' })
  const resizer = page.getByRole('separator', { name: '편집기와 미리보기 크기 조절' })
  const beforeResize = await editor.boundingBox()
  const handle = await resizer.boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100)
  await page.mouse.down()
  await page.mouse.move(handle.x + 100, handle.y + 100)
  await page.mouse.up()
  const afterResize = await editor.boundingBox()
  assert.ok(afterResize.width > beforeResize.width + 70)
  await resizer.press('ArrowLeft')
  assert.ok((await editor.boundingBox()).width < afterResize.width)
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
  const root = await request('/?week=2026-09-07', { user: null })
  assert.equal(root.url.endsWith('/?week=2026-09-07'), true)
})
