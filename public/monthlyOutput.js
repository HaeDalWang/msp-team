// 원본 prototype(src/monthlyOutput.ts)을 그대로 옮긴 것.
function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function indentItems(items, indent = '  ') {
  return items.length ? items.map((item) => `${indent}* ${item}`).join('\n') : `${indent}* 집계된 항목 없음`
}

export function buildMonthlyTeamOutput(reviewEnd, snapshots) {
  const [year, month] = reviewEnd.split('-')
  const numericMonth = Number(month)
  const filenameBase = `${year}-${month}-msp-team-output`
  const title = `${year}년 ${numericMonth}월 MSP 팀 Output`
  const selectedSnapshots = snapshots.filter((snapshot) => snapshot.reviewEnd.startsWith(`${year}-${month}-`))
  const reviewEntries = selectedSnapshots.flatMap((snapshot) => snapshot.entries)
  const totalTickets = selectedSnapshots.reduce((total, snapshot) => total + snapshot.totalTickets, 0)

  const customerItems = new Map()
  reviewEntries.forEach((entry) => {
    entry.blocks.forEach((block) => {
      const previous = customerItems.get(block.customer) ?? []
      customerItems.set(block.customer, unique([...previous, ...block.items.map((item) => item.text)]))
    })
  })

  const customerLines = [...customerItems.entries()].flatMap(([customer, items]) => [
    `  * ${customer}`,
    ...items.map((item) => `    * ${item}`),
  ])
  const actionItems = unique(reviewEntries.flatMap((entry) => entry.actionItems ?? []))
  const topsProjects = unique(reviewEntries.flatMap((entry) => entry.topsProjects ?? entry.goals ?? []))
  const projectItems = unique([...actionItems, ...topsProjects])
  const otherNotes = unique(reviewEntries.flatMap((entry) => entry.otherNotes ?? []))

  const markdown = [
    '### 2. MSP 팀',
    '',
    '* **업무 현황 지표**',
    `  * 총 티켓 처리 건수: **${totalTickets}건**`,
    '* 주요 업무 현황',
    customerLines.length ? customerLines.join('\n') : '  * 집계된 항목 없음',
    '* 프로젝트/과제 현황',
    indentItems(projectItems),
    '* 기타 사항',
    indentItems(otherNotes),
    '',
  ].join('\n')

  const text = markdown.replace(/^###\s+/gm, '').replace(/\*\*/g, '')

  return { title, filenameBase, markdown, text }
}
