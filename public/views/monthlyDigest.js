import { api } from '../api.js'
import { escapeHtml as h } from '../html.js'
import { session } from '../session.js'

const endpoint = '/api/monthly-digest'
const blank = () => ({ meta: { title: 'AWS 월간 리포트', written: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).replace('-', '.'), customer_intro: '', sales_intro: '' }, customer: { eol_eos: [], whats_new: [] }, sales: [], script: { outline: '', speech: '' }, diagnostics: {} })
const state = { config: null, report: blank(), user: null, files: [], tab: 'eol', dirty: false, busy: false, progress: 0, message: '', error: '', preview: '', previewKind: 'customer' }
const tabs = { eol: '고객용 종료 안내', customer: '고객용 업데이트', sales: '영업용 업데이트', script: '발표 대본', diagnostics: '분석 진단' }
const artifacts = { customer_pdf: '고객용 PDF', sales_pdf: '영업용 PDF', customer_json: '고객용 JSON', sales_json: '영업용 JSON', outline: '아웃라인', speech: '발표 대본', full_json: '전체 JSON' }
export const monthlyDigestDirty = () => state.dirty || state.busy
export const monthlyDigestBusy = () => state.busy
export const discardMonthlyDigest = () => { state.report = blank(); state.dirty = false; state.files = []; state.preview = '' }

function ensureOwner() {
  if (state.user !== session.user?.userId) {
    discardMonthlyDigest()
    state.user = session.user?.userId
    state.config = null
    state.error = ''
    state.message = ''
  }
}

export async function loadMonthlyDigest() {
  ensureOwner()
  try { state.config = await api(endpoint + '/config'); state.error = '' }
  catch (error) { state.config = null; state.error = error.message }
}

const list = () => state.tab === 'eol' ? state.report.customer.eol_eos : state.tab === 'customer' ? state.report.customer.whats_new : state.report.sales
const fields = () => state.tab === 'eol' ? { service: '서비스', target: '대상 버전', date: '일정', badge: '배지', action: '조치 내용', source_quote: '원문 근거' } : { title: '제목', date: '일정', badge: '배지', body: '내용', url: '참고 URL', source_quote: '원문 근거' }

function editor() {
  if (state.tab === 'diagnostics') return `<p>AI 결과는 원문과 대조한 뒤 공유해 주세요.</p><pre class="digest-diagnostics">${h(JSON.stringify(state.report.diagnostics, null, 2))}</pre>`
  if (state.tab === 'script') return ['outline', 'speech'].map(key => `<label>${key === 'outline' ? '발표 아웃라인' : '발표 대본'}<textarea rows="18" maxlength="100000" data-script="${key}">${h(state.report.script[key])}</textarea></label>`).join('')
  const intro = state.tab === 'sales' ? 'sales_intro' : 'customer_intro'
  return `<label>이번 달 핵심 요약<textarea rows="4" maxlength="12000" data-meta="${intro}">${h(state.report.meta[intro])}</textarea></label>
    ${list().map((item, index) => `<article class="digest-item"><div class="digest-actions"><strong>항목 ${index + 1}</strong><button data-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="항목 ${index + 1} 위로">↑</button><button data-move="${index}" data-direction="1" ${index === list().length - 1 ? 'disabled' : ''} aria-label="항목 ${index + 1} 아래로">↓</button><button data-remove="${index}" aria-label="항목 ${index + 1} 삭제">삭제</button></div><div class="digest-fields">${Object.entries(fields()).map(([key, label]) => `<label class="${['body', 'action'].includes(key) ? 'wide' : ''}">${label}${['body', 'action'].includes(key) ? `<textarea rows="5" maxlength="12000" data-index="${index}" data-key="${key}">${h(item[key] || '')}</textarea>` : `<input maxlength="12000" data-index="${index}" data-key="${key}" value="${h(item[key] || '')}">`}</label>`).join('')}</div></article>`).join('')}
    ${!list().length ? '<p>아직 항목이 없습니다. PDF를 분석하거나 직접 추가하세요.</p>' : ''}<button id="digest-add" ${list().length >= 150 ? 'disabled' : ''}>항목 추가</button>`
}

export function renderMonthlyDigest() {
  ensureOwner()
  return `<main class="digest-page"><header><span class="eyebrow">AWS MONTHLY REPORT</span><h1>AWS 월간 리포트</h1><p>PDF를 분석하고 고객용·영업용 리포트와 발표 대본을 작성합니다.</p></header>
    ${state.error ? `<p role="alert" class="digest-error">${h(state.error)}</p>` : ''}
    ${!state.config?.enabled ? '<p role="status">월간 리포트 연결을 준비 중입니다. JSON 불러오기와 편집은 사용할 수 있습니다.</p><button id="digest-retry">연결 다시 확인</button>' : ''}
    <fieldset class="digest-controls" ${state.busy ? 'disabled' : ''}><legend>1. 자료 준비</legend>
      <label>분석할 PDF <input id="digest-files" type="file" accept="application/pdf,.pdf" multiple></label><small>최대 3개 · 파일당 20MB · 합계 150페이지 · 텍스트 PDF</small>
      <p>${state.files.map(file => h(file.name)).join(', ') || '선택된 파일이 없습니다.'}</p>
      <div class="digest-actions"><button id="digest-analyze" class="primary" ${!state.config?.enabled || !state.files.length ? 'disabled' : ''}>PDF 분석 시작</button><label class="digest-import">기존 JSON 불러오기<input id="digest-import" type="file" accept="application/json,.json"></label></div>
    </fieldset>
    <div class="digest-status" role="status" aria-live="polite">${h(state.message)}${state.busy ? `<progress max="100" value="${state.progress}">${state.progress}%</progress>` : ''}</div>
    <fieldset class="digest-controls" ${state.busy ? 'disabled' : ''}><legend>2. 내용 검토·편집</legend>
      <div class="digest-fields"><label>리포트 제목<input data-meta="title" maxlength="12000" value="${h(state.report.meta.title)}"></label><label>작성월<input data-meta="written" maxlength="7" placeholder="2026.09" value="${h(state.report.meta.written)}"></label></div>
      <div class="digest-tabs" role="group" aria-label="리포트 편집 영역">${Object.entries(tabs).map(([id, label]) => `<button data-digest-tab="${id}" aria-pressed="${state.tab === id}">${label}</button>`).join('')}</div>
      <div class="digest-layout"><section class="digest-editor">${editor()}</section><section class="digest-preview"><div class="digest-actions"><label>미리보기 종류<select id="digest-preview-kind"><option value="customer" ${state.previewKind === 'customer' ? 'selected' : ''}>고객용</option><option value="sales" ${state.previewKind === 'sales' ? 'selected' : ''}>영업용</option></select></label><button id="digest-preview" ${!state.config?.enabled ? 'disabled' : ''}>미리보기 갱신</button></div><p>편집 후 미리보기를 갱신하면 PDF에 반영될 내용을 확인할 수 있습니다.</p><iframe id="digest-frame" title="리포트 미리보기" sandbox="" referrerpolicy="no-referrer"></iframe></section></div>
    </fieldset>
    <fieldset class="digest-controls" ${state.busy ? 'disabled' : ''}><legend>3. 저장·공유</legend><p>편집 내용은 이 화면에만 있습니다. 나가기 전 전체 JSON을 저장하면 이어서 작성할 수 있습니다.</p><div class="digest-actions"><button id="digest-export">전체 JSON 저장</button><button id="digest-download" ${!state.config?.enabled ? 'disabled' : ''}>전체 산출물 ZIP</button><button id="digest-pdf" ${!state.config?.enabled ? 'disabled' : ''}>${state.previewKind === 'sales' ? '영업용' : '고객용'} PDF</button></div><details><summary>Slack으로 공유</summary><div class="digest-selection">${Object.entries(artifacts).map(([key, label]) => `<label><input type="checkbox" name="digest-artifact" value="${key}" ${key.endsWith('_pdf') ? 'checked' : ''}>${label}</label>`).join('')}</div><button id="digest-slack" ${!state.config?.slackEnabled ? 'disabled' : ''}>선택한 파일 Slack 전송</button>${!state.config?.slackEnabled ? '<p>Slack 전송 연결을 준비 중입니다.</p>' : ''}</details></fieldset>
  </main>`
}

function saveFile(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

async function request(path, body) {
  const response = await fetch(endpoint + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `요청에 실패했습니다. (${response.status})`) }
  return response
}

// Keep imported documents bounded and ignore unrecognized fields before using them in the editor.
export function importReport(value) {
  if (!value || typeof value !== 'object' || !value.customer || !Array.isArray(value.sales)) throw new Error('전체 백업 JSON 파일을 선택하세요.')
  const result = blank()
  const text = (v, limit = 12000) => {
    if (v == null) return ''
    if (typeof v !== 'string' || v.length > limit) throw new Error('JSON의 텍스트 형식 또는 길이를 확인하세요.')
    return v
  }
  for (const key of Object.keys(result.meta)) if (value.meta?.[key] != null) result.meta[key] = text(value.meta[key])
  for (const key of ['outline', 'speech']) result.script[key] = text(value.script?.[key], 100000)
  const items = (rows, keys) => {
    if (!Array.isArray(rows) || rows.length > 150) throw new Error('항목은 영역별 150개까지 가능합니다.')
    return rows.map(row => { if (!row || typeof row !== 'object') throw new Error('항목 형식을 확인하세요.'); return Object.fromEntries(keys.map(key => [key, text(row[key])])) })
  }
  const updateKeys = ['title', 'badge', 'date', 'body', 'url', 'source_quote']
  result.sales = items(value.sales, updateKeys)
  result.customer.eol_eos = items(value.customer.eol_eos || [], ['service', 'target', 'date', 'badge', 'action', 'source_quote'])
  result.customer.whats_new = items(value.customer.whats_new || [], updateKeys)
  result.diagnostics = value.diagnostics && typeof value.diagnostics === 'object' ? value.diagnostics : {}
  serializeReport(result)
  return result
}

export function serializeReport(report) {
  const json = JSON.stringify(report)
  if (new TextEncoder().encode(json).length > 1800000) throw new Error('전체 리포트는 1.8MB까지 저장할 수 있습니다. 내용을 나눠 주세요.')
  return json
}

export function bindMonthlyDigest(root, render) {
  const frame = root.querySelector('#digest-frame')
  if (frame) frame.srcdoc = state.preview
  const changed = () => { state.dirty = true; state.preview = ''; if (frame) frame.srcdoc = '' }
  const on = (selector, event, callback) => root.querySelector(selector)?.addEventListener(event, callback)
  const update = (object, key, value) => {
    const previous = object[key]
    object[key] = value
    try { serializeReport(state.report); changed() }
    catch (error) { object[key] = previous; state.error = error.message; render() }
  }
  const run = async task => {
    if (state.busy) return
    state.busy = true; state.error = ''; state.message = '처리 중입니다…'; state.progress = 0; render()
    try { await task() } catch (error) { state.error = error.message; state.message = '' }
    finally { state.busy = false; render() }
  }
  on('#digest-retry', 'click', async () => { await loadMonthlyDigest(); render() })
  on('#digest-files', 'change', event => {
    const files = [...event.target.files]
    if (files.length > 3 || files.some(file => !file.name.toLowerCase().endsWith('.pdf') || file.size <= 0 || file.size > 20 * 1024 * 1024)) {
      state.error = 'PDF는 최대 3개, 파일당 20MB까지 선택하세요.'; state.files = []
    } else { state.files = files; state.error = '' }
    render()
  })
  root.querySelectorAll('[data-meta]').forEach(el => el.addEventListener('input', () => update(state.report.meta, el.dataset.meta, el.value)))
  root.querySelectorAll('[data-script]').forEach(el => el.addEventListener('input', () => update(state.report.script, el.dataset.script, el.value)))
  root.querySelectorAll('[data-index]').forEach(el => el.addEventListener('input', () => update(list()[Number(el.dataset.index)], el.dataset.key, el.value)))
  root.querySelectorAll('[data-digest-tab]').forEach(el => el.addEventListener('click', () => { state.tab = el.dataset.digestTab; render() }))
  on('#digest-add', 'click', () => { if (list().length < 150) list().push({}); changed(); render() })
  root.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => { if (!confirm('이 항목을 삭제할까요?')) return; list().splice(Number(el.dataset.remove), 1); changed(); render() }))
  root.querySelectorAll('[data-move]').forEach(el => el.addEventListener('click', () => { const i = Number(el.dataset.move), j = i + Number(el.dataset.direction); if (j >= 0 && j < list().length) [list()[i], list()[j]] = [list()[j], list()[i]]; changed(); render() }))
  on('#digest-preview-kind', 'change', event => { state.previewKind = event.target.value; state.preview = ''; render() })
  on('#digest-import', 'change', event => {
    const file = event.target.files[0]
    if (!file || (state.dirty && !confirm('현재 편집 내용을 불러온 파일로 바꿀까요?'))) return
    run(async () => { if (file.size > 2000000) throw new Error('JSON 파일은 2MB까지 불러올 수 있습니다.'); const report = importReport(JSON.parse(await file.text())); state.report = report; changed(); state.message = 'JSON을 불러왔습니다.' })
  })
  on('#digest-export', 'click', () => { try { saveFile(new Blob([serializeReport(state.report)], { type: 'application/json' }), 'aws-monthly-report.json'); state.dirty = false; state.message = '전체 JSON 다운로드를 요청했습니다.' } catch (error) { state.error = error.message } render() })
  on('#digest-preview', 'click', () => run(async () => { state.preview = await (await request('/preview', { state: state.report, kind: state.previewKind })).text(); state.message = '미리보기를 갱신했습니다.' }))
  on('#digest-download', 'click', () => run(async () => { saveFile(await (await request('/download-all', state.report)).blob(), 'aws-monthly-report.zip'); state.message = 'ZIP 다운로드를 요청했습니다.' }))
  on('#digest-pdf', 'click', () => run(async () => { saveFile(await (await request('/pdf', { state: state.report, kind: state.previewKind })).blob(), `${state.previewKind}.pdf`); state.message = 'PDF 다운로드를 요청했습니다.' }))
  on('#digest-slack', 'click', () => {
    const selected = [...root.querySelectorAll('[name="digest-artifact"]:checked')].map(el => el.value)
    if (!selected.length) { state.error = '전송할 파일을 선택하세요.'; render(); return }
    if (!confirm(`선택한 ${selected.length}개 파일을 팀 Slack 채널에 전송할까요?`)) return
    run(async () => { await request('/slack-notify', { state: state.report, selected_files: selected }); state.message = 'Slack으로 전송했습니다.' })
  })
  on('#digest-analyze', 'click', () => {
    if (!state.files.length || (state.dirty && !confirm('분석 결과로 현재 편집 내용을 바꿀까요? 먼저 JSON 저장을 권장합니다.'))) return
    run(async () => {
      const data = await (await request('/upload-url', { files: state.files.map(file => ({ name: file.name, size: file.size })) })).json()
      for (const [index, upload] of data.uploads.entries()) {
        const form = new FormData()
        for (const [key, value] of Object.entries(upload.fields)) form.append(key, value)
        form.append('file', state.files[index])
        const uploaded = await fetch(upload.url, { method: 'POST', body: form, credentials: 'omit' })
        if (!uploaded.ok) throw new Error('PDF 업로드에 실패했습니다. 파일 크기와 연결 상태를 확인하세요.')
      }
      const response = await request('/analyze', { session_id: data.session_id, keys: data.uploads.map(upload => upload.key) })
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = '', completed = false
      const consume = line => {
        if (!line.trim()) return
        const event = JSON.parse(line)
        if (event.error) throw new Error(event.error)
        if (event.success) { state.report = importReport(event.data); changed(); completed = true; state.progress = 100; state.message = '분석을 완료했습니다. 내용을 검토한 뒤 JSON으로 저장해 주세요.' }
        else { state.progress = event.progress || 0; state.message = event.msg || '분석 중입니다.' }
        render()
      }
      try {
        while (true) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          if (buffer.length > 2000000) throw new Error('분석 응답이 너무 큽니다.')
          let end
          while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); consume(line) }
          if (done) { consume(buffer); break }
        }
        if (!completed) throw new Error('분석 연결이 중간에 끊겼습니다. 완료된 결과가 없습니다.')
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    })
  })
}
