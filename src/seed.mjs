export function normalizeSeed(input) {
  const parts = input.parts.map(({ id, name, color = '#5fa8ff' }) => ({ id, name, color }))
  const partByName = new Map(parts.map((part) => [part.name, part.id]))
  const users = input.users.map(({ id, name, part, role = 'engineer', slackUserId = null }) => {
    const partId = part === null ? null : partByName.get(part)
    if (part !== null && !partId) throw new Error(`unknown part: ${part}`)
    return { id, name, partId, role, slackUserId }
  })
  return { parts, users }
}
