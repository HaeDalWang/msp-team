export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(
      body.error || `요청에 실패했습니다. (${response.status})`,
    )
    error.status = response.status
    throw error
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
