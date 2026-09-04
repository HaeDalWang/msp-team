// 로그인 세션을 여러 화면(app.js, views/*)이 공유하는 단일 모듈.
// role은 서버 seed 기준 'engineer' | 'lead' | 'executive' | 'admin' 중 하나.
export const session = { checked: false, user: null }

export async function loadSession() {
  try {
    const response = await fetch('/api/me')
    session.user = response.ok ? await response.json() : null
  } catch {
    session.user = null
  }
  session.checked = true
  return session.user
}

export function isAdmin() {
  return session.user?.role === 'admin'
}
export function isAdminOrLead() {
  return session.user?.role === 'admin' || session.user?.role === 'lead'
}
export function isSelfOrAdminOrLead(userId) {
  return session.user?.userId === userId || isAdminOrLead()
}
